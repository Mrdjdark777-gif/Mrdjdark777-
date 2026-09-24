import type {LegalPack} from './types';

export const it: LegalPack = {
  updated: '2026-09-25',
  privacy: {
    title: 'Informativa sulla privacy',
    intro:
      'True Thrills è un canale con podcast, video, testi e dirette. L’app e il sito girano sul server dell’autore e non mostrano pubblicità. Questo documento spiega quali dati passano dal servizio, perché e cosa puoi farci.',
    sections: [
      {
        heading: 'Chi tratta i dati',
        paragraphs: [
          'Il titolare del trattamento è {controller}. Per qualsiasi domanda su questo documento scrivi a {contact}.',
          'Il sito e l’app girano su un server in affitto (Oracle Cloud). I dati restano su quel server e in copie cifrate che l’autore conserva fuori dal server.',
        ],
      },
      {
        heading: 'Cosa resta solo sul tuo dispositivo',
        paragraphs: [
          'L’app ricorda nella memoria del browser o della WebView alcune cose, per non ricominciare ogni volta da capo. Queste annotazioni non vanno da nessuna parte: né al server né a terzi.',
        ],
        bullets: [
          'il punto in cui ti sei fermato in un episodio e la sua durata;',
          'quali pubblicazioni hai già aperto — così l’etichetta «nuovo» sparisce;',
          'quali schede hai tolto dalla pagina principale e quale riga «Continua» hai nascosto;',
          'la posizione e la dimensione del testo nelle storie scritte.',
        ],
      },
      {
        heading: 'Cosa arriva al server',
        bullets: [
          'Il normale registro del server web: indirizzo IP, ora, indirizzo della pagina, versione del browser. Serve a vedere i guasti e a distinguere le persone dai robot. La durata la decide la rotazione dei log del sistema operativo.',
          'Le notifiche — solo se le hai attivate: l’indirizzo dell’abbonamento del tuo browser o il token del dispositivo Android, la lingua scelta, i temi selezionati e il momento dell’iscrizione. Senza questi la notifica non ha dove arrivare.',
          'La diretta: l’audio arriva via HTTPS dallo stesso server. Per la durata della diretta viene rilasciata una chiave temporanea di ascolto, perché il link non possa essere passato all’esterno.',
        ],
      },
      {
        heading: 'A chi vanno i dati all’esterno',
        bullets: [
          'Google (Firebase Cloud Messaging) — consegna le notifiche su Android. Google riceve il token del dispositivo e il testo della notifica. Senza notifiche attive non c’è nessuna richiesta a Google.',
          'Oracle Cloud — l’hosting del server. Come ogni hosting, ha tecnicamente accesso ai dischi della macchina.',
          'A nessun altro. Nell’app non ci sono reti pubblicitarie, contatori, pixel o analisi di terze parti.',
        ],
      },
      {
        heading: 'Commenti e profilo dell’ascoltatore',
        paragraphs: [
          'Nell’app esiste il codice della community: un profilo con pseudonimo e i commenti in diretta. Finché è spento, non viene creato né conservato alcun profilo e alcun commento.',
          'Quando l’autore lo accenderà, il profilo nasce senza nome, e-mail o telefono: l’app assegna uno pseudonimo e un codice personale di accesso. Sul server non si conserva il codice, ma la sua impronta irreversibile.',
        ],
        bullets: [
          'pseudonimo e impronta del codice di accesso — finché il profilo esiste;',
          'impronte delle sessioni attive — una settimana dall’ultimo utilizzo;',
          'commenti, segnalazioni ed elenchi di bloccati — fino a trenta giorni, poi si cancellano da soli;',
          'la cancellazione del profilo elimina tutto quanto elencato, subito e senza possibilità di recupero.',
        ],
      },
      {
        heading: 'Per quanto tempo',
        bullets: [
          'Pubblicazioni del canale e registrazioni delle dirette — finché l’autore non le elimina.',
          'Iscrizione alle notifiche — finché non la disattivi o finché il dispositivo smette di riceverle.',
          'Commenti della community — trenta giorni.',
          'Registro del server web — secondo la rotazione dei log del sistema operativo.',
          'Copie cifrate del database — al massimo le ultime trenta; le vecchie si cancellano da sole.',
        ],
      },
      {
        heading: 'I tuoi diritti',
        paragraphs: [
          'Puoi chiedere quali dati esistono su di te, ottenerne una copia, chiederne la correzione o la cancellazione, opporti al trattamento e revocare il consenso alle notifiche. Invia la richiesta a {contact}; la risposta arriva entro trenta giorni.',
          'Se usi un profilo della community, esportazione e cancellazione sono disponibili direttamente nell’app, senza scrivere a nessuno.',
          'Se ritieni che i tuoi diritti siano stati violati, puoi rivolgerti all’autorità di controllo per la protezione dei dati del tuo Paese.',
        ],
      },
      {
        heading: 'Basi giuridiche',
        bullets: [
          'Consenso — notifiche e profilo della community. Revocabile in qualsiasi momento, disattivandoli nell’app.',
          'Legittimo interesse — il registro del server web e la protezione dagli abusi: senza di esso il servizio non si può né mantenere né difendere.',
          'Esecuzione della tua richiesta — mostrare gli episodi e le dirette per cui sei arrivato.',
        ],
      },
      {
        heading: 'Minori',
        paragraphs: [
          'Il servizio non è destinato a minori di 13 anni, e il profilo della community a minori di 16 anni o dell’età del consenso prevista dalla legge del tuo Paese. Non verifichiamo l’età e non la raccogliamo. Se dati simili ci sono arrivati per errore, scrivi a {contact} e li cancelleremo.',
        ],
      },
      {
        heading: 'Sicurezza',
        paragraphs: [
          'Il collegamento al servizio è protetto da HTTPS. L’app gira con un utente di sistema senza shell e senza diritti di amministratore. Le copie dei dati vengono cifrate prima di lasciare il server. Il codice personale di accesso alla community è conservato solo come impronta irreversibile.',
          'Nessun metodo di conservazione offre una garanzia totale. Se si verifica una violazione che riguarda i tuoi dati, l’autore lo comunicherà nell’app e su {site}.',
        ],
      },
      {
        heading: 'Modifiche',
        paragraphs: [
          'Il documento può cambiare. La data dell’ultima modifica è in cima alla pagina. Le modifiche rilevanti saranno annunciate nell’app prima che entrino in vigore.',
        ],
      },
    ],
  },
  rules: {
    title: 'Regole e condizioni',
    intro:
      'Regole brevi: cosa si può fare, cosa no e cosa succede in caso di violazione. Usando l’app le accetti.',
    sections: [
      {
        heading: 'Contenuti del canale',
        paragraphs: [
          'Tutti gli episodi, i video, i testi, le copertine e le registrazioni delle dirette appartengono all’autore del canale. Puoi ascoltarli, guardarli e leggerli liberamente. Copiare, ricaricare, ridoppiare e distribuire — solo con permesso scritto.',
        ],
      },
      {
        heading: 'Regole della community',
        paragraphs: ['Se l’autore ha attivato i commenti, in essi sono vietati:'],
        bullets: [
          'minacce, insulti, molestie e istigazione all’odio;',
          'spam, pubblicità e link di qualsiasi tipo;',
          'materiali illegali e istigazione a reati;',
          'dati personali altrui — indirizzi, telefoni, corrispondenza;',
          'fingersi l’autore del canale o un’altra persona.',
        ],
      },
      {
        heading: 'Moderazione',
        paragraphs: [
          'I commenti appaiono subito e l’autore li controlla. La violazione porta alla rimozione del messaggio e, se ripetuta, al blocco del profilo. La decisione viene spiegata: il commento rimosso mostra il motivo a chi l’ha scritto.',
          'Non sei d’accordo con la decisione — scrivi a {contact}. L’autore risponde entro trenta giorni.',
        ],
      },
      {
        heading: 'Sostegno all’autore',
        paragraphs: [
          'Il sostegno è volontario. Non compra nulla: non ci sono e non ci saranno episodi riservati, privilegi, distintivi o priorità nei commenti a pagamento — tutti i contenuti restano gratuiti per tutti.',
          'I soldi vanno al server, all’attrezzatura e al lavoro. Il sostegno volontario non è rimborsabile; le condizioni di rimborso le stabilisce la piattaforma con cui hai pagato.',
        ],
      },
      {
        heading: 'Responsabilità',
        paragraphs: [
          'Il servizio è fornito così com’è. L’autore non promette un funzionamento ininterrotto: è un progetto personale su un solo server. L’autore non risponde del contenuto dei commenti altrui, ma rimuove le violazioni quando ne viene a conoscenza.',
        ],
      },
      {
        heading: 'Cessazione',
        paragraphs: [
          'Puoi smettere di usare il servizio in qualsiasi momento: elimina l’app, disattiva le notifiche, cancella il profilo della community. L’autore può chiudere l’accesso a un profilo che viola le regole e può chiudere del tutto il servizio, annunciandolo nell’app.',
        ],
      },
    ],
  },
};
