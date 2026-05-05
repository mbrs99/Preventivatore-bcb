/* ================================================================
   Preventivatore BCB — processo principale Electron

   Responsabilità:
   - Apre la finestra Home (launcher con 4 bottoni)
   - Apre la finestra Preventivatore (app React buildata da Vite)
   - Espone API di storage che scrivono/leggono file JSON in Clienti/
   - Apre cartelle Clienti/, Tariffario/, Codice/ nel file manager del SO
   - Funzioni di import/export clienti via ZIP per passaggio tra utenti
   ================================================================ */

const { app, BrowserWindow, ipcMain, shell, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const fsp = require('fs').promises;

/* ---------------- Path risoluzione portabile ------------------- */
// Vogliamo che cartelle dati (Clienti, Tariffario, Codice) siano ACCANTO
// all'app, non dentro il bundle. In questo modo:
//  - Su Mac: accanto a Preventivatore.app (nella cartella genitore)
//  - Su Windows: accanto a Preventivatore.exe (stessa cartella)
//  - In sviluppo (npm run dev): nella root del progetto
//
// Questo garantisce che copiando l'intera cartella "Preventivatore/"
// su un altro computer, tutti i dati vengano con te.

function getPortableRoot() {
  if (!app.isPackaged) {
    // Modalità sviluppo: la root è la directory del progetto
    return app.getAppPath();
  }

  // Produzione: risali dal .app / .exe alla cartella contenitrice
  const execPath = process.execPath;

  if (process.platform === 'darwin') {
    // process.execPath = .../Preventivatore BCB.app/Contents/MacOS/Preventivatore BCB
    // Risalire 4 livelli: MacOS -> Contents -> .app -> cartella contenitore
    return path.resolve(execPath, '..', '..', '..', '..');
  } else {
    // Windows/Linux: accanto al .exe
    return path.dirname(execPath);
  }
}

const PORTABLE_ROOT = getPortableRoot();
const CLIENTI_DIR   = path.join(PORTABLE_ROOT, 'Clienti');
const TARIFFARIO_DIR = path.join(PORTABLE_ROOT, 'Tariffario');
const STORICO_DIR    = path.join(TARIFFARIO_DIR, 'storico');
const CODICE_DIR    = path.join(PORTABLE_ROOT, 'Codice');

// File principale del tariffario "in uso" (modificato dall'editor)
const TARIFFARIO_FILE = path.join(TARIFFARIO_DIR, 'tariffario_attivo.json');
// Default JSON incorporato nel bundle dell'app (read-only)
function getDefaultTariffarioPath() {
  // In dev: src/shared/tariffario-default.json (relativo alla root del progetto)
  // In prod: lo stesso file finisce dentro app.asar (gestito da electron-builder)
  return path.join(__dirname, 'shared', 'tariffario-default.json');
}

console.log('[Preventivatore] Portable root:', PORTABLE_ROOT);
console.log('[Preventivatore] Clienti dir:', CLIENTI_DIR);
console.log('[Preventivatore] Tariffario file:', TARIFFARIO_FILE);

// All'avvio: assicurati che le cartelle esistano e popola "Codice/" con un
// README che spiega cos'è (il vero codice sorgente è altrove, ma la cartella
// può contenere backup o documenti di riferimento).
async function ensureDataFolders() {
  for (const dir of [CLIENTI_DIR, TARIFFARIO_DIR, STORICO_DIR, CODICE_DIR]) {
    try {
      await fsp.mkdir(dir, { recursive: true });
    } catch (err) {
      console.error('Errore creazione cartella:', dir, err);
    }
  }

  // Al primo avvio: copia il tariffario di default nel file attivo, se non esiste
  try {
    await fsp.access(TARIFFARIO_FILE);
  } catch {
    // Non esiste: copia dal default
    try {
      const defaultJson = await fsp.readFile(getDefaultTariffarioPath(), 'utf-8');
      await fsp.writeFile(TARIFFARIO_FILE, defaultJson, 'utf-8');
      console.log('[Tariffario] File attivo creato dal default');
    } catch (err) {
      console.error('[Tariffario] Errore copia default:', err);
    }
  }

  // Crea un README nella cartella Clienti/ al primo avvio, se è vuota
  try {
    const files = await fsp.readdir(CLIENTI_DIR);
    if (files.length === 0) {
      const readmePath = path.join(CLIENTI_DIR, 'LEGGIMI.txt');
      await fsp.writeFile(readmePath,
        'Questa cartella contiene i clienti salvati del Preventivatore BCB.\n\n' +
        'Ogni cliente è un singolo file .json.\n' +
        'Per spostare i tuoi clienti su un altro computer, copia questa cartella\n' +
        'intera (oppure compressa in .zip) e incollala sull\'altro computer.\n\n' +
        'Non modificare manualmente i file .json se non sei sicuro di cosa fai:\n' +
        'l\'app si occupa di crearli, aggiornarli ed eliminarli automaticamente.\n',
        'utf-8');
    }
  } catch {}
}

/* ---------------- Funzioni helper per chiavi storage -------------- */
// Il preventivatore usa chiavi tipo "cliente:abc123", "ui_theme", "tariffario_bcb".
// Windows non accetta ":" nei nomi file, quindi converto in nomi sicuri.

function keyToFilename(key) {
  // "cliente:abc123" → "cliente__abc123.json"
  // "ui_theme" → "ui_theme.json"
  // Uso un doppio underscore come separatore per non confondere con underscore singoli
  return key.replace(/:/g, '__') + '.json';
}

function filenameToKey(filename) {
  return filename.replace(/\.json$/, '').replace(/__/g, ':');
}

/* ---------------- IPC Handlers: storage -------------------------- */
// Il preventivatore.jsx si aspetta un'API con questi metodi.
// Vedi il fallback localStorage nel codice del preventivatore.

ipcMain.handle('storage:get', async (_, key) => {
  try {
    const file = path.join(CLIENTI_DIR, keyToFilename(key));
    const content = await fsp.readFile(file, 'utf-8');
    return { value: content };
  } catch (err) {
    if (err.code === 'ENOENT') return null;
    console.error('[storage:get] errore:', err);
    return null;
  }
});

ipcMain.handle('storage:set', async (_, { key, value }) => {
  try {
    const file = path.join(CLIENTI_DIR, keyToFilename(key));
    await fsp.writeFile(file, String(value), 'utf-8');
    return { ok: true };
  } catch (err) {
    console.error('[storage:set] errore:', err);
    throw new Error('Salvataggio su disco non riuscito: ' + err.message);
  }
});

ipcMain.handle('storage:delete', async (_, key) => {
  try {
    const file = path.join(CLIENTI_DIR, keyToFilename(key));
    await fsp.unlink(file);
    return { ok: true };
  } catch (err) {
    if (err.code === 'ENOENT') return { ok: false };
    console.error('[storage:delete] errore:', err);
    return { ok: false };
  }
});

ipcMain.handle('storage:list', async (_, prefix) => {
  try {
    const files = await fsp.readdir(CLIENTI_DIR);
    const keys = files
      .filter(f => f.endsWith('.json') && !f.startsWith('.'))
      .map(filenameToKey)
      .filter(k => !prefix || k.startsWith(prefix));
    return { keys };
  } catch (err) {
    console.error('[storage:list] errore:', err);
    return { keys: [] };
  }
});

/* ---------------- IPC Handlers: cartelle di sistema --------------- */

ipcMain.handle('shell:openFolder', async (_, which) => {
  const map = {
    clienti: CLIENTI_DIR,
    tariffario: TARIFFARIO_DIR,
    codice: CODICE_DIR,
    root: PORTABLE_ROOT,
  };
  const target = map[which];
  if (!target) return { ok: false, error: 'cartella sconosciuta' };
  try {
    await fsp.mkdir(target, { recursive: true });
    await shell.openPath(target);
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err.message };
  }
});

/* ---------------- IPC Handlers: export/import clienti ------------ */
// Funzioni per zippare/unzippare la cartella Clienti/ a comando,
// per passaggio veloce della lista clienti da un utente all'altro.

ipcMain.handle('clienti:export', async () => {
  const result = await dialog.showSaveDialog({
    title: 'Esporta lista clienti',
    defaultPath: `clienti-bcb-${new Date().toISOString().slice(0,10)}.zip`,
    filters: [{ name: 'Archivio ZIP', extensions: ['zip'] }],
  });
  if (result.canceled || !result.filePath) return { ok: false, canceled: true };

  try {
    // Uso AdmZip se disponibile, altrimenti un archivio tar-like semplice.
    // Dato che non vogliamo dipendenze pesanti, uso archiver (node built-in
    // non esiste per zip, quindi creo manualmente un formato semplice).
    // In realtà più semplice: copio i JSON in una cartella temporanea e poi
    // chiedo all'OS di comprimerla, ma questo è platform-specific.
    //
    // Soluzione pragmatica: copio i file uno per uno con questo formato:
    // un unico file JSON con tutti i clienti dentro come { key: value }.

    const files = await fsp.readdir(CLIENTI_DIR);
    const payload = {};
    for (const f of files) {
      if (!f.endsWith('.json') || f.startsWith('.')) continue;
      const content = await fsp.readFile(path.join(CLIENTI_DIR, f), 'utf-8');
      payload[filenameToKey(f)] = content;
    }

    // Salvo come file .json singolo (non proprio zip, ma più semplice da gestire)
    // Se Marco vuole vero .zip, basta che zippi la cartella Clienti/ dal Finder.
    // Uso formato .bcbexport per non confondere con .json normali.
    const exportPath = result.filePath.replace(/\.zip$/i, '.bcbexport.json');
    await fsp.writeFile(exportPath, JSON.stringify({
      exportVersion: 1,
      exportedAt: new Date().toISOString(),
      count: Object.keys(payload).length,
      clienti: payload,
    }, null, 2), 'utf-8');

    return { ok: true, path: exportPath, count: Object.keys(payload).length };
  } catch (err) {
    console.error('[clienti:export] errore:', err);
    return { ok: false, error: err.message };
  }
});

ipcMain.handle('clienti:import', async () => {
  const result = await dialog.showOpenDialog({
    title: 'Importa lista clienti',
    filters: [{ name: 'File di export BCB', extensions: ['json', 'bcbexport'] }],
    properties: ['openFile'],
  });
  if (result.canceled || result.filePaths.length === 0) return { ok: false, canceled: true };

  try {
    const content = await fsp.readFile(result.filePaths[0], 'utf-8');
    const parsed = JSON.parse(content);
    if (!parsed.clienti || typeof parsed.clienti !== 'object') {
      return { ok: false, error: 'File non valido: manca il campo "clienti"' };
    }

    let importati = 0, errori = 0;
    for (const [key, value] of Object.entries(parsed.clienti)) {
      try {
        const file = path.join(CLIENTI_DIR, keyToFilename(key));
        await fsp.writeFile(file, String(value), 'utf-8');
        importati++;
      } catch (e) { errori++; }
    }

    return { ok: true, importati, errori, totale: Object.keys(parsed.clienti).length };
  } catch (err) {
    console.error('[clienti:import] errore:', err);
    return { ok: false, error: 'File non valido o corrotto: ' + err.message };
  }
});

/* ---------------- IPC Handlers: tariffario --------------------- */

ipcMain.handle('tariffario:read', async () => {
  // Leggi il tariffario attivo. Se per qualche motivo manca, crea da default.
  try {
    const content = await fsp.readFile(TARIFFARIO_FILE, 'utf-8');
    return { ok: true, data: JSON.parse(content) };
  } catch (err) {
    if (err.code === 'ENOENT') {
      try {
        const defaultJson = await fsp.readFile(getDefaultTariffarioPath(), 'utf-8');
        await fsp.writeFile(TARIFFARIO_FILE, defaultJson, 'utf-8');
        return { ok: true, data: JSON.parse(defaultJson) };
      } catch (e2) {
        return { ok: false, error: 'Impossibile creare tariffario: ' + e2.message };
      }
    }
    return { ok: false, error: err.message };
  }
});

ipcMain.handle('tariffario:write', async (_, data) => {
  try {
    // Aggiorna il timestamp
    const toWrite = { ...data, ultimaModifica: new Date().toISOString() };
    // Salva uno snapshot nello storico prima di sovrascrivere
    try {
      const old = await fsp.readFile(TARIFFARIO_FILE, 'utf-8');
      const ts = new Date().toISOString().replace(/[:.]/g, '-');
      await fsp.writeFile(path.join(STORICO_DIR, `tariffario_${ts}.json`), old, 'utf-8');
      // Mantieni solo ultimi 30 snapshot per non riempire il disco
      const snaps = (await fsp.readdir(STORICO_DIR))
        .filter(f => f.startsWith('tariffario_') && f.endsWith('.json'))
        .sort();
      if (snaps.length > 30) {
        for (const s of snaps.slice(0, snaps.length - 30)) {
          try { await fsp.unlink(path.join(STORICO_DIR, s)); } catch {}
        }
      }
    } catch {}
    await fsp.writeFile(TARIFFARIO_FILE, JSON.stringify(toWrite, null, 2), 'utf-8');
    return { ok: true, ultimaModifica: toWrite.ultimaModifica };
  } catch (err) {
    console.error('[tariffario:write] errore:', err);
    return { ok: false, error: err.message };
  }
});

ipcMain.handle('tariffario:resetDefault', async () => {
  try {
    const defaultJson = await fsp.readFile(getDefaultTariffarioPath(), 'utf-8');
    // Salva snapshot prima di resettare
    try {
      const old = await fsp.readFile(TARIFFARIO_FILE, 'utf-8');
      const ts = new Date().toISOString().replace(/[:.]/g, '-');
      await fsp.writeFile(path.join(STORICO_DIR, `tariffario_${ts}_pre-reset.json`), old, 'utf-8');
    } catch {}
    await fsp.writeFile(TARIFFARIO_FILE, defaultJson, 'utf-8');
    return { ok: true, data: JSON.parse(defaultJson) };
  } catch (err) {
    return { ok: false, error: err.message };
  }
});

ipcMain.handle('tariffario:listStorico', async () => {
  try {
    const files = await fsp.readdir(STORICO_DIR);
    const list = files
      .filter(f => f.startsWith('tariffario_') && f.endsWith('.json'))
      .sort()
      .reverse()
      .map(f => {
        // Estrai timestamp dal nome: tariffario_2026-04-24T15-30-45-123Z.json
        const m = f.match(/^tariffario_(.+?)(_pre-reset)?\.json$/);
        return { filename: f, timestamp: m ? m[1] : '', isPreReset: !!(m && m[2]) };
      });
    return { ok: true, list };
  } catch (err) {
    return { ok: false, error: err.message, list: [] };
  }
});

ipcMain.handle('tariffario:restoreFromStorico', async (_, filename) => {
  try {
    // Sicurezza: il filename deve essere nella cartella storico, non un path arbitrario
    if (filename.includes('/') || filename.includes('\\') || filename.includes('..')) {
      return { ok: false, error: 'Nome file non valido' };
    }
    const sourcePath = path.join(STORICO_DIR, filename);
    const content = await fsp.readFile(sourcePath, 'utf-8');
    // Salva uno snapshot del tariffario CORRENTE prima di sovrascrivere
    try {
      const current = await fsp.readFile(TARIFFARIO_FILE, 'utf-8');
      const ts = new Date().toISOString().replace(/[:.]/g, '-');
      await fsp.writeFile(path.join(STORICO_DIR, `tariffario_${ts}_pre-restore.json`), current, 'utf-8');
    } catch {}
    await fsp.writeFile(TARIFFARIO_FILE, content, 'utf-8');
    return { ok: true, data: JSON.parse(content) };
  } catch (err) {
    return { ok: false, error: err.message };
  }
});

ipcMain.handle('tariffario:exportXLS', async () => {
  // Esporta in XLS: lasciamo che sia il renderer a generare l'XLS con SheetJS
  // (è già disponibile via npm). Qui facciamo solo il save dialog.
  const result = await dialog.showSaveDialog({
    title: 'Esporta tariffario come XLS',
    defaultPath: `tariffario-bcb-${new Date().toISOString().slice(0,10)}.xlsx`,
    filters: [{ name: 'Excel', extensions: ['xlsx', 'xls'] }],
  });
  return result.canceled ? { ok: false, canceled: true } : { ok: true, path: result.filePath };
});

ipcMain.handle('tariffario:saveBuffer', async (_, { path: filePath, buffer }) => {
  try {
    // Riceve un ArrayBuffer dal renderer e lo scrive su disco
    await fsp.writeFile(filePath, Buffer.from(buffer));
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err.message };
  }
});

/* ---------------- Finestre ---------------------------------- */

let homeWindow = null;
let preventivatoreWindow = null;
let editorWindow = null;

function createHomeWindow() {
  homeWindow = new BrowserWindow({
    width: 680,
    height: 640,
    minWidth: 600,
    minHeight: 580,
    title: 'Preventivatore BCB',
    backgroundColor: '#f8f7f4',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
    autoHideMenuBar: true,
    resizable: true,
  });
  homeWindow.loadFile(path.join(__dirname, 'home.html'));

  homeWindow.on('closed', () => { homeWindow = null; });

  // In modalità sviluppo, apri DevTools
  if (!app.isPackaged) {
    // homeWindow.webContents.openDevTools({ mode: 'detach' });
  }
}

function createPreventivatoreWindow() {
  if (preventivatoreWindow) {
    preventivatoreWindow.focus();
    return;
  }

  preventivatoreWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 900,
    minHeight: 600,
    title: 'Preventivatore BCB',
    backgroundColor: '#ffffff',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
    autoHideMenuBar: true,
  });

  // Carica il build Vite del preventivatore
  const htmlPath = app.isPackaged
    ? path.join(__dirname, '..', 'dist', 'preventivatore.html')
    : path.join(__dirname, '..', 'dist', 'preventivatore.html');

  preventivatoreWindow.loadFile(htmlPath);

  preventivatoreWindow.on('closed', () => { preventivatoreWindow = null; });

  if (!app.isPackaged) {
    // preventivatoreWindow.webContents.openDevTools({ mode: 'detach' });
  }
}

function createEditorWindow() {
  if (editorWindow) {
    editorWindow.focus();
    return;
  }

  editorWindow = new BrowserWindow({
    width: 1100,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    title: 'Editor Tariffario BCB',
    backgroundColor: '#f8f7f4',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
    autoHideMenuBar: true,
  });

  const htmlPath = path.join(__dirname, '..', 'dist', 'editor.html');
  editorWindow.loadFile(htmlPath);

  editorWindow.on('closed', () => { editorWindow = null; });
}

/* IPC: apri preventivatore (chiamato dalla Home) */
ipcMain.handle('app:openPreventivatore', () => {
  createPreventivatoreWindow();
  return { ok: true };
});

ipcMain.handle('app:openEditor', () => {
  createEditorWindow();
  return { ok: true };
});

ipcMain.handle('app:getPaths', () => {
  return {
    root: PORTABLE_ROOT,
    clienti: CLIENTI_DIR,
    tariffario: TARIFFARIO_DIR,
    codice: CODICE_DIR,
  };
});

/* ---------------- Ciclo di vita app ---------------------- */

app.whenReady().then(async () => {
  await ensureDataFolders();
  createHomeWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createHomeWindow();
  });
});

app.on('window-all-closed', () => {
  // Su Mac le app restano attive anche senza finestre (convenzione)
  if (process.platform !== 'darwin') app.quit();
});
