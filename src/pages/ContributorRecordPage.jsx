// pages/ContributorRecordPage.jsx — Anamoria SPA
// v1.0 — Session 3 (April 19, 2026)
//
// Contributor voice capture page. Parallel to owner RecordPage.jsx v5.4 but
// adapted for contributor context.
//
// Route: /contribute/:spaceId/record
//
// CSS: Reuses RecordPage.module.css per Session 3 Plan v1.1 decision B2
// (new component, shared CSS module). Zero CSS duplication.
//
// Differences from owner RecordPage.jsx v5.4:
//   - Auth: createContributorApiClient (session token) instead of Auth0 JWT
//   - Space fetch: GET /contribute/:spaceId
//   - Upload URL: POST /contribute/:spaceId/upload-url — spaceId in path, body is
//     {mimeType, mediaType} (differs from owner POST /media/upload-url which
//     takes spaceId in body)
//   - Memory create: POST /contribute/:spaceId/memories with {type:'voice',
//     s3Key, mimeType, duration, title} — no isPrivate, no promptId
//   - No edit mode — edit flow deferred to Session 3.5 (decision E2).
//     All edit-related state, effects, and render branches removed.
//   - No privacy toggle — contributor memories always shared.
//   - No prompt skip — hardcoded generic prompt per decision P2.
//   - No SuccessScreen — saved pill + navigate to feed (S2).
//   - No post-save gating (reminder/feedback) — not applicable to contributors.
//   - LovedOneBar reused unchanged (pure props, no auth coupling).
//   - BottomNav → ContributorBottomNav (3-button, no Invite).
//
// Structure preserved from owner:
//   - useRecorder hook for MediaRecorder API
//   - Circle tap: idle → recording → paused → recording
//   - Stop button to enter review
//   - Review screen: playback + label input + save/re-record
//   - Waveform bars (decorative, 18-bar pattern matches owner)
//   - Blob preview via URL.createObjectURL with revoke cleanup
//
// MIME handling matches owner: strip codec suffix via split(';')[0]; Lambda
// validates against ALLOWED_MIME_TYPES.voice: ['audio/webm', 'audio/mp4',
// 'audio/ogg']. If Lambda allowlist changes, update both RecordPage files.

import { useState, useRef, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useRecorder } from '../hooks/useRecorder';
import { createContributorApiClient, getSessionToken } from '../api/contributorApi';
import LovedOneBar from '../components/LovedOneBar';
import ContributorBottomNav from '../components/ContributorBottomNav';
import styles from './RecordPage.module.css';

const TOAST_DURATION_MS = 2500;

/* ═══════════════════════════════════════
   CONTRIBUTOR RECORD PAGE
   ═══════════════════════════════════════ */

export default function ContributorRecordPage() {
  const { spaceId } = useParams();
  const navigate = useNavigate();

  const {
    recordingState,
    audioBlob,
    mimeType,
    duration,
    durationFormatted,
    error: recorderError,
    startRecording,
    pauseRecording,
    resumeRecording,
    stopRecording,
    reRecord,
  } = useRecorder();

  /* ─── Space data ─── */
  const [space, setSpace] = useState(null);
  const [loadingData, setLoadingData] = useState(true);
  const [loadError, setLoadError] = useState('');

  useEffect(() => {
    const token = getSessionToken();
    if (!token) {
      setLoadError('Your session has expired. Please use your invite link again.');
      setLoadingData(false);
      return;
    }

    let cancelled = false;
    async function load() {
      setLoadingData(true);
      try {
        const api = createContributorApiClient();
        const data = await api.get(`/contribute/${spaceId}`);
        if (!cancelled) setSpace(data);
      } catch (err) {
        if (cancelled) return;
        if (err.error === 'INVALID_SESSION' || err.error === 'NO_SESSION_TOKEN') {
          setLoadError('Your session has expired. Please use your invite link again.');
        } else {
          setLoadError('Could not load this space.');
        }
      } finally {
        if (!cancelled) setLoadingData(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, [spaceId]);

  /* ─── Review + save state ─── */
  const [memoryLabel, setMemoryLabel] = useState('');
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState('');
  const [s3KeySaved, setS3KeySaved] = useState(null);
  const [previewUrl, setPreviewUrl] = useState(null);
  const [playing, setPlaying] = useState(false);
  const [showSavedPill, setShowSavedPill] = useState(false);

  const previewAudioRef = useRef(null);
  const toastTimerRef = useRef(null);

  /* ─── Derive blob preview URL ─── */
  useEffect(() => {
    if (audioBlob && recordingState === 'stopped') {
      const url = URL.createObjectURL(audioBlob);
      setPreviewUrl(url);
      return () => URL.revokeObjectURL(url);
    }
  }, [audioBlob, recordingState]);

  /* ─── Playback control ─── */
  const togglePlayback = useCallback(() => {
    const audio = previewAudioRef.current;
    if (!audio) return;
    if (playing) { audio.pause(); } else { audio.play(); }
    setPlaying(!playing);
  }, [playing]);

  useEffect(() => {
    const audio = previewAudioRef.current;
    if (!audio) return;
    function handleEnded() { setPlaying(false); }
    audio.addEventListener('ended', handleEnded);
    return () => audio.removeEventListener('ended', handleEnded);
  });

  /* ─── Cleanup toast timer on unmount ─── */
  useEffect(() => {
    return () => {
      if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    };
  }, []);

  /* ─── Save handler ─── */
  const handleSave = useCallback(async () => {
    if (!audioBlob) return;
    setUploadError('');
    setUploading(true);

    const baseMimeType = (mimeType || 'audio/webm').split(';')[0];

    try {
      const api = createContributorApiClient();

      // 1. Get pre-signed upload URL from contributor route.
      //    Contributor route takes spaceId in path, body is {mimeType, mediaType}.
      const uploadData = await api.post(`/contribute/${spaceId}/upload-url`, {
        mimeType: baseMimeType,
        mediaType: 'voice',
      });

      // 2. PUT blob directly to S3 (pre-signed URL is self-authorizing).
      await api.putS3(uploadData.uploadUrl, audioBlob, baseMimeType);
      setS3KeySaved(uploadData.s3Key);

      // 3. Create contributor voice memory.
      //    Response: { id, type: 'voice', spaceId, s3Key, duration, createdAt, voiceNoteId }
      //    No isPrivate (Lambda hardcodes FALSE). No promptId (P2 — no backend
      //    prompt for contributors). Discarding response id — no gating for
      //    contributors.
      await api.post(`/contribute/${spaceId}/memories`, {
        type: 'voice',
        s3Key: uploadData.s3Key,
        mimeType: baseMimeType,
        duration: Math.round(duration),
        ...(memoryLabel.trim() ? { title: memoryLabel.trim() } : {}),
      });

      // Show saved pill, then navigate to feed.
      setUploading(false);
      setShowSavedPill(true);
      toastTimerRef.current = setTimeout(() => {
        navigate(`/contribute/${spaceId}/memories`, { replace: true });
      }, TOAST_DURATION_MS);
    } catch (err) {
      console.error('Save error:', err);
      if (err.error === 'INVALID_SESSION' || err.error === 'NO_SESSION_TOKEN') {
        setUploadError('Your session has expired. Please use your invite link again.');
      } else if (err.error === 'S3_UPLOAD_FAILED') {
        setUploadError('Upload failed. Please check your connection and try again.');
      } else if (s3KeySaved) {
        setUploadError('Recording uploaded but save failed. Tap "Save" to retry.');
      } else {
        setUploadError('Upload failed. Please try again.');
      }
      setUploading(false);
    }
  }, [audioBlob, mimeType, duration, memoryLabel, spaceId, s3KeySaved, navigate]);

  /* ─── Circle tap handler ─── */
  const handleCircleTap = useCallback(() => {
    if (recordingState === 'idle') startRecording();
    else if (recordingState === 'recording') pauseRecording();
    else if (recordingState === 'paused') resumeRecording();
  }, [recordingState, startRecording, pauseRecording, resumeRecording]);

  /* ─── Class composition (same as owner) ─── */
  const circleClass = [
    styles.circle,
    recordingState === 'recording' ? styles.circleRecording : '',
    recordingState === 'paused' ? styles.circlePaused : '',
  ].filter(Boolean).join(' ');

  const ringClass = [
    styles.ring,
    recordingState === 'recording' ? styles.ringBreathing : '',
    recordingState === 'paused' ? styles.ringDimmed : '',
  ].filter(Boolean).join(' ');

  const timerClass = [
    styles.timer,
    recordingState === 'recording' ? styles.timerActive : '',
  ].filter(Boolean).join(' ');

  const hintText =
    recordingState === 'recording' ? 'Tap to pause · 5:00 max' :
    recordingState === 'paused'    ? 'Tap to resume · 5:00 max' :
                                     'Tap the circle to start · 5:00 max';

  const stateLabel =
    recordingState === 'recording' ? 'Recording...' :
    recordingState === 'paused'    ? 'Paused' :
                                     'Ready';

  const barSubtitle =
    recordingState === 'stopped'   ? 'Review before saving' :
    recordingState === 'recording' ? 'Recording...' :
    recordingState === 'paused'    ? 'Paused' :
                                     'Ready to record';

  const spaceName = space?.spaceName || 'this space';
  const spacePhotoUrl = space?.photoUrl || null;

  /* ═══════════════════════════════════════════════════════════
     RENDER ORDER (mirrors owner: loading → uploading → saved
     → review → record). No edit branches.
     ═══════════════════════════════════════════════════════════ */

  // ─── 1. Loading ───
  if (loadingData) {
    return (
      <div className={styles.loadingPage}>
        <div className="app-loading-spinner" />
      </div>
    );
  }

  // ─── 2. Load error (pre-space) ───
  if (loadError && !space) {
    return (
      <div className={styles.loadingPage}>
        <p style={{ padding: '24px', textAlign: 'center' }}>{loadError}</p>
      </div>
    );
  }

  // ─── 3. Uploading ───
  if (uploading) {
    return (
      <div className={styles.page}>
        <LovedOneBar
          spaceName={spaceName}
          spacePhotoUrl={spacePhotoUrl}
          subtitle="Saving..."
          onBack={() => {}}
          backLabel="Saving in progress"
        />
        <div className={styles.uploadingContent}>
          <div className="app-loading-spinner" />
          <p className={styles.uploadingText}>Saving your recording...</p>
        </div>
        <ContributorBottomNav spaceId={spaceId} activeTab="record" />
      </div>
    );
  }

  // ─── 4. Review (after recording stops) ───
  if (recordingState === 'stopped' && audioBlob) {
    return (
      <div className={styles.page}>
        <LovedOneBar
          spaceName={spaceName}
          spacePhotoUrl={spacePhotoUrl}
          subtitle="Review before saving"
          onBack={reRecord}
          backLabel="Back to recording"
        />

        {/* Hardcoded generic prompt banner (no skip — P2) */}
        <div className={styles.promptWrap}>
          <HardcodedPromptBanner spaceName={spaceName} />
        </div>

        <div className={styles.reviewBody}>
          {/* Playback card */}
          <div className={styles.playbackCard}>
            <span className={styles.playbackLabel}>YOUR RECORDING</span>
            <div className={styles.playerRow}>
              <button
                className={`${styles.playBtn} ${playing ? styles.playBtnPlaying : ''}`}
                onClick={togglePlayback}
                aria-label={playing ? 'Pause playback' : 'Play recording'}
              >
                {playing ? (
                  <svg width="12" height="14" viewBox="0 0 12 14" fill="white">
                    <rect x="0" y="0" width="4" height="14" rx="1" />
                    <rect x="8" y="0" width="4" height="14" rx="1" />
                  </svg>
                ) : (
                  <svg width="12" height="14" viewBox="0 0 12 14" fill="white">
                    <path d="M0 0l12 7-12 7V0z" />
                  </svg>
                )}
              </button>

              <div className={styles.waveform}>
                {[8,14,10,18,12,20,16,22,14,18,10,16,20,12,8,14,6,10].map((h, i) => (
                  <span
                    key={i}
                    className={`${styles.waveBar} ${i >= 12 ? styles.waveBarLight : ''}`}
                    style={{ height: `${h}px` }}
                  />
                ))}
              </div>

              <span className={styles.playbackDuration}>{durationFormatted}</span>
            </div>

            {previewUrl && (
              <audio ref={previewAudioRef} src={previewUrl} className={styles.hiddenAudio} />
            )}
          </div>

          {/* Settings card — label only (no privacy toggle for contributors) */}
          <div className={styles.settingsCard}>
            <div className={styles.settingsInputRow}>
              <input
                type="text"
                className={styles.labelInput}
                placeholder="Label (optional) — e.g., Advice, Funny moments..."
                value={memoryLabel}
                onChange={(e) => setMemoryLabel(e.target.value)}
              />
            </div>
          </div>

          {uploadError && (
            <p className={styles.uploadError} role="alert">{uploadError}</p>
          )}

          {/* Action buttons */}
          <div className={styles.reviewActions}>
            <button className={styles.saveBtn} onClick={handleSave}>
              Add to {spaceName}'s space
            </button>
            <button className={styles.reRecordBtn} onClick={reRecord}>
              Re-record
            </button>
          </div>
        </div>

        <ContributorBottomNav spaceId={spaceId} activeTab="record" />

        {showSavedPill && <SavedPill />}
      </div>
    );
  }

  /* ─── 5. Record screen (idle / recording / paused) ─── */
  return (
    <div className={styles.page}>
      <LovedOneBar
        spaceName={spaceName}
        spacePhotoUrl={spacePhotoUrl}
        subtitle={barSubtitle}
        onBack={() => navigate(`/contribute/${spaceId}/memories`, { replace: true })}
        backLabel="Back to feed"
      />

      <div className={styles.recordingContent}>
        {/* Hardcoded generic prompt banner (no skip — P2) */}
        <div className={styles.promptWrap}>
          <HardcodedPromptBanner spaceName={spaceName} />
        </div>

        <div className={styles.circleArea}>
          <button
            className={circleClass}
            onClick={handleCircleTap}
            aria-label={
              recordingState === 'idle'      ? 'Start recording' :
              recordingState === 'recording' ? 'Pause recording' :
                                               'Resume recording'
            }
          >
            <div className={ringClass} />
            <div className={styles.dot} />
          </button>

          <div className={styles.statusArea}>
            <div className={styles.timerRow}>
              <span className={timerClass}>{durationFormatted}</span>
              <span className={styles.stateLabel}>{stateLabel}</span>
            </div>
            <p className={styles.hint}>{hintText}</p>
          </div>

          {recorderError && (
            <p className={styles.recorderError} role="alert">{recorderError}</p>
          )}

          {(recordingState === 'recording' || recordingState === 'paused') && (
            <div className={styles.controls}>
              <button
                className={styles.stopBtn}
                onClick={stopRecording}
                aria-label="Stop recording"
              >
                <span className={styles.stopIcon} />
                Stop
              </button>
            </div>
          )}
        </div>
      </div>

      <ContributorBottomNav spaceId={spaceId} activeTab="record" />
    </div>
  );
}

/* ═══════════════════════════════════════
   HARDCODED PROMPT BANNER
   Inline component — Session 3 P2 decision. Contributors don't hit the
   backend prompt endpoints (owner /spaces/:id/prompt is JWT-authed). Generic
   guidance only. No skip link (no prompt to advance).

   Visual: mirrors PromptBanner fullWidth mode for visual consistency.
   Uses styles from RecordPage.module.css:
     - .promptWrap wraps (negative margin on record screen, normal on review)
   No dedicated prompt banner classes here — the wrap alone provides the
   container styling; the inner card uses its own inline styles to avoid
   touching PromptBanner.module.css (owner-owned).
   ═══════════════════════════════════════ */

function HardcodedPromptBanner({ spaceName }) {
  return (
    <div
      style={{
        background: 'linear-gradient(135deg, #e8f0e8 0%, #d8e8d8 100%)',
        borderTop: '1px solid rgba(124, 152, 133, 0.3)',
        borderBottom: '1px solid rgba(124, 152, 133, 0.3)',
        padding: '20px 24px',
        textAlign: 'center',
      }}
    >
      <span
        style={{
          display: 'block',
          fontSize: '11px',
          fontWeight: 800,
          textTransform: 'uppercase',
          letterSpacing: '0.1em',
          color: '#5b7a65',
          marginBottom: '6px',
          fontFamily: 'var(--font-sans, "DM Sans", -apple-system, sans-serif)',
        }}
      >
        Share a memory
      </span>
      <p
        style={{
          fontSize: '18px',
          fontStyle: 'italic',
          color: '#2d3436',
          margin: 0,
          lineHeight: 1.4,
          fontFamily: 'var(--font-serif, "Lora", Georgia, serif)',
        }}
      >
        Share a memory of {spaceName}.
      </p>
    </div>
  );
}

/* ═══════════════════════════════════════
   SAVED PILL TOAST
   Mirrors ContributorWritePage + ContributorPhotoPage SavedPill.
   ═══════════════════════════════════════ */

function SavedPill() {
  return (
    <div
      role="status"
      aria-live="polite"
      style={{
        position: 'fixed',
        left: '50%',
        transform: 'translateX(-50%)',
        bottom: 'calc(88px + env(safe-area-inset-bottom, 0px))',
        // Sits above bottom nav on record/review screens (owner pattern has
        // ~72px nav + margin, add extra for contributor here).
        background: 'var(--color-text-primary, #2d3436)',
        color: '#ffffff',
        padding: '12px 20px',
        borderRadius: '24px',
        fontSize: '14px',
        fontWeight: 500,
        fontFamily: 'var(--font-sans, "DM Sans", -apple-system, sans-serif)',
        boxShadow: '0 4px 12px rgba(0, 0, 0, 0.15)',
        display: 'flex',
        alignItems: 'center',
        gap: '8px',
        zIndex: 1000,
        pointerEvents: 'none',
      }}
    >
      <span
        aria-hidden="true"
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          width: '18px',
          height: '18px',
          borderRadius: '50%',
          background: 'var(--color-sage, #7c9885)',
          color: '#ffffff',
          fontSize: '11px',
          lineHeight: 1,
        }}
      >
        ✓
      </span>
      Saved
    </div>
  );
}
