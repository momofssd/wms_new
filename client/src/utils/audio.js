/**
 * Audio feedback utilities matching the original application.
 */

export const playLast4Digits = (sku, enabled) => {
  if (!enabled || !sku) return;

  const cleanSku = String(sku).trim();
  const last4 = cleanSku.slice(-4);

  // If there are no digits at the end, just don't play anything
  if (!last4) return;

  // Cancel any ongoing speech to avoid backlog
  if (window.speechSynthesis.speaking) {
    window.speechSynthesis.cancel();
  }

  // Ensure speech synthesis is ready
  setTimeout(() => {
    // We space out the digits so they are read individually
    const textToSpeak = last4.split("").join(" ");
    const utterance = new SpeechSynthesisUtterance(textToSpeak);

    // Choose a clear voice if available
    const voices = window.speechSynthesis.getVoices();
    if (voices.length > 0) {
      utterance.voice =
        voices.find((v) => v.lang.startsWith("en")) || voices[0];
    }

    utterance.rate = 0.9; // Slightly slower for clarity
    utterance.pitch = 1.0;
    utterance.volume = 1.0;

    window.speechSynthesis.speak(utterance);
  }, 50);
};

export const playInvalidInput = (enabled) => {
  if (!enabled) return;

  if (window.speechSynthesis.speaking) {
    window.speechSynthesis.cancel();
  }

  setTimeout(() => {
    const utterance = new SpeechSynthesisUtterance("Invalid Input");
    const voices = window.speechSynthesis.getVoices();
    if (voices.length > 0) {
      utterance.voice =
        voices.find((v) => v.lang.startsWith("en")) || voices[0];
    }
    utterance.rate = 1.0;
    utterance.pitch = 1.0;
    utterance.volume = 1.0;

    window.speechSynthesis.speak(utterance);
  }, 50);
};

// Workaround for some browsers requiring a user gesture to initialize speech
export const initAudio = () => {
  const utterance = new SpeechSynthesisUtterance("");
  window.speechSynthesis.speak(utterance);
};
