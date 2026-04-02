// components/PromptCard.jsx — Anamoria SPA
// v2.0 — Faithful port from LWC axr_MemoryVaultV2 prompt-card
// April 1, 2026
//
// LWC source: axr_MemoryVaultV2.html (prompt-card-wrapper) +
//             axr_MemoryVaultV2.css (.prompt-card, .prompt-label, .prompt-text, .prompt-actions)

import { useState, useCallback } from 'react';
import styles from './PromptCard.module.css';

export default function PromptCard({ prompt, spaceName, onRecord, onSkip }) {
  const [skipping, setSkipping] = useState(false);

  const handleSkip = useCallback(async (e) => {
    e.preventDefault();
    if (skipping || !onSkip) return;
    setSkipping(true);
    try {
      await onSkip();
    } finally {
      setSkipping(false);
    }
  }, [skipping, onSkip]);

  if (!prompt) return null;

  const title = prompt.promptTitle || 'Today\u2019s Remembrance';
  const text = prompt.promptText || 'What do you wish you could tell them today?';

  return (
    <div className={styles.wrapper}>
      <div className={styles.card}>

        {/* Title label — uppercase sage */}
        <span className={styles.label}>{title}</span>

        {/* Prompt text — italic serif */}
        <p className={styles.text}>{text}</p>

        {/* Record button — white bg, sage outline */}
        <div className={styles.actions}>
          <button className={styles.recordBtn} onClick={onRecord}>
            <span className={styles.btnIcon}>
              <svg viewBox="0 0 24 24" fill="none" strokeLinecap="round" strokeLinejoin="round">
                <path
                  d="M12 2a3 3 0 0 0-3 3v6a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3z"
                  fill="currentColor"
                  stroke="none"
                />
                <path d="M18 10.5v.5a6 6 0 0 1-12 0v-.5" strokeWidth="1.5" stroke="currentColor" />
                <path d="M12 17v4" strokeWidth="1.5" stroke="currentColor" />
              </svg>
            </span>
            Record
          </button>
        </div>

        {/* Skip prompt link */}
        {onSkip && (
          <button
            className={styles.skipLink}
            onClick={handleSkip}
            disabled={skipping}
          >
            {skipping ? 'Loading...' : 'Try a different prompt'}
          </button>
        )}
      </div>
    </div>
  );
}
