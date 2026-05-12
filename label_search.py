import pathlib
import fitz  # PyMuPDF

def search_pdf_content(root_directory, search_string):
    root_path = pathlib.Path(root_directory)
    
    if not root_path.exists():
        print(f"Error: Path '{root_directory}' not found.")
        return

    print(f"Searching for content '{search_string}' in {root_path}...\n")
    found_count = 0

    # rglob handles subfolders and ignores .zip automatically
    for pdf_file in root_path.rglob('*.pdf'):
        try:
            # Open the PDF
            doc = fitz.open(pdf_file)
            file_matched = False
            
            for page_num, page in enumerate(doc):
                # Search for the string on the current page
                if page.search_for(search_string):
                    if not file_matched:
                        print(f"MATCH FOUND:")
                        print(f" - File:   {pdf_file.name}")
                        print(f" - Folder: {pdf_file.parent}")
                        file_matched = True
                        found_count += 1
                    
                    print(f" - Found on Page: {page_num + 1}")
            
            doc.close()
            if file_matched: print("-" * 30)

        except Exception as e:
            print(f"Could not read {pdf_file.name}: {e}")

    print(f"\nSearch complete. Found {found_count} matching PDF(s).")

# --- Configuration ---
# Use the 'r' prefix to avoid "invalid escape sequence"
folder_to_search = r"E:\WHS" 
string_to_find = "X005100ZK5"

search_pdf_content(folder_to_search, string_to_find)