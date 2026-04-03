// components/PromptBanner.jsx — Anamoria SPA
// v1.1 — Prompt banner for capture screens (April 2, 2026)
//
// Props:
//   prompt    — { text, title, category, promptId } (required)
//   onSkip    — function|null — callback for "Try a different prompt"
//   showSkip  — boolean — show the skip link (default: true)
//   fullWidth — boolean — edge-to-edge mode, no border-radius (default: false)

import styles from './PromptBanner.module.css';

export default function PromptBanner({ prompt, onSkip, showSkip = true, fullWidth = false }) {
  if (!prompt || !prompt.text) return null;

  const categoryLabel = prompt.title || prompt.category || "TODAY'S REMEMBRANCE";

  return (
    <div className={`${styles.banner} ${fullWidth ? styles.bannerFull : ''}`}>
      <span className={styles.category}>{categoryLabel}</span>
      <p className={styles.text}>{prompt.text}</p>
      {showSkip && onSkip && (
        <button className={styles.skip} onClick={onSkip}>
          Try a different prompt
        </button>
      )}
    </div>
  );
}
