import { useState, useRef, useCallback } from 'react';
import styles from './VoiceCard.module.css';

function formatDuration(val) {
  const s = Math.round(Number(val) || 0);
  return `${Math.floor(s/60)}:${(s%60).toString().padStart(2,'0')}`;
}

function safeTimeAgo(dateStr) {
  if (!dateStr) return '';
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return '';
    const diff = Math.floor((Date.now() - d.getTime()) / 1000);
    if (diff < 60) return 'just now';
    if (diff < 3600) return `${Math.floor(diff/60)}m ago`;
    if (diff < 86400) return `${Math.floor(diff/3600)}h ago`;
    return d.toLocaleDateString();
  } catch { return ''; }
}

const WAVE_HEIGHTS = [24, 40, 32, 48, 28, 44, 36];

export default function VoiceCard({ memory, theme = 'warm', getApi }) {
  const [playing, setPlaying] = useState(false);
  const [loadingAudio, setLoadingAudio] = useState(false);
  const [progress, setProgress] = useState(0);
  const audioRef = useRef(null);

  // camelCase fields from memories handler
  const s3Key = memory.voiceNote?.s3Key || memory.s3Key;
  const duration = memory.voiceNote?.duration || 0;
  const title = memory.title || 'Voice Note';
  const isPrivate = memory.isPrivate;
  const createdAt = memory.createdAt;

  const themeKey = (theme||'warm').charAt(0).toUpperCase() + (theme||'warm').slice(1);
  const themeClass = styles[`theme${themeKey}`] || styles.themeWarm;

  const handlePlayPause = useCallback(async () => {
    if (loadingAudio) return;
    if (audioRef.current && playing) { audioRef.current.pause(); setPlaying(false); return; }
    if (audioRef.current && !playing) { audioRef.current.play(); setPlaying(true); return; }
    if (!s3Key) return;
    setLoadingAudio(true);
    try {
      const api = getApi();
      const data = await api.get(`/media/playback/${encodeURIComponent(s3Key)}`);
      const audio = new Audio(data.playbackUrl);
      audioRef.current = audio;
      audio.ontimeupdate = () => { if (audio.duration) setProgress((audio.currentTime/audio.duration)*100); };
      audio.onended = () => { setPlaying(false); setProgress(0); };
      audio.onerror = () => { setPlaying(false); setLoadingAudio(false); };
      await audio.play();
      setPlaying(true);
    } catch(err) { console.error('Playback error:', err); }
    finally { setLoadingAudio(false); }
  }, [playing, loadingAudio, s3Key, getApi]);

  return (
    <div className={`${styles.card} ${themeClass}`}>
      <div className={styles.accent} />
      <div className={styles.header}>
        <div className={styles.icon}>{theme==='story'?'❙❙':theme==='sage'?'🎙':null}</div>
        {theme!=='story'&&theme!=='sage'&&<span className={styles.label}>Voice Memory</span>}
        <span className={styles.title}>{title}</span>
      </div>
      <div className={styles.player}>
        <button className={styles.playBtn} onClick={handlePlayPause} aria-label={playing?'Pause':'Play'}>
          {loadingAudio
            ? <div className={styles.playLoading}/>
            : playing
              ? <svg viewBox="0 0 24 24" width="14" height="14"><rect x="5" y="4" width="4" height="16" rx="1" fill="white"/><rect x="15" y="4" width="4" height="16" rx="1" fill="white"/></svg>
              : <svg viewBox="0 0 24 24" width="14" height="14"><path d="M6 4l14 8-14 8V4z" fill="white"/></svg>}
        </button>
        {theme==='story'||theme==='clean'
          ? <div className={styles.progressBar}><div className={styles.progressFill} style={{width:`${progress}%`}}/></div>
          : <div className={styles.waveform}>{WAVE_HEIGHTS.map((h,i)=><div key={i} className={styles.waveBar} style={{height:h,opacity:playing?0.8:0.4}}/>)}</div>}
        <span className={styles.duration}>{formatDuration(duration)}</span>
      </div>
      <div className={styles.footer}>
        <span className={styles.date}>{safeTimeAgo(createdAt)}</span>
        {isPrivate&&<span className={styles.privacy}>🔒 Private</span>}
      </div>
    </div>
  );
}
