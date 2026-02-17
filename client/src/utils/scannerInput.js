import { useCallback, useRef, useState } from "react";
import { useAuth } from "../context/AuthContext";
import { playInvalidInput } from "./audio";

/**
 * Hook to handle scanner input with special character detection.
 * If a special character is detected, the input is disabled for 2 seconds.
 */
export const useScannerInput = (setter) => {
  const { audioEnabled } = useAuth();
  const [isDisabled, setIsDisabled] = useState(false);
  const timeoutRef = useRef(null);

  const handleInputChange = useCallback(
    (e) => {
      const value = e.target.value;

      // Regular expression for special characters (not alphanumeric or space)
      // You can adjust this based on what characters should be blocked.
      // Common scanner special characters: ~ ! @ # $ % ^ & * ( ) _ + { } | : " < > ? ` - = [ ] \ ; ' , . /
      const specialCharRegex = /[^a-zA-Z0-9 ]/;

      if (specialCharRegex.test(value)) {
        setIsDisabled(true);
        setter(""); // Clear the input
        playInvalidInput(audioEnabled);

        if (timeoutRef.current) {
          clearTimeout(timeoutRef.current);
        }

        timeoutRef.current = setTimeout(() => {
          setIsDisabled(false);
        }, 2000);
      } else {
        setter(value);
      }
    },
    [setter],
  );

  return {
    isDisabled,
    handleInputChange,
  };
};
