/**
 * USPS tracking number validation and extraction utilities.
 *
 * Extraction uses three layered strategies, tried in order:
 *
 *   Layer 1 – pdfplumber word-level  [MOST RELIABLE]
 *     Reads structured word tokens from the PDF. Because pdfplumber splits
 *     text by position it never merges content across lines, making it immune
 *     to the line-merging bug that defeats plain regex on raw text.
 *     Requires Python + pdfplumber to be installed on the host.
 *
 *   Layer 2 – Line-by-line regex  [FALLBACK FOR SPACED FORMAT]
 *     Processes each line independently so digit runs from adjacent lines
 *     (e.g. a reference ID like "YXGYL0000201051266" following a tracking
 *     number) can never be merged into the same match.
 *
 *   Layer 3 – Char-by-char scan  [FALLBACK FOR COMPACT FORMAT]
 *     Finds 22 consecutive digit sequences for PDFs where the text layer
 *     already contains the compact (un-spaced) tracking number.
 *
 * All three layers share a deduplication Set so a number is never returned
 * twice regardless of how many layers find it.
 */

const { execSync } = require("child_process");
const path = require("path");
const os = require("os");
const fs = require("fs");

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

const VALID_PREFIXES = ["92", "93", "94", "95"];

/**
 * Returns true if `number` (compact or spaced) is a structurally valid USPS
 * tracking number: exactly 22 digits starting with 92, 93, 94, or 95.
 */
const isValidUSPSTracking = (number) => {
  if (!number || typeof number !== "string") return false;
  const compact = number.replace(/\D/g, "");
  if (compact.length !== 22) return false;
  return VALID_PREFIXES.some((p) => compact.startsWith(p));
};

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

const _add = (compact, seen, results) => {
  if (!seen.has(compact)) {
    seen.add(compact);
    results.push(compact);
  }
};

/**
 * Layer 3 – char-by-char scan for 22 consecutive digits with a valid prefix.
 */
const _scanCompact = (text, seen, results) => {
  for (let i = 0; i < text.length - 21; i++) {
    if (VALID_PREFIXES.includes(text.slice(i, i + 2))) {
      const candidate = text.slice(i, i + 22);
      if (/^\d{22}$/.test(candidate) && isValidUSPSTracking(candidate)) {
        _add(candidate, seen, results);
      }
    }
  }
};

/**
 * Layer 2 – line-by-line regex for spaced/hyphenated formats like
 * "9300 1110 3880 1217 0346 20".
 *
 * Line-by-line processing is critical: the original bug ran a full-text
 * regex with \s (which includes \n), causing it to merge the trailing digits
 * of a tracking number with the leading digits of a reference ID on the next
 * line (e.g. "YXGYL0000201051266"), producing 35-digit strings that silently
 * failed the length === 22 check.
 */
const _scanSpaced = (text, seen, results) => {
  for (const line of text.split(/\r?\n/)) {
    const matches = line.match(/[\d -]{20,30}/g) || [];
    for (const chunk of matches) {
      const compact = chunk.replace(/\D/g, "");
      if (isValidUSPSTracking(compact)) {
        _add(compact, seen, results);
      }
    }
  }
};

/**
 * Layer 1 – pdfplumber word-level extraction via a Python helper.
 *
 * pdfplumber splits PDF text into individual word tokens by position, so
 * "9300 1110 3880 1217 0346 20" arrives as six separate words. We accumulate
 * consecutive digit-only words until we reach exactly 22 digits.
 *
 * This is the most robust strategy: it operates on the PDF's internal
 * structure rather than on a raw text dump, so it is completely immune to
 * cross-line merging and encoding artifacts.
 *
 * Returns [] if Python / pdfplumber is unavailable.
 */
const _scanWithPdfplumber = (pdfBuffer) => {
  const tmpFile = path.join(os.tmpdir(), `usps_scan_${Date.now()}.pdf`);
  try {
    fs.writeFileSync(tmpFile, pdfBuffer);

    const pyScript = `
import sys, json, re, pdfplumber

PREFIXES = {"92","93","94","95"}

def extract(pdf_path):
    seen = set()
    results = []
    with pdfplumber.open(pdf_path) as pdf:
        for page in pdf.pages:
            words = [w["text"] for w in page.extract_words()]
            i = 0
            while i < len(words):
                digits = re.sub(r"\\D", "", words[i])
                if len(digits) >= 2 and digits[:2] in PREFIXES:
                    j = i + 1
                    while len(digits) < 22 and j < len(words):
                        nxt = re.sub(r"\\D", "", words[j])
                        if nxt:
                            digits += nxt
                            j += 1
                        else:
                            break
                    if len(digits) == 22 and digits not in seen:
                        seen.add(digits)
                        results.append(digits)
                i += 1
    return results

print(json.dumps(extract(sys.argv[1])))
`;

    const output = execSync(
      `python3 -c ${JSON.stringify(pyScript)} "${tmpFile}"`,
      { timeout: 30000, encoding: "utf8" },
    );
    return JSON.parse(output.trim());
  } catch (_err) {
    // Python / pdfplumber unavailable → fall through to text-based layers
    return [];
  } finally {
    try {
      fs.unlinkSync(tmpFile);
    } catch (_) {}
  }
};

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Extract all unique valid USPS tracking numbers from raw PDF text.
 *
 * Drop-in replacement for the original function. Runs Layer 2 + Layer 3.
 * Use `extractTrackingNumbersFromPDF` instead when you have the raw buffer.
 *
 * @param {string} text
 * @returns {string[]}
 */
const extractTrackingNumbersFromText = (text) => {
  if (!text) return [];
  const seen = new Set();
  const results = [];
  _scanSpaced(String(text), seen, results);
  _scanCompact(String(text), seen, results);
  return results;
};

/**
 * Extract all unique valid USPS tracking numbers from a PDF buffer.
 *
 * Runs all three layers; each layer fills in what the previous one may miss.
 *
 * Usage in outbound.js route – replace:
 *   const trackingNumbers = extractTrackingNumbersFromText(text);
 * with:
 *   const trackingNumbers = extractTrackingNumbersFromPDF(req.file.buffer, text);
 *
 * @param {Buffer}  pdfBuffer    - Raw PDF bytes (req.file.buffer)
 * @param {string}  fallbackText - Text from pdf-parse (for Layers 2 & 3)
 * @returns {string[]}
 */
const extractTrackingNumbersFromPDF = (pdfBuffer, fallbackText) => {
  const seen = new Set();
  const results = [];

  // Layer 1: pdfplumber word-level (most reliable)
  if (pdfBuffer) {
    for (const n of _scanWithPdfplumber(pdfBuffer)) {
      _add(n, seen, results);
    }
  }

  // Layers 2 & 3: text-based fallbacks
  if (fallbackText) {
    _scanSpaced(String(fallbackText), seen, results);
    _scanCompact(String(fallbackText), seen, results);
  }

  return results;
};

module.exports = {
  isValidUSPSTracking,
  extractTrackingNumbersFromText, // existing callers unchanged
  extractTrackingNumbersFromPDF, // new: preferred when buffer is available
};
