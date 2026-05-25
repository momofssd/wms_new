import pathlib
import fitz  # PyMuPDF

def search_pdf_content(root_directory, search_string):
    root_path = pathlib.Path(root_directory)
    normalized_search = search_string.casefold()
    
    if not root_path.exists():
        print(f"Error: Path '{root_directory}' not found.")
        return

    print(f"Searching for '{search_string}' in PDF content and filenames under {root_path}...\n")
    found_count = 0

    # rglob handles subfolders and ignores .zip automatically
    for pdf_file in root_path.rglob('*.pdf'):
        try:
            # Open the PDF
            doc = fitz.open(pdf_file)
            filename_matched = normalized_search in pdf_file.name.casefold()
            matched_pages = []
            
            for page_num, page in enumerate(doc):
                # Treat the query as included text, including within longer values.
                page_text = page.get_text()
                if normalized_search in page_text.casefold() or page.search_for(search_string):
                    matched_pages.append(page_num + 1)
            
            doc.close()
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

# --- Configuration ---
# Use the 'r' prefix to avoid "invalid escape sequence"
folder_to_search = r"E:\WHS" 
string_to_find = "2CXL4KSC"

search_pdf_content(folder_to_search, string_to_find)
