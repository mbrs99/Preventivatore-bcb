#!/usr/bin/env node
/* ----------------------------------------------------------------
   tools/obfuscate-electron.mjs

   Obfusca i file JS del processo Electron (main.js, preload.js,
   home.js, ecc.) verso una directory di output `dist-electron/`.
   I file HTML, JSON e altri non-JS vengono copiati invariati.

   Lo script si invoca via `npm run build:electron` ed è chiamato
   automaticamente prima di ogni `pack:*` (vedi package.json).

   electron-builder è configurato per includere `dist-electron/**`
   nel package E per usare `dist-electron/main.js` come entry point
   (via build.extraMetadata.main). I file originali in `src/` non
   finiscono mai dentro l'app distribuita.

   Lo script salta la cartella `src/renderer/` perché il rendering
   è già gestito da Vite (npm run build:renderer) e finisce in
   `dist/`, già minificato e bundleato.
   ---------------------------------------------------------------- */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import JavaScriptObfuscator from 'javascript-obfuscator';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '..');
const SRC_DIR = path.join(ROOT, 'src');
const OUT_DIR = path.join(ROOT, 'dist-electron');

// Opzioni dell'obfuscator. Configurazione "media-alta": il codice
// resta funzionante (no controlFlowFlattening estremo, no debugProtection
// che possono rompere Electron) ma diventa molto difficile da leggere.
const obfuscatorOptions = {
  compact:                       true,
  controlFlowFlattening:         true,
  controlFlowFlatteningThreshold: 0.6,
  deadCodeInjection:             true,
  deadCodeInjectionThreshold:    0.3,
  identifierNamesGenerator:      'hexadecimal',
  log:                           false,
  numbersToExpressions:          true,
  renameGlobals:                 false,
  selfDefending:                 false,  // disattivato: può rompere strict mode in alcune versioni di Node
  simplify:                      true,
  splitStrings:                  true,
  splitStringsChunkLength:       10,
  stringArray:                   true,
  stringArrayCallsTransform:     true,
  stringArrayEncoding:           ['base64'],
  stringArrayThreshold:          0.85,
  transformObjectKeys:           true,
  unicodeEscapeSequence:         false,
  // IMPORTANTE: i file vengono eseguiti da Node.js (Electron main),
  // quindi target = 'node'. Se fosse 'browser' alcune trasformazioni
  // userebbero API non disponibili in Node.
  target:                        'node',
};

function shouldSkipDir(name) {
  // renderer è già processato da Vite, non lo riobfusciamo qui
  if (name === 'renderer') return true;
  // node_modules non va mai obfuscato/copiato qui
  if (name === 'node_modules') return true;
  return false;
}

let stats = { obfuscated: 0, copied: 0, skipped: 0 };

function processDir(srcDir, outDir) {
  fs.mkdirSync(outDir, { recursive: true });
  for (const entry of fs.readdirSync(srcDir, { withFileTypes: true })) {
    const srcPath = path.join(srcDir, entry.name);
    const outPath = path.join(outDir, entry.name);
    // Salta file di sistema OS (.DS_Store, Thumbs.db) e file invisibili
    if (entry.name.startsWith('.')) {
      stats.skipped++;
      continue;
    }
    if (entry.isDirectory()) {
      if (shouldSkipDir(entry.name)) {
        stats.skipped++;
        continue;
      }
      processDir(srcPath, outPath);
    } else if (entry.name.endsWith('.js')) {
      const code = fs.readFileSync(srcPath, 'utf-8');
      const result = JavaScriptObfuscator.obfuscate(code, obfuscatorOptions);
      fs.writeFileSync(outPath, result.getObfuscatedCode(), 'utf-8');
      stats.obfuscated++;
    } else {
      // HTML, JSON, ecc.: copia invariato
      fs.copyFileSync(srcPath, outPath);
      stats.copied++;
    }
  }
}

console.log('Obfuscazione codice Electron...');
console.log('  da:    ' + SRC_DIR);
console.log('  verso: ' + OUT_DIR);

// Pulizia output precedente
fs.rmSync(OUT_DIR, { recursive: true, force: true });
processDir(SRC_DIR, OUT_DIR);

console.log('Risultato:');
console.log('  - file JS obfuscati: ' + stats.obfuscated);
console.log('  - file non-JS copiati: ' + stats.copied);
console.log('  - directory saltate (renderer/node_modules): ' + stats.skipped);
console.log('Output pronto in dist-electron/');
