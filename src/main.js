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
   AUTH — gestione lock dell'app con password remota (modalità STRICT)

   Schema della modalità strict (v1.0.4+):
   - L'app NON ricorda mai un unlock precedente: ogni avvio richiede
     una nuova autenticazione tramite la schermata di password.
   - L'app NON usa cache offline per la verifica della password:
     ogni tentativo di unlock fa un fetch fresco dal Gist. Senza
     connessione → impossibile sbloccare.
   - Il cambio password sul Gist ha effetto IMMEDIATO al prossimo
     riavvio (anche dopo ore: l'utente non vede mai una versione
     "stantia" della lista perché c'è sempre un fetch live).
   - Quando si chiudono tutte le finestre, l'app si chiude — il
     prossimo lancio richiede di nuovo password.
   ================================================================ */

// URL del Gist di Marco — versione "stabile" senza commit SHA, così punta
// sempre all'ultima revisione del file (quando Marco modifica il Gist,
// l'app vede automaticamente la nuova versione al riavvio successivo).
const AUTH_GIST_URL = 'https://gist.githubusercontent.com/mbrs99/9977a30f9f545c66d50c499f02f4af90/raw/preventivatore-auth.json';

// In modalità STRICT non ci sono fallback hash embeddati: la verifica
// della password avviene SEMPRE contro il Gist live. Niente backup
// offline = nessun valore "di fabbrica" da cui rientrare.
const AUTH_FALLBACK_HASHES = []; // intenzionalmente vuoto in v1.0.4+

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
    const req = https.get(url, {
      headers: {
        'User-Agent':    'PreventivatoreBCB',
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'Pragma':        'no-cache',
      },
    }, (res) => {
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

// Modalità STRICT: niente stato persistente di unlock.
// Ogni tentativo di sblocco fa un fetch live del Gist. Nessuna cache
// dell'unlock. L'app si chiude quando non è più sbloccata.
//
// LIVE REVOKE: dopo un unlock, partono dei controlli periodici contro
// il Gist (ogni 30s). Se Marco modifica killSwitch=true o rimuove
// l'hash della password attualmente in uso, l'utente viene sloggato
// entro pochi secondi senza dover riavviare l'app.
let currentUnlockHash = null;        // hash con cui è stato fatto l'ultimo unlock
let revokeCheckInterval = null;      // setInterval handle
let lastRevokeReason = null;         // 'killSwitch' | 'password-revoked' | null
const REVOKE_CHECK_INTERVAL_MS = 30 * 1000;  // 30 secondi

// Fetcha la lista live dal Gist. Restituisce {validHashes, killSwitch, requireAuth}
// oppure lancia un'eccezione se la fetch fallisce.
//
// Schema atteso del Gist (preventivatore-auth.json):
//   {
//     "validHashes":  [ "<hash1>", ... ],
//     "killSwitch":   false,
//     "requireAuth":  true,   // opzionale: se false, l'app salta la password
//     "lastUpdated":  "..."
//   }
async function fetchAuthListLive(timeoutMs = 8000) {
  // Cache-busting: query string variabile per assicurare un fetch fresco
  const sep = AUTH_GIST_URL.includes('?') ? '&' : '?';
  const text = await fetchUrlAsString(AUTH_GIST_URL + sep + 'cb=' + Date.now(), timeoutMs);
  const data = JSON.parse(text);
  return {
    validHashes: Array.isArray(data.validHashes) ? data.validHashes : [],
    killSwitch:  !!data.killSwitch,
    // requireAuth è OPZIONALE: se assente o non boolean, default = true
    // (cioè comportamento sicuro: chiediamo password).
    requireAuth: typeof data.requireAuth === 'boolean' ? data.requireAuth : true,
  };
}

// Marker speciale per indicare che l'utente è "dentro" l'app perché la
// modalità remota dice requireAuth=false (e non perché ha inserito una
// password). Questa distinzione serve al polling: se requireAuth torna
// a true mentre l'utente è dentro tramite questo marker, lo logghiamo
// fuori per richiedere la password.
const NO_AUTH_MARKER = '__no-auth-required__';

// Avvia il polling periodico del Gist. Se rileva una revoca della
// password corrente o un killSwitch attivato, sblocca l'utente in tempo
// reale (sgancia la home, riapre la schermata di password con messaggio).
function startRevokeCheck() {
  stopRevokeCheck();
  revokeCheckInterval = setInterval(async () => {
    try {
      const live = await fetchAuthListLive(8000);
      if (live.killSwitch) {
        triggerLockout('killSwitch');
        return;
      }
      // Se requireAuth è stato attivato (true) mentre l'utente è dentro
      // SENZA aver inserito una password (NO_AUTH_MARKER), forziamo il
      // logout per richiedere la password nuova.
      if (live.requireAuth && currentUnlockHash === NO_AUTH_MARKER) {
        triggerLockout('auth-required');
        return;
      }
      // Password revocata sul Gist: solo se l'utente aveva fatto unlock
      // con una password reale (non NO_AUTH_MARKER).
      if (currentUnlockHash &&
          currentUnlockHash !== NO_AUTH_MARKER &&
          !live.validHashes.includes(currentUnlockHash)) {
        triggerLockout('password-revoked');
        return;
      }
    } catch (err) {
      // Fetch fallita (es. offline transitorio) — non revochiamo,
      // l'utente resta dentro. Riproveremo al prossimo ciclo.
      console.warn('[auth] Live check fallito (mantengo sessione):', err.message);
    }
  }, REVOKE_CHECK_INTERVAL_MS);
}

function stopRevokeCheck() {
  if (revokeCheckInterval) {
    clearInterval(revokeCheckInterval);
    revokeCheckInterval = null;
  }
}

// Logout immediato: sgancia la home, mostra di nuovo la schermata
// password con un messaggio che spiega perché.
function triggerLockout(reason) {
  console.log('[auth] Accesso revocato remotamente — motivo:', reason);
  currentUnlockHash = null;
  lastRevokeReason = reason;
  stopRevokeCheck();
  // Apri prima la finestra auth (così l'app non si chiude col window-all-closed)
  if (!authWindow) createAuthWindow();
  // Poi chiudi tutte le altre finestre
  for (const w of BrowserWindow.getAllWindows()) {
    if (w !== authWindow) {
      try { w.close(); } catch {}
    }
  }
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

/* ---------------- IPC Handler: PDF del riepilogo ------------------
   Riceve dal renderer l'HTML del solo riepilogo (non tutta la finestra
   dell'app), lo apre in una finestra nascosta e lo converte in PDF.
   Così il file contiene esattamente la scheda riepilogativa, senza
   pulsanti, schede di navigazione o altri elementi dell'interfaccia. */

ipcMain.handle('pdf:salvaRiepilogo', async (_, { html, nomeFile }) => {
  const result = await dialog.showSaveDialog({
    title: 'Salva il riepilogo in PDF',
    defaultPath: nomeFile || 'riepilogo.pdf',
    filters: [{ name: 'PDF', extensions: ['pdf'] }],
  });
  if (result.canceled) return { ok: false, canceled: true };

  let win = null;
  try {
    // Finestra nascosta e senza JavaScript: serve solo a impaginare l'HTML
    win = new BrowserWindow({ show: false, webPreferences: { javascript: false } });
    // Il contenuto arriva come data URL: nessun file temporaneo su disco
    await win.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(html));
    const pdf = await win.webContents.printToPDF({
      printBackground: true,
      pageSize: 'A4',
      margins: { marginType: 'custom', top: 0.6, bottom: 0.6, left: 0.5, right: 0.5 },
    });
    await fsp.writeFile(result.filePath, pdf);
    return { ok: true, path: result.filePath };
  } catch (err) {
    return { ok: false, error: err.message };
  } finally {
    if (win && !win.isDestroyed()) win.destroy();
  }
});

/* ---------------- IPC Handlers: auth (lock con password STRICT) -- */

ipcMain.handle('auth:isUnlocked', async () => {
  return { ok: true, unlocked: !!currentUnlockHash };
});

// Restituisce e CONSUMA il motivo dell'ultimo lockout (per mostrare
// nella schermata di password un messaggio "il tuo accesso è stato
// revocato" anziché solo la richiesta password generica).
ipcMain.handle('auth:getRevokeReason', async () => {
  const reason = lastRevokeReason;
  lastRevokeReason = null;
  return { ok: true, reason };
});

// STRICT unlock: ogni tentativo fa un fetch live del Gist.
// Senza connessione → fallisce con reason 'offline'.
// Cambio password sul Gist → ha effetto immediato, vecchia password rifiutata.
ipcMain.handle('auth:unlock', async (_, password) => {
  let live;
  try {
    live = await fetchAuthListLive(8000);
  } catch (err) {
    return {
      ok: false,
      reason: 'offline',
      message: 'Impossibile contattare il server di autenticazione. Verifica la tua connessione Internet e riprova.',
    };
  }
  if (live.killSwitch) {
    return { ok: false, reason: 'killSwitch' };
  }
  if (live.validHashes.length === 0) {
    return { ok: false, reason: 'no-passwords-configured' };
  }
  for (const stored of live.validHashes) {
    if (verifyPasswordAgainstStored(password, stored)) {
      currentUnlockHash = stored;
      // Avvia il polling LIVE per rilevare cambio password / killSwitch
      startRevokeCheck();
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
  return { ok: false, reason: 'wrong-password' };
});

ipcMain.handle('auth:hashPassword', async (_, plain) => {
  return { ok: true, hash: hashPasswordSync(plain) };
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
    // Se l'utente chiude la finestra di auth senza essersi sbloccato
    // (currentUnlockHash è null), chiude tutta l'app.
    if (wasInteractiveClose && !currentUnlockHash) {
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

  // Quando la home si chiude, l'intera sessione finisce: l'utente al
  // prossimo lancio dovrà rifare la password. Chiudo tutte le finestre
  // figlie aperte per garantire un quit pulito.
  homeWindow.on('closed', () => {
    homeWindow = null;
    currentUnlockHash = null;
    stopRevokeCheck();
    // Se c'è già una authWindow aperta (caso: lockout live), non quittare.
    // Altrimenti l'utente ha chiuso volontariamente → quit dell'app.
    if (!authWindow) {
      for (const w of BrowserWindow.getAllWindows()) {
        try { w.close(); } catch {}
      }
      app.quit();
    }
  });

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

// Decide quale finestra aprire all'avvio in base allo stato live del Gist:
//   - killSwitch=true → schermata bloccata con messaggio (no input password)
//   - requireAuth=false → home diretta, niente password
//   - default (compreso fetch fallita) → schermata password
async function decideStartupWindow() {
  let live;
  try {
    live = await fetchAuthListLive(5000);
  } catch (err) {
    // Fetch fallita: comportamento sicuro = chiedi password
    console.warn('[auth] Fetch iniziale fallita, mostro auth window:', err.message);
    createAuthWindow();
    return;
  }
  if (live.killSwitch) {
    lastRevokeReason = 'killSwitch';
    createAuthWindow();
    return;
  }
  if (!live.requireAuth) {
    // Modalità rilassata: salta password, vai alla home.
    // Avvio comunque il polling, così se Marco riattiva requireAuth
    // (o killSwitch / o cambia password) durante l'uso, l'app reagisce.
    currentUnlockHash = NO_AUTH_MARKER;
    startRevokeCheck();
    createHomeWindow();
    return;
  }
  // Default: chiedi password
  createAuthWindow();
}

app.whenReady().then(async () => {
  await ensureDataFolders();
  currentUnlockHash = null;
  stopRevokeCheck();
  await decideStartupWindow();

  app.on('activate', async () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      // Anche per il "click sul dock" su Mac: serve un nuovo check del Gist.
      currentUnlockHash = null;
      stopRevokeCheck();
      await decideStartupWindow();
    }
  });
});

// Quit dell'app quando tutte le finestre vengono chiuse — anche su Mac.
// In modalità STRICT, la chiusura di tutte le finestre = sessione finita.
app.on('window-all-closed', () => {
  app.quit();
});
