import { useState, useEffect } from 'react';
import VoiceCard from './VoiceCard';
import styles from './MemoryFeed.module.css';

export default function MemoryFeed({ spaceId, theme = 'warm', getApi }) {
  const [memories, setMemories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    async function load() {
      setLoading(true);
      try {
        const api = getApi();
        const data = await api.get(`/spaces/${spaceId}/memories?limit=100&offset=0`);
        setMemories(data.memories || []);
      } catch (err) {
        setError('Could not load memories.');
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [spaceId]);

  if (loading) return <div className={styles.loading}><div className="app-loading-spinner" /></div>;
  if (error) return <div className={styles.error}><p>{error}</p></div>;
  if (memories.length === 0) return null;

  return (
    <div className={styles.feed}>
      {memories.map((memory) => {
        const isVoice = (memory.category || '').toLowerCase() === 'voice';
        if (isVoice) {
          return <VoiceCard key={memory.id} memory={memory} theme={theme} getApi={getApi} />;
        }
        return (
          <div key={memory.id} className={styles.simpleCard}>
            <p className={styles.simpleCategory}>{memory.category || 'Memory'}</p>
            <p className={styles.simpleTitle}>{memory.title || 'Untitled'}</p>
          </div>
        );
      })}
    </div>
  );
}
