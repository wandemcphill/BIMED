'use client';

import { useEffect, useState } from 'react';

// Reads a question aloud using the browser's built-in text-to-speech (Web Speech API
// SpeechSynthesis) - no third-party service, no API key, no subscription.
export default function SpeakQuestionButton({ text }: { text: string }) {
  const [supported, setSupported] = useState(false);
  const [speaking, setSpeaking] = useState(false);

  useEffect(() => {
    setSupported(typeof window !== 'undefined' && 'speechSynthesis' in window);
    return () => {
      if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
        window.speechSynthesis.cancel();
      }
    };
  }, []);

  if (!supported) return null;

  const play = () => {
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = 'en-IE';
    utterance.onstart = () => setSpeaking(true);
    utterance.onend = () => setSpeaking(false);
    utterance.onerror = () => setSpeaking(false);
    window.speechSynthesis.speak(utterance);
  };

  return (
    <button type="button" className="secondary" onClick={play} disabled={speaking}>
      {speaking ? 'Playing question...' : 'Play question aloud'}
    </button>
  );
}
