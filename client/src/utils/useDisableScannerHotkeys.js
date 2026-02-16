import { useEffect } from "react";

/**
 * Prevent scanner devices from triggering browser devtools / reserved actions.
 *
 * Blocks F1-F12 on keydown in the capture phase so the browser never sees it.
 * Also optionally disables the right-click context menu.
 */
export default function useDisableScannerHotkeys({
  disableContextMenu = true,
} = {}) {
  useEffect(() => {
    /** @param {KeyboardEvent} e */
    function preventScannerKeys(e) {
      // Only block F1-F12 function keys.
      // Using keyCode first avoids accidentally blocking the regular 'f' key.
      const code = e.keyCode ?? e.which;
      const isFunctionKeyByCode = code >= 112 && code <= 123;
      const isFunctionKeyByKey =
        typeof e.key === "string" && /^F(\d|1[0-2])$/.test(e.key);

      if (e.type === "keydown" && (isFunctionKeyByCode || isFunctionKeyByKey)) {
        e.preventDefault();
        e.stopPropagation();
        // stopImmediatePropagation is supported on native events; guard for safety.
        if (typeof e.stopImmediatePropagation === "function") {
          e.stopImmediatePropagation();
        }
        return false;
      }
    }

    /** @param {MouseEvent} e */
    function preventContextMenu(e) {
      e.preventDefault();
      e.stopPropagation();
      if (typeof e.stopImmediatePropagation === "function") {
        e.stopImmediatePropagation();
      }
      return false;
    }

    // Capture phase so we intercept before browser/other handlers.
    document.addEventListener("keydown", preventScannerKeys, true);
    window.addEventListener("keydown", preventScannerKeys, true);

    if (disableContextMenu) {
      document.addEventListener("contextmenu", preventContextMenu, true);
    }

    return () => {
      document.removeEventListener("keydown", preventScannerKeys, true);
      window.removeEventListener("keydown", preventScannerKeys, true);
      if (disableContextMenu) {
        document.removeEventListener("contextmenu", preventContextMenu, true);
      }
    };
  }, [disableContextMenu]);
}
