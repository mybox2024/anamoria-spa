// pages/LeaderPage.jsx — Anamoria SPA
// v1.0 — April 5, 2026
// Route: /leader (protected — JWT required, leader role enforced by API)
//
// Ported from axr_LeaderDashboard (LWC). Consumes:
//   GET  /leader/dashboard    → group context + metrics + participants + weeklyStats
//   GET  /leader/week/{num}   → per-week breakdown + participants
//   GET  /leader/checkin/{num}→ submitted check-in or 404
//   POST /leader/checkin      → submit weekly check-in (immutable)
//
// QR code: client-side via qrcode.react (Option A)
// Checklist: localStorage persistence (non-sensitive)

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth0 } from '@auth0/auth0-react';
import { createApiClient } from '../api/client';
import { useAppContext } from '../App';
import { QRCodeSVG } from 'qrcode.react';
import s from './LeaderPage.module.css';

// ─── Static Data ─────────────────────────────────────────────────────────

const THEMES = { 1:'Their Story', 2:'What I Miss', 3:'Rituals', 4:'Legacy' };
const PROMPTS = {
  1:'One thing I never want to forget...',
  2:'What I miss most is...',
  3:'A small ritual that makes me feel close to them is...',
  4:'What I want others to remember about them is...',
};

const FAQ = [
  { q:"A participant can't log in", a:"Make sure they're using the email address you have on file. They should check their spam folder for the Auth0 verification email. If the issue persists, have them try resetting their password from the login screen." },
  { q:"The group code isn't working", a:"Group codes are case-insensitive but must be entered exactly. Confirm the code on your dashboard matches what the participant is entering. If the pilot hasn't started yet, the code won't be accepted." },
  { q:"A participant didn't receive the welcome email", a:"Check that their email is spelled correctly. Ask them to check spam/junk folders. You can resend the welcome instructions manually using the email template on this page." },
  { q:"Someone wants to join mid-pilot", a:"They can join at any time during the active pilot period using the group code. They'll start with the current week's prompt but can record memories about any topic." },
  { q:"How do participants record a voice note?", a:"After logging in and creating a space, they tap the microphone button. The app requests microphone permission on first use. Voice notes can be up to 5 minutes. They can re-record before saving." },
];

const CHECKLIST = [
  { id:'participants', label:'Participant email list submitted' },
  { id:'accounts', label:'All participant accounts created' },
  { id:'welcome', label:'Welcome emails sent to participants' },
  { id:'tested', label:'Tested the platform yourself' },
  { id:'kickoff', label:'Group kickoff meeting scheduled' },
];

// ─── Helpers ─────────────────────────────────────────────────────────────

function heightTier(pct, isFuture) {
  if (isFuture) return s.barH0;
  if (pct <= 0) return s.barH0;
  if (pct <= 10) return s.barH10;
  if (pct <= 20) return s.barH20;
  if (pct <= 30) return s.barH30;
  if (pct <= 40) return s.barH40;
  if (pct <= 50) return s.barH50;
  if (pct <= 60) return s.barH60;
  if (pct <= 70) return s.barH70;
  if (pct <= 80) return s.barH80;
  if (pct <= 90) return s.barH90;
  return s.barH100;
}

function formatDate(d) {
  if (!d) return null;
  return new Date(d).toLocaleDateString('en-US', { month:'short', day:'numeric', year:'numeric' });
}

function initial(name) {
  return (name || '?').charAt(0).toUpperCase();
}

// ─── Component ───────────────────────────────────────────────────────────

export default function LeaderPage() {
  const navigate = useNavigate();
  const { getAccessTokenSilently } = useAuth0();
  const appState = useAppContext();

  const getApi = useCallback(
    () => createApiClient(getAccessTokenSilently),
    [getAccessTokenSilently]
  );

  // ── Dashboard state ──
  const [dash, setDash] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // ── Week selection ──
  const [selectedWeek, setSelectedWeek] = useState(null); // set after dash loads
  const [subTab, setSubTab] = useState('activity'); // 'activity' | 'checkin'

  // ── Weekly data caches ──
  const [weekCache, setWeekCache] = useState({}); // weekNum → { participants, breakdown }
  const [checkinCache, setCheckinCache] = useState({}); // weekNum → checkin obj or 'none'
  const [weekLoading, setWeekLoading] = useState(false);

  // ── Check-in form ──
  const [engLevel, setEngLevel] = useState(null);
  const [concerns, setConcerns] = useState('');
  const [verbatim, setVerbatim] = useState('');
  const [positiveFeedback, setPositiveFeedback] = useState('');
  const [techIssues, setTechIssues] = useState(null); // true/false
  const [techDetails, setTechDetails] = useState('');
  const [followUp, setFollowUp] = useState(null); // true/false
  const [followUpNotes, setFollowUpNotes] = useState('');
  const [priorFollowup, setPriorFollowup] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // ── UI ──
  const [toast, setToast] = useState('');
  const [showQrModal, setShowQrModal] = useState(false);
  const [openFaq, setOpenFaq] = useState(null);

  // ── Checklist (localStorage) ──
  const [checklist, setChecklist] = useState(() => {
    try {
      const saved = localStorage.getItem('ana_leader_checklist');
      return saved ? JSON.parse(saved) : {};
    } catch { return {}; }
  });

  // ── Load dashboard ──
  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError('');
      try {
        const api = getApi();
        const data = await api.get('/leader/dashboard');
        if (cancelled) return;
        setDash(data);
        setSelectedWeek(data.currentWeek > 0 ? data.currentWeek : 0);
      } catch (err) {
        if (cancelled) return;
        if (err.error === 'LEADER_ROLE_REQUIRED' || err.error === 'NOT_A_LEADER') {
          setError('ACCESS_DENIED');
        } else {
          setError(err.error || 'LOAD_FAILED');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, [getApi]);

  // ── Load week data when selectedWeek changes ──
  useEffect(() => {
    if (!dash || selectedWeek === null || selectedWeek === 0) return;
    if (selectedWeek > dash.currentWeek) return; // future week
    if (weekCache[selectedWeek]) return; // already cached

    let cancelled = false;
    async function loadWeek() {
      setWeekLoading(true);
      try {
        const api = getApi();
        const [weekData, checkinData] = await Promise.all([
          api.get(`/leader/week/${selectedWeek}`),
          api.get(`/leader/checkin/${selectedWeek}`).catch(e =>
            e.error === 'NOT_FOUND' ? null : Promise.reject(e)
          ),
        ]);
        if (cancelled) return;
        setWeekCache(prev => ({ ...prev, [selectedWeek]: weekData }));
        setCheckinCache(prev => ({ ...prev, [selectedWeek]: checkinData || 'none' }));
      } catch (err) {
        console.error('Week load error:', err);
      } finally {
        if (!cancelled) setWeekLoading(false);
      }
    }
    loadWeek();
    return () => { cancelled = true; };
  }, [dash, selectedWeek, weekCache, getApi]);

  // ── Checklist persistence ──
  useEffect(() => {
    try { localStorage.setItem('ana_leader_checklist', JSON.stringify(checklist)); } catch {}
  }, [checklist]);

  // ── Derived data ──
  const totalWeeks = dash?.totalWeeks || 4;
  const currentWeek = dash?.currentWeek || 0;
  const weekData = selectedWeek ? weekCache[selectedWeek] : null;
  const checkinData = selectedWeek ? checkinCache[selectedWeek] : null;
  const isSubmitted = checkinData && checkinData !== 'none';
  const isFutureWeek = selectedWeek > currentWeek;
  const checkDone = CHECKLIST.filter(c => checklist[c.id]).length;

  const totalMemories = useMemo(() => {
    if (!dash?.memoriesByType) return 0;
    return Object.values(dash.memoriesByType).reduce((sum, n) => sum + n, 0);
  }, [dash]);

  const voiceCount = dash?.memoriesByType?.voice || 0;

  // ── Max values for bar chart scaling ──
  const maxBar = useMemo(() => {
    if (!dash?.weeklyStats) return 1;
    let m = 1;
    for (const ws of dash.weeklyStats) {
      m = Math.max(m, ws.memories, ws.voiceNotes);
    }
    return m;
  }, [dash]);

  // ── Handlers ──

  function showToast(msg) {
    setToast(msg);
    setTimeout(() => setToast(''), 4000);
  }

  async function copyText(text, label) {
    try {
      await navigator.clipboard.writeText(text);
      showToast(`${label} copied!`);
    } catch {
      showToast('Copy failed — please copy manually');
    }
  }

  function toggleCheck(id) {
    setChecklist(prev => ({ ...prev, [id]: !prev[id] }));
  }

  function selectWeek(wk) {
    if (wk > currentWeek && wk !== 0) return;
    setSelectedWeek(wk);
    setSubTab('activity');
    // Reset form when switching weeks
    resetForm();
  }

  function resetForm() {
    setEngLevel(null);
    setConcerns('');
    setVerbatim('');
    setPositiveFeedback('');
    setTechIssues(null);
    setTechDetails('');
    setFollowUp(null);
    setFollowUpNotes('');
    setPriorFollowup('');
  }

  async function handleSubmitCheckin() {
    if (!engLevel) { showToast('Please select an engagement level'); return; }
    if (!window.confirm('Check-ins are locked after submission and cannot be edited. Submit this check-in?')) return;

    setSubmitting(true);
    try {
      const api = getApi();
      const result = await api.post('/leader/checkin', {
        weekNumber: selectedWeek,
        engagementLevel: engLevel,
        leaderVerbatim: verbatim || null,
        concernsRaised: concerns || null,
        positiveFeedback: positiveFeedback || null,
        technicalIssues: techIssues === true,
        technicalIssueDetails: techDetails || null,
        followUpNeeded: followUp === true,
        followUpNotes: followUpNotes || null,
        priorWeekFollowup: priorFollowup || null,
      });
      // Refresh checkin cache with submitted data
      const fresh = await api.get(`/leader/checkin/${selectedWeek}`).catch(() => null);
      setCheckinCache(prev => ({ ...prev, [selectedWeek]: fresh || result }));
      showToast('Check-in submitted successfully');
      setSubTab('checkin');
    } catch (err) {
      if (err.error === 'ALREADY_SUBMITTED') {
        showToast('This check-in was already submitted');
        // Refresh cache
        const api = getApi();
        const fresh = await api.get(`/leader/checkin/${selectedWeek}`).catch(() => null);
        if (fresh) setCheckinCache(prev => ({ ...prev, [selectedWeek]: fresh }));
      } else {
        showToast('Submit failed — please try again');
      }
    } finally {
      setSubmitting(false);
    }
  }

  // ── Email template ──
  const emailTemplate = useMemo(() => {
    if (!dash) return '';
    const code = dash.accessCode || 'CODE';
    const prompt = PROMPTS[1] || '';
    return `Subject: A private place to keep memories of [THEIR_NAME]

Hi [FIRST_NAME],

As I mentioned, we're trying out a private remembrance platform for the next ${totalWeeks} weeks. It's a place to record voice notes, share photos, and keep memories of [THEIR_NAME]. Completely private, completely optional.

Here's how to get started:

1. Go to app.anamoria.org
2. Click "I have a group code"
3. Enter code: ${code}
4. Enter your email (the one I have on file for you)
5. Check your email for a password setup link
6. Set your password and you're in!

This week's prompt: "${prompt}"

Go at your own pace. Even one voice note is okay.

Warmly,
[YOUR NAME]`;
  }, [dash, totalWeeks]);

  const joinUrl = dash ? `https://app.anamoria.org/join?gc=${encodeURIComponent(dash.accessCode || '')}` : '';

  // ─── RENDER ────────────────────────────────────────────────────────────

  // Loading
  if (loading) {
    return (
      <div className={s.page}>
        <div className={s.loading}>
          <div className="app-loading-spinner" />
        </div>
      </div>
    );
  }

  // Access denied
  if (error === 'ACCESS_DENIED') {
    return (
      <div className={s.page}>
        <div className={s.errorBox}>
          <h2>Access Restricted</h2>
          <p>This page is only available to pilot group leaders.</p>
          <button className={s.retryBtn} onClick={() => navigate(-1)}>Go Back</button>
        </div>
      </div>
    );
  }

  // Other errors
  if (error || !dash) {
    return (
      <div className={s.page}>
        <div className={s.errorBox}>
          <h2>Something went wrong</h2>
          <p>We couldn't load the dashboard. Please try again.</p>
          <button className={s.retryBtn} onClick={() => window.location.reload()}>Retry</button>
        </div>
      </div>
    );
  }

  const startStr = formatDate(dash.pilotStartDate);
  const endStr = formatDate(dash.pilotEndDate);
  const datesStr = startStr && endStr ? `${startStr} – ${endStr}` : 'Dates not set';

  return (
    <div className={s.page}>
      <div className={s.dashboard}>

        {/* ── Back Link ── */}
        <button className={s.backLink} onClick={() => navigate(appState?.currentSpace ? `/spaces/${appState.currentSpace.id}` : -1)}>
          ← My Memory Vault
        </button>

        {/* ══════════════════════════════════════════
            HEADER
            ══════════════════════════════════════════ */}
        <div className={s.header}>
          <div className={s.headerLeft}>
            <h1 className={s.headerTitle}>{dash.groupName || 'Pilot Group'}</h1>
            <div className={s.headerMeta}>
              <div className={s.codeRow}>
                <span className={s.codeLabel}>Group Code:</span>
                <span className={s.codeValue}>{dash.accessCode}</span>
                <button className={s.btnSmall} onClick={() => copyText(dash.accessCode, 'Code')}>Copy</button>
                <button className={s.btnShowQr} onClick={() => setShowQrModal(true)}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="3" height="3"/><rect x="20" y="14" width="1" height="3"/><rect x="14" y="20" width="3" height="1"/></svg>
                  Show QR
                </button>
              </div>
              <span className={s.headerDates}>{datesStr}</span>
            </div>
          </div>

          <div className={s.headerStats}>
            <div className={s.stat}>
              <span className={`${s.statNumber} ${s.statMemories}`}>{totalMemories}</span>
              <span className={s.statLabel}>Memories</span>
            </div>
            <div className={s.stat}>
              <span className={`${s.statNumber} ${s.statVoice}`}>{voiceCount}</span>
              <span className={s.statLabel}>Voice</span>
            </div>
            <div className={s.stat}>
              <span className={`${s.statNumber} ${s.statActive}`}>{dash.activatedUsers}/{dash.totalUsers}</span>
              <span className={s.statLabel}>Active</span>
            </div>
          </div>
        </div>

        {/* ══════════════════════════════════════════
            BAR CHART
            ══════════════════════════════════════════ */}
        {dash.weeklyStats && dash.weeklyStats.length > 0 && (
          <div className={s.insightsCard}>
            <div className={s.chartLabel}>Weekly Activity</div>
            <div className={s.chartBars}>
              {dash.weeklyStats.map(ws => {
                const memPct = maxBar > 0 ? (ws.memories / maxBar) * 100 : 0;
                const voicePct = maxBar > 0 ? (ws.voiceNotes / maxBar) * 100 : 0;
                return (
                  <div key={ws.week} className={s.chartWeek}>
                    <div className={s.chartBarGroup}>
                      <div className={`${s.chartBar} ${s.barMemories} ${heightTier(memPct, ws.isFuture)}`} />
                      <div className={`${s.chartBar} ${s.barVoice} ${heightTier(voicePct, ws.isFuture)}`} />
                    </div>
                    <div className={s.circleWrap}>
                      {ws.isFuture ? (
                        <span style={{ fontSize:11, color:'var(--text-muted)' }}>—</span>
                      ) : (
                        <span className={s.activeCircle}>{ws.activeParticipants}</span>
                      )}
                    </div>
                    <span className={s.weekLabel}>Wk {ws.week}</span>
                  </div>
                );
              })}
            </div>
            <div className={s.chartLegend}>
              <span className={s.legendItem}><span className={`${s.legendDot} ${s.dotMemories}`} /> Memories</span>
              <span className={s.legendItem}><span className={`${s.legendDot} ${s.dotVoice}`} /> Voice Notes</span>
              <span className={s.legendItem}><span className={`${s.legendDot} ${s.dotActive}`} /> Active</span>
            </div>
          </div>
        )}

        {/* ══════════════════════════════════════════
            WEEK TABS
            ══════════════════════════════════════════ */}
        <div className={s.weekNav}>
          {/* Week 0: Getting Started */}
          <button
            className={`${s.weekTab} ${s.weekTabOnboarding} ${selectedWeek === 0 ? s.weekTabSelected : ''}`}
            onClick={() => selectWeek(0)}
          >
            <span className={s.tabNumber}>Getting Started</span>
          </button>

          {/* Weeks 1..N */}
          {Array.from({ length: totalWeeks }, (_, i) => i + 1).map(wk => {
            const isSel = selectedWeek === wk;
            const isCur = wk === currentWeek;
            const isFut = wk > currentWeek;
            const isSub = checkinCache[wk] && checkinCache[wk] !== 'none';
            return (
              <button
                key={wk}
                className={[
                  s.weekTab,
                  isSel && s.weekTabSelected,
                  isSub && s.weekTabSubmitted,
                  isFut && s.weekTabFuture,
                ].filter(Boolean).join(' ')}
                onClick={() => selectWeek(wk)}
                disabled={isFut}
              >
                {isSub && <span className={s.tabCheck}>✓</span>}
                {isCur && <span className={s.tabCurrentDot} />}
                <span className={s.tabNumber}>Week {wk}</span>
                <span className={s.tabTheme}>{THEMES[wk] || ''}</span>
              </button>
            );
          })}
        </div>

        {/* ══════════════════════════════════════════
            WEEK 0 — GETTING STARTED
            ══════════════════════════════════════════ */}
        {selectedWeek === 0 && (
          <div className={s.onboardingSection}>

            {/* Pre-Launch Checklist */}
            <div className={s.card}>
              <div className={s.cardHeader}>
                <h3 className={s.cardTitle}>Pre-Launch Checklist</h3>
                <span className={s.checkProgress}>{checkDone} of {CHECKLIST.length} complete</span>
              </div>
              <div className={s.checkItems}>
                {CHECKLIST.map(item => (
                  <button key={item.id} className={s.checkItem} onClick={() => toggleCheck(item.id)}>
                    <span className={`${s.checkBox} ${checklist[item.id] ? s.checkBoxDone : ''}`}>
                      {checklist[item.id] ? '✓' : ''}
                    </span>
                    <span className={checklist[item.id] ? s.checkLabelDone : ''}>{item.label}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Email Template */}
            <div className={s.card}>
              <h3 className={s.cardTitle}>Welcome Email Template</h3>
              <p className={s.cardHint}>Copy and personalize this for your group. Replace bracketed text with your details.</p>
              <div className={s.emailTpl}>{emailTemplate}</div>
              <button className={s.btnCopyTpl} onClick={() => copyText(emailTemplate, 'Template')}>
                Copy Template
              </button>
            </div>

            {/* QR Code */}
            <div className={s.card}>
              <h3 className={s.cardTitle}>Group QR Code</h3>
              <p className={s.cardHint}>Display this at the start of each session. Participants scan to join your group's private space.</p>
              <div className={s.qrWrap}>
                <QRCodeSVG value={joinUrl} size={180} level="M" />
              </div>
            </div>

            {/* Weekly Prompts */}
            <div className={s.card}>
              <h3 className={s.cardTitle}>Weekly Prompts</h3>
              <p className={s.cardHint}>Each week has a prompt to get started.</p>
              {Object.entries(THEMES).map(([wk, theme]) => (
                <div key={wk} className={s.promptRow}>
                  <span className={s.promptBadge}>{wk}</span>
                  <div>
                    <div className={s.promptTheme}>{theme}</div>
                    <div className={s.promptText}>"{PROMPTS[wk]}"</div>
                  </div>
                </div>
              ))}
            </div>

            {/* FAQ */}
            <div className={s.card}>
              <h3 className={s.cardTitle}>Troubleshooting</h3>
              <div className={s.faqList}>
                {FAQ.map((item, i) => (
                  <div key={i} className={s.faqItem}>
                    <button className={s.faqQ} onClick={() => setOpenFaq(openFaq === i ? null : i)}>
                      {item.q}
                      <span className={`${s.faqArrow} ${openFaq === i ? s.faqArrowOpen : ''}`}>▾</span>
                    </button>
                    {openFaq === i && <div className={s.faqA}>{item.a}</div>}
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* ══════════════════════════════════════════
            WEEK 1-N — CONTENT
            ══════════════════════════════════════════ */}
        {selectedWeek > 0 && !isFutureWeek && (
          <>
            {/* Week Banner */}
            <div className={s.weekBanner}>
              <div className={s.bannerTheme}>WEEK {selectedWeek}: {(THEMES[selectedWeek] || '').toUpperCase()}</div>
              {PROMPTS[selectedWeek] && (
                <div className={s.bannerPrompt}>"{PROMPTS[selectedWeek]}"</div>
              )}
            </div>

            {/* Sub-tabs */}
            <div className={s.subTabBar}>
              <button className={`${s.subTab} ${subTab === 'activity' ? s.subTabActive : ''}`} onClick={() => setSubTab('activity')}>
                Participant Activity
              </button>
              <button className={`${s.subTab} ${subTab === 'checkin' ? s.subTabActive : ''}`} onClick={() => setSubTab('checkin')}>
                Weekly Check-In {isSubmitted && '✓'}
              </button>
            </div>

            <div className={s.subTabContent}>
              {weekLoading ? (
                <div className={s.weekLoading}>
                  <div className="app-loading-spinner" style={{ width:18, height:18, borderWidth:2 }} />
                  Loading week data...
                </div>
              ) : subTab === 'activity' ? (
                /* ── Participant Activity ── */
                <div>
                  {weekData && (
                    <div className={s.activitySummary}>
                      <span className={s.summaryText}>
                        {weekData.participants.filter(p => p.memoriesThisWeek > 0).length} of {weekData.participants.length} active this week
                      </span>
                    </div>
                  )}
                  {weekData?.participants.map(p => {
                    const hasActivity = p.memoriesThisWeek > 0;
                    return (
                      <div key={p.id} className={`${s.pRow} ${!hasActivity ? s.pRowPending : ''}`}>
                        <span className={`${s.avatar} ${hasActivity ? s.avatarActive : s.avatarPending}`}>
                          {initial(p.name)}
                        </span>
                        <div className={s.pInfo}>
                          <span className={s.pName}>{p.name}</span>
                          <span className={s.pMeta}>
                            {hasActivity
                              ? `${p.voiceNotesThisWeek} voice · ${p.memoriesThisWeek} memories`
                              : 'Not yet activated'}
                          </span>
                        </div>
                        <div className={s.pActivity}>
                          {hasActivity ? (
                            <span className={s.badge}>{p.memoriesThisWeek} this week</span>
                          ) : (
                            <span className={s.statusPending}>Not activated</span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                  {!weekData?.participants?.length && !weekLoading && (
                    <div style={{ padding:24, textAlign:'center', color:'var(--text-muted)' }}>
                      No participant data available for this week.
                    </div>
                  )}
                </div>
              ) : (
                /* ── Check-In Tab ── */
                <div className={s.checkinContent}>
                  {isSubmitted ? (
                    /* Submitted — read-only view */
                    <div>
                      <div className={s.submittedBadge}>
                        <span style={{ fontWeight:700 }}>✓</span>
                        Submitted on {formatDate(checkinData.reportDate)}
                      </div>

                      <div className={s.reportGrid}>
                        <div className={s.reportItem}>
                          <span className={s.reportLabel}>Engagement</span>
                          <span className={`${s.reportValue} ${
                            checkinData.engagementLevel === 'high' ? s.engHigh :
                            checkinData.engagementLevel === 'medium' ? s.engMedium : s.engLow
                          }`}>
                            {checkinData.engagementLevel ? checkinData.engagementLevel.charAt(0).toUpperCase() + checkinData.engagementLevel.slice(1) : '—'}
                          </span>
                        </div>
                      </div>

                      {checkinData.concernsRaised && (
                        <div className={s.reportBlock}>
                          <span className={s.reportBlockLabel}>Issues & Concerns</span>
                          <p className={s.reportBlockValue}>{checkinData.concernsRaised}</p>
                        </div>
                      )}
                      {checkinData.leaderVerbatim && (
                        <div className={s.reportBlock}>
                          <span className={s.reportBlockLabel}>Verbatim</span>
                          <p className={`${s.reportBlockValue} ${s.reportVerbatim}`}>"{checkinData.leaderVerbatim}"</p>
                        </div>
                      )}
                      {checkinData.positiveFeedback && (
                        <div className={s.reportBlock}>
                          <span className={s.reportBlockLabel}>Positive Feedback</span>
                          <p className={s.reportBlockValue}>{checkinData.positiveFeedback}</p>
                        </div>
                      )}
                      {checkinData.technicalIssues && checkinData.technicalIssueDetails && (
                        <div className={s.reportBlock}>
                          <span className={s.reportBlockLabel}>Technical Issues</span>
                          <p className={s.reportBlockValue}>{checkinData.technicalIssueDetails}</p>
                        </div>
                      )}
                    </div>
                  ) : (
                    /* Not submitted — check-in form */
                    <div>
                      <p className={s.formIntro}>How did this week go for your group?</p>

                      {/* Engagement Level */}
                      <div className={s.formGroup}>
                        <label className={s.formLabel}>Engagement Level *</label>
                        <div className={s.engOptions}>
                          {['low','medium','high'].map(level => (
                            <button key={level} className={`${s.engBtn} ${engLevel === level ? s.engBtnSelected : ''}`}
                              onClick={() => setEngLevel(level)}>
                              {level.charAt(0).toUpperCase() + level.slice(1)}
                            </button>
                          ))}
                        </div>
                        <span className={s.formHint}>Your read on how engaged participants were with prompts this week</span>
                      </div>

                      {/* Concerns */}
                      <div className={s.formGroup}>
                        <label className={s.formLabel}>Issues & Concerns</label>
                        <textarea className={s.formTextarea} value={concerns} onChange={e => setConcerns(e.target.value)}
                          placeholder="Any participant or technical concerns this week?" rows={3} />
                      </div>

                      {/* Verbatim */}
                      <div className={s.formGroup}>
                        <label className={s.formLabel}>Participant Verbatim</label>
                        <textarea className={s.formTextarea} value={verbatim} onChange={e => setVerbatim(e.target.value)}
                          placeholder="A quote or moment that stood out this week" rows={2} />
                        <span className={s.formHint}>Participant words that stood out to you</span>
                      </div>

                      {/* Positive Feedback */}
                      <div className={s.formGroup}>
                        <label className={s.formLabel}>Positive Feedback</label>
                        <textarea className={s.formTextarea} value={positiveFeedback} onChange={e => setPositiveFeedback(e.target.value)}
                          placeholder="What went well this week?" rows={2} />
                      </div>

                      {/* Technical Issues */}
                      <div className={s.formGroup}>
                        <label className={s.formLabel}>Technical Issues?</label>
                        <div className={s.toggleRow}>
                          <button className={`${s.togBtn} ${techIssues === true ? s.togBtnYes : ''}`} onClick={() => setTechIssues(true)}>Yes</button>
                          <button className={`${s.togBtn} ${techIssues === false ? s.togBtnNo : ''}`} onClick={() => setTechIssues(false)}>No</button>
                        </div>
                        {techIssues === true && (
                          <textarea className={s.formTextarea} value={techDetails} onChange={e => setTechDetails(e.target.value)}
                            placeholder="Describe the technical issues" rows={2} style={{ marginTop:8 }} />
                        )}
                      </div>

                      {/* Follow-up Needed */}
                      <div className={s.formGroup}>
                        <label className={s.formLabel}>Follow-up Needed?</label>
                        <div className={s.toggleRow}>
                          <button className={`${s.togBtn} ${followUp === true ? s.togBtnYes : ''}`} onClick={() => setFollowUp(true)}>Yes</button>
                          <button className={`${s.togBtn} ${followUp === false ? s.togBtnNo : ''}`} onClick={() => setFollowUp(false)}>No</button>
                        </div>
                        {followUp === true && (
                          <textarea className={s.formTextarea} value={followUpNotes} onChange={e => setFollowUpNotes(e.target.value)}
                            placeholder="What follow-up is needed?" rows={2} style={{ marginTop:8 }} />
                        )}
                      </div>

                      {/* Submit */}
                      <button className={s.btnSubmit} onClick={handleSubmitCheckin} disabled={submitting || !engLevel}>
                        {submitting ? 'Submitting...' : 'Submit Check-In'}
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          </>
        )}

        {/* Future week */}
        {selectedWeek > 0 && isFutureWeek && (
          <div className={s.futureMsg}>
            <div className={s.futureIcon}>🗓️</div>
            <p>Week {selectedWeek} hasn't started yet.</p>
            <p style={{ fontSize:'var(--ds)', marginTop:4 }}>Check back when this week begins.</p>
          </div>
        )}

        {/* ══════════════════════════════════════════
            FOOTER
            ══════════════════════════════════════════ */}
        <div className={s.footer}>
          <p>Questions or need help? Reach out anytime.</p>
          <a href="mailto:support@anamoria.com" className={s.supportLink}>support@anamoria.com</a>
        </div>

      </div>

      {/* ══════════════════════════════════════════
          QR MODAL
          ══════════════════════════════════════════ */}
      {showQrModal && (
        <div className={s.modalOverlay} onClick={() => setShowQrModal(false)}>
          <div className={s.modalBox} onClick={e => e.stopPropagation()}>
            <div className={s.modalHead}>
              <h3 className={s.modalTitle}>Group QR Code</h3>
              <button className={s.btnClose} onClick={() => setShowQrModal(false)}>✕</button>
            </div>
            <div className={s.modalBody}>
              <QRCodeSVG value={joinUrl} size={240} level="M" />
              <p className={s.modalHint}>Participants scan this to join your group</p>
            </div>
          </div>
        </div>
      )}

      {/* Toast */}
      {toast && <div className={s.toast}>✓ {toast}</div>}
    </div>
  );
}
