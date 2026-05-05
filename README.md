# Preventivatore BCB — App Desktop

App desktop autonoma per il Preventivatore dello Studio Commercialista BCB.
Un'unica icona da cliccare, niente più server locali o file `.command`.

> 📦 **Per pubblicare/aggiornare l'app** (build automatica Mac/Win/Linux su GitHub Actions): vedi [`DISTRIBUZIONE.md`](DISTRIBUZIONE.md)
>
> 💾 **Per chi riceve l'app e deve installarla**: vedi [`INSTALLAZIONE.md`](INSTALLAZIONE.md)

---

## Che cosa c'è dentro

Quando cliccherai sull'icona dell'app, si aprirà una **finestra Home** con i 4 pulsanti che hai chiesto:

1. **Apri Preventivatore** → apre il preventivatore in una finestra interna
2. **Cartella Clienti** → apre nel Finder/Explorer la cartella dove sono salvati tutti i clienti (un file `.json` per cliente)
3. **Editor Tariffario** → ⭐ NOVITÀ: apre l'editor visuale del tariffario in una finestra dedicata
4. **Cartella Codice** → apre la cartella con i file operativi del tool

In basso trovi anche due bottoni per **Esportare** e **Importare** liste clienti, utili per passarle velocemente tra te e il tuo collaboratore.

### L'Editor del Tariffario

L'editor è una **finestra completamente nuova** che permette di modificare TUTTE le tariffe del Preventivatore senza più dover modificare l'XLS. Caratteristiche:

- **8 sezioni** organizzate come l'Excel originale (Contabilità, Dichiarazioni, Quadri UPF/USP/USC, Bilancio, Consulenza, IMU, Allegato A, Voci Personalizzate)
- **Modifica visuale** di ogni voce: niente formule complicate, solo input numerici
- **Aggiunta di nuove voci** in qualsiasi sezione esistente
- **Voci PERSONALIZZATE**: puoi creare tariffe completamente nuove (non presenti nel tariffario standard) e decidere in quale gruppo del preventivo (1.1 Contabilità, 1.2 Dichiarazioni, 1.3 770, 1.4 Consulenza, IMU) farle apparire
- **3 tipi di tariffa** per ogni voce: importo fisso, per unità (es. €10 × N pratiche), composta (base + per unità)
- **Storico automatico**: ogni salvataggio crea uno snapshot ripristinabile (gli ultimi 30)
- **Esporta come XLS**: rigenera un Excel del tariffario per backup/condivisione
- **Salva/Ricarica**: il file `tariffario_attivo.json` è la fonte primaria; il preventivatore lo legge all'avvio

### Dove vengono salvati i dati

I dati (clienti, tariffario, codice) vengono salvati nella cartella
**Documenti/Preventivatore BCB/** dell'utente, indipendentemente da dove
hai messo l'app stessa. Questa scelta garantisce che i dati siano sempre
in una posizione scrivibile e standard, su tutti e tre i sistemi.

Struttura sul disco:

```
~/Documenti/Preventivatore BCB/         ← Mac/Linux
C:\Users\<user>\Documenti\Preventivatore BCB\   ← Windows
├── Clienti/                            ← tutti i clienti (un .json ciascuno)
│   ├── cliente__abc123.json
│   └── ...
├── Tariffario/                         ← tariffario in uso
│   ├── tariffario_attivo.json          ← ⭐ modificabile dall'editor
│   └── storico/                        ← snapshot delle versioni precedenti
└── Codice/                             ← cartella ausiliaria (di solito vuota)
```

Per spostare i dati su un altro computer:
- **Metodo veloce**: dalla home dell'app, "Esporta lista clienti" → mandi
  il file `.bcbexport.json` all'altro PC → "Importa lista clienti" lì
- **Metodo manuale**: copia l'intera cartella `Documenti/Preventivatore BCB/`
  sull'altro PC, sovrascrivendo quella esistente

---

## Prima installazione (una tantum)

Per creare l'app eseguibile la prima volta serve Node.js installato. È un
software gratuito scaricabile da <https://nodejs.org> (scegli la versione LTS).
Una volta installato, **non serve più** per usare l'app — solo per compilarla.

### Passo 1 — Apri il terminale nella cartella del progetto

Su **Mac**: apri l'app "Terminale", poi scrivi `cd ` (con lo spazio) e trascina
la cartella `preventivatore-app` dentro la finestra del Terminale. Premi Invio.

Su **Windows**: apri la cartella `preventivatore-app` in Esplora File, clicca
sulla barra degli indirizzi, scrivi `cmd` e premi Invio.

### Passo 2 — Installa le dipendenze

Esegui questo comando una sola volta (scarica circa 300 MB di librerie):

```bash
npm install
```

Questo passo dura 2-5 minuti ed è normale che stampi molte righe.

### Passo 3 — Compila l'app

A questo punto, in base al sistema su cui sei, lancia **uno** di questi due comandi:

**Se sei su Mac** (compila l'app per Mac):
```bash
npm run pack:mac
```
Al termine trovi il risultato in `release/mac-universal/Preventivatore BCB.app`.

**Se sei su Windows** (compila l'app per Windows):
```bash
npm run pack:win
```
Al termine trovi il risultato in `release\Preventivatore-BCB-Portable.exe`.

> **Nota**: da Mac si può compilare anche per Windows (e viceversa), ma serve
> qualche passaggio extra. Per semplicità, compila sul sistema che stai usando.
> Se hai bisogno della versione per l'altro sistema, contattami e ti spiego
> come usare GitHub Actions per compilare gratuitamente su server cloud.

---

## Distribuzione sul primo computer

Una volta compilata, prendi il file/cartella risultato dal passo 3 e copialo
in una cartella qualsiasi. La prima volta che apri l'app, si creano
automaticamente le cartelle `Clienti/`, `Tariffario/`, `Codice/` accanto ad essa.

### Caricare il tariffario

1. Avvia l'app (doppio click sull'icona)
2. Clicca "Cartella Tariffario" — si apre Finder/Explorer
3. Trascina dentro il file `tariffario_BCB.xls` che vuoi usare
4. Torna all'app e apri il Preventivatore — il tariffario si carica
   automaticamente

### Spostamento su un altro computer

Hai due opzioni:

**Opzione A: Copia l'intera cartella**
Copia tutta la cartella `Preventivatore BCB/` (inclusi `Clienti/`, `Tariffario/`
e l'icona) su USB / cloud / email. Incollala sull'altro computer e apri
l'app — trovi tutti i clienti già pronti.

**Opzione B: Solo il software, niente dati**
Copia solo il file `Preventivatore BCB.app` (o `.exe`). I clienti non ci
saranno, ma l'app funziona immediatamente. Poi importa i clienti tramite
il bottone "Importa lista clienti".

---

## Scambio clienti tra te e il tuo collaboratore

### Metodo rapido (da dentro l'app)

1. **Tu**: clicca "Esporta lista clienti", scegli dove salvare, mandagli il
   file `.bcbexport.json` via email/chat/USB
2. **Lui**: clicca "Importa lista clienti", seleziona il file ricevuto

I clienti importati vengono sommati a quelli che già possiede (non
cancellano nulla di esistente).

### Metodo manuale (dal Finder)

Dato che ogni cliente è un singolo file `.json`, puoi:
1. Aprire "Cartella Clienti"
2. Selezionare i file dei clienti che vuoi passare
3. Comprimerli in un `.zip` e inviarli
4. Il destinatario li scompatta nella sua cartella `Clienti/`

---

## Aggiornamenti del tariffario

Quando le tariffe cambiano (es. passaggio 2026→2027):

1. Apri "Cartella Tariffario"
2. Metti dentro il nuovo file `.xls`
3. Apri il Preventivatore
4. Nel preventivatore, pulsante "Aggiorna tariffario XLS" e seleziona il nuovo file

I clienti già salvati **non vengono toccati** — usano il tariffario che era
attivo al momento della loro creazione.

---

## Risoluzione problemi

### Mac: "app non può essere aperta perché non verificata"

Questo è normale: l'app non è firmata con Apple Developer ID (che costa
100$/anno). Soluzione:

1. Click destro sull'app → "Apri"
2. Clicca "Apri" nel dialog
3. Da ora l'OS la riconosce come sicura

Alternativa da Terminale (una volta sola):
```bash
xattr -d com.apple.quarantine "/path/to/Preventivatore BCB.app"
```

### Windows: "Windows ha protetto il PC"

Uguale al caso Mac: app non firmata (firma costa ~200$/anno).

1. Clicca "Ulteriori informazioni" nel dialog
2. Clicca "Esegui comunque"

### L'app non trova i clienti dopo averla spostata

Assicurati di aver copiato anche la cartella `Clienti/` accanto all'app, non solo
il file dell'app da solo.

### Il preventivatore non parte (finestra bianca)

Probabilmente il build Vite non è stato fatto. Torna al terminale, vai nella
cartella del progetto ed esegui:
```bash
npm run build:renderer
```
Poi riavvia l'app.

---

## Struttura dei file del progetto

```
preventivatore-app/
├── package.json              ← configurazione build
├── vite.config.mjs           ← configurazione build React
├── src/
│   ├── main.js               ← processo principale Electron
│   ├── preload.js            ← bridge sicuro verso il file system
│   ├── home.html             ← UI della finestra launcher (i 4 bottoni)
│   ├── home.js               ← logica della home
│   └── renderer/
│       ├── index.html        ← HTML entry del preventivatore
│       ├── main.jsx          ← entry React
│       └── preventivatore.jsx ← CODICE DEL PREVENTIVATORE (identico all'originale)
├── build/                    ← icone (Marco può sostituirle)
│   ├── icon.png              ← icona Mac (1024×1024)
│   └── icon.ico              ← icona Windows
├── dist/                     ← output build Vite (auto-generato)
└── release/                  ← output app compilata (auto-generato)
```

Il file `src/renderer/preventivatore.jsx` è una **copia identica** dell'ultimo
preventivatore.jsx. Quando riceverai una nuova versione del preventivatore,
basta sostituire questo file e rieseguire `npm run pack:mac` (o win).

---

## Comandi rapidi

| Comando | Cosa fa |
|---|---|
| `npm install` | Scarica le librerie (solo prima volta) |
| `npm run dev` | Avvia l'app in modalità sviluppo (utile per test rapidi) |
| `npm run pack:mac` | Compila l'app per Mac (output in `release/`) |
| `npm run pack:win` | Compila l'app per Windows (output in `release/`) |

---

## Cambiare le icone

Se vuoi sostituire le icone placeholder "BCB":

1. Crea un'icona quadrata 1024×1024 pixel in formato PNG
2. Salvala come `build/icon.png` (sovrascrivi la placeholder)
3. Per Windows, serve anche un `.ico` — usa <https://convertio.co/png-ico/>
   per convertire, poi salva come `build/icon.ico`
4. Ricompila con `npm run pack:mac` o `npm run pack:win`
