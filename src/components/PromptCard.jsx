// components/PromptCard.jsx — Anamoria SPA
// Displays the current prompt for a space.
// Prompt text is already personalized by the handler ({name} replaced).
// Props:
//   prompt   — { promptId, text, title, category }
//   spaceName — string (for display)
//   onRecord  — fn — called when "Record a voice note" CTA is tapped

import styles from './PromptCard.module.css';

export default function PromptCard({ prompt, spaceName, onRecord }) {
  if (!prompt) return null;

  return (
    <div className={styles.card}>
      <div className={styles.header}>
        <span className={styles.eyebrow}>This week&apos;s prompt</span>
        {prompt.title && (
          <span className={styles.category}>{prompt.title}</span>
        )}
      </div>

      <p className={styles.text}>{prompt.text}</p>

      <button className={styles.cta} onClick={onRecord}>
        <span className={styles.ctaIcon}>
          {/* Mic SVG — same as BottomNav Record icon */}
          <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" strokeLinecap="round" strokeLinejoin="round">
            <path className={styles.ctaIconFill} d="M12 2a3 3 0 0 0-3 3v6a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3z"/>
            <path d="M18 10.5v.5a6 6 0 0 1-12 0v-.5" strokeWidth="1.5"/>
            <path d="M12 17v4" strokeWidth="1.5"/>
          </svg>
        </span>
        Record a voice note
      </button>
    </div>
  );
}
