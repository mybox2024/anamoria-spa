// hooks/useRecorder.js — Anamoria SPA
// MediaRecorder state machine ported from axr_MemoryVaultV2.js v3.2
//
// States: idle → recording → paused → stopped → uploading → done
// MIME priority: webm/opus (Chrome) → mp4 (Safari) → ogg/opus (Firefox)
//
// Returns:
//   recordingState  — 'idle' | 'recording' | 'paused' | 'stopped'
//   audioBlob       — Blob | null
//   mimeType        — string
//   duration        — seconds (integer)
//   durationFormatted — 'M:SS'
//   error           — string | null
//   startRecording()
//   pauseRecording()
//   resumeRecording()
//   stopRecording()
//   reRecord()

import { useState, useRef, useCallback, useEffect } from 'react';

function getSupportedMimeType() {
  const candidates = [
    'audio/webm;codecs=opus',
    'audio/webm',
    'audio/mp4',
    'audio/ogg;codecs=opus',
  ];
  for (const type of candidates) {
    if (MediaRecorder.isTypeSupported(type)) return type;
  }
  return '';
}

function formatDuration(seconds) {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

export function useRecorder() {
  const [recordingState, setRecordingState] = useState('idle');
  const [audioBlob, setAudioBlob] = useState(null);
  const [mimeType, setMimeType] = useState('');
  const [duration, setDuration] = useState(0);
  const [error, setError] = useState(null);

  const mediaRecorderRef = useRef(null);
  const audioStreamRef = useRef(null);
  const audioChunksRef = useRef([]);
  const timerRef = useRef(null);
  const lastTickRef = useRef(null);
  const durationMsRef = useRef(0);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stopTimer();
      if (audioStreamRef.current) {
        audioStreamRef.current.getTracks().forEach((t) => t.stop());
      }
    };
  }, []);

  function startTimer() {
    lastTickRef.current = Date.now();
    const tick = () => {
      const now = Date.now();
      durationMsRef.current += now - lastTickRef.current;
      lastTickRef.current = now;
      const secs = Math.floor(durationMsRef.current / 1000);
      setDuration(secs);
      // 5 minute max
      if (durationMsRef.current >= 300000) {
        stopRecording();
        return;
      }
      timerRef.current = requestAnimationFrame(tick);
    };
    timerRef.current = requestAnimationFrame(tick);
  }

  function stopTimer() {
    if (timerRef.current) {
      cancelAnimationFrame(timerRef.current);
      timerRef.current = null;
    }
  }

  function pauseTimer() {
    stopTimer();
  }

  function resumeTimer() {
    lastTickRef.current = Date.now();
    const tick = () => {
      const now = Date.now();
      durationMsRef.current += now - lastTickRef.current;
      lastTickRef.current = now;
      setDuration(Math.floor(durationMsRef.current / 1000));
      if (durationMsRef.current >= 300000) {
        stopRecording();
        return;
      }
      timerRef.current = requestAnimationFrame(tick);
    };
    timerRef.current = requestAnimationFrame(tick);
  }

  const startRecording = useCallback(async () => {
    setError(null);
    setAudioBlob(null);
    setDuration(0);
    durationMsRef.current = 0;
    audioChunksRef.current = [];

    if (!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder) {
      setError('Voice recording is not supported in this browser.');
      return;
    }

    const mime = getSupportedMimeType();

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      audioStreamRef.current = stream;
      setMimeType(mime);

      const recorder = new MediaRecorder(stream, mime ? { mimeType: mime } : {});
      mediaRecorderRef.current = recorder;

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) audioChunksRef.current.push(e.data);
      };

      recorder.onstop = () => {
        const blob = new Blob(audioChunksRef.current, {
          type: mime || 'audio/webm',
        });
        setAudioBlob(blob);
        if (audioStreamRef.current) {
          audioStreamRef.current.getTracks().forEach((t) => t.stop());
          audioStreamRef.current = null;
        }
        setRecordingState('stopped');
      };

      recorder.start(1000);
      setRecordingState('recording');
      startTimer();
    } catch (err) {
      if (err.name === 'NotAllowedError') {
        setError('Microphone access denied. Please allow microphone access and try again.');
      } else {
        setError('Failed to start recording. Please try again.');
      }
    }
  }, []);

  const pauseRecording = useCallback(() => {
    if (mediaRecorderRef.current && recordingState === 'recording') {
      mediaRecorderRef.current.pause();
      pauseTimer();
      setRecordingState('paused');
    }
  }, [recordingState]);

  const resumeRecording = useCallback(() => {
    if (mediaRecorderRef.current && recordingState === 'paused') {
      mediaRecorderRef.current.resume();
      resumeTimer();
      setRecordingState('recording');
    }
  }, [recordingState]);

  const stopRecording = useCallback(() => {
    if (mediaRecorderRef.current &&
        (recordingState === 'recording' || recordingState === 'paused')) {
      stopTimer();
      mediaRecorderRef.current.stop();
      // State set to 'stopped' in onstop handler
    }
  }, [recordingState]);

  const reRecord = useCallback(() => {
    stopTimer();
    if (audioStreamRef.current) {
      audioStreamRef.current.getTracks().forEach((t) => t.stop());
      audioStreamRef.current = null;
    }
    mediaRecorderRef.current = null;
    audioChunksRef.current = [];
    durationMsRef.current = 0;
    setAudioBlob(null);
    setDuration(0);
    setError(null);
    setRecordingState('idle');
  }, []);

  return {
    recordingState,
    audioBlob,
    mimeType,
    duration,
    durationFormatted: formatDuration(duration),
    error,
    startRecording,
    pauseRecording,
    resumeRecording,
    stopRecording,
    reRecord,
  };
}
