# Gestione password remota — Preventivatore BCB

Guida per gestire l'**accesso al Preventivatore** controllando da remoto chi può
usare l'app, anche dopo che il file è stato distribuito a terzi.

## Come funziona in 3 righe

1. L'app, ad ogni avvio, **scarica un file JSON** dal tuo Gist GitHub con
   la lista delle password valide (in forma di hash).
2. Quando un utente inserisce la sua password, l'app la confronta con la
   lista. Se non corrisponde a nessuna → bloccato.
3. Per **disattivare** una password, rimuovi il suo hash dal Gist. Al
   prossimo avvio dell'app, chi aveva quella password viene bloccato.

---

## Setup iniziale (una sola volta)

### 1. Crea il Gist

1. Vai su <https://gist.github.com/> (loggato come `mbrs99`).
2. **Filename**: `preventivatore-auth.json`
3. **Content**: incolla questo JSON. L'hash dentro è quello della password
   iniziale `studio-bcb-mestre-25` (da cambiare al più presto):

```json
{
  "validHashes": [
    "ed862ebb9f967a4b420c1fdd20d88a55:ed52291c5d8763dbc3b6410f21985ab97981f3516e80a512a01c2c1199565aadf0611408d350f578dc7cd50d2a45358cd41c06b1fd38a2737a23c06cfbb454fa"
  ],
  "killSwitch": false,
  "lastUpdated": "2026-05-15"
}
```

4. Scegli **"Create secret gist"** in basso (NON pubblico — anche se in pratica
   l'URL "raw" del secret gist è accessibile a chiunque ce l'abbia).
5. Una volta creato, clicca il bottone **"Raw"** in alto a destra del file.
6. **Copia l'URL** della pagina raw che si apre. Sarà tipo:
   ```
   https://gist.githubusercontent.com/mbrs99/AAAAAAA/raw/BBBBBBB/preventivatore-auth.json
   ```
7. Manda quell'URL allo sviluppatore: lo cabla nel codice dell'app.

---

## Schema del file

```json
{
  "validHashes": [
    "<hash1>",
    "<hash2>"
  ],
  "killSwitch": false,
  "lastUpdated": "2026-05-15"
}
```

| Campo | Tipo | Descrizione |
|---|---|---|
| `validHashes` | array di stringhe | hash delle password attualmente attive. Anche solo una è ok. |
| `killSwitch` | boolean | se `true`, **nessuno** può sbloccare l'app (emergency lockdown). |
| `lastUpdated` | stringa | data dell'ultima modifica, solo per riferimento personale. |

> 🛡️ **Sicurezza incorporata**: l'app contiene un hash di "fallback" embeddato
> nel binario. Se per errore svuoti l'array `validHashes`, l'app continua a
> riconoscere quella password di emergenza (è la stessa di sicurezza inserita
> al momento del primo build). Così non puoi mai "bloccarti fuori" da te stesso.

---

## Operazioni comuni

### Cambiare la password (es. dopo che è stata divulgata)

1. **Genera un nuovo hash** della password che vuoi usare. Tre modi:

   **a) Da dentro l'app (più comodo)**:
   *(disponibile in versioni future con bottone "Genera hash" nella schermata Home)*

   **b) Da terminale sul tuo Mac**:
   ```bash
   cd "/Users/marcobares/Desktop/Lavoro Ufficio/preventivatore-app"
   node tools/genera-hash.mjs
   ```
   Lo script ti chiede la password (mascherata) e stampa l'hash.

   **c) Tool online (ATTENZIONE: NON usare siti pubblici per password reali!)**

2. **Apri il Gist** nel browser (la pagina principale del Gist).
3. Clicca **"Edit"** in alto a destra.
4. Modifica il file:
   - Per **cambiare** la password: rimuovi il vecchio hash dall'array
     `validHashes` e aggiungi il nuovo
   - Per **aggiungerne una accanto** (validità doppia per migrazione soft):
     aggiungi il nuovo hash senza rimuovere il vecchio
5. Aggiorna `lastUpdated` con la data di oggi (cosmetico).
6. Clicca **"Update secret gist"**.

7. **Comunica la nuova password** agli utenti autorizzati. Al loro prossimo
   avvio dell'app, vedranno la schermata di sblocco e dovranno digitare la
   nuova.

### Bloccare TUTTI temporaneamente (emergency)

1. Modifica il Gist: imposta `"killSwitch": true`.
2. Update.
3. Al prossimo avvio, tutte le installazioni mostreranno
   "Accesso temporaneamente disattivato dallo Studio".
4. Per riattivare: imposta `"killSwitch": false` e update.

### Tagliare fuori un singolo utente

Non è possibile in modo "diretto" perché tutti condividono la stessa password.
La via è:
1. Cambia la password (vedi sopra)
2. Comunica la nuova SOLO agli utenti che vuoi mantenere
3. Quello che NON ricevi la nuova → bloccato al primo avvio online

---

## Domande frequenti

### Cosa succede se l'utente è offline?

L'app usa l'**ultima lista valida** scaricata in passato (cache locale).
Quindi un utente offline continua a usare la password attuale.

**Conseguenza**: se l'utente non si connette MAI ad Internet, non saprai mai
quando ha smesso di funzionare. Per la stragrande maggioranza dei PC questo
non è un problema (sono sempre online).

### Quanto è sicura la password?

L'hash usato è **scrypt** (Node.js built-in), parametri di default robusti.
La password è praticamente irrecuperabile dall'hash anche se:
- Qualcuno scarica il Gist
- Decompila il binario per leggere l'hash di fallback

A condizione che la **password sia ragionevole** (almeno 3-4 parole o 12+
caratteri). Password tipo `123456` sono crackabili comunque.

Suggerimento: usa frasi di senso compiuto unite con trattini, tipo
`barea-canal-bares-25` o `consulenza-mestre-2026`.

### Quante password posso avere attive contemporaneamente?

Tutte quelle che vuoi. Inserisci più hash nell'array `validHashes`. Utile
per:
- **Migrazioni soft**: vecchia password attiva 30gg, poi rimossa
- **Password "temporanea per ospite"**: aggiungi hash, poi rimuovi
- **Coexistenza di gruppi**: ognuno ha la sua, tu li gestisci dal Gist

---

## Cosa fare se perdi accesso al Gist

Se per qualunque motivo non puoi più gestire il Gist (account perso, ecc.):

1. La password di **fallback** embeddata nel binario continua a funzionare:
   è quella iniziale (`studio-bcb-mestre-25` per la v1.0.2 — controlla
   nelle release notes della versione che gli utenti hanno).
2. Avvisa gli utenti di usare quella password.
3. Per ripristinare il sistema, crea un nuovo Gist e fai una nuova release
   dell'app col nuovo URL.
