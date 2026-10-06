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
import { Admin } from './admin/Admin';

createRoot(document.getElementById('root')!).render(
  <StrictMode>{location.pathname.startsWith('/admin') ? <Admin /> : <Display />}</StrictMode>,
);
