// InvitePage.jsx — /spaces/:spaceId/invite
// Owner: send email invites, view contributor list
// APIs: POST /spaces/:id/invite, GET /spaces/:id/contributors

import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth0 } from '@auth0/auth0-react';
import { createApiClient } from '../api/client';
import styles from './InvitePage.module.css';

export default function InvitePage() {
  const { spaceId } = useParams();
  const navigate = useNavigate();
  const { getAccessTokenSilently } = useAuth0();

  const [space, setSpace] = useState(null);
  const [contributors, setContributors] = useState([]);
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [message, setMessage] = useState('');
  const [sending, setSending] = useState(false);
  const [success, setSuccess] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const api = createApiClient(getAccessTokenSilently);
        const [spaceData, contribData] = await Promise.all([
          api.get(`/spaces/${spaceId}`),
          api.get(`/spaces/${spaceId}/contributors`),
        ]);
        if (cancelled) return;
        setSpace(spaceData);
        setContributors(contribData.contributors || []);
      } catch (err) {
        console.error('Invite load error:', err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, [spaceId, getAccessTokenSilently]);

  const handleSend = useCallback(async () => {
    if (!email.trim() || !name.trim() || sending) return;
    setSending(true);
    setError(null);
    setSuccess(null);
    try {
      const api = createApiClient(getAccessTokenSilently);
      const result = await api.post(`/spaces/${spaceId}/invite`, {
        email: email.trim(),
        contributorName: name.trim(),
        message: message.trim() || null,
      });
      setSuccess(`Invite sent to ${email.trim()}`);
      setEmail('');
      setName('');
      setMessage('');
      // Refresh contributor list
      const contribData = await api.get(`/spaces/${spaceId}/contributors`);
      setContributors(contribData.contributors || []);
    } catch (err) {
      if (err.error === 'ALREADY_INVITED') {
        setError('This person has already been invited.');
      } else {
        setError("Couldn't send invite. Please try again.");
      }
    } finally {
      setSending(false);
    }
  }, [email, name, message, sending, spaceId, getAccessTokenSilently]);

  const spaceInitial = space?.name ? space.name.charAt(0).toUpperCase() : '?';

  if (loading) {
    return <div className={styles.loading}><div className={styles.loadingDot} /><span>Loading...</span></div>;
  }

  return (
    <div className={styles.screen}>
      {/* Header */}
      <div className={styles.header}>
        <div className={styles.headerInner}>
          <button className={styles.backBtn} onClick={() => navigate(`/spaces/${spaceId}`)}>←</button>
          <div className={styles.headerAvatar}>
            <span className={styles.headerInitial}>{spaceInitial}</span>
          </div>
          <div className={styles.headerInfo}>
            <span className={styles.headerName}>{space?.name}</span>
            <span className={styles.headerSub}>Invite someone</span>
          </div>
        </div>
      </div>

      <div className={styles.content}>
        {/* Invite form */}
        <div className={styles.formCard}>
          <h3 className={styles.formTitle}>Invite a family member or friend</h3>
          <p className={styles.formDesc}>They'll be able to add their own memories to {space?.name}'s space.</p>

          <div className={styles.field}>
            <label className={styles.fieldLabel}>Their name</label>
            <input
              type="text"
              className={styles.fieldInput}
              placeholder="e.g., Aunt Sarah"
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={100}
            />
          </div>

          <div className={styles.field}>
            <label className={styles.fieldLabel}>Their email</label>
            <input
              type="email"
              className={styles.fieldInput}
              placeholder="email@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>

          <div className={styles.field}>
            <label className={styles.fieldLabel}>Personal note <span className={styles.optional}>(optional)</span></label>
            <textarea
              className={styles.fieldTextarea}
              placeholder={`e.g., I've been keeping some memories of ${space?.name || 'them'} here...`}
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              maxLength={500}
              rows={3}
            />
          </div>

          {success && <div className={styles.successBanner}>{success}</div>}
          {error && <div className={styles.errorBanner}>{error}</div>}

          <button
            className={styles.btnPrimary}
            onClick={handleSend}
            disabled={!email.trim() || !name.trim() || sending}
          >
            {sending ? 'Sending...' : 'Send invite'}
          </button>
        </div>

        {/* Contributor list */}
        {contributors.length > 0 && (
          <div className={styles.listSection}>
            <h3 className={styles.listTitle}>Invited ({contributors.length})</h3>
            {contributors.map((c) => (
              <div key={c.id} className={styles.contribRow}>
                <div className={styles.contribInfo}>
                  <span className={styles.contribName}>{c.contributor_name}</span>
                  <span className={styles.contribEmail}>{c.email}</span>
                </div>
                <span className={`${styles.contribStatus} ${c.status === 'active' ? styles.statusActive : ''}`}>
                  {c.status === 'active' ? 'Joined' : c.status === 'invited' ? 'Pending' : c.status}
                </span>
              </div>
            ))}
          </div>
        )}

        {/* Privacy note */}
        <div className={styles.privacyNote}>
          <span>🔒</span>
          <span>Contributors only see shared memories. They can never see your private memories.</span>
        </div>
      </div>
    </div>
  );
}
