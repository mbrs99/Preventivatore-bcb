# Guida alla distribuzione del Preventivatore BCB

Questa guida spiega **come pubblicare** una nuova versione dell'app — cioè
come ottenere i 3 file installabili (Mac, Windows, Linux) pronti da
condividere via email/Drive/USB con chi vuoi.

Il sistema usa **GitHub Actions** che compila automaticamente l'app per tutte
e 3 le piattaforme su server cloud, gratis. Tu non devi installare niente
sul tuo Mac — basta fare un push su GitHub.

---

## Setup iniziale (una sola volta)

Da fare la prima volta che porti il progetto su GitHub.

### 1. Crea il repository su GitHub

1. Vai su <https://github.com/new>
2. Nome repository: `preventivatore-bcb` (o quello che preferisci)
3. **Privato** o **Pubblico**: scegli "Private" se non vuoi che il codice sia
   visibile a tutti. Per GitHub Actions funziona uguale.
4. **NON** aggiungere README, .gitignore, license — li abbiamo già nel progetto.
5. Clicca "Create repository".

### 2. Carica il progetto su GitHub

Apri il **Terminale**, vai nella cartella del progetto e usa questi comandi
(sostituisci `TUO-USERNAME` col tuo nome utente GitHub e `NOME-REPO` col
nome che hai scelto sopra):

```bash
cd "/Users/marcobares/Desktop/Lavoro Ufficio/preventivatore-app"

# Inizializza il repo (solo prima volta)
git init -b main
git add .
git commit -m "Versione iniziale del Preventivatore"

# Collega il repo locale a GitHub
git remote add origin https://github.com/TUO-USERNAME/NOME-REPO.git
git push -u origin main
```

Se Git ti chiede username e password:
- **Username**: il tuo username GitHub
- **Password**: NON la tua password normale, ma un **Personal Access Token**.
  Crealo qui: <https://github.com/settings/tokens/new> → seleziona "repo" →
  Generate. Usa quel token come password.

### 3. Verifica che GitHub Actions parta

Vai sulla pagina del repo su GitHub → tab **"Actions"**. Dovresti vedere il
workflow "Build cross-platform" che gira automaticamente dopo il push.

Aspetta che finisca (5–10 minuti). Quando vedi 3 spunte verdi (mac, windows,
linux), la prima build è pronta.

---

## Pubblicare una NUOVA versione (operazione regolare)

Ogni volta che hai modificato il codice e vuoi distribuire una nuova versione:

### Opzione A — Release ufficiale con tag (consigliata)

I file vengono allegati automaticamente a una pagina "Release" su GitHub —
così chi vuoi può scaricarli con un link unico, anche tra mesi.

```bash
cd "/Users/marcobares/Desktop/Lavoro Ufficio/preventivatore-app"

# Salva le modifiche
git add .
git commit -m "Descrizione breve di cosa è cambiato"
git push

# Crea il tag della versione (incrementa il numero rispetto all'ultimo)
git tag v1.0.1
git push origin v1.0.1
```

GitHub Actions fa partire la build, e quando finisce trovi i 3 file qui:

```
https://github.com/TUO-USERNAME/NOME-REPO/releases/latest
```

Mandi questo link a chi vuoi installare l'app. Loro scelgono il file giusto
per il loro sistema.

### Opzione B — Solo build di test (senza release)

Se vuoi solo verificare che la build funzioni senza creare una release
pubblica:

```bash
git push   # solo questo
```

I file si trovano nel tab "Actions" del repository, sezione "Artifacts" in
fondo alla pagina del run. Restano disponibili per 30 giorni.

---

## Numerazione delle versioni

Convenzione consigliata (semver): `vMAGGIORE.MINORE.PATCH`

- **Patch** (`v1.0.0` → `v1.0.1`): correzioni di bug, nessuna funzionalità nuova.
- **Minore** (`v1.0.0` → `v1.1.0`): nuove funzionalità, retrocompatibili.
- **Maggiore** (`v1.0.0` → `v2.0.0`): grandi cambiamenti, possibile rottura.

Aggiorna anche il campo `"version"` in `package.json` a corrispondere con il
tag (es. se fai tag `v1.0.1`, in package.json metti `"version": "1.0.1"`).

---

## Cosa contiene ogni file generato

| File | Per chi | Cosa è |
|------|---------|--------|
| `Preventivatore-BCB-X.Y.Z-mac-universal.dmg` | Mac (Intel + Apple Silicon) | Trascina nella cartella Applicazioni |
| `Preventivatore-BCB-X.Y.Z-mac-universal.zip` | Mac fallback | Estrai e doppio click sull'app |
| `Preventivatore-BCB-X.Y.Z-Windows-Portable.exe` | Windows 10/11 | Doppio click, nessuna installazione |
| `Preventivatore-BCB-X.Y.Z-Linux-x64.AppImage` | Linux | Click destro → Permessi → Esecuzione, poi doppio click |

Ognuno è completamente self-contained: chi riceve il file non deve
installare niente altro (no Node.js, no Python, no librerie).

---

## Limiti tecnici della distribuzione

### Dimensione dei file (~150–200 MB ciascuno)

I file Electron sono "pesanti" perché includono il runtime Chromium —
non è eliminabile, è il prezzo di un'app cross-platform basata su web.

**Conseguenza**: troppo grande per allegato email standard (Gmail max 25 MB,
Outlook max 20 MB). **Devi usare uno di questi metodi**:

- ✅ **Link al rilascio GitHub** (consigliato): mandi solo l'URL
  `https://github.com/.../releases/latest`. Chi clicca scarica.
- ✅ **Google Drive / Dropbox / iCloud**: carichi il file, condividi link.
- ✅ **WeTransfer**: link che scade in 7 giorni, max 2 GB gratis.
- ✅ **USB / hard disk**: copia diretta.

### Avvisi di sicurezza alla prima apertura

L'app non ha firma digitale (costa €100/anno per Mac, €200/anno per Windows,
non spese per uso interno). Conseguenza: la **prima volta** che il
destinatario apre l'app, vedrà un avviso. È un passaggio una tantum:

- **Mac**: click destro sull'app → "Apri" → "Apri" nel dialog.
- **Windows**: doppio click → "Ulteriori informazioni" → "Esegui comunque".
- **Linux**: click destro → Proprietà → Permessi → Esegui come programma.

Dalla seconda apertura in poi nessun avviso.

Includi sempre il file [`INSTALLAZIONE.md`](INSTALLAZIONE.md) nel link che
condividi: spiega questi passaggi a chi riceve l'app.

---

## Build locale (alternativa, per sviluppo)

Se preferisci buildare sul tuo Mac per testare (senza usare GitHub Actions),
i comandi sono:

```bash
cd "/Users/marcobares/Desktop/Lavoro Ufficio/preventivatore-app"

npm install                 # solo prima volta
npm run pack:mac            # produce .dmg + .zip in release/
npm run pack:current        # builda per il sistema corrente (Mac qui)
```

Per Windows/Linux dal Mac servirebbero strumenti aggiuntivi (Wine, Docker)
che è più semplice evitare usando GitHub Actions.

---

## Risoluzione problemi

### "GitHub Actions ha fallito"

Vai sul repo → tab Actions → clicca sul run rosso → guarda il log del job
fallito. I problemi più comuni:

- **`npm ci` errore**: hai aggiunto pacchetti ma non hai aggiornato `package-lock.json`.
  Fix: in locale fai `npm install`, poi commit del nuovo `package-lock.json`.
- **Build su macOS richiede risorse**: a volte si stalla. Riavvia il job dal
  tab Actions (bottone "Re-run failed jobs").

### "Il tag esiste già"

Se ti sei sbagliato a fare un tag e vuoi rifarlo:

```bash
# Cancella tag locale + remoto
git tag -d v1.0.1
git push origin :refs/tags/v1.0.1
# Poi rifai il tag
git tag v1.0.1
git push origin v1.0.1
```

### "La build su GitHub è lenta"

Normale: 5–10 minuti per piattaforma, ~10–15 minuti totale. GitHub Actions
ha runner gratuiti ma non sempre veloci.
