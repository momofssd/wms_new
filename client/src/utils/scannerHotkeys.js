/**
 * Utility to prevent special characters from scanner input
 * This prevents barcode scanners from injecting unwanted special characters
 * while still allowing developers to use F12 for dev tools
 */

/**
 * Filters out special characters from input events that may come from barcode scanners
 * This approach doesn't block F-keys globally, allowing dev tools to work normally
 */
export const disableScannerHotkeys = () => {
  const filterScannerInput = (e) => {
    // Only filter on input elements (text, number, etc.)
    const target = e.target;
    if (!target || !target.tagName) return;

    const isInputElement =
      target.tagName === "INPUT" || target.tagName === "TEXTAREA";

    if (!isInputElement) return;

    // Block function keys (F1-F12) only when focused on input fields
    // This prevents scanner-triggered F-keys from affecting inputs
    // but still allows F12 to open dev tools when not focused on inputs
    if (e.type === "keydown" && e.keyCode >= 112 && e.keyCode <= 123) {
      e.preventDefault();
      e.stopPropagation();
      return false;
    }
  };

  // Add event listener to capture events on input elements
  document.addEventListener("keydown", filterScannerInput, true);

  // Disable right-click context menu
  const preventContextMenu = (e) => {
    e.preventDefault();
    return false;
  };
  document.addEventListener("contextmenu", preventContextMenu, true);

  // Return cleanup function
  return () => {
    document.removeEventListener("keydown", filterScannerInput, true);
    document.removeEventListener("contextmenu", preventContextMenu, true);
  };
};
