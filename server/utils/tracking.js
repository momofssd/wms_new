/**
 * USPS tracking number validation and extraction utilities.
 * Ported from original Python implementation.
 */

const isValidUSPSTracking = (number) => {
  if (!number || typeof number !== "string") return false;
  // Handle compact number
  const compact = number.replace(/\D/g, "");
  if (compact.length !== 22) return false;

  // Must start with valid USPS channel prefix (92, 93, 94, 95)
  if (!["92", "93", "94", "95"].some((prefix) => compact.startsWith(prefix))) {
    return false;
  }

  return true;
};

const extractTrackingNumbersFromText = (text) => {
  if (!text) return [];
  const textStr = String(text);

  const numbers = [];

  // Pass 1: char-by-char scan for 22 consecutive digits starting with 92-95.
  // BUG FIX: Collect ALL matches, not just the last one (original code only kept
  // candidates[candidates.length - 1], discarding all but the final match).
  for (let i = 0; i < textStr.length - 21; i++) {
    const prefix = textStr.slice(i, i + 2);
    if (["92", "93", "94", "95"].includes(prefix)) {
      const potential = textStr.slice(i, i + 22);
      if (/^\d{22}$/.test(potential) && isValidUSPSTracking(potential)) {
        if (!numbers.includes(potential)) {
          numbers.push(potential);
        }
      }
    }
  }

  // Pass 2: spaced/hyphenated formats (e.g. "9300 1110 3880 1217 0346 20").
  // BUG FIX: Process line-by-line instead of the full text at once.
  // The original regex used \s which includes \n, causing it to merge the
  // trailing digits of one tracking number with the leading digits of a
  // reference ID on the next line (e.g. "YXGYL0000201051266"), producing
  // 35-digit chunks that failed the length === 22 check and were silently
  // dropped. Splitting by line prevents cross-line merging.
  const lines = textStr.split(/\r?\n/);
  for (const line of lines) {
    const spacedRegex = /[\d -]{20,30}/g;
    const matches = line.match(spacedRegex) || [];
    for (const chunk of matches) {
      const compact = chunk.replace(/\D/g, "");
      if (
        compact.length === 22 &&
        ["92", "93", "94", "95"].some((prefix) => compact.startsWith(prefix)) &&
        isValidUSPSTracking(compact) &&
        !numbers.includes(compact)
      ) {
        numbers.push(compact);
      }
    }
  }

  return numbers;
};

module.exports = {
  isValidUSPSTracking,
  extractTrackingNumbersFromText,
};
