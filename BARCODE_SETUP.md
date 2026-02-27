# Tracking Number Extraction — Setup Guide

## Overview

USPS tracking numbers are extracted directly from the PDF's internal text structure using `pdfjs-dist`. No image rendering, no barcode scanning libraries, no system dependencies, no Python.

---

## How It Works

### Why not barcode scanning

Barcode scanning was evaluated and rejected. USPS Ground Advantage labels use a large-format Code 128 linear barcode that every tested Node.js library (`jsqr`, `quagga2`, OpenCV `BarcodeDetector`) failed to decode reliably. The 2D code in the label corner is a DataMatrix/Aztec format with no viable Node.js support. Image-based approaches also require rendering the PDF to a bitmap first, which adds latency, DPI tuning, and temp file management.

### Why not pdf-parse text extraction

`pdf-parse` concatenates all text from a page into a single string. The bug this caused: the original regex used `\s` as a separator, which includes `\n`. After extraction, a label page looks like:

```
9300 1110 3880 1217 0346 20\n
YXGYL0000201051266\n
9300 1110 3880 1217 0346 37\n
```

The regex consumed across the newline, merging a tracking number with the reference ID on the next line into a 35-digit string that failed the `length === 22` check. The first number happened to match before the merge, so it returned — all subsequent ones were silently dropped.

### The actual fix: pdfjs-dist structured text

`pdfjs-dist` exposes each PDF text object as a separate `item.str`. USPS labels generated via the USPS API store the tracking number as one text object, so `"9300 1110 3880 1217 0346 20"` arrives as a single complete string — never merged with anything. Stripping non-digits gives exactly 22 digits. One `Set` deduplicates across all pages.

```
PDF text objects per page (pdfjs-dist):
  "USPS GROUND ADVANTAGE"  ← one item
  "9300 1110 3880 1217 0346 20"  ← one item  ✓ 22 digits after strip
  "YXGYL0000201051266"  ← separate item, ignored
```

---

## Dependencies

`pdfjs-dist` is already installed. No new packages required.

`pdf-parse-fork` is no longer needed in the `/process-pdf` route and can be removed from that import.

---

## Changes

### `server/utils/tracking.js`

Replaced the regex-based `extractTrackingNumbersFromText` with a new async `extractTrackingNumbersFromPDF(buffer)` that uses `pdfjs-dist` internally.

The old `extractTrackingNumbersFromText(text)` is kept as a synchronous fallback for any callers that only have a plain text string, with the cross-line merging bug fixed.

### `server/routes/outbound.js`

Two changes in the `/process-pdf` route:

```diff
- const pdfParse = require("pdf-parse-fork");
- const { extractTrackingNumbersFromText } = require("../utils/tracking");
+ const { extractTrackingNumbersFromPDF } = require("../utils/tracking");

  router.post("/process-pdf", upload.single("pdf"), async (req, res) => {
-   const data = await pdfParse(req.file.buffer);
-   const trackingNumbers = extractTrackingNumbersFromText(data.text);
+   const trackingNumbers = await extractTrackingNumbersFromPDF(req.file.buffer);
  });
```

Response shape is unchanged: `{ trackingNumbers: ["9300111038801217034620", ...] }`

---

## API

### `extractTrackingNumbersFromPDF(pdfBuffer)`

```js
const { extractTrackingNumbersFromPDF } = require("../utils/tracking");

const trackingNumbers = await extractTrackingNumbersFromPDF(req.file.buffer);
// ["9300111038801217034620", "9300111038801217034637", "9300111038801217034644"]
```

Reads every page of the PDF. Each text object is stripped to digits and checked for a valid USPS prefix (`92`–`95`) and length (22). Duplicates across pages are collapsed to one entry.

### `isValidUSPSTracking(number)`

```js
isValidUSPSTracking("9300 1110 3880 1217 0346 20"); // true  (spaced)
isValidUSPSTracking("9300111038801217034620"); // true  (compact)
isValidUSPSTracking("1234567890123456789012"); // false (wrong prefix)
```

Returns `true` if the input, after stripping non-digits, is exactly 22 digits starting with `92`, `93`, `94`, or `95`.

---

## Troubleshooting

**Returns empty array**

The PDF may be image-only (a scan or a screenshot saved as PDF). `pdfjs-dist` reads the text layer — if there is no text layer, there is nothing to extract. Confirm by opening the PDF and trying to select text. If text is not selectable, the file needs OCR before it can be processed.

**`DOMMatrix is not defined` error**

`pdfjs-dist` needs browser globals polyfilled in Node. `tracking.js` handles this automatically by importing from `pdfjs-dist`'s own bundled `@napi-rs/canvas` before loading pdfjs. If you see this error, verify `pdfjs-dist` is installed at version 4.x or later and that `node_modules/pdfjs-dist/node_modules/@napi-rs/canvas` exists.

**New prefix not recognized**

All current USPS service prefixes (`92`–`95`) are supported. If USPS introduces a new prefix, add it to `VALID_PREFIXES` at the top of `tracking.js`.
