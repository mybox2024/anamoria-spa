// components/BrandIcons.jsx — Anamoria SPA
// v1.0 — Extracted Brand Sage SVG icons for reuse across BottomNav and
//         SuccessScreen (April 16, 2026)
//
// Named exports:
//   - RecordIcon  (microphone — filled capsule body + outlined pickup arc + stand)
//   - WriteIcon   (pencil/pen — filled nib + outlined pen body + edit line)
//   - PhotoIcon   (image frame — filled sun + outlined frame + mountain line)
//   - InviteIcon  (person + plus — filled face + outlined head/body/plus)
//
// Reference: BottomNav_BrandSage_Implementation.md
// SVG paths copied byte-for-byte from BottomNav.jsx (pre-extraction).
//
// Usage:
//   <RecordIcon />                      — 20x20, inherits currentColor
//   <RecordIcon size={24} />            — custom size
//
// Color model:
//   - Outlined elements inherit `stroke: currentColor` via the consuming
//     component's CSS (BottomNav.module.css .icon svg, or
//     SuccessScreen.module.css .primaryIcon svg).
//   - Filled elements use inline fill="currentColor" (no .svgFill class
//     dependency — keeps icons portable across CSS modules).
//
// No logic, no state, no side effects.

export function RecordIcon({ size = 20 }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path fill="currentColor" d="M12 2a3 3 0 0 0-3 3v6a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3z" />
      <path d="M18 10.5v.5a6 6 0 0 1-12 0v-.5" strokeWidth="1.5" />
      <path d="M12 17v4" strokeWidth="1.5" />
    </svg>
  );
}

export function WriteIcon({ size = 20 }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M20 7l-3-3-12.5 12.5L3 21l4.5-1.5L20 7z" strokeWidth="1.5" />
      <path d="M15 6l3 3" strokeWidth="1.5" />
      <circle fill="currentColor" cx="18.5" cy="5.5" r="1" />
    </svg>
  );
}

export function PhotoIcon({ size = 20 }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <rect x="3" y="3" width="18" height="18" rx="3" strokeWidth="1.5" />
      <circle fill="currentColor" cx="8.5" cy="8.5" r="1.5" />
      <path d="M21 15l-5-5-8 11" strokeWidth="1.5" />
    </svg>
  );
}

export function InviteIcon({ size = 20 }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <circle cx="9" cy="7" r="3.5" strokeWidth="1.5" />
      <circle fill="currentColor" cx="9" cy="7" r="1.5" />
      <path d="M2 21v-2a4 4 0 0 1 4-4h6a4 4 0 0 1 4 4v2" strokeWidth="1.5" />
      <line x1="19" y1="8" x2="19" y2="14" strokeWidth="1.5" />
      <line x1="22" y1="11" x2="16" y2="11" strokeWidth="1.5" />
    </svg>
  );
}
