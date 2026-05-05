/* ================================================================
   Preventivatore BCB — preload script

   Gira in un contesto isolato tra il renderer (finestra browser) e
   il processo principale Node.js. Espone in modo controllato le API
   necessarie senza dare accesso completo al file system.

   Esposizione IMPORTANTE:
   - `window.storage` — stesso contratto del fallback localStorage del
     preventivatore.jsx, ma ora persiste su file JSON nella cartella
     Clienti/ accanto all'app. Il preventivatore non richiede alcuna
     modifica: il check `if (!window.storage)` nel suo codice vede che
     window.storage è già stato iniettato qui e salta il fallback.
   - `window.preventivatoreAPI` — funzioni della Home per aprire
     cartelle, il preventivatore, import/export clienti, ecc.
   ================================================================ */

const { contextBridge, ipcRenderer } = require('electron');

// window.storage — stesso contratto del localStorage wrapper, ma persiste su file JSON
contextBridge.exposeInMainWorld('storage', {
  get:    (key)          => ipcRenderer.invoke('storage:get', key),
  set:    (key, value)   => ipcRenderer.invoke('storage:set', { key, value }),
  delete: (key)          => ipcRenderer.invoke('storage:delete', key),
  list:   (prefix = '')  => ipcRenderer.invoke('storage:list', prefix),
});

// window.preventivatoreAPI — usato dalla home.html per le 4 azioni del launcher
contextBridge.exposeInMainWorld('preventivatoreAPI', {
  openPreventivatore: ()       => ipcRenderer.invoke('app:openPreventivatore'),
  openEditor:         ()       => ipcRenderer.invoke('app:openEditor'),
  openFolder:         (which)  => ipcRenderer.invoke('shell:openFolder', which),
  getPaths:           ()       => ipcRenderer.invoke('app:getPaths'),
  exportClienti:      ()       => ipcRenderer.invoke('clienti:export'),
  importClienti:      ()       => ipcRenderer.invoke('clienti:import'),
});

// window.tariffarioAPI — usato dall'editor del tariffario E dal preventivatore
// per leggere il tariffario in uso
contextBridge.exposeInMainWorld('tariffarioAPI', {
  read:               ()       => ipcRenderer.invoke('tariffario:read'),
  write:              (data)   => ipcRenderer.invoke('tariffario:write', data),
  resetDefault:       ()       => ipcRenderer.invoke('tariffario:resetDefault'),
  listStorico:        ()       => ipcRenderer.invoke('tariffario:listStorico'),
  restoreFromStorico: (filename) => ipcRenderer.invoke('tariffario:restoreFromStorico', filename),
  exportXLS:          ()       => ipcRenderer.invoke('tariffario:exportXLS'),
  saveBuffer:         (path, buffer) => ipcRenderer.invoke('tariffario:saveBuffer', { path, buffer }),
});

// window.authAPI — gestione del lock con password remota (modalità STRICT)
contextBridge.exposeInMainWorld('authAPI', {
  unlock:        (password) => ipcRenderer.invoke('auth:unlock', password),
  isUnlocked:    ()         => ipcRenderer.invoke('auth:isUnlocked'),
  hashPassword:  (plain)    => ipcRenderer.invoke('auth:hashPassword', plain),
});

// Debug: segnala al renderer che l'ambiente Electron è caricato
contextBridge.exposeInMainWorld('isElectronApp', true);
