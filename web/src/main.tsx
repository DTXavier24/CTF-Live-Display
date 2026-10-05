import '@fontsource/chakra-petch/500.css';
import '@fontsource/chakra-petch/600.css';
import '@fontsource/chakra-petch/700.css';
import '@fontsource/ibm-plex-sans/400.css';
import '@fontsource/ibm-plex-sans/500.css';
import '@fontsource/ibm-plex-sans/600.css';
import './index.css';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { Display } from './display/Display';
import { useServerState } from './server';

// ponytail: placeholder until the admin panel (phase 5).
function Admin() {
  const { state, connected } = useServerState();
  return (
    <main className="p-8 font-sans">
      <h1 className="font-display text-3xl font-bold">IBOH 2026 Admin</h1>
      <p className="mt-2 text-fg-muted">The control panel is coming in phase 5.</p>
      <pre className="mt-6 text-sm">
        {JSON.stringify({ connected, phase: state?.phase, dataDelayed: state?.dataDelayed, mock: state?.mock }, null, 2)}
      </pre>
    </main>
  );
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>{location.pathname.startsWith('/admin') ? <Admin /> : <Display />}</StrictMode>,
);
