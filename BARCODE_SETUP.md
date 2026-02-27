# Barcode Extraction Setup Guide

## Overview

The outbound PDF processing feature now extracts tracking numbers directly from barcodes embedded in PDF labels, matching the functionality of the original Python application.

## Changes Made

### Backend (server/routes/outbound.js)

- **Replaced text-based extraction** with barcode scanning using image processing
- **Added barcode extraction function** `extractBarcodesFromPDF()` that:
  - Converts PDF pages to PNG images using `pdf-poppler`
  - Reads barcodes from images using `jsqr`
  - Extracts tracking numbers from barcode data using the existing tracking pattern utility
  - Returns an array of objects with `page` and `barcode` properties

### Frontend Updates

- **OutboundPage.jsx**: Updated to handle new response format `{ barcodes: [...], count: N }`
- **ShipmentTrackingPage.jsx**: Updated to extract barcode values from the new response format

## Required Dependencies

### Server Dependencies

Install the following npm packages in the `server` directory:

```bash
cd server
npm install pdf-poppler jsqr jimp multer quagga
```

**Key Libraries:**

- `pdf-poppler` - Converts PDF pages to PNG images
- `jsqr` - Decodes QR codes from images
- `quagga` - Decodes 1D barcodes (CODE128, CODE39, EAN, UPC, etc.)
- `jimp` - Image processing library
- `multer` - File upload handling

### System Requirements

The `pdf-poppler` package requires **Poppler** to be installed on your system:

#### Windows

1. Download Poppler for Windows from: https://github.com/oschwartz10612/poppler-windows/releases
2. Extract the archive (e.g., to `C:\Program Files\poppler`)
3. Add the `bin` folder to your system PATH:
   - Right-click "This PC" → Properties → Advanced system settings
   - Click "Environment Variables"
   - Under "System variables", find and edit "Path"
   - Add the path to the `bin` folder (e.g., `C:\Program Files\poppler\Library\bin`)
4. Restart your terminal/IDE

#### Linux (Ubuntu/Debian)

```bash
sudo apt-get update
sudo apt-get install poppler-utils
```

#### macOS

```bash
brew install poppler
```

## How It Works

### Original Python Implementation

The Python version used:

- `pdf2image` to convert PDF pages to images
- `pyzbar` to decode barcodes from images
- `_extract_tracking_numbers_from_text()` to extract USPS tracking numbers from barcode data

### JavaScript Implementation

The JavaScript version uses equivalent libraries:

- `pdf-poppler` (replaces `pdf2image`) - converts PDF to PNG images at high resolution
- `jsqr` - decodes QR codes from images
- `quagga` (replaces `pyzbar`) - decodes 1D barcodes (CODE128, CODE39, EAN, UPC, I2of5, CODE93)
- `jimp` - image processing library to read PNG files
- `extractTrackingNumbersFromText()` - existing utility to extract USPS tracking numbers

### Process Flow

1. User uploads a PDF with shipment labels
2. Backend converts each PDF page to a PNG image at high resolution (scale: 2048)
3. Each image is processed with two barcode detection methods:
   - **jsQR** for QR codes
   - **Quagga** for 1D barcodes (CODE128, CODE39, EAN, UPC, I2of5, CODE93)
4. Barcode data is passed through the tracking number extraction utility
5. Valid 22-digit USPS tracking numbers (starting with 92-95) are extracted
6. Duplicate barcodes per page are removed using a Set
7. Results are returned with page numbers for reference

## API Response Format

### Before (Text Extraction)

```json
{
  "trackingNumbers": ["9205590164917312345678", "9205590164917387654321"]
}
```

### After (Barcode Extraction)

```json
{
  "barcodes": [
    { "page": 1, "barcode": "9205590164917312345678" },
    { "page": 2, "barcode": "9205590164917387654321" }
  ],
  "count": 2
}
```

## Testing

1. **Install dependencies**:

   ```bash
   cd server
   npm install
   ```

2. **Verify Poppler installation**:

   ```bash
   pdftoppm -v
   ```

   Should display version information if installed correctly.

3. **Start the server**:

   ```bash
   npm run dev
   ```

4. **Test the feature**:
   - Navigate to Outbound Processing → Outbound Load (PDF) or Outbound Consolidated (PDF)
   - Upload a PDF with USPS shipping labels containing barcodes
   - Verify that tracking numbers are extracted correctly

## Troubleshooting

### "Barcode scanning unavailable" error

- Ensure all npm packages are installed: `npm install pdf-poppler jsqr jimp multer quagga`
- Check that Poppler is installed and in your system PATH
- Restart the server after installing dependencies

### "Error extracting barcodes" or no barcodes found

- Verify the PDF contains actual barcode images (not just text)
- Ensure barcodes are clear and high-resolution
- Check that barcodes are 1D barcodes (CODE128, CODE39, EAN, UPC, I2of5, CODE93) or QR codes
- The system now uses high-resolution conversion (scale: 2048) for better detection
- Check server console logs for detailed per-page barcode detection results
- Try with a different PDF or test with a known working barcode image

### Poppler not found

- Windows: Verify the `bin` folder is in your PATH and restart your terminal
- Linux/Mac: Run the installation command again and verify with `which pdftoppm`

## Performance Notes

- PDF to image conversion can be resource-intensive for large PDFs
- Temporary files are created and cleaned up automatically
- Processing time depends on PDF size and number of pages
- Consider implementing rate limiting for production use

## Future Enhancements

- Support for additional barcode formats (UPC, EAN, etc.)
- Parallel processing for multi-page PDFs
- Caching of processed PDFs
- Progress indicators for large file uploads
- Batch processing optimization
