// pages/RecordPage.jsx — Anamoria SPA
// Route: /spaces/:spaceId/record (protected — JWT required)

import { useState, useRef, useEffect } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { useAuth0 } from '@auth0/auth0-react';
import { useRecorder } from '../hooks/useRecorder';
import { createApiClient } from '../api/client';
import styles from './RecordPage.module.css';

export default function RecordPage() {
  const { spaceId } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const { getAccessTokenSilently } = useAuth0();
  const api = createApiClient(getAccessTokenSilently);

  const promptId = location.state?.promptId || null;

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

  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState('');
  const [s3KeySaved, setS3KeySaved] = useState(null);
  const previewAudioRef = useRef(null);
  const [previewUrl, setPreviewUrl] = useState(null);

  useEffect(() => {
    if (audioBlob && recordingState === 'stopped') {
      const url = URL.createObjectURL(audioBlob);
      setPreviewUrl(url);
      return () => URL.revokeObjectURL(url);
    }
  }, [audioBlob, recordingState]);

  async function handleSave() {
    if (!audioBlob) return;
    setUploadError('');
    setUploading(true);

    // Strip codecs suffix — handler accepts 'audio/webm' not 'audio/webm;codecs=opus'
    const baseMimeType = (mimeType || 'audio/webm').split(';')[0];

    try {
      // Step 1: Get pre-signed upload URL
      const uploadData = await api.post('/media/upload-url', {
        spaceId,
        mimeType: baseMimeType,
        mediaType: 'voice',
      });

      // Step 2: Upload blob directly to S3
      await api.putS3(uploadData.uploadUrl, audioBlob, baseMimeType);
      setS3KeySaved(uploadData.s3Key);

      // Step 3: Create memory record
      await api.post(`/spaces/${spaceId}/memories`, {
        type: 'voice',
        s3Key: uploadData.s3Key,
        mimeType: baseMimeType,
        duration: Math.round(duration),
        isPrivate: true,
        ...(promptId ? { promptId } : {}),
      });

      // Step 4: Mark prompt responded (fire-and-forget)
      if (promptId) {
        api.post(`/spaces/${spaceId}/prompt/respond`, { promptId }).catch(() => {});
      }

      navigate(`/spaces/${spaceId}`, { replace: true });
    } catch (err) {
      console.error('Save error:', err);
      if (s3KeySaved) {
        setUploadError('Recording uploaded but save failed. Tap "Save recording" to retry.');
      } else {
        setUploadError('Upload failed. Please try again.');
      }
      setUploading(false);
    }
  }

  function handleCircleTap() {
    if (recordingState === 'idle') startRecording();
    else if (recordingState === 'recording') pauseRecording();
    else if (recordingState === 'paused') resumeRecording();
  }

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

  // ─── Uploading screen ───────────────────────────────────────

  if (uploading) {
    return (
      <div className={styles.uploadingPage}>
        <div className="app-loading-spinner" />
        <p className={styles.uploadingText}>Saving your recording...</p>
      </div>
    );
  }

  // ─── Review screen (stopped) ────────────────────────────────

  if (recordingState === 'stopped' && audioBlob) {
    return (
      <div className={styles.page}>
        <header className={styles.header}>
          <button className={styles.backBtn} onClick={reRecord} aria-label="Back">
            <svg viewBox="0 0 24 24" fill="none" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M15 18l-6-6 6-6" stroke="currentColor"/>
            </svg>
          </button>
          <span className={styles.headerTitle}>Review recording</span>
        </header>

        <div className={styles.reviewContent}>
          <div className={styles.reviewCard}>
            <p className={styles.reviewLabel}>YOUR RECORDING</p>
            <p className={styles.reviewDuration}>{durationFormatted}</p>
            {previewUrl && (
              <audio
                ref={previewAudioRef}
                src={previewUrl}
                controls
                className={styles.audioPreview}
              />
            )}
          </div>

          {uploadError && (
            <p className={styles.uploadError} role="alert">{uploadError}</p>
          )}

          <div className={styles.reviewActions}>
            <button className={styles.saveBtn} onClick={handleSave}>
              Save recording
            </button>
            <button className={styles.reRecordBtn} onClick={reRecord}>
              Record again
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ─── Idle / Recording / Paused screen ──────────────────────

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <button
          className={styles.backBtn}
          onClick={() => navigate(`/spaces/${spaceId}`, { replace: true })}
          aria-label="Back to space"
        >
          <svg viewBox="0 0 24 24" fill="none" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M15 18l-6-6 6-6" stroke="currentColor"/>
          </svg>
        </button>
        <span className={styles.headerTitle}>Voice note</span>
      </header>

      <div className={styles.recordingContent}>

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
  );
}
