import type {LegalPack} from './types';

/*
 * Политика и правила по стандартному устройству (14 октября 2026, по просьбе
 * владельца «сделай стандартной, как требует закон»): политика — по ст. 13
 * GDPR (оператор, данные, цели и основания, cookies, получатели, передача за
 * границу, сроки, безопасность, права, жалоба, автоматические решения, дети,
 * изменения); правила — обычные условия использования. Содержание — только
 * то, что сервис делает на самом деле: источник — docs/legal/PRIVACY-DATA-RU.md.
 * Устройство на четырёх языках одинаковое — сторожит tests/guards/legal-docs.mjs.
 */
export const it: LegalPack = {
  "updated": "2026-10-14",
  "privacy": {
    "title": "Informativa sulla privacy",
    "intro": "Questa informativa spiega quali dati personali vengono trattati quando usi il sito {site} e l’app True Thrills per Android e Windows (di seguito, il «servizio»), per quali finalità, per quanto tempo vengono conservati e quali diritti hai. Il documento è redatto secondo il Regolamento generale sulla protezione dei dati (GDPR) e le leggi sulla protezione dei dati dei paesi in cui opera il servizio.",
    "sections": [
      {
        "heading": "1. Chi è responsabile dei tuoi dati",
        "paragraphs": [
          "Il titolare del trattamento è {controller}. Indirizzo per qualsiasi domanda sui dati personali, richieste e reclami: {contact}.",
          "Il servizio è un progetto d’autore senza scopo di lucro: podcast, video, storie e dirette del canale True Thrills. Nel servizio non ci sono registrazione per gli ascoltatori, pubblicità o abbonamenti a pagamento. Non vendiamo né cediamo in affitto dati personali e non li usiamo per la pubblicità."
        ]
      },
      {
        "heading": "2. Quali dati trattiamo",
        "paragraphs": [
          "Raccogliamo il meno possibile. Il servizio non chiede agli ascoltatori nome, indirizzo email, numero di telefono o dati di pagamento. Vengono trattati:"
        ],
        "bullets": [
          "Dati tecnici delle richieste: indirizzo IP, data e ora, indirizzo della pagina richiesta, tipo di browser e dispositivo. Li registra il log del server web a ogni accesso al servizio.",
          "Dati per la protezione dagli abusi: l’indirizzo IP sotto forma di hash irreversibile, con cui si limita la frequenza delle richieste. L’indirizzo vero e proprio non viene conservato nel database.",
          "Contatori delle pubblicazioni: l’identificativo dell’episodio o della storia e un codice casuale della sessione corrente. Servono a contare le aperture delle storie e gli avvii dell’audio. Il codice di sessione non è collegato alla tua identità e non viene salvato sul dispositivo.",
          "Dati delle notifiche — solo se le notifiche sono attive: indirizzo di iscrizione del browser o token del dispositivo Android, lingua scelta, argomenti scelti e ora dell’iscrizione. Su Android 12 e versioni precedenti il sistema non mostra una richiesta di autorizzazione separata, quindi l’app attiva le notifiche al primo avvio; puoi disattivarle con un tocco nelle impostazioni dell’app.",
          "Dati della diretta: una chiave temporanea dell’ascoltatore per la durata della diretta. Dopo la diretta viene cancellata.",
          "Dati della community — solo se l’autore ha attivato i commenti e hai creato tu un profilo: pseudonimo, hash del codice personale di accesso, i tuoi commenti e le tue segnalazioni.",
          "I messaggi che ci invii all’indirizzo {contact} e i dati che vi includi."
        ]
      },
      {
        "heading": "3. Finalità e basi giuridiche",
        "bullets": [
          "Mostrare episodi, video, storie e dirette su tua richiesta — esecuzione della tua richiesta di usare il servizio (art. 6(1)(b) GDPR).",
          "Funzionamento, sicurezza e protezione del servizio da attacchi, guasti e abusi — log del server, limitazione della frequenza delle richieste — legittimo interesse del titolare a un servizio funzionante e protetto (art. 6(1)(f) GDPR).",
          "Contatori di aperture e ascolti, perché l’autore capisca cosa interessa al pubblico — legittimo interesse del titolare (art. 6(1)(f) GDPR). I contatori sono anonimi e non permettono di sapere chi ha ascoltato.",
          "Notifiche su dirette e nuovi episodi — il tuo consenso (art. 6(1)(a) GDPR). Puoi revocarlo in qualsiasi momento disattivando le notifiche nelle impostazioni del servizio o del telefono.",
          "Profilo e commenti della community — il tuo consenso (art. 6(1)(a) GDPR), che dai creando il profilo. Cancellare il profilo lo revoca.",
          "Risposte alle tue richieste ed esercizio dei tuoi diritti — obbligo legale del titolare (art. 6(1)(c) GDPR)."
        ]
      },
      {
        "heading": "4. Cookie e memoria del dispositivo",
        "paragraphs": [
          "Il servizio non usa cookie pubblicitari o analitici e non installa cookie di altre società. Agli ascoltatori il servizio non installa alcun cookie. Un cookie di sessione tecnicamente necessario compare solo per l’autore del canale quando entra nello studio e, se la community è attiva, per un membro dopo l’accesso al profilo.",
          "Per non farti ricominciare ogni volta da capo, il servizio salva alcuni dati nella memoria locale del browser o dell’app. Questi dati non vengono inviati né al server né a terzi e puoi cancellarli eliminando i dati del sito o dell’app:"
        ],
        "bullets": [
          "il punto in cui ti sei fermato in un episodio e la sua durata;",
          "quali pubblicazioni hai già aperto, per togliere l’etichetta «nuovo»;",
          "quali schede hai tolto dalla pagina principale e quale riga «Continua» hai nascosto;",
          "la posizione di lettura e le impostazioni del testo nelle storie, la lingua scelta e il volume."
        ]
      },
      {
        "heading": "5. Video incorporati e link ad altri siti",
        "paragraphs": [
          "Alcuni video sono incorporati da piattaforme esterne: YouTube (in modalità youtube-nocookie.com), Rutube, VK o TikTok. Quando apri un video di questo tipo, il tuo browser si collega direttamente alla piattaforma e le trasmette il tuo indirizzo IP e i dati del browser. Il trattamento successivo è regolato dall’informativa privacy della piattaforma.",
          "I link alle pagine del canale sui social network e ai servizi di sostegno volontario portano a siti di altre società. Seguendoli, sei soggetto alle loro regole. I pagamenti di sostegno avvengono presso questi servizi: i dati della carta e del pagamento non arrivano a noi."
        ]
      },
      {
        "heading": "6. Chi altro riceve i dati",
        "paragraphs": [
          "Trasmettiamo dati solo a chi è indispensabile per far funzionare il servizio. Si tratta di responsabili del trattamento che agiscono per nostro conto e secondo i propri obblighi contrattuali sulla protezione dei dati:"
        ],
        "bullets": [
          "Oracle (Oracle Cloud Infrastructure) — hosting del server su cui funzionano il sito, l’app e il database.",
          "Google (Firebase Cloud Messaging) — invio delle notifiche su Android. All’avvio l’app riceve da Google il token del dispositivo; arriva al nostro server solo se le notifiche sono attive. Google riceve il token e il testo della notifica.",
          "Servizi di notifiche push dei browser (Google, Mozilla, Apple, Microsoft) — invio delle notifiche nel browser. Il testo della notifica è cifrato con le chiavi del tuo dispositivo e il servizio non può leggerlo.",
          "Autorità pubbliche — solo se la legge lo richiede espressamente e solo nei limiti di tale richiesta."
        ]
      },
      {
        "heading": "7. Trasferimento dei dati in altri paesi",
        "paragraphs": [
          "Il server del servizio e i responsabili del trattamento possono trovarsi fuori dal tuo paese. Google può trattare dati negli Stati Uniti. Tale trasferimento avviene sulla base della decisione di adeguatezza della Commissione europea (EU–US Data Privacy Framework) o delle clausole contrattuali standard approvate dalla Commissione europea. Puoi chiedere una copia delle garanzie applicabili all’indirizzo {contact}."
        ]
      },
      {
        "heading": "8. Per quanto tempo conserviamo i dati",
        "bullets": [
          "Log del server web — fino a 14 giorni, poi viene cancellato dalla rotazione automatica dei log del server.",
          "Hash per la limitazione della frequenza delle richieste — fino alla fine della finestra di limitazione, poi vengono cancellati automaticamente.",
          "Codice di sessione per i contatori — 24 ore. I contatori stessi sono conservati come totali anonimi finché esiste la pubblicazione.",
          "Iscrizione alle notifiche — finché non la disattivi o finché il dispositivo non smette di ricevere notifiche.",
          "Chiave dell’ascoltatore della diretta — fino alla fine della diretta.",
          "Commenti, segnalazioni e blocchi della community — fino a trenta giorni, poi vengono cancellati automaticamente. Pseudonimo e hash del codice di accesso — finché esiste il profilo.",
          "La corrispondenza con te — per il tempo necessario a rispondere alla richiesta e non oltre tre anni.",
          "Copie di backup cifrate — si conservano le ultime trenta copie, quelle più vecchie vengono cancellate automaticamente."
        ]
      },
      {
        "heading": "9. Come proteggiamo i dati",
        "paragraphs": [
          "La connessione al servizio è protetta da HTTPS. Solo il titolare ha accesso al server. Il programma del servizio funziona con un utente di sistema separato, senza diritti di amministratore. Le copie di backup sono cifrate prima di lasciare il server. I codici di accesso sono conservati solo sotto forma di hash irreversibile.",
          "Nessun metodo di conservazione e trasmissione dei dati offre una garanzia assoluta. Se si verifica una violazione che può incidere sui tuoi diritti, ne informeremo l’autorità di controllo e te, nei termini previsti dalla legge, nel servizio e su {site}."
        ]
      },
      {
        "heading": "10. I tuoi diritti",
        "paragraphs": [
          "Hai il diritto di:"
        ],
        "bullets": [
          "sapere se i tuoi dati sono trattati e riceverne una copia (diritto di accesso);",
          "chiedere la rettifica dei dati inesatti;",
          "chiedere la cancellazione dei dati («diritto all’oblio»);",
          "chiedere la limitazione del trattamento;",
          "ricevere i dati che hai fornito in un formato leggibile da dispositivo automatico e trasmetterli a un altro titolare (diritto alla portabilità);",
          "opporti al trattamento basato sul legittimo interesse;",
          "revocare il consenso in qualsiasi momento. Ciò non rende illecito il trattamento svolto prima della revoca;",
          "proporre reclamo all’autorità di controllo per la protezione dei dati del paese in cui vivi o lavori o in cui ritieni siano stati violati i tuoi diritti."
        ]
      },
      {
        "heading": "11. Come esercitare i tuoi diritti",
        "paragraphs": [
          "Scrivi a {contact}. Ti risponderemo senza ingiustificato ritardo e al più tardi entro un mese (trenta giorni) dal ricevimento della richiesta. Se la richiesta è complessa, il termine può essere prorogato di altri due mesi, e te lo comunicheremo. La risposta è gratuita. Per non consegnare i dati di altri, potremmo chiederti di confermare che la richiesta proviene da te.",
          "La maggior parte dei dati puoi cancellarla da solo: disattivando le notifiche, eliminando i dati del sito o dell’app; un membro della community può esportare e cancellare il proprio profilo direttamente nell’app."
        ]
      },
      {
        "heading": "12. Fornire i dati è obbligatorio?",
        "paragraphs": [
          "No. Il servizio si può usare senza registrazione e senza fornire alcuna informazione su di te. I dati tecnici delle richieste sono trasmessi automaticamente dal browser: senza di essi il servizio non può mostrare la pagina. Le notifiche e il profilo della community sono facoltativi."
        ]
      },
      {
        "heading": "13. Decisioni automatizzate",
        "paragraphs": [
          "Non prendiamo decisioni basate unicamente sul trattamento automatizzato, compresa la profilazione, che producano effetti giuridici che ti riguardano o che incidano in modo analogo significativamente sulla tua persona."
        ]
      },
      {
        "heading": "14. Minori",
        "paragraphs": [
          "Il servizio non è destinato ai minori di 13 anni. Un profilo nella community può essere creato dai 16 anni o dall’età del consenso digitale stabilita dalla legge del tuo paese. Non raccogliamo informazioni sull’età. Se scopri che un minore ci ha trasmesso i propri dati, scrivi a {contact} e li cancelleremo."
        ]
      },
      {
        "heading": "15. Modifiche all’informativa",
        "paragraphs": [
          "Possiamo aggiornare questa informativa quando cambiano il servizio o la legge. La data dell’ultima modifica è indicata in cima alla pagina. Delle modifiche sostanziali ti informeremo in anticipo nel servizio."
        ]
      }
    ]
  },
  "rules": {
    "title": "Termini e condizioni",
    "intro": "Questi termini regolano l’uso del sito {site} e dell’app True Thrills (di seguito, il «servizio»). Il gestore del servizio è {controller}. Usando il servizio accetti questi termini. Se non li accetti, ti preghiamo di non usare il servizio.",
    "sections": [
      {
        "heading": "1. Che cos’è il servizio",
        "paragraphs": [
          "Il servizio è la piattaforma d’autore gratuita del canale True Thrills: audio, video, storie scritte e dirette. Per usare il servizio non è necessaria la registrazione. Le funzioni del servizio possono essere modificate, ampliate o interrotte."
        ]
      },
      {
        "heading": "2. Età",
        "paragraphs": [
          "Il servizio è destinato a persone di età superiore ai 13 anni. Alcuni contenuti raccontano catastrofi, traumi e la morte di persone e possono essere difficili da affrontare. Un profilo nella community può essere creato dai 16 anni o dall’età stabilita dalla legge del tuo paese."
        ]
      },
      {
        "heading": "3. Diritti sui contenuti",
        "paragraphs": [
          "Tutti gli episodi, i video, i testi, le copertine, il logo e le registrazioni delle dirette sono protetti dal diritto d’autore e appartengono al gestore o sono da lui usati legittimamente. Puoi ascoltarli, guardarli e leggerli per uso personale non commerciale e condividerne i link.",
          "Senza l’autorizzazione scritta del gestore è vietato copiare, scaricare aggirando le funzioni del servizio, ricaricare, ridoppiare, modificare, vendere e diffondere pubblicamente i contenuti, nonché usarli per addestrare sistemi di intelligenza artificiale."
        ]
      },
      {
        "heading": "4. Uso consentito",
        "paragraphs": [
          "Nell’uso del servizio è vietato:"
        ],
        "bullets": [
          "violare la legge e i diritti di altre persone;",
          "tentare di ottenere un accesso non autorizzato al server, allo studio dell’autore o ai dati altrui;",
          "disturbare il funzionamento del servizio, creare un carico eccessivo, scaricare in massa i contenuti con strumenti automatici;",
          "diffondere software dannoso ed eludere le misure tecniche di protezione;",
          "spacciarsi per l’autore del canale o per un’altra persona."
        ]
      },
      {
        "heading": "5. Commenti e community",
        "paragraphs": [
          "Se l’autore ha attivato i commenti, sei responsabile di ciò che pubblichi. Pubblicando un commento, ne consenti la visualizzazione nel servizio finché non viene cancellato da te, dall’autore o automaticamente alla scadenza del periodo di conservazione. Nei commenti sono vietati:"
        ],
        "bullets": [
          "minacce, insulti, molestie e incitamento all’odio;",
          "spam, pubblicità e link di qualsiasi tipo;",
          "contenuti illegali e incitamenti a reati o alla violenza;",
          "dati personali altrui: indirizzi, telefoni, corrispondenza, fotografie;",
          "contenuti che violano i diritti d’autore e altri diritti di terzi."
        ]
      },
      {
        "heading": "6. Moderazione",
        "paragraphs": [
          "I commenti vengono pubblicati subito e l’autore li controlla. Una violazione comporta la cancellazione del messaggio e, se ripetuta, il blocco del profilo. L’autore che cancella un commento ne indica il motivo.",
          "Se non sei d’accordo con una decisione o vuoi segnalare un contenuto illegale, scrivi a {contact}. Esamineremo la richiesta e risponderemo entro trenta giorni."
        ]
      },
      {
        "heading": "7. Sostegno volontario",
        "paragraphs": [
          "Puoi sostenere l’autore se lo desideri, tramite servizi di pagamento di terzi. Il sostegno è una donazione volontaria, non un acquisto: non dà accesso a contenuti riservati, privilegi o vantaggi, e tutti i contenuti del servizio restano gratuiti per tutti.",
          "Il pagamento è gestito dal servizio di pagamento che scegli, secondo le sue regole. Le questioni di rimborso sono regolate dalle regole di tale servizio e dalle norme inderogabili di legge."
        ]
      },
      {
        "heading": "8. I contenuti non sono consigli",
        "paragraphs": [
          "Le storie di sopravvivenza, i consigli degli ospiti delle dirette e l’indicazione per la respirazione nella pagina della diretta hanno carattere informativo. Non costituiscono consulenza medica, psicologica, legale o professionale e non sostituiscono preparazione, attrezzatura e aiuto di specialisti. Se hai bisogno di aiuto, rivolgiti a un medico o ai servizi di emergenza."
        ]
      },
      {
        "heading": "9. Servizi di terzi",
        "paragraphs": [
          "Il servizio incorpora video di piattaforme esterne e contiene link a social network e servizi di pagamento. Il gestore non controlla questi servizi e non risponde dei loro contenuti e delle loro regole. Il loro uso è disciplinato dai rispettivi termini."
        ]
      },
      {
        "heading": "10. Esclusione di garanzie",
        "paragraphs": [
          "Il servizio è fornito «così com’è» e «come disponibile». È un progetto personale e il gestore non garantisce un funzionamento ininterrotto e privo di errori né la disponibilità costante di singoli contenuti."
        ]
      },
      {
        "heading": "11. Limitazione di responsabilità",
        "paragraphs": [
          "Nei limiti consentiti dalla legge, il gestore non risponde di danni indiretti, mancato guadagno e perdita di dati legati all’uso del servizio, né del contenuto dei commenti di altri utenti, ma rimuove le violazioni quando ne viene a conoscenza. Nulla in questi termini limita la responsabilità che la legge non consente di limitare né i tuoi diritti inderogabili di consumatore."
        ]
      },
      {
        "heading": "12. Cessazione dell’uso",
        "paragraphs": [
          "Puoi smettere di usare il servizio in qualsiasi momento: disinstallando l’app, disattivando le notifiche, cancellando il profilo della community. Il gestore può limitare l’accesso a chi viola questi termini e può cessare il servizio, avvisando in anticipo quando possibile."
        ]
      },
      {
        "heading": "13. Modifiche dei termini",
        "paragraphs": [
          "Il gestore può modificare questi termini. La data dell’ultima modifica è indicata in cima alla pagina. Delle modifiche sostanziali ti informeremo in anticipo nel servizio. Continuando a usare il servizio dopo l’entrata in vigore delle modifiche, accetti la nuova versione."
        ]
      },
      {
        "heading": "14. Legge applicabile e controversie",
        "paragraphs": [
          "A questi termini si applica la legge del paese in cui si trova il gestore. Se sei un consumatore, conservi la tutela delle norme inderogabili del paese in cui vivi e il diritto di rivolgerti al giudice di quel paese. Prima di rivolgerti al giudice, ti preghiamo di scrivere a {contact}: la maggior parte delle questioni si risolve con un messaggio."
        ]
      },
      {
        "heading": "15. Contatti",
        "paragraphs": [
          "Domande su questi termini, richieste e reclami vanno inviati a {contact}."
        ]
      }
    ]
  }
};
