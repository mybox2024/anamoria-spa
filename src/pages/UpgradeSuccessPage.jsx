// pages/UpgradeSuccessPage.jsx — Anamoria SPA
// v1.0 — B3: Payment Success screen (April 6, 2026)
//
// Shown after a successful purchase (mock: navigated from CheckoutPage).
// In production: Stripe webhook confirms payment → tier updated in DB →
//   SPA reads updated tier from GET /billing/subscription → renders this screen.
//
// URL: /settings/upgrade/success?plan={monthly|annual|forever}&from={spaceId}
//   ?plan  — purchased plan id (for copy variation)
//   ?from  — spaceId for "Back to your space" CTA

import { useNavigate, useSearchParams } from 'react-router-dom';
import styles from './UpgradeSuccessPage.module.css';

/* ─── Plan-specific copy ─── */

const SUCCESS_COPY = {
  monthly: {
    heading: "You're now Premium.",
    body: "Every memory you've shared is still here, and now there's no limit to what you can add. We're glad you're staying.",
  },
  annual: {
    heading: "You're now Premium.",
    body: "A full year of unlimited memories. Every voice, photo, and story you share is kept safe — always.",
  },
  forever: {
    heading: "You're a Lifetime Member.",
    body: "Thank you for being part of Anamoria for life. Your memories, and the memories of the people you love, will always have a home here.",
  },
};

/* ─── Animated check icon ─── */

function SuccessCheckmark() {
  return (
    <div className={styles.checkCircle} aria-hidden="true">
      <svg
        className={styles.checkSvg}
        viewBox="0 0 52 52"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        <circle
          className={styles.checkCircleRing}
          cx="26" cy="26" r="24"
          stroke="currentColor"
          strokeWidth="2.5"
          fill="none"
        />
        <path
          className={styles.checkMark}
          d="M14 26l8 8 16-16"
          stroke="currentColor"
          strokeWidth="3"
          strokeLinecap="round"
          strokeLinejoin="round"
          fill="none"
        />
      </svg>
    </div>
  );
}

/* ═══════════════════════════════════════
   SUCCESS PAGE
   ═══════════════════════════════════════ */

export default function UpgradeSuccessPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const planId  = searchParams.get('plan') || 'monthly';
  const spaceId = searchParams.get('from');

  const copy = SUCCESS_COPY[planId] || SUCCESS_COPY.monthly;

  function goToSpace() {
    if (spaceId) navigate(`/spaces/${spaceId}`);
    else navigate('/spaces');
  }

  return (
    <div className={styles.page}>
      <div className={styles.card}>

        {/* Animated checkmark */}
        <SuccessCheckmark />

        {/* Heading + body */}
        <h1 className={styles.heading}>{copy.heading}</h1>
        <p className={styles.body}>{copy.body}</p>

        {/* CTA */}
        <button className={styles.cta} onClick={goToSpace}>
          Back to your space
        </button>

        {/* Subtle confirmation note */}
        <p className={styles.note}>
          A confirmation will be sent to your email.
        </p>

      </div>
    </div>
  );
}
