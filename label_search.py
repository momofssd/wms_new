import pathlib
import shutil
import sys
import unicodedata

import fitz  # PyMuPDF


# Keeps Chinese output readable in Windows terminals that default to a legacy
# code page. If this fails, Python will continue with the terminal default.
try:
    sys.stdout.reconfigure(encoding="utf-8")
    sys.stderr.reconfigure(encoding="utf-8")
except AttributeError:
    pass


ENABLE_OCR = shutil.which("tesseract") is not None
OCR_LANGUAGES = "eng+chi_sim+chi_tra"
OCR_DPI = 250


def normalize_text(value):
    return unicodedata.normalize("NFKC", value).casefold()


def ocr_page_text(page):
    if not ENABLE_OCR:
        return ""

    try:
        import pytesseract
        from PIL import Image
    except ImportError:
        return ""

    pix = page.get_pixmap(dpi=OCR_DPI, alpha=False)
    image = Image.frombytes("RGB", (pix.width, pix.height), pix.samples)
    try:
        return pytesseract.image_to_string(image, lang=OCR_LANGUAGES)
    except (pytesseract.TesseractError, pytesseract.TesseractNotFoundError) as e:
        if not getattr(ocr_page_text, "warned", False):
            print(f"OCR unavailable or missing language data ({OCR_LANGUAGES}): {e}")
            ocr_page_text.warned = True
        return ""


def page_contains_text(page, search_string, normalized_search):
    page_text = page.get_text("text")
    if normalized_search in normalize_text(page_text):
        return True

    # PyMuPDF's native search can find text that is laid out oddly in the PDF.
    if page.search_for(search_string):
        return True

    ocr_text = ocr_page_text(page)
    return normalized_search in normalize_text(ocr_text)


def search_pdf_content(root_directory, search_string):
    root_path = pathlib.Path(root_directory)
    normalized_search = normalize_text(search_string)

    if not root_path.exists():
        print(f"Error: Path '{root_directory}' not found.")
        return

    print(f"Searching for '{search_string}' in PDF content and filenames under {root_path}...\n")
    found_count = 0

    # rglob handles subfolders and ignores .zip automatically
    for pdf_file in root_path.rglob('*.pdf'):
        try:
            with fitz.open(pdf_file) as doc:
                filename_matched = normalized_search in normalize_text(pdf_file.name)
                matched_pages = []

                for page_num, page in enumerate(doc):
                    # Treat the query as included text, including within longer values.
                    if page_contains_text(page, search_string, normalized_search):
                        matched_pages.append(page_num + 1)

            if filename_matched or matched_pages:
                print("MATCH FOUND:")
                print(f" - File:   {pdf_file.name}")
                print(f" - Folder: {pdf_file.parent}")
                if filename_matched:
                    print(" - Found in Filename")
                for page_num in matched_pages:
                    print(f" - Found on Page: {page_num}")
                print("-" * 30)
                found_count += 1

        except Exception as e:
            print(f"Could not read {pdf_file.name}: {e}")

    print(f"\nSearch complete. Found {found_count} matching PDF(s).")

def main():
    # Defaults can still be changed here, or overridden from the command line:
    # python label_search.py "E:\WHS" "<Chinese text>"
    folder_to_search = r"E:\WHS"
    string_to_find = "X005100ZK5"

    if len(sys.argv) > 1:
        folder_to_search = sys.argv[1]
    if len(sys.argv) > 2:
        string_to_find = sys.argv[2]

    search_pdf_content(folder_to_search, string_to_find)


if __name__ == "__main__":
    main()


