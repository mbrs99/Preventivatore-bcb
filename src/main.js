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
const crypto = require('crypto');
const https = require('https');

/* ================================================================
   AUTH — gestione lock dell'app con password remota

   Schema:
   - L'app fetcha periodicamente da AUTH_GIST_URL una lista di hash
     di password "valide" (gestita da Marco via Gist).
   - L'utente sblocca inserendo una password che corrisponde a uno
     degli hash. L'unlock viene memorizzato localmente.
   - Se Marco rimuove un hash dalla lista, al prossimo avvio l'app
     vede che l'unlock locale non è più valido e blocca tutto.
   - Funzionamento offline: usa la cache dell'ultima lista valida.

   Marco non conosce nessuna password in chiaro: nel Gist ci sono solo
   gli hash (formato scrypt: "<salt>:<derivedKey>"). Quando vuole
   cambiare password, genera un nuovo hash con il bottone "Genera
   hash" nella schermata di sblocco (visibile solo se l'app è
   già sbloccata) o col tool da terminale tools/genera-hash.mjs.
   ================================================================ */

// URL del Gist di Marco — versione "stabile" senza commit SHA, così punta
// sempre all'ultima revisione del file (quando Marco modifica il Gist,
// l'app vede automaticamente la nuova versione al riavvio successivo).
const AUTH_GIST_URL = 'https://gist.githubusercontent.com/mbrs99/9977a30f9f545c66d50c499f02f4af90/raw/preventivatore-auth.json';

// Lista di hash "di emergenza" embeddati nel binario.
// REGOLA: questa lista NON viene MAI fusa con la lista del Gist o della
// cache. È usata SOLO come ultima ancora di salvezza nel caso edge in
// cui l'app sia al primissimo avvio E senza connessione E senza cache
// (utente nuovo che apre l'app per la prima volta offline). Si attiva
// quando getEffectiveValidHashes() vede una lista altrimenti vuota.
// Cambiare la password sul Gist invalida correttamente l'unlock locale,
// indipendentemente da cosa contiene questa lista.
const AUTH_FALLBACK_HASHES = [
  // Password iniziale di "fabbrica": "studio-bcb-mestre-25"
  'ed862ebb9f967a4b420c1fdd20d88a55:ed52291c5d8763dbc3b6410f21985ab97981f3516e80a512a01c2c1199565aadf0611408d350f578dc7cd50d2a45358cd41c06b1fd38a2737a23c06cfbb454fa',
];

// Calcolo hash scrypt (salt+key). Formato stored: "<salt-hex>:<hash-hex>"
function hashPasswordSync(plaintext, saltBuf = null) {
  const salt = saltBuf || crypto.randomBytes(16);
  const hash = crypto.scryptSync(String(plaintext), salt, 64);
  return salt.toString('hex') + ':' + hash.toString('hex');
}

function verifyPasswordAgainstStored(plaintext, stored) {
  try {
    const [saltHex, hashHex] = stored.split(':');
    if (!saltHex || !hashHex) return false;
    const salt = Buffer.from(saltHex, 'hex');
    const expected = Buffer.from(hashHex, 'hex');
    if (expected.length !== 64) return false;
    const actual = crypto.scryptSync(String(plaintext), salt, 64);
    return crypto.timingSafeEqual(expected, actual);
  } catch {
    return false;
  }
}

function fetchUrlAsString(url, timeoutMs = 5000) {
  return new Promise((resolve, reject) => {
    if (!url || url.startsWith('PLACEHOLDER')) {
      return reject(new Error('URL Gist non configurato'));
    }
    const req = https.get(url, { headers: { 'User-Agent': 'PreventivatoreBCB' } }, (res) => {
      // Segui redirect (es. github → user-content)
      if ([301, 302, 303, 307, 308].includes(res.statusCode)) {
        return resolve(fetchUrlAsString(res.headers.location, timeoutMs));
      }
      if (res.statusCode !== 200) {
        return reject(new Error('HTTP ' + res.statusCode));
      }
      let data = '';
      res.setEncoding('utf-8');
      res.on('data', (chunk) => data += chunk);
      res.on('end', () => resolve(data));
    });
    req.on('error', reject);
    req.setTimeout(timeoutMs, () => { req.destroy(new Error('timeout')); });
  });
}

// Modulo auth: stato in memoria + persistenza su disco
const authState = {
  validHashes: [],                            // ultima lista nota (vuota all'inizio)
  killSwitch: false,                          // se true, app bloccata sempre
  lastFetchedAt: null,                        // timestamp ultima fetch riuscita
  unlockedHash: null,                         // hash salvato dopo unlock (per ricontrollare validità)
};

// Restituisce la lista effettiva di hash da usare per la verifica.
// Solo se non ci sono hash da Gist/cache cade sui fallback embeddati.
function getEffectiveValidHashes() {
  if (authState.validHashes && authState.validHashes.length > 0) {
    return authState.validHashes;
  }
  return AUTH_FALLBACK_HASHES;
}

function getAuthCachePath() {
  // Salvato dentro DATA_ROOT (creato in initAuthCacheFolder)
  return path.join(DATA_ROOT, '.auth-cache.json');
}

async function loadAuthCache() {
  try {
    const txt = await fsp.readFile(getAuthCachePath(), 'utf-8');
    const obj = JSON.parse(txt);
    if (Array.isArray(obj.validHashes)) {
      // Filtra eventuali hash di fallback rimasti in cache da versioni
      // precedenti dell'app (in cui il merge col fallback era attivo,
      // bug fix v1.0.3): la cache deve contenere SOLO hash dal Gist.
      authState.validHashes = obj.validHashes.filter(h => !AUTH_FALLBACK_HASHES.includes(h));
    }
    if (typeof obj.killSwitch === 'boolean')   authState.killSwitch   = obj.killSwitch;
    if (typeof obj.lastFetchedAt === 'string') authState.lastFetchedAt = obj.lastFetchedAt;
    if (typeof obj.unlockedHash === 'string')  authState.unlockedHash  = obj.unlockedHash;
  } catch {
    // Cache assente o corrotta — resta vuoto, getEffectiveValidHashes userà il fallback
  }
}

async function saveAuthCache() {
  try {
    await fsp.mkdir(DATA_ROOT, { recursive: true });
    await fsp.writeFile(getAuthCachePath(), JSON.stringify({
      validHashes:    authState.validHashes,
      killSwitch:     authState.killSwitch,
      lastFetchedAt:  authState.lastFetchedAt,
      unlockedHash:   authState.unlockedHash,
    }, null, 2), 'utf-8');
  } catch (err) {
    console.error('[auth] Errore salvataggio cache:', err.message);
  }
}

async function refreshAuthList() {
  try {
    const text = await fetchUrlAsString(AUTH_GIST_URL, 5000);
    const data = JSON.parse(text);
    if (Array.isArray(data.validHashes) && data.validHashes.length > 0) {
      // Sostituisce la lista in modo netto: SOLO ciò che è nel Gist è valido.
      // Niente fallback aggiunti — quelli sono usati esclusivamente quando
      // la lista è vuota (vedi getEffectiveValidHashes).
      // Se Marco svuota il Gist per errore, il check qui sopra
      // (length > 0) preserva la lista precedente: cioè non si "blocca fuori"
      // accidentalmente.
      authState.validHashes = data.validHashes.slice();
    }
    authState.killSwitch    = !!data.killSwitch;
    authState.lastFetchedAt = new Date().toISOString();
    await saveAuthCache();
    console.log('[auth] Lista password aggiornata da Gist (' + authState.validHashes.length + ' hash)');
    return true;
  } catch (err) {
    console.warn('[auth] Fetch fallita:', err.message, '— uso cache/fallback');
    return false;
  }
}

function isCurrentlyUnlocked() {
  if (authState.killSwitch) return false;
  if (!authState.unlockedHash) return false;
  return getEffectiveValidHashes().includes(authState.unlockedHash);
}

/* ---------------- Path risoluzione dei dati persistenti ----------
 *
 * Strategia: i dati (Clienti, Tariffario, Codice) vivono nella cartella
 *   Documenti/Preventivatore BCB/
 * dell'utente, su tutti e tre i sistemi:
 *   - Mac:     ~/Documenti/Preventivatore BCB/   (oppure ~/Documents/...)
 *   - Windows: C:\Users\<user>\Documenti\Preventivatore BCB\
 *   - Linux:   ~/Documenti/Preventivatore BCB/   (XDG_DOCUMENTS_DIR se settato)
 *
 * Questa scelta risolve il conflitto con macOS AppTranslocation (che
 * esegue le app non firmate da una sandbox read-only), assicurando una
 * cartella sempre scrivibile e una posizione standard riconoscibile.
 *
 * In modalità sviluppo (npm run dev) la root resta nel progetto, così
 * non si "inquina" Documenti durante test.
 */

function getDataRoot() {
  if (!app.isPackaged) {
    // Modalità sviluppo: la root è la directory del progetto (legacy behavior)
    return app.getAppPath();
  }
  // Produzione su tutti gli OS: <Documenti>/Preventivatore BCB/
  return path.join(app.getPath('documents'), 'Preventivatore BCB');
}

const DATA_ROOT      = getDataRoot();
const CLIENTI_DIR    = path.join(DATA_ROOT, 'Clienti');
const TARIFFARIO_DIR = path.join(DATA_ROOT, 'Tariffario');
const STORICO_DIR    = path.join(TARIFFARIO_DIR, 'storico');
const CODICE_DIR     = path.join(DATA_ROOT, 'Codice');

// File principale del tariffario "in uso" (modificato dall'editor)
const TARIFFARIO_FILE = path.join(TARIFFARIO_DIR, 'tariffario_attivo.json');
// Default JSON incorporato nel bundle dell'app (read-only)
function getDefaultTariffarioPath() {
  // In dev: src/shared/tariffario-default.json (relativo alla root del progetto)
  // In prod: lo stesso file finisce dentro app.asar (gestito da electron-builder)
  return path.join(__dirname, 'shared', 'tariffario-default.json');
}

console.log('[Preventivatore] Data root:', DATA_ROOT);
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
    root: DATA_ROOT,
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

/* ---------------- IPC Handlers: auth (lock con password) -------- */

ipcMain.handle('auth:isUnlocked', async () => {
  return { ok: true, unlocked: isCurrentlyUnlocked(), killSwitch: authState.killSwitch };
});

ipcMain.handle('auth:unlock', async (_, password) => {
  if (authState.killSwitch) return { ok: false, killSwitch: true };
  for (const stored of getEffectiveValidHashes()) {
    if (verifyPasswordAgainstStored(password, stored)) {
      authState.unlockedHash = stored;
      await saveAuthCache();
      // Apri la home e chiudi la finestra di auth
      if (authWindow) {
        const w = authWindow;
        authWindow = null;
        createHomeWindow();
        w.close();
      }
      return { ok: true };
    }
  }
  return { ok: false };
});

ipcMain.handle('auth:lock', async () => {
  authState.unlockedHash = null;
  await saveAuthCache();
  // Chiudi tutte le finestre tranne la auth
  for (const w of BrowserWindow.getAllWindows()) w.close();
  createAuthWindow();
  return { ok: true };
});

ipcMain.handle('auth:hashPassword', async (_, plain) => {
  return { ok: true, hash: hashPasswordSync(plain) };
});

ipcMain.handle('auth:refreshList', async () => {
  const ok = await refreshAuthList();
  return { ok, lastFetchedAt: authState.lastFetchedAt, count: authState.validHashes.length };
});

/* ---------------- Finestre ---------------------------------- */

let homeWindow = null;
let preventivatoreWindow = null;
let editorWindow = null;
let authWindow = null;

function createAuthWindow() {
  if (authWindow) {
    authWindow.focus();
    return;
  }
  authWindow = new BrowserWindow({
    width: 480,
    height: 540,
    minWidth: 420,
    minHeight: 480,
    title: 'Preventivatore BCB — Sblocco',
    backgroundColor: '#1b3a5c',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
    autoHideMenuBar: true,
    resizable: false,
    maximizable: false,
  });
  authWindow.loadFile(path.join(__dirname, 'auth.html'));
  authWindow.on('closed', () => {
    const wasInteractiveClose = authWindow !== null;
    authWindow = null;
    // Se l'utente chiude la finestra di auth senza sbloccare, chiudi tutta l'app
    if (wasInteractiveClose && !isCurrentlyUnlocked()) {
      app.quit();
    }
  });
}

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
    root: DATA_ROOT,
    clienti: CLIENTI_DIR,
    tariffario: TARIFFARIO_DIR,
    codice: CODICE_DIR,
  };
});

/* ---------------- Ciclo di vita app ---------------------- */

app.whenReady().then(async () => {
  await ensureDataFolders();
  // Carica cache auth (lista valida storica + ultimo unlock)
  await loadAuthCache();
  // Tenta refresh dalla URL del Gist (non bloccante: timeout 5s, fallback su cache)
  await refreshAuthList();
  // Se l'unlock locale è ancora valido contro la lista corrente: apri Home.
  // Altrimenti: schermata di sblocco.
  if (isCurrentlyUnlocked()) {
    createHomeWindow();
  } else {
    createAuthWindow();
  }

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      if (isCurrentlyUnlocked()) createHomeWindow();
      else createAuthWindow();
    }
  });
});

app.on('window-all-closed', () => {
  // Su Mac le app restano attive anche senza finestre (convenzione)
  if (process.platform !== 'darwin') app.quit();
});
