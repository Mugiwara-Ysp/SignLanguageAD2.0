import { useCallback, useEffect, useRef, useState } from 'react';

export interface SpeechState {
  supported: boolean;
  speaking: boolean;
  error: string | null;
  speak: (text: string) => void;
  stop: () => void;
}

export function useSpeech(): SpeechState {
  const supported =
    typeof window !== 'undefined' &&
    typeof window.speechSynthesis?.speak === 'function' &&
    typeof window.speechSynthesis?.cancel === 'function' &&
    typeof SpeechSynthesisUtterance !== 'undefined';
  const [speaking, setSpeaking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const utteranceRef = useRef<SpeechSynthesisUtterance | null>(null);

  const stop = useCallback(() => {
    if (supported) window.speechSynthesis?.cancel();
    utteranceRef.current = null;
    setSpeaking(false);
  }, [supported]);

  const speak = useCallback(
    (text: string) => {
      if (!supported || !text.trim()) return;

      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = 'en-IN';
      utterance.onend = () => {
        if (utteranceRef.current !== utterance) return;
        utteranceRef.current = null;
        setSpeaking(false);
      };
      utterance.onerror = (event) => {
        if (utteranceRef.current !== utterance) return;
        utteranceRef.current = null;
        setSpeaking(false);
        if (event.error !== 'interrupted' && event.error !== 'canceled') {
          setError('Text-to-speech could not play. Check your device volume and try again.');
        }
      };

      utteranceRef.current = utterance;
      setError(null);
      setSpeaking(true);
      window.speechSynthesis.speak(utterance);
    },
    [supported],
  );

  useEffect(() => {
    if (!supported) return;
    return () => window.speechSynthesis?.cancel();
  }, [supported]);

  return { supported, speaking, error, speak, stop };
}
