# Come installare il Preventivatore BCB

Ti è arrivato il link al Preventivatore BCB? Segui le istruzioni per il tuo sistema.

L'app **non richiede installazione tradizionale**: si scarica un singolo file
e si apre con doppio click. Tutti i tuoi dati (clienti, tariffario)
restano sul tuo computer, **niente viene inviato online**.

---

## 🍎 Mac (macOS 10.15 Catalina o successivo)

### Versione DMG (più semplice)

1. Scarica il file `Preventivatore-BCB-X.Y.Z-mac-universal.dmg` dal link che ti è stato mandato.
2. Doppio click sul file `.dmg` per aprirlo.
3. Trascina l'icona "Preventivatore BCB" nella cartella Applicazioni.
4. La prima volta che la apri, macOS dirà che "non può essere aperta perché
   non viene da uno sviluppatore identificato". È normale.
5. **Click destro** (o ctrl+click) sull'icona dell'app → **"Apri"** → conferma con **"Apri"**.
6. Da questo momento in poi, doppio click come una qualsiasi app.

### Se non trovi il "Click destro → Apri"

In alternativa, dal Terminale (una volta sola):

```bash
xattr -d com.apple.quarantine "/Applications/Preventivatore BCB.app"
```

---

## 🪟 Windows 10 / 11

1. Scarica il file `Preventivatore-BCB-X.Y.Z-Windows-Portable.exe`.
2. **Doppio click** sul file scaricato.
3. La prima volta, Windows mostra "Windows ha protetto il PC". È normale —
   l'app non è firmata digitalmente perché è uso interno.
4. Clicca **"Ulteriori informazioni"** → **"Esegui comunque"**.
5. L'app si apre. Dalla seconda volta in poi, nessun avviso.

L'app si lancia direttamente dal file `.exe`, non c'è un'installazione vera
e propria. Puoi mettere il file dove vuoi (Desktop, Documenti, una cartella
sul disco). I tuoi dati (clienti, tariffario) vengono comunque salvati in
`Documenti\Preventivatore BCB\` indipendentemente da dove hai messo il `.exe`.

---

## 🐧 Linux (Ubuntu, Debian, Fedora, ecc.)

1. Scarica il file `Preventivatore-BCB-X.Y.Z-Linux-x64.AppImage`.
2. **Click destro** sul file → **Proprietà** → tab **Permessi** →
   spunta **"Esegui come programma"** (o equivalente).
3. **Doppio click** sull'AppImage per avviarlo.

In alternativa da terminale:

```bash
chmod +x Preventivatore-BCB-*.AppImage
./Preventivatore-BCB-*.AppImage
```

---

## Cosa fa l'app al primo avvio

Crea automaticamente la cartella `Preventivatore BCB` dentro **Documenti**
del tuo utente. Indipendentemente da dove hai messo il file dell'app:

```
Documenti/Preventivatore BCB/        ← Mac e Linux
[Documenti]\Preventivatore BCB\      ← Windows
├── Clienti/                         ← un file .json per ogni cliente
│   └── LEGGIMI.txt
├── Tariffario/                      ← il tariffario in uso
│   ├── tariffario_attivo.json
│   └── storico/                     ← versioni precedenti del tariffario
└── Codice/                          ← cartella ausiliaria (di solito vuota)
```

**Tutto resta sul tuo disco**: niente cloud, niente account, niente login.
Per spostare i tuoi dati su un altro computer hai due strade:
- Dalla home dell'app: "Esporta lista clienti" → manda il file all'altro PC
  → "Importa lista clienti" lì.
- Manuale: copia l'intera cartella `Documenti/Preventivatore BCB/` sull'altro PC.

---

## Aggiornare a una nuova versione

Quando ricevi una nuova versione:

1. **Chiudi** il Preventivatore se è aperto.
2. **Sostituisci** il vecchio file (`.app`, `.exe`, `.AppImage`) con quello nuovo.
3. Riapri l'app.

Le tue informazioni (clienti, tariffario personalizzato) **non vengono
toccate** dall'aggiornamento — vivono in `Documenti/Preventivatore BCB/`,
non nel file dell'app, quindi sopravvivono a qualsiasi sostituzione.

---

## Problemi comuni

### Mac: "L'app è danneggiata e non può essere aperta"

Significa che macOS ha messo l'app in quarantena. Soluzione (terminale):

```bash
xattr -cr "/Applications/Preventivatore BCB.app"
```

### Mac: l'app non si apre nemmeno con click destro → Apri

Verifica di aver scaricato la versione `mac-universal.dmg` (funziona sia su
Intel che su Apple Silicon). Se hai per caso scaricato la `.zip`, estraila
prima di copiarla in Applicazioni.

### Windows: "L'app non risponde" all'avvio

Probabilmente l'antivirus sta scansionando il file. Aspetta 10–15 secondi
e riprova. Se persiste, aggiungi una eccezione nell'antivirus per la
cartella dove hai messo il `.exe`.

### Linux: l'AppImage non si apre

Verifica i permessi di esecuzione (vedi sopra). Su alcune distribuzioni
serve anche il pacchetto `libfuse2`:

```bash
sudo apt install libfuse2     # Debian/Ubuntu
sudo dnf install fuse-libs    # Fedora
```

### Tutti i sistemi: "L'app non vede i miei vecchi clienti"

L'app cerca i clienti in `Documenti/Preventivatore BCB/Clienti/`. Se hai
cambiato computer, copia quella cartella dal vecchio PC al nuovo (stesso
percorso). In alternativa, usa il bottone **"Importa lista clienti"** dalla
home dell'app per caricare un export precedente.

---

## In caso di dubbi

Contatta lo Studio Commercialista BCB per assistenza.
