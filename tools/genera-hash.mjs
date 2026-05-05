#!/usr/bin/env node
/* ----------------------------------------------------------------
   tools/genera-hash.mjs
   Genera l'hash da incollare nel Gist Preventivatore-auth.

   USO:
     node tools/genera-hash.mjs

   Lo script chiede la password in chiaro al terminale (mascherata),
   calcola l'hash scrypt nello stesso formato usato dall'app, e lo
   stampa pronto da copia-incollare dentro il Gist.

   Formato output: "<salt-hex>:<derivedKey-hex>"
   ---------------------------------------------------------------- */

import crypto from 'node:crypto';
import readline from 'node:readline';

function askPasswordHidden(prompt) {
  return new Promise((resolve) => {
    process.stdout.write(prompt);
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: true });

    // Maschera l'input nel terminale: ogni char digitato sembra un *
    let captured = '';
    const onKeypress = (ch, key) => {
      if (key && (key.name === 'return' || key.name === 'enter')) {
        process.stdin.removeListener('keypress', onKeypress);
        process.stdout.write('\n');
        rl.close();
        resolve(captured);
      } else if (key && (key.name === 'backspace' || key.sequence === '\x7f')) {
        captured = captured.slice(0, -1);
        // Riscrive la riga del prompt con i restanti *
        process.stdout.clearLine(0);
        process.stdout.cursorTo(0);
        process.stdout.write(prompt + '*'.repeat(captured.length));
      } else if (ch && !key.ctrl && !key.meta) {
        captured += ch;
        process.stdout.write('*');
      } else if (key && key.ctrl && key.name === 'c') {
        process.exit(130);
      }
    };
    readline.emitKeypressEvents(process.stdin, rl);
    if (process.stdin.isTTY) process.stdin.setRawMode(true);
    process.stdin.on('keypress', onKeypress);
  });
}

function hashPassword(plaintext) {
  const salt = crypto.randomBytes(16);
  const hash = crypto.scryptSync(String(plaintext), salt, 64);
  return salt.toString('hex') + ':' + hash.toString('hex');
}

async function main() {
  console.log('');
  console.log('  Generatore hash password — Preventivatore BCB');
  console.log('  ──────────────────────────────────────────────');
  console.log('');

  const pwd1 = await askPasswordHidden('  Password           : ');
  if (!pwd1) {
    console.error('\n  Errore: password vuota.');
    process.exit(1);
  }
  if (pwd1.length < 6) {
    console.error('\n  Errore: la password deve avere almeno 6 caratteri.');
    process.exit(1);
  }
  const pwd2 = await askPasswordHidden('  Conferma password  : ');
  if (pwd1 !== pwd2) {
    console.error('\n  Errore: le password non coincidono.');
    process.exit(1);
  }

  const hash = hashPassword(pwd1);
  console.log('');
  console.log('  ✓ Hash generato. Copia la riga seguente DENTRO il file del Gist,');
  console.log('    nell\'array "validHashes" (vedi DOC PASSWORD.md):');
  console.log('');
  console.log('    "' + hash + '"');
  console.log('');
  console.log('  Lunghezza:', hash.length, 'caratteri.');
  console.log('');
}

main().catch((e) => {
  console.error('\nErrore:', e.message);
  process.exit(1);
});
