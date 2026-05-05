/* ================================================================
   Preventivatore BCB — Home launcher (logica UI)
   ================================================================ */

const api = window.preventivatoreAPI;

function showToast(message, isError = false) {
  const toast = document.getElementById('toast');
  toast.textContent = message;
  toast.classList.toggle('error', isError);
  toast.classList.add('visible');
  clearTimeout(toast._timer);
  toast._timer = setTimeout(() => toast.classList.remove('visible'), 3000);
}

async function init() {
  // Mostra in footer il path della cartella portable
  try {
    const paths = await api.getPaths();
    const footer = document.getElementById('footer');
    footer.textContent = 'Dati salvati in: ' + paths.root;
  } catch (err) {
    console.error(err);
  }

  // Bottone 1: Apri Preventivatore
  document.getElementById('btn-open-preventivatore').addEventListener('click', async () => {
    await api.openPreventivatore();
  });

  // Bottone 2: Cartella Clienti
  document.getElementById('btn-open-clienti').addEventListener('click', async () => {
    const r = await api.openFolder('clienti');
    if (!r.ok) showToast('Errore apertura cartella: ' + (r.error || ''), true);
  });

  // Bottone 3: Editor Tariffario
  document.getElementById('btn-open-editor').addEventListener('click', async () => {
    await api.openEditor();
  });

  // Bottone 4: Cartella Codice
  document.getElementById('btn-open-codice').addEventListener('click', async () => {
    const r = await api.openFolder('codice');
    if (!r.ok) showToast('Errore apertura cartella: ' + (r.error || ''), true);
  });

  // Esporta clienti
  document.getElementById('btn-export').addEventListener('click', async () => {
    try {
      const r = await api.exportClienti();
      if (r.canceled) return;
      if (!r.ok) { showToast('Errore export: ' + (r.error || ''), true); return; }
      showToast(`✓ ${r.count} clienti esportati`);
    } catch (err) {
      showToast('Errore: ' + err.message, true);
    }
  });

  // Importa clienti
  document.getElementById('btn-import').addEventListener('click', async () => {
    try {
      const r = await api.importClienti();
      if (r.canceled) return;
      if (!r.ok) { showToast('Errore import: ' + (r.error || ''), true); return; }
      showToast(`✓ ${r.importati}/${r.totale} clienti importati` +
        (r.errori > 0 ? ` (${r.errori} errori)` : ''));
    } catch (err) {
      showToast('Errore: ' + err.message, true);
    }
  });
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
