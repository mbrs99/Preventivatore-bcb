import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import EditorApp from './editor-app.jsx';

const root = createRoot(document.getElementById('root'));
root.render(<StrictMode><EditorApp /></StrictMode>);
