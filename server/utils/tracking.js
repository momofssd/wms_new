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
  const candidates = [];

  // Find all possible 22-digit sequences starting with 92-95
  for (let i = 0; i < textStr.length - 21; i++) {
    const prefix = textStr.slice(i, i + 2);
    if (["92", "93", "94", "95"].includes(prefix)) {
      const potential = textStr.slice(i, i + 22);
      if (/^\d{22}$/.test(potential)) {
        if (isValidUSPSTracking(potential)) {
          candidates.push({ pos: i, tracking: potential });
        }
      }
    }
  }

  // Take the rightmost valid match
  if (candidates.length > 0) {
    const tracking = candidates[candidates.length - 1].tracking;
    if (!numbers.includes(tracking)) {
      numbers.push(tracking);
    }
  }

  // Also try regex patterns for spaced/hyphenated formats
  // USPS numbers are often 22 digits, but can be found in chunks
  const spacedRegex = /[\d\s-]{20,45}/g;
  const matches = textStr.match(spacedRegex) || [];
  for (const chunk of matches) {
    const compact = chunk.replace(/\D/g, "");
    if (
      compact.length === 22 &&
      ["92", "93", "94", "95"].some((prefix) => compact.startsWith(prefix))
    ) {
      if (isValidUSPSTracking(compact) && !numbers.includes(compact)) {
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
