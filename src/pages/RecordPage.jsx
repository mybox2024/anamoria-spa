// pages/RecordPage.jsx — Anamoria SPA
// v5.4 — Session 2 (April 19, 2026)
//
// Changes from v5.3:
//   - Session 2 feedback routing. Three narrow additions:
//
//     1. NEW STATE `savedMemoryId`. Captures the id returned by the
//        successful POST to /spaces/:id/memories so the feedback branch
//        of handleViewAllMemories can put it into router.state.memoryId.
//        Per Plan v1.2 Q5 + D1c (Option A — session decision).
//
//     2. `handleSave` now captures the POST response. v5.3 discarded it;
//        v5.4 stores `created.id` into savedMemoryId before setSaved(true).
//        Response shape verified against anamoria-memories Lambda v2.0
//        (createVoiceMemory → returns {id, type, spaceId, s3Key, duration,
//        createdAt, voiceNoteId}). This is the only scope extension beyond
//        handler-only changes, documented per the session guardrail.
//        EDIT PATH (`handleEditSave`) is INTENTIONALLY NOT MODIFIED —
//        edits bypass gating via the editMode early-return, so the id is
//        not needed for edits.
//
//     3. `handleViewAllMemories` feedback branch now routes to
//        /spaces/:id/feedback with full router.state instead of falling
//        through to the feed. The branch splits:
//           gate.redirectTo === 'reminder'  → /spaces/:id/reminder
//           gate.redirectTo === 'feedback'  → /spaces/:id/feedback (NEW)
//           default (feed)                  → /spaces/:id
//        editMode early-return unchanged (edits never gate).
//
//     4. `handleRecordAnother` additionally resets savedMemoryId to null
//        so the next save within this mount gets its own id and can't
//        accidentally reuse the previous one.
//
//   - postSaveGating v1.2 call: `userMemoryCount` argument is OMITTED
//     from the caller side. The helper fetches it from
//     GET /spaces/{id}/memories/count internally (parallel with the
//     stats fetch). Per session decision on File 5 review.
//
//   - No other changes. Record screen (5a), Review screen (5b, create +
//     edit variants), Uploading, Loading, Success body apart from the
//     handleViewAllMemories edit, handlers except the three listed above,
//     state shape apart from savedMemoryId, effects, refs, useRecorder
//     integration, LovedOneBar usage, BottomNav placement, re-record
//     confirmation modal — all byte-identical to v5.3.
//
// editMode guard rationale (unchanged from v5.3):
//   RecordPage's success branch renders `<SuccessScreen>` for both create
//   (handleSave) and edit (handleEditSave) paths. Editing is NOT a new
//   memory creation, so it must not trigger feedback OR reminder prompts.
//   The gating handler checks `editMode` at the top and early-returns to
//   feed without calling the gating helper. Satisfies RG-4 and RG-13.
//
// Previous changes (v5.3 — Session 1A.5, April 18, 2026):
//   - Imports `checkPostSaveGating` from '../utils/postSaveGating' v1.1.
//   - Adds a `handleViewAllMemories` useCallback that gates on create
//     paths and early-returns to feed on edit paths. Wired into the
//     SuccessScreen `tertiaryCta.onClick`.
//
// Historical note — v5.2 was never deployed (see v5.3 header for detail).
//
// Previous changes (v5.1 — Success screen extraction, April 16, 2026):
//   - Success block (5c) uses shared <SuccessScreen> component.
//   - Voice-specific player body extracted to local VoicePlayerBody.
//
// Regression-critical: VR-1 through VR-13 plus RG-1, RG-4, RG-13 from
// Session 1A.5 must all pass. Session 2 adds F-1/F-2 (voice first save
// triggers feedback after reminder has been shown) and F-10 (direct URL
// load) for feedback-specific verification — see Plan v1.2 §10.
//
// Route: /spaces/:spaceId/record (protected — JWT required)
// Screens: Record (5a) | Review (5b) | Success (5c via SuccessScreen) | Uploading
// Components: LovedOneBar, PromptBanner (fullWidth), BottomNav, SuccessScreen,
//             BrandIcons.RecordIcon

import { useState, useRef, useEffect, useCallback } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { useAuth0 } from '@auth0/auth0-react';
import { useRecorder } from '../hooks/useRecorder';
import { createApiClient } from '../api/client';
import LovedOneBar from '../components/LovedOneBar';
import PromptBanner from '../components/PromptBanner';
import BottomNav from '../components/BottomNav';
import SuccessScreen from '../components/SuccessScreen';
import { RecordIcon } from '../components/BrandIcons';
// v5.3: Session 1A.5 post-save gating helper (DB-backed reminder branch;
// feedback branch stubbed for Session 2).
// v5.4: postSaveGating is now v1.2 — feedback branch implemented.
import { checkPostSaveGating } from '../utils/postSaveGating';
import styles from './RecordPage.module.css';

/* ─── Helper ─── */
function formatDurationSec(val) {
  const s = Math.round(Number(val) || 0);
  return `${Math.floor(s / 60)}:${(s % 60).toString().padStart(2, '0')}`;
}

export default function RecordPage() {
  const { spaceId } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const { getAccessTokenSilently } = useAuth0();

  const getApi = useCallback(
    () => createApiClient(getAccessTokenSilently),
    [getAccessTokenSilently]
  );

  // ─── Edit mode (v5.0) ──────────────────────────────────
  const editMode = location.state?.editMode || false;
  const editMemory = location.state?.editMemory || null;

  const promptIdFromNav = location.state?.promptId || null;

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

  // ─── Space + Prompt data ─────────────────────────────────

  const [space, setSpace] = useState(null);
  const [prompt, setPrompt] = useState(null);
  const [loadingData, setLoadingData] = useState(true);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoadingData(true);
      try {
        const api = getApi();
        const [spaceData, promptData] = await Promise.all([
          api.get(`/spaces/${spaceId}`),
          api.get(`/spaces/${spaceId}/prompt`).catch(() => null),
        ]);
        if (!cancelled) {
          setSpace(spaceData);
          setPrompt(promptData);
        }
      } catch (err) {
        console.error('RecordPage data load error:', err);
      } finally {
        if (!cancelled) setLoadingData(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, [spaceId, getApi]);

  const activePromptId = promptIdFromNav || prompt?.promptId || null;

  // ─── Edit mode: fetch existing audio URL + pre-fill ─────

  const [existingAudioUrl, setExistingAudioUrl] = useState(null);
  const [loadingEditAudio, setLoadingEditAudio] = useState(!!editMode);
  const existingAudioRef = useRef(null);
  const [existingPlaying, setExistingPlaying] = useState(false);
  const [showReRecordConfirm, setShowReRecordConfirm] = useState(false);

  useEffect(() => {
    if (!editMode || !editMemory) {
      setLoadingEditAudio(false);
      return;
    }

    // Pre-fill label and privacy from existing memory
    setMemoryLabel(editMemory.title || '');
    setIsPrivate(editMemory.isPrivate ?? true);

    // Fetch signed playback URL for existing recording
    const s3Key = editMemory.voiceNote?.s3Key || editMemory.s3Key;
    if (!s3Key) {
      setLoadingEditAudio(false);
      return;
    }

    let cancelled = false;
    async function fetchAudioUrl() {
      try {
        const api = getApi();
        const data = await api.get(`/media/playback/${encodeURIComponent(s3Key)}`);
        if (!cancelled) setExistingAudioUrl(data.playbackUrl);
      } catch (err) {
        console.error('Edit audio load error:', err);
      } finally {
        if (!cancelled) setLoadingEditAudio(false);
      }
    }
    fetchAudioUrl();
    return () => { cancelled = true; };
  }, [editMode, editMemory, getApi]);

  // Existing audio playback controls
  function toggleExistingPlayback() {
    const audio = existingAudioRef.current;
    if (!audio) return;
    if (existingPlaying) { audio.pause(); } else { audio.play(); }
    setExistingPlaying(!existingPlaying);
  }

  useEffect(() => {
    const audio = existingAudioRef.current;
    if (!audio) return;
    function handleEnded() { setExistingPlaying(false); }
    audio.addEventListener('ended', handleEnded);
    return () => audio.removeEventListener('ended', handleEnded);
  });

  // Cleanup existing audio on unmount
  useEffect(() => {
    return () => {
      if (existingAudioRef.current) {
        existingAudioRef.current.pause();
        existingAudioRef.current = null;
      }
    };
  }, []);

  // ─── Review screen state ─────────────────────────────────

  const [isPrivate, setIsPrivate] = useState(editMemory?.isPrivate ?? true);
  const [memoryLabel, setMemoryLabel] = useState(editMemory?.title || '');
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState('');
  const [s3KeySaved, setS3KeySaved] = useState(null);
  const previewAudioRef = useRef(null);
  const [previewUrl, setPreviewUrl] = useState(null);
  const [playing, setPlaying] = useState(false);
  const [saved, setSaved] = useState(false);
  const [savedDuration, setSavedDuration] = useState('0:00');
  // v5.4: Session 2 — capture created memory id from successful POST for
  // feedback routing. Null until handleSave succeeds. Reset in
  // handleRecordAnother so a second save within this mount gets its own id.
  // Not populated on edit path (handleEditSave) — edits never gate.
  const [savedMemoryId, setSavedMemoryId] = useState(null);

  useEffect(() => {
    if (audioBlob && recordingState === 'stopped') {
      const url = URL.createObjectURL(audioBlob);
      setPreviewUrl(url);
      return () => URL.revokeObjectURL(url);
    }
  }, [audioBlob, recordingState]);

  function togglePlayback() {
    const audio = previewAudioRef.current;
    if (!audio) return;
    if (playing) { audio.pause(); } else { audio.play(); }
    setPlaying(!playing);
  }

  useEffect(() => {
    const audio = previewAudioRef.current;
    if (!audio) return;
    function handleEnded() { setPlaying(false); }
    audio.addEventListener('ended', handleEnded);
    return () => audio.removeEventListener('ended', handleEnded);
  });

  // ─── Prompt skip ─────────────────────────────────────────

  const handleSkipPrompt = useCallback(async () => {
    try {
      const api = getApi();
      const nextPrompt = await api.post(`/spaces/${spaceId}/prompt/advance`);
      if (nextPrompt) setPrompt(nextPrompt);
    } catch (err) {
      console.error('Skip prompt error:', err);
    }
  }, [getApi, spaceId]);

  // ─── Save: NEW recording (create mode) ───────────────────

  async function handleSave() {
    if (!audioBlob) return;
    setUploadError('');
    setUploading(true);

    const baseMimeType = (mimeType || 'audio/webm').split(';')[0];

    try {
      const api = getApi();

      const uploadData = await api.post('/media/upload-url', {
        spaceId,
        mimeType: baseMimeType,
        mediaType: 'voice',
      });

      await api.putS3(uploadData.uploadUrl, audioBlob, baseMimeType);
      setS3KeySaved(uploadData.s3Key);

      // v5.4: capture the response from POST /spaces/:id/memories so
      // savedMemoryId is available to the feedback branch of
      // handleViewAllMemories. Response shape (voice):
      //   { id, type: 'voice', spaceId, s3Key, duration, createdAt, voiceNoteId }
      // Verified against anamoria-memories Lambda v2.0 source.
      const createdMemory = await api.post(`/spaces/${spaceId}/memories`, {
        type: 'voice',
        s3Key: uploadData.s3Key,
        mimeType: baseMimeType,
        duration: Math.round(duration),
        isPrivate,
        ...(memoryLabel.trim() ? { title: memoryLabel.trim() } : {}),
        ...(activePromptId ? { promptId: activePromptId } : {}),
      });
      setSavedMemoryId(createdMemory.id);

      if (activePromptId) {
        api.post(`/spaces/${spaceId}/prompt/respond`, { promptId: activePromptId }).catch(() => {});
      }

      setSavedDuration(durationFormatted);
      setUploading(false);
      setSaved(true);
    } catch (err) {
      console.error('Save error:', err);
      if (s3KeySaved) {
        setUploadError('Recording uploaded but save failed. Tap "Save" to retry.');
      } else {
        setUploadError('Upload failed. Please try again.');
      }
      setUploading(false);
    }
  }

  // ─── Save: EDIT mode (metadata only or re-record) ────────
  // v5.4: INTENTIONALLY UNCHANGED FROM v5.3.
  // Edit path bypasses gating via handleViewAllMemories editMode early-return,
  // so savedMemoryId is not needed here. The PATCH response is discarded as
  // in v5.3. If edits ever needed to gate in a future session, this handler
  // would be the place to capture the id — but for Session 2, it stays.

  async function handleEditSave() {
    setUploadError('');
    setUploading(true);

    try {
      const api = getApi();
      const updates = {};

      // Metadata changes
      const trimLabel = memoryLabel.trim();
      if (trimLabel !== (editMemory.title || '')) {
        updates.title = trimLabel || null;
      }
      if (isPrivate !== (editMemory.isPrivate ?? true)) {
        updates.isPrivate = isPrivate;
      }

      // If user re-recorded, upload new audio
      if (audioBlob) {
        const baseMimeType = (mimeType || 'audio/webm').split(';')[0];
        const uploadData = await api.post('/media/upload-url', {
          spaceId,
          mimeType: baseMimeType,
          mediaType: 'voice',
        });
        await api.putS3(uploadData.uploadUrl, audioBlob, baseMimeType);

        updates.newVoiceS3Key = uploadData.s3Key;
        updates.newVoiceDuration = Math.round(duration);
        updates.newVoiceMimeType = baseMimeType;
      }

      // Always send PATCH (even if only metadata)
      if (Object.keys(updates).length > 0) {
        await api.patch(`/memories/${editMemory.id}`, updates);
      }

      // Duration for success screen
      if (audioBlob) {
        setSavedDuration(durationFormatted);
      } else {
        setSavedDuration(formatDurationSec(editMemory.voiceNote?.duration || 0));
      }

      setUploading(false);
      setSaved(true);
    } catch (err) {
      console.error('Edit save error:', err);
      setUploadError('Save failed. Please try again.');
      setUploading(false);
    }
  }

  // ─── "Record new version" — from edit review ─────────────

  function handleRecordNewVersion() {
    setShowReRecordConfirm(true);
  }

  function handleConfirmReRecord() {
    setShowReRecordConfirm(false);
    // Stop existing playback
    if (existingAudioRef.current) {
      existingAudioRef.current.pause();
      setExistingPlaying(false);
    }
    // Clear existing audio so we fall through to record screen
    setExistingAudioUrl(null);
    // reRecord resets recorder to idle
    reRecord();
  }

  // ─── Circle handler ──────────────────────────────────────

  function handleCircleTap() {
    if (recordingState === 'idle') startRecording();
    else if (recordingState === 'recording') pauseRecording();
    else if (recordingState === 'paused') resumeRecording();
  }

  // ─── Class composition ───────────────────────────────────

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

  const spaceName = space?.name || 'Space';
  const spacePhotoUrl = space?.photoUrl || null;

  // ─── Record another (from success screen) ─────────────────

  function handleRecordAnother() {
    setSaved(false);
    setS3KeySaved(null);
    setUploadError('');
    setIsPrivate(true);
    setMemoryLabel('');
    setPlaying(false);
    // v5.4: clear captured memory id so the next save gets its own id
    setSavedMemoryId(null);
    reRecord();
  }

  // ─── View all memories (post-save gating, v5.4) ──────────
  // Called from SuccessScreen.tertiaryCta.onClick.
  //
  // Edit paths: early-return to feed. Edits never trigger reminder OR
  // feedback prompts (RG-4 / RG-13 Session 1A.5 + Session 2 scope).
  //
  // Create paths: call the DB-backed gating helper (v1.2) which returns
  // one of three shapes:
  //   { redirectTo: 'reminder' }                                      → /reminder
  //   { redirectTo: 'feedback', triggerContext, userMemoryCount }     → /feedback
  //   { redirectTo: 'feed' }                                          → /:spaceId
  //
  // The helper also handles the internal count fetch (we omit
  // `userMemoryCount` from the call — helper fetches it in parallel with
  // /feedback/stats). Per session decision on File 5 review.
  //
  // On any error from the helper (which itself never throws — it returns
  // 'feed' on internal failure), we catch defensively and navigate to the
  // feed. User is never stuck on success screen.
  const handleViewAllMemories = useCallback(async () => {
    // Edit-mode early-return (File Review v1.1 D5): edits are not new
    // memories; no gating prompt should fire. Unchanged from v5.3.
    if (editMode) {
      navigate(`/spaces/${spaceId}`, { replace: true });
      return;
    }
    try {
      const gate = await checkPostSaveGating({
        spaceId,
        space,
        memoryType: 'voice',
        getApi,
        // userMemoryCount intentionally omitted — helper fetches it from
        // GET /spaces/:id/memories/count in parallel with the stats fetch.
      });
      if (gate.redirectTo === 'reminder') {
        navigate(`/spaces/${spaceId}/reminder`);
      } else if (gate.redirectTo === 'feedback') {
        // v5.4: route to feedback screen with full router state per Plan
        // v1.2 Q5. FeedbackPage's direct-URL-load guard requires
        // triggerContext at minimum; the other fields correlate the
        // feedback event to the memory that triggered it.
        navigate(`/spaces/${spaceId}/feedback`, {
          state: {
            memoryId: savedMemoryId,
            memoryType: 'voice',
            triggerContext: gate.triggerContext,
            userMemoryCount: gate.userMemoryCount,
          },
        });
      } else {
        // 'feed' — default path, or helper returned 'feed' on internal error
        navigate(`/spaces/${spaceId}`, { replace: true });
      }
    } catch (err) {
      console.error('Gating check failed:', err);
      navigate(`/spaces/${spaceId}`, { replace: true });
    }
  }, [editMode, spaceId, space, navigate, getApi, savedMemoryId]);

  // ═══════════════════════════════════════════════════════════
  // RENDER ORDER
  // ═══════════════════════════════════════════════════════════

  // ─── 1. Loading ───────────────────────────────────────────

  if (loadingData || loadingEditAudio) {
    return (
      <div className={styles.loadingPage}>
        <div className="app-loading-spinner" />
      </div>
    );
  }

  // ─── 2. Uploading ─────────────────────────────────────────

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
        <BottomNav spaceId={spaceId} activeTab="record" />
      </div>
    );
  }

  // ─── 3. Success screen (5c) — after save (new or edit) ───
  // v5.1: Uses shared <SuccessScreen>. Voice-specific player body is passed
  //       as children. Subtitle and handler behavior unchanged from v5.0.
  // v5.3: tertiaryCta.onClick routes through handleViewAllMemories which
  //       gates on create paths and early-returns on edit paths.
  // v5.4: handleViewAllMemories feedback branch fully wired — unchanged
  //       markup below.

  if (saved) {
    const subtitle = memoryLabel.trim()
      ? `${memoryLabel.trim()} · Memory saved`
      : 'Memory saved';

    return (
      <SuccessScreen
        spaceName={spaceName}
        spacePhotoUrl={spacePhotoUrl}
        subtitle={subtitle}
        onBack={() => navigate(`/spaces/${spaceId}`, { replace: true })}
        backLabel="Back to feed"
        badgeLabel={editMode ? 'UPDATED' : 'JUST ADDED'}
        promptText={prompt?.text || null}
        isPrivate={isPrivate}
        primaryCta={{
          icon: <RecordIcon />,
          label: 'Record another',
          onClick: handleRecordAnother,
        }}
        secondaryCta={{
          label: 'Invite family to add memories',
          onClick: () => navigate(`/spaces/${spaceId}/invite`),
        }}
        tertiaryCta={{
          label: 'View all memories',
          onClick: handleViewAllMemories,
        }}
        spaceId={spaceId}
        activeTab="record"
      >
        {/* Voice-specific preview body — play button, waveform, duration, hidden audio */}
        <div className={styles.savedPlayerRow}>
          <button
            className={styles.playBtn}
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

          <span className={styles.playbackDuration}>{savedDuration}</span>
        </div>

        {previewUrl && (
          <audio ref={previewAudioRef} src={previewUrl} className={styles.hiddenAudio} />
        )}
        {/* If edit mode without re-record, use existing audio for playback */}
        {!previewUrl && existingAudioUrl && (
          <audio ref={previewAudioRef} src={existingAudioUrl} className={styles.hiddenAudio} />
        )}
      </SuccessScreen>
    );
  }

  // ─── 4. EDIT REVIEW (5b) — existing audio, before re-recording ───

  if (editMode && !audioBlob && existingAudioUrl) {
    const existingDuration = formatDurationSec(editMemory?.voiceNote?.duration || 0);

    return (
      <div className={styles.page}>
        <LovedOneBar
          spaceName={spaceName}
          spacePhotoUrl={spacePhotoUrl}
          subtitle="Edit recording"
          onBack={() => navigate(`/spaces/${spaceId}`, { replace: true })}
          backLabel="Back to feed"
        />

        {/* Prompt banner — shows original prompt context */}
        {prompt && (
          <div className={styles.promptWrap}>
            <PromptBanner prompt={prompt} showSkip={false} fullWidth />
          </div>
        )}

        <div className={styles.reviewBody}>
          {/* Existing audio playback card */}
          <div className={styles.playbackCard}>
            <span className={styles.playbackLabel}>CURRENT RECORDING</span>
            <div className={styles.playerRow}>
              <button
                className={`${styles.playBtn} ${existingPlaying ? styles.playBtnPlaying : ''}`}
                onClick={toggleExistingPlayback}
                aria-label={existingPlaying ? 'Pause playback' : 'Play recording'}
              >
                {existingPlaying ? (
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

              <span className={styles.playbackDuration}>{existingDuration}</span>
            </div>

            {existingAudioUrl && (
              <audio ref={existingAudioRef} src={existingAudioUrl} className={styles.hiddenAudio} />
            )}

            {/* Record new version link */}
            <button
              className={styles.recordNewVersionBtn}
              onClick={handleRecordNewVersion}
            >
              Record new version
            </button>
          </div>

          {/* Settings card — label + privacy grouped */}
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
            <div className={styles.settingsDivider} />
            <div
              className={styles.settingsRow}
              onClick={() => setIsPrivate((prev) => !prev)}
              role="switch"
              aria-checked={isPrivate}
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  setIsPrivate((prev) => !prev);
                }
              }}
            >
              <div className={styles.privacyLabel}>
                <span className={styles.privacyIcon}>
                  {isPrivate ? (
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
                      <rect x="5" y="11" width="14" height="10" rx="2" />
                      <path d="M8 11V7a4 4 0 0 1 8 0v4" />
                    </svg>
                  ) : (
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
                      <circle cx="12" cy="12" r="10" />
                      <path d="M2 12h20M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
                    </svg>
                  )}
                </span>
                <span className={styles.privacyText}>{isPrivate ? 'Private' : 'Shared'}</span>
              </div>
              <div className={`${styles.toggleTrack} ${isPrivate ? styles.toggleTrackOn : styles.toggleTrackOff}`}>
                <div className={styles.toggleThumb} />
              </div>
            </div>
          </div>

          <p className={styles.settingsHint}>You can change privacy anytime</p>

          {uploadError && (
            <p className={styles.uploadError} role="alert">{uploadError}</p>
          )}

          {/* Action buttons */}
          <div className={styles.reviewActions}>
            <button className={styles.saveBtn} onClick={handleEditSave}>
              Save Changes
            </button>
            <button
              className={styles.reRecordBtn}
              onClick={() => navigate(`/spaces/${spaceId}`, { replace: true })}
            >
              Cancel
            </button>
          </div>
        </div>

        {/* Re-record confirmation modal */}
        {showReRecordConfirm && (
          <div className={styles.modalBackdrop} onClick={() => setShowReRecordConfirm(false)}>
            <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
              <div className={styles.modalIcon}>
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#b85450" strokeWidth="1.5" strokeLinecap="round">
                  <circle cx="12" cy="12" r="10" />
                  <line x1="12" y1="8" x2="12" y2="12" />
                  <line x1="12" y1="16" x2="12.01" y2="16" />
                </svg>
              </div>
              <h3 className={styles.modalTitle}>Replace recording?</h3>
              <p className={styles.modalText}>
                This will replace your current recording. You can't undo this.
              </p>
              <div className={styles.modalActions}>
                <button
                  className={styles.modalCancelBtn}
                  onClick={() => setShowReRecordConfirm(false)}
                >
                  Keep current
                </button>
                <button
                  className={styles.modalConfirmBtn}
                  onClick={handleConfirmReRecord}
                >
                  Record new version
                </button>
              </div>
            </div>
          </div>
        )}

        <BottomNav spaceId={spaceId} activeTab="record" />
      </div>
    );
  }

  // ─── 5. REVIEW (5b) — after recording (new or re-recorded) ───

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

        {prompt && (
          <div className={styles.promptWrap}>
            <PromptBanner prompt={prompt} showSkip={false} fullWidth />
          </div>
        )}

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

          {/* Settings card — label + privacy grouped */}
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
            <div className={styles.settingsDivider} />
            <div
              className={styles.settingsRow}
              onClick={() => setIsPrivate((prev) => !prev)}
              role="switch"
              aria-checked={isPrivate}
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  setIsPrivate((prev) => !prev);
                }
              }}
            >
              <div className={styles.privacyLabel}>
                <span className={styles.privacyIcon}>
                  {isPrivate ? (
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
                      <rect x="5" y="11" width="14" height="10" rx="2" />
                      <path d="M8 11V7a4 4 0 0 1 8 0v4" />
                    </svg>
                  ) : (
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
                      <circle cx="12" cy="12" r="10" />
                      <path d="M2 12h20M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
                    </svg>
                  )}
                </span>
                <span className={styles.privacyText}>{isPrivate ? 'Private' : 'Shared'}</span>
              </div>
              <div className={`${styles.toggleTrack} ${isPrivate ? styles.toggleTrackOn : styles.toggleTrackOff}`}>
                <div className={styles.toggleThumb} />
              </div>
            </div>
          </div>

          <p className={styles.settingsHint}>You can change privacy anytime</p>

          {uploadError && (
            <p className={styles.uploadError} role="alert">{uploadError}</p>
          )}

          {/* Action buttons */}
          <div className={styles.reviewActions}>
            <button className={styles.saveBtn} onClick={editMode ? handleEditSave : handleSave}>
              {editMode ? 'Save Changes' : `Add to ${spaceName}'s space`}
            </button>
            <button className={styles.reRecordBtn} onClick={reRecord}>
              Re-record
            </button>
          </div>
        </div>

        <BottomNav spaceId={spaceId} activeTab="record" />
      </div>
    );
  }

  // ═══════════════════════════════════════════════════════════
  // 6. RECORD SCREEN (5a) — idle / recording / paused
  // ═══════════════════════════════════════════════════════════

  return (
    <div className={styles.page}>
      <LovedOneBar
        spaceName={spaceName}
        spacePhotoUrl={spacePhotoUrl}
        subtitle={barSubtitle}
        onBack={() => navigate(`/spaces/${spaceId}`, { replace: true })}
        backLabel="Back to feed"
      />

      <div className={styles.recordingContent}>
        {prompt && (
          <div className={styles.promptWrap}>
            <PromptBanner
              prompt={prompt}
              onSkip={handleSkipPrompt}
              showSkip={recordingState === 'idle'}
              fullWidth
            />
          </div>
        )}

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

      <BottomNav spaceId={spaceId} activeTab="record" />
    </div>
  );
}
