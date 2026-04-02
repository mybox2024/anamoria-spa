// components/VoiceCard.jsx — Anamoria SPA
// Warm amber theme ported faithfully from LWC axr_MediaCard.css
// v2.0 — Space screen overhaul (April 1, 2026)
//
// API fields (camelCase from memories handler):
//   memory.voiceNote.s3Key, memory.voiceNote.duration
//   memory.createdAt, memory.isPrivate, memory.isFavorite, memory.s3Key

import { useState, useRef, useCallback } from 'react';
import styles from './VoiceCard.module.css';

/* ─── Helpers ─── */

function formatDuration(val) {
  const s = Math.round(Number(val) || 0);
  return `${Math.floor(s / 60)}:${(s % 60).toString().padStart(2, '0')}`;
}

function formatDate(dateStr) {
  if (!dateStr) return '';
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return '';
    const diff = Math.floor((Date.now() - d.getTime()) / 1000);
    if (diff < 60) return 'just now';
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
    return d.toLocaleDateString('en-US', { month: 'numeric', day: 'numeric', year: 'numeric' });
  } catch {
    return '';
  }
}

// Waveform bar heights — matches LWC axr_MediaCard.html (12 bars)
const WAVE_BARS = [8, 14, 10, 18, 12, 20, 8, 16, 14, 10, 18, 6];

/* ─── Heart SVG (inline, matches LWC grid-item-change-icon) ─── */

function HeartIcon({ filled }) {
  if (filled) {
    return (
      <svg viewBox="0 0 24 24" width="14" height="14" fill="#e76869">
        <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
    </svg>
  );
}

/* ─── Edit (pencil) SVG ─── */

function EditIcon() {
  return (
    <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z" />
    </svg>
  );
}

/* ─── Privacy SVG icons (matches LWC card-privacy-icon) ─── */

function PrivacyIcon({ isPrivate }) {
  if (isPrivate) {
    return (
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#737373" strokeWidth="1.5" strokeLinecap="round">
        <rect x="5" y="11" width="14" height="10" rx="2" />
        <path d="M8 11V7a4 4 0 0 1 8 0v4" />
      </svg>
    );
  }
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#737373" strokeWidth="1.5" strokeLinecap="round">
      <circle cx="12" cy="12" r="10" />
      <path d="M2 12h20M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
    </svg>
  );
}

/* ═══════════════════════════════════════════
   VoiceCard Component
   ═══════════════════════════════════════════ */

export default function VoiceCard({ memory, getApi, onFavorite, onEdit, onClick }) {
  const [playing, setPlaying] = useState(false);
  const [loadingAudio, setLoadingAudio] = useState(false);
  const [progress, setProgress] = useState(0);
  const audioRef = useRef(null);

  // camelCase fields from memories handler
  const s3Key = memory.voiceNote?.s3Key || memory.s3Key;
  const duration = memory.voiceNote?.duration || 0;
  const title = memory.title || 'Voice Note';
  const isPrivate = memory.isPrivate;
  const isFavorite = memory.isFavorite;
  const createdAt = memory.createdAt;

  /* ─── Audio playback ─── */

  const handlePlayPause = useCallback(async (e) => {
    e.stopPropagation(); // Don't trigger card click
    if (loadingAudio) return;

    if (audioRef.current && playing) {
      audioRef.current.pause();
      setPlaying(false);
      return;
    }
    if (audioRef.current && !playing) {
      audioRef.current.play();
      setPlaying(true);
      return;
    }
    if (!s3Key) return;

    setLoadingAudio(true);
    try {
      const api = getApi();
      const data = await api.get(`/media/playback/${encodeURIComponent(s3Key)}`);
      const audio = new Audio(data.playbackUrl);
      audioRef.current = audio;
      audio.ontimeupdate = () => {
        if (audio.duration) setProgress((audio.currentTime / audio.duration) * 100);
      };
      audio.onended = () => { setPlaying(false); setProgress(0); };
      audio.onerror = () => { setPlaying(false); setLoadingAudio(false); };
      await audio.play();
      setPlaying(true);
    } catch (err) {
      console.error('Playback error:', err);
    } finally {
      setLoadingAudio(false);
    }
  }, [playing, loadingAudio, s3Key, getApi]);

  /* ─── Favorite toggle ─── */

  const handleFavorite = useCallback((e) => {
    e.stopPropagation();
    if (onFavorite) onFavorite(memory);
  }, [memory, onFavorite]);

  /* ─── Edit click ─── */

  const handleEdit = useCallback((e) => {
    e.stopPropagation();
    if (onEdit) onEdit(memory);
  }, [memory, onEdit]);

  /* ─── Card click ─── */

  const handleCardClick = useCallback(() => {
    if (onClick) onClick(memory);
  }, [memory, onClick]);

  return (
    <div
      className={styles.card}
      onClick={handleCardClick}
      role="button"
      tabIndex={0}
    >
      {/* Header: dot icon + VOICE label + title */}
      <div className={styles.header}>
        <div className={styles.headerTop}>
          <span className={styles.dot} />
          <span className={styles.label}>VOICE</span>
        </div>
        {title && <p className={styles.title}>{title}</p>}
      </div>

      {/* Player: play btn + waveform + duration */}
      <div className={styles.player}>
        <button
          className={styles.playBtn}
          onClick={handlePlayPause}
          aria-label={playing ? 'Pause' : 'Play'}
        >
          {loadingAudio ? (
            <div className={styles.playLoading} />
          ) : playing ? (
            <svg viewBox="0 0 24 24" width="10" height="10">
              <rect x="5" y="4" width="4" height="16" rx="1" fill="white" />
              <rect x="15" y="4" width="4" height="16" rx="1" fill="white" />
            </svg>
          ) : (
            <svg viewBox="0 0 24 24" width="9" height="9">
              <path d="M6 4l14 8-14 8V4z" fill="white" />
            </svg>
          )}
        </button>

        <div className={styles.waveform}>
          {WAVE_BARS.map((h, i) => (
            <div
              key={i}
              className={styles.waveBar}
              style={{
                height: `${h}px`,
                opacity: playing ? 0.5 : 0.3,
              }}
            />
          ))}
        </div>

        <span className={styles.duration}>{formatDuration(duration)}</span>
      </div>

      {/* Footer: date + privacy */}
      <div className={styles.footer}>
        <span className={styles.date}>{formatDate(createdAt)}</span>
        <span className={styles.privacyIcon}>
          <PrivacyIcon isPrivate={isPrivate} />
        </span>
      </div>

      {/* Hover overlay: favorite + edit */}
      <div className={`${styles.overlay} ${isFavorite ? styles.overlayLiked : ''}`}>
        <button
          className={`${styles.overlayBtn} ${isFavorite ? styles.overlayBtnLiked : ''}`}
          onClick={handleFavorite}
          aria-label={isFavorite ? 'Remove from favorites' : 'Add to favorites'}
          aria-pressed={isFavorite}
        >
          <HeartIcon filled={isFavorite} />
        </button>
        <button
          className={`${styles.overlayBtn} ${styles.overlayEdit} ${isFavorite ? styles.overlayEditWhenLiked : ''}`}
          onClick={handleEdit}
          aria-label="Edit memory"
        >
          <EditIcon />
        </button>
      </div>
    </div>
  );
}
