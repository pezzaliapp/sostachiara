# Sosta Chiara

App web gratuita per chi parcheggia sulle strisce blu in 13 città italiane:
**Arezzo, Bologna, Civitanova Marche, Firenze, Milano, Modena, Parma, Perugia, Reggio nell'Emilia, Roma, Torino, Trieste, Udine**.

- mappa OpenStreetMap con le zone di sosta e il loro stato (a pagamento ora / gratis ora);
- orari, tariffe, durata massima e regole speciali di ogni zona;
- "Vicino a me": sceglie la città e mostra le zone più vicine;
- promemoria della sosta con avviso 10 minuti prima della scadenza (notifica, suono, evento in calendario);
- installabile sul telefono come app (PWA), utilizzabile anche offline (mappa esclusa);
- si aggiorna da sola: quando pubblichi una nuova versione compare l'avviso **"Nuova versione disponibile – Aggiorna"**.

**Sosta Chiara è solo informativa e non paga la sosta.** Al primo avvio l'utente deve leggere e accettare le note legali (vedi sotto). Fa sempre fede la segnaletica sul posto.

## Pubblicazione su GitHub Pages (gratis)

1. Su GitHub apri la repo → **Settings** → **Pages**.
2. In *Build and deployment* → *Source* scegli **GitHub Actions**.
3. Ogni `git push` su `main` pubblica l'app su `https://pezzaliapp.github.io/sostachiara/` in circa un minuto (stato nella scheda **Actions**).

Il workflow `.github/workflows/pages.yml` scrive a ogni pubblicazione un numero di versione nuovo in `sw.js` e `version.json`. Le app già installate lo rilevano all'apertura (e ogni 30 minuti) e mostrano il pulsante **Aggiorna**. Non devi cambiare nulla a mano.

## Installarla sul telefono

- **iPhone**: apri il link in Safari → **Condividi** → **Aggiungi a schermata Home**.
- **Android**: apri il link in Chrome → menu **⋮** → **Installa app**.

## Aggiornare i dati

Tutte le zone sono in [`zones.json`](zones.json): modifica il file, poi `git commit` e `git push`.

| Campo | Significato |
|---|---|
| `from`, `to` | orario a pagamento (`HH:MM`); `null` se da verificare |
| `slots` | in alternativa a from/to, più fasce: `[["08:00","13:00"],["15:00","20:00"]]` |
| `days` | `lun-sab` (predefinito), `lun-ven` o `tutti` |
| `rate` | tariffa in euro all'ora (usata per la stima) |
| `tiers` | tariffa come scritta sul cartello |
| `max` | durata massima in minuti, `null` se illimitata |
| `free` | `true` se vale l'ora gratis 12.30–14.30 con app (Parma) |
| `pos` | coordinate `[lat, lon]` del segnaposto (indicative) |
| `verify` | `true` se il dato non è confermato da fonte ufficiale |
| `holidays` (città) | santo patrono `"mese-giorno"`; le feste nazionali sono già incluse |

Per ricalcolare le coordinate da OpenStreetMap (serve Node 18+): `node tools/geocode.mjs --all`

## Note legali

Il testo completo è nell'app (pulsante *Note legali e privacy*). In sintesi: l'app è informativa, non ufficiale, non collegata a Comuni o gestori; i dati possono essere errati; fa fede la segnaletica; il promemoria non è un titolo di sosta; l'autore non risponde di multe, rimozioni o danni nei limiti consentiti dalla legge; nessun dato personale raccolto.

Se cambi il testo delle note legali, aumenta `LEGAL_VERSION` in `app.js`: tutti gli utenti dovranno riaccettarle.

> Questo testo è una base ragionevole ma non sostituisce il parere di un avvocato, soprattutto se l'app verrà promossa o monetizzata.

## Privacy e dipendenze

Nessun server, database, cookie o statistica. Nessuna API a pagamento, nessuna chiave, nessuna versione di prova: il pulsante "Portami qui" è un semplice link che apre Mappe di Apple (iPhone/Mac) o Google Maps (Android/PC), gratis per sempre. La libreria mappe (Leaflet) è inclusa nella repo e i font sono quelli di sistema, quindi l'app non contatta servizi esterni tranne le tessere di OpenStreetMap ([policy d'uso](https://operations.osmfoundation.org/policies/tiles/)). Le tessere OSM sono gratuite per un uso moderato; se l'app diventasse molto usata, si può passare a un servizio di mappe sempre gratuito e senza chiave come OpenFreeMap, senza costi.

## Fonti dei dati

Ogni città indica nell'app la sua fonte principale (sito del Comune o del gestore della sosta) e la data dell'ultimo controllo. I dati segnati "da verificare" non sono stati confermati da fonte ufficiale. Il rapporto completo della verifica, città per città e con i link alle fonti, è in [FONTI.md](FONTI.md).

## Licenza

MIT. Vedi [LICENSE](LICENSE).
