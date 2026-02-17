import { useEffect } from "react";

/**
 * Hook to prevent F1-F12 hotkeys often triggered by scanner devices
 * and disable the right-click context menu.
 * Uses modern key/code properties and aggressive event interception.
 */
export const useScannerHotkeys = () => {
  useEffect(() => {
    const preventScannerKeys = (e) => {
      const key = e.key;
      const code = e.code;

      // Block F1-F12 function keys
      const isFunctionKey =
        (key && key.length === 2 && key.startsWith("F")) ||
        (code && code.startsWith("F") && code.length >= 2 && code.length <= 3);

      // Block Ctrl+Shift+I, Ctrl+Shift+J, Ctrl+Shift+C (DevTools)
      const isDevToolsCombo =
        e.ctrlKey &&
        e.shiftKey &&
        (key === "I" ||
          key === "i" ||
          key === "J" ||
          key === "j" ||
          key === "C" ||
          key === "c" ||
          code === "KeyI" ||
          code === "KeyJ" ||
          code === "KeyC");

      // Block Ctrl+U (View Source)
      const isViewSource =
        e.ctrlKey && (key === "U" || key === "u" || code === "KeyU");

      // Block F12 specifically as a fallback check
      const isF12 = key === "F12" || code === "F12" || e.keyCode === 123;

      // Block Alt key
      const isAltKey =
        e.altKey || key === "Alt" || code === "AltLeft" || code === "AltRight";

      if (
        isFunctionKey ||
        isDevToolsCombo ||
        isViewSource ||
        isF12 ||
        isAltKey
      ) {
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation();
        return false;
      }
    };

    const preventContextMenu = (e) => {
      e.preventDefault();
      e.stopPropagation();
      e.stopImmediatePropagation();
      return false;
    };

    const events = ["keydown", "keyup", "keypress"];
    const targets = [window, window.document];

    if (window.parent && window.parent !== window) {
      try {
        targets.push(window.parent);
        targets.push(window.parent.document);
      } catch (err) {
        // Cross-origin
      }
    }

    targets.forEach((target) => {
      events.forEach((evt) => {
        target.addEventListener(evt, preventScannerKeys, true);
      });
      target.addEventListener("contextmenu", preventContextMenu, true);
    });

    return () => {
      targets.forEach((target) => {
        events.forEach((evt) => {
          target.removeEventListener(evt, preventScannerKeys, true);
        });
        target.removeEventListener("contextmenu", preventContextMenu, true);
      });
    };
  }, []);
};
