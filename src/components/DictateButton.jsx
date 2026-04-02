// DictateButton.jsx — Web Speech API dictation
// Replaces LWC c-axr-_-dictate-button
// Appends recognized speech to parent via onTranscript callback

import { useState, useRef, useCallback, useEffect } from 'react';
import styles from './DictateButton.module.css';

const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;

export default function DictateButton({ onTranscript, size = 'medium', disabled = false }) {
  const [listening, setListening] = useState(false);
  const recognitionRef = useRef(null);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (recognitionRef.current) {
        try { recognitionRef.current.abort(); } catch (_) { /* ignore */ }
      }
    };
  }, []);

  const toggle = useCallback(() => {
    if (!SpeechRecognition) {
      console.warn('SpeechRecognition not supported');
      return;
    }

    if (listening && recognitionRef.current) {
      recognitionRef.current.stop();
      setListening(false);
      return;
    }

    const recognition = new SpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = false;
    recognition.lang = 'en-US';

    recognition.onresult = (event) => {
      let transcript = '';
      for (let i = event.resultIndex; i < event.results.length; i++) {
        if (event.results[i].isFinal) {
          transcript += event.results[i][0].transcript;
        }
      }
      if (transcript && onTranscript) {
        onTranscript(transcript);
      }
    };

    recognition.onerror = (event) => {
      console.warn('Speech recognition error:', event.error);
      setListening(false);
    };

    recognition.onend = () => {
      setListening(false);
      recognitionRef.current = null;
    };

    recognitionRef.current = recognition;
    recognition.start();
    setListening(true);
  }, [listening, onTranscript]);

  if (!SpeechRecognition) return null;

  const sizeClass = size === 'small' ? styles.small : styles.medium;

  return (
    <button
      type="button"
      className={`${styles.dictateBtn} ${sizeClass} ${listening ? styles.active : ''}`}
      onClick={toggle}
      disabled={disabled}
      aria-label={listening ? 'Stop dictation' : 'Start dictation'}
      title={listening ? 'Stop dictation' : 'Dictate'}
    >
      {listening ? (
        /* Stop icon (square) */
        <svg viewBox="0 0 24 24" fill="none" className={styles.icon}>
          <rect x="7" y="7" width="10" height="10" rx="1.5" fill="currentColor" />
        </svg>
      ) : (
        /* Mic icon */
        <svg viewBox="0 0 24 24" fill="none" className={styles.icon}>
          <path d="M12 2a3 3 0 0 0-3 3v6a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3z" fill="currentColor" />
          <path d="M18 10.5v.5a6 6 0 0 1-12 0v-.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          <path d="M12 17v3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
      )}
      {listening && <span className={styles.pulse} />}
    </button>
  );
}
