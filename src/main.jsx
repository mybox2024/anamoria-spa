// main.jsx — Anamoria SPA entry point
// Mounts <App /> into the #root div and imports global styles.
// Nothing else belongs here — keep this file minimal.

import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

import './styles/global.css';
import App from './App';

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>
);
