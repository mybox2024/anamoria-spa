// WritePage.jsx — /spaces/:id/write
// Two sub-screens: compose → review → save
// Ported from LWC currentStep === 'write' → 'writeReview'

import { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth0 } from '@auth0/auth0-react';
import { createApiClient } from '../api/client';
import DictateButton from '../components/DictateButton';
import styles from './WritePage.module.css';

const MAX_CHARS = 10000;

export default function WritePage() {
  const { spaceId } = useParams();
  const navigate = useNavigate();
  const { getAccessTokenSilently } = useAuth0();

  // Space data
  const [space, setSpace] = useState(null);
  // Prompt data
  const [prompt, setPrompt] = useState(null);
  // Form state
  const [title, setTitle] = useState('');
  const [text, setText] = useState('');
  const [isPrivate, setIsPrivate] = useState(true);
  // UI state
  const [step, setStep] = useState('compose'); // 'compose' | 'review'
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  const textareaRef = useRef(null);

  // ─── Fetch space + prompt on mount ───
  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const api = createApiClient(getAccessTokenSilently);
        const [spaceData, promptData] = await Promise.all([
          api.get(`/spaces/${spaceId}`),
          api.get(`/spaces/${spaceId}/prompt`),
        ]);
        if (cancelled) return;
        setSpace(spaceData);
        setPrompt(promptData);
      } catch (err) {
        console.error('WritePage load error:', err);
        if (!cancelled) setError('Failed to load. Please go back and try again.');
      }
    }
    load();
    return () => { cancelled = true; };
  }, [spaceId, getAccessTokenSilently]);

  // ─── Focus textarea when entering compose ───
  useEffect(() => {
    if (step === 'compose' && textareaRef.current) {
      // Small delay to let transition complete
      const t = setTimeout(() => textareaRef.current?.focus(), 100);
      return () => clearTimeout(t);
    }
  }, [step]);

  // ─── Handlers ───

  const handleTextChange = useCallback((e) => {
    const val = e.target.value;
    if (val.length <= MAX_CHARS) {
      setText(val);
    }
  }, []);

  const handleTitleChange = useCallback((e) => {
    setTitle(e.target.value);
  }, []);

  const handleDictation = useCallback((transcript) => {
    setText((prev) => {
      const separator = prev && !prev.endsWith(' ') ? ' ' : '';
      const next = prev + separator + transcript;
      return next.length <= MAX_CHARS ? next : next.substring(0, MAX_CHARS);
    });
    // Sync textarea value
    if (textareaRef.current) {
      // Need to update via state, not direct DOM — React controls this
    }
  }, []);

  const handleCancel = useCallback(() => {
    navigate(`/spaces/${spaceId}`);
  }, [navigate, spaceId]);

  const handleReview = useCallback(() => {
    if (!text.trim()) return;
    setStep('review');
  }, [text]);

  const handleBackToCompose = useCallback(() => {
    setStep('compose');
  }, []);

  const handleSkipPrompt = useCallback(async () => {
    try {
      const api = createApiClient(getAccessTokenSilently);
      await api.post(`/spaces/${spaceId}/prompt/advance`, {});
      const newPrompt = await api.get(`/spaces/${spaceId}/prompt`);
      setPrompt(newPrompt);
    } catch (err) {
      console.error('Skip prompt error:', err);
    }
  }, [spaceId, getAccessTokenSilently]);

  const handleSave = useCallback(async () => {
    if (saving) return;
    setSaving(true);
    setError(null);

    try {
      const api = createApiClient(getAccessTokenSilently);

      // 1. Create text memory
      await api.post(`/spaces/${spaceId}/memories`, {
        type: 'text',
        note: text.trim(),
        title: title.trim() || null,
        isPrivate,
        promptId: prompt?.promptId || null,
      });

      // 2. Record prompt response (if prompt was active)
      if (prompt?.promptId) {
        try {
          await api.post(`/spaces/${spaceId}/prompt/respond`, {
            promptId: prompt.promptId,
          });
        } catch (_) {
          // Non-critical — don't block save
        }
      }

      // 3. Navigate back to space feed
      navigate(`/spaces/${spaceId}`);
    } catch (err) {
      console.error('Save error:', err);
      setError("Something didn't save. Please try again.");
      setSaving(false);
    }
  }, [saving, text, title, isPrivate, prompt, spaceId, getAccessTokenSilently, navigate]);

  // ─── Derived values ───
  const charCount = text.length;
  const nearLimit = charCount > 9000;
  const canReview = text.trim().length > 0;
  const spaceInitial = space?.name ? space.name.charAt(0).toUpperCase() : '?';

  // ─── Loading state ───
  if (!space) {
    return (
      <div className={styles.loading}>
        <div className={styles.loadingDot} />
        <span>Loading...</span>
      </div>
    );
  }

  // ─── Error state ───
  if (error && !space) {
    return (
      <div className={styles.errorScreen}>
        <p>{error}</p>
        <button className={styles.btnPrimary} onClick={() => navigate(`/spaces/${spaceId}`)}>
          Go back
        </button>
      </div>
    );
  }

  // ═══════════════════════════════════════════════════
  //  REVIEW SUB-SCREEN
  // ═══════════════════════════════════════════════════
  if (step === 'review') {
    return (
      <div className={styles.reviewScreen}>
        {/* LovedOneBar */}
        <div className={styles.lovedOneBar}>
          <div className={styles.lovedOneBarInner}>
            <div className={styles.barAvatar}>
              {space.photoUrl ? (
                <img src={space.photoUrl} alt={space.name} className={styles.barAvatarImg} />
              ) : (
                <span className={styles.barAvatarInitial}>{spaceInitial}</span>
              )}
            </div>
            <div className={styles.barInfo}>
              <span className={styles.barName}>{space.name}</span>
              <span className={styles.barSub}>Review your memory</span>
            </div>
          </div>
        </div>

        {/* Review content */}
        <div className={styles.reviewContent}>
          {/* Preview card */}
          <div className={styles.reviewPreview}>
            {title.trim() && (
              <h3 className={styles.reviewTitle}>{title.trim()}</h3>
            )}
            <p className={styles.reviewText}>{text}</p>
          </div>

          {/* Privacy toggle */}
          <div className={styles.privacySection}>
            <div className={styles.privacyRow} onClick={() => setIsPrivate((p) => !p)}>
              <div className={styles.privacyLabel}>
                <span className={styles.privacyIcon}>{isPrivate ? '🔒' : '👥'}</span>
                <span className={styles.privacyText}>
                  {isPrivate ? 'Private — only you can see this' : 'Shared with family'}
                </span>
              </div>
              <div className={`${styles.toggleTrack} ${isPrivate ? styles.togglePrivate : styles.toggleShared}`}>
                <div className={styles.toggleThumb} />
              </div>
            </div>
            <p className={styles.privacyHint}>You can change this anytime</p>
          </div>

          {/* Error message */}
          {error && (
            <div className={styles.errorBanner}>{error}</div>
          )}

          {/* Actions */}
          <div className={styles.reviewActions}>
            <button
              className={styles.btnPrimary}
              onClick={handleSave}
              disabled={saving}
            >
              {saving ? 'Saving...' : 'Save memory'}
            </button>
            <button
              className={styles.btnGhost}
              onClick={handleBackToCompose}
              disabled={saving}
            >
              ← Edit
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ═══════════════════════════════════════════════════
  //  COMPOSE SUB-SCREEN (default)
  // ═══════════════════════════════════════════════════
  return (
    <div className={styles.composeScreen}>
      {/* LovedOneBar */}
      <div className={styles.lovedOneBar}>
        <div className={styles.lovedOneBarInner}>
          <button
            className={styles.barBackLink}
            onClick={handleCancel}
            aria-label="Back to feed"
          >
            ←
          </button>
          <div className={styles.barAvatar}>
            {space.photoUrl ? (
              <img src={space.photoUrl} alt={space.name} className={styles.barAvatarImg} />
            ) : (
              <span className={styles.barAvatarInitial}>{spaceInitial}</span>
            )}
          </div>
          <div className={styles.barInfo}>
            <span className={styles.barName}>{space.name}</span>
            <span className={styles.barSub}>Write a memory</span>
          </div>
        </div>
      </div>

      {/* Compose content */}
      <div className={styles.composeContent}>
        {/* Prompt banner */}
        {prompt && prompt.text && (
          <div className={styles.promptBanner}>
            <span className={styles.promptCategory}>
              {prompt.title || "TODAY'S REMEMBRANCE"}
            </span>
            <p className={styles.promptText}>{prompt.text}</p>
            <button className={styles.promptSkip} onClick={handleSkipPrompt}>
              Try a different prompt
            </button>
          </div>
        )}

        {/* Title input */}
        <input
          type="text"
          className={styles.titleInput}
          placeholder="Give it a title (optional)"
          value={title}
          onChange={handleTitleChange}
          maxLength={75}
        />

        {/* Textarea with dictate button */}
        <div className={styles.textareaWrap}>
          <textarea
            ref={textareaRef}
            className={styles.textarea}
            placeholder="Start writing... say whatever comes to mind."
            value={text}
            onChange={handleTextChange}
            maxLength={MAX_CHARS}
          />
          <div className={styles.dictatePosition}>
            <DictateButton onTranscript={handleDictation} size="medium" />
          </div>
        </div>

        {/* Footer */}
        <div className={styles.footer}>
          <span className={`${styles.charCount} ${nearLimit ? styles.nearLimit : ''}`}>
            {charCount.toLocaleString()} / 10,000
          </span>
          <div className={styles.footerButtons}>
            <button className={styles.btnCancel} onClick={handleCancel}>
              Cancel
            </button>
            <button
              className={styles.btnReview}
              onClick={handleReview}
              disabled={!canReview}
            >
              Review
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
