import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import JSZip from 'jszip';
import App from './preventivatore.jsx';

// Il preventivatore.jsx (codice esistente) usa `window.JSZip` caricandolo da
// CDN se non presente. In ambiente Electron offline/CSP quel caricamento da
// rete fallirebbe. Iniettandolo qui da node_modules il preventivatore trova
// window.JSZip già presente e non tenta il caricamento remoto.
window.JSZip = JSZip;

const root = createRoot(document.getElementById('root'));
root.render(<StrictMode><App /></StrictMode>);
