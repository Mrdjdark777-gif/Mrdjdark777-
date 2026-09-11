import type { ru} from './ru';

// Română (Moldova). Tipul cere toate cheile din ru.ts — o traducere uitată nu compilează.
export const ro: Record<keyof typeof ru, string> = {

  "err.liveUpload": "Sunetul emisiunii nu a putut fi trimis pe server.",

  "err.liveRecorder": "Pentru transmisie ai nevoie de un browser cu înregistrare WebM/Opus. Actualizează Windows WebView2.",

  "err.liveLimit": "Ai atins limita emisiunii: până la 8 ore sau 1 GiB de sunet primit.",

  "err.liveSequence": "Ordinea transmisiei a fost întreruptă. Partea primită a fost salvată.",

  "err.livePreparing": "Serverul pregătește sunetul emisiunii.",

  "err.liveDisk": "Pe server a rămas puțin spațiu liber. Eliberează spațiu înainte de emisiune.",

  "err.liveWorker": "Serviciul de emisiuni nu este pornit pe server. Rulează instalarea de întreținere 0.9.",

  "post.liveArchive": "Înregistrarea emisiunii",

  "liveArchive.empty": "Aici vor apărea înregistrările emisiunilor tale.",

  "liveArchive.download": "Descarcă înregistrarea",

  "liveArchive.retryAction": "Reia procesarea",

  "liveArchive.failed": "Înregistrarea nu a putut fi procesată. Fragmentele primite au fost salvate.",

  "liveArchive.ready": "Înregistrarea este disponibilă la podcasturi",

  "liveArchive.processingState": "Pregătim înregistrarea",

  "liveArchive.closing": "Închidem înregistrarea",

  "liveArchive.receivingState": "Emisiunea se înregistrează",

  "liveArchive.title": "Înregistrările emisiunilor",

  "liveArchive.ended": "Emisiunea s-a încheiat. Înregistrarea va apărea la podcasturi după procesare.",

  "liveArchive.buffering": "Conectăm sunetul de pe server…",

  "liveArchive.processing": "Emisiunea s-a încheiat. Serverul pregătește înregistrarea — poți opri PC-ul.",

  "liveArchive.partial": "Transmisia s-a întrerupt. Serverul salvează partea primită; sunetul netrimis se poate să se fi pierdut.",

  "liveArchive.retry": "Reluăm transmisia către server…",

  "liveArchive.receiving": "Sunetul se transmite pe server și se salvează",

  "liveArchive.saving": "Trimitem ultimele secunde… Nu închide aplicația.",

  "donate.configure": "Adaugă un link",

  "donate.unavailable": "Autorul nu a adăugat încă un link pentru donații.",

  "donate.setup": "Adaugă-ți linkul: butonul va apărea la ascultători pe pagina principală și în emisiune.",

  "donate.free": "Tot conținutul este gratuit. Susținerea este doar opțională.",

  "donate.action": "Donație",

  "donate.boosty": "Boosty",

  "donate.paypal": "PayPal",

  "err.loginLimited": "Prea multe încercări. Așteaptă 10 minute.",

  "err.coverUrl": "Pentru copertă e nevoie de un link HTTPS.",

  "err.coverType": "Coperta trebuie să fie JPEG, PNG, WebP sau GIF",

  "err.coverSize": "Fișierul copertei — până la 12 MB",

  "err.coverEmpty": "Fișier de copertă gol",

  "err.coverUpload": "Coperta nu a putut fi încărcată",

  "err.coverNotFound": "Coperta încărcată nu a fost găsită",

  "editor.cover": "Copertă",

  "editor.coverUpload": "Încarcă o copertă",

  "editor.coverNote": "Copertă verticală 9:16 — de exemplu 1080×1920. Umple cardul pe înălțime; un alt raport se decupează din centru.",

  "editor.coverUrlPlaceholder": "sau lipește un link https://…",

  "editor.coverTooBig": "Fișierul copertei — până la 12 MB",

  "err.nativeUnavailable": "Actualizează aplicația și Android System WebView.",

  "err.notificationsBlocked": "Permite notificările din setările telefonului.",

  "err.playback": "Podcastul nu a putut fi redat. Verifică conexiunea și apasă redare.",

  "notif.blocked": "Telefonul blochează notificările True Thrills.",

  "notif.openSettings": "Setările telefonului",

  "notif.lastReceived": "Ultima notificare primită de telefon",

  "player.rate": "Viteză",

  "player.sleep": "Cronometru de adormire",

  "player.sleepOff": "Oprit",

  "player.minutes": "min",

  "home.continue": "Continuă să asculți",

  "home.latest": "Ultima publicare",

  "reader.size": "Mărimea textului",

  "common.retry": "Încearcă din nou",

  "common.refresh": "Reîmprospătează",

  "common.cancel": "Anulează",

  "common.login": "Intră",

  "common.loading": "Încărcăm studioul…",

  "common.link": "Link",

  "common.mb": "MB",

  "meta.title": "True Thrills — studio și podcasturi",

  "meta.description": "Podcasturi, povești și emisiuni live True Thrills.",

  "nav.podcasts": "Podcasturi",

  "nav.videos": "Video",

  "nav.home": "Acasă",

  "nav.stories": "Povești",

  "nav.live": "Live",

  "header.settings": "Setări",

  "header.support": "Donație",

  "header.toStudio": "În studio",

  "header.asListener": "Ca ascultător",

  "header.logout": "Ieși",

  "header.loginAuthor": "Intră ca autor",

  "setup.eyebrow": "TRUE THRILLS / PRIMA PORNIRE",

  "setup.title": "Studioul tău e gata\npentru prima înregistrare.",

  "setup.text": "Leagă studioul de contul tău. Doar tu vei putea publica episoade, scrie povești și porni emisiuni.",

  "setup.cta": "Deschide studioul meu",

  "setup.note": "Deocamdată aplicația este disponibilă doar ție. Accesul pentru public se activează separat.",

  "heading.eyebrowAuthor": "TRUE THRILLS / WORKSPACE",

  "heading.eyebrowListener": "TRUE THRILLS / PENTRU ASCULTĂTOR",

  "heading.homeAuthor": "Ce facem azi?",

  "heading.homeListener": "True Thrills",

  "heading.studio": "Totul începe cu vocea.",

  "heading.podcasts": "Podcasturi",

  "heading.videos": "Video",

  "heading.stories": "Povești",

  "heading.live": "Emisiune live",

  "heading.settings": "Setări",

  "desc.homeAuthor": "Înregistrare, video, poveste sau live — începe cu ce contează.",

  "desc.homeListener": "Video, podcasturi și povești — într-un singur loc.",

  "desc.studio": "Înregistrează. Povestește. Fă-te auzit.",

  "footer.tagline": "Povestea ta. Vocea ta.",

  "desc.podcastsAuthor": "Episoadele tale — de la ciornă la publicare.",

  "desc.podcastsListener": "Toate episoadele publicate True Thrills.",

  "desc.videosAuthor": "Linkurile către videoclipurile tale — ascultătorul le vede chiar aici.",

  "desc.videosListener": "Videoclipurile True Thrills — direct în aplicație.",

  "desc.storiesAuthor": "Locul poveștilor pe care vrei să le spui.",

  "desc.storiesListener": "Poveștile True Thrills în format text.",

  "desc.live": "Voce și ascultători. În timp real.",

  "desc.settingsAuthor": "Susținere, platforme și notificări.",

  "desc.settingsListener": "Notificări, platforme și susținerea autorului.",

  "home.record": "Înregistrează\nun episod",

  "home.addVideo": "Adaugă\nvideo",

  "home.writeStory": "Scrie\no poveste",

  "home.startLive": "Pornește\nemisiunea",

  "home.shareChannel": "Distribuie\ncanalul",

  "home.watchVideos": "Vezi\nvideo",

  "home.listenPodcasts": "Ascultă\npodcasturi",

  "home.readStories": "Citește\npovești",

  "home.liveNow": "Emisiune\nlive",

  "home.socialCaption": "Autorul pe alte platforme",

  "support.title": "Donație",

  "support.setupTitle": "Butonul de susținere nu este conectat",

  "support.setupText": "Adaugă un link de plată — va apărea la ascultători în antet și pe ecranul principal.",

  "support.subtitle": "Donație unică sau abonament pe pagina autorului.",

  "live.youAreListening": "ASCULȚI EMISIUNEA",

  "live.authorOnAir": "AUTORUL ESTE ÎN DIRECT",

  "live.open": "Deschide emisiunea",

  "live.continueListening": "Continuă să asculți",

  "live.enableSound": "Pornește sunetul",

  "live.connecting": "Ne conectăm…",

  "live.backToLive": "Înapoi la emisiune",

  "live.listen": "Ascultă emisiunea",

  "live.refreshFailed": "Starea emisiunii nu a putut fi actualizată.",

  "live.micOnNote": "Microfon pornit · emisiunea continuă",

  "live.stop": "Încheie emisiunea",

  "live.stopped": "Emisiune încheiată",

  "live.alreadyEnded": "Această emisiune s-a încheiat deja",

  "live.running": "Emisiunea e în desfășurare",

  "live.starting": "Pornim emisiunea…",

  "live.preparing": "Pregătirea emisiunii",

  "live.micReady": "Microfonul e gata. Poți verifica vocea.",

  "live.pickSource": "Alege mai întâi sursa de sunet.",

  "live.titleField": "Titlul emisiunii",

  "live.coverField": "Coperta emisiunii",

  "live.coverUpload": "Încarcă o copertă",

  "live.coverChange": "Alege alta",

  "live.coverNote": "Copertă verticală 9:16 — de exemplu 1080×1920. Se arată ascultătorilor pe pagina emisiunii și rămâne coperta episodului la podcasturi. Dacă nu încarci una, se ia bannerul general al canalului.",

  "live.titlePlaceholder": "Despre ce povestești azi?",

  "live.titleRequired": "Scrie titlul emisiunii",

  "live.micOff": "MICROFON OPRIT",

  "live.signalOnAir": "SEMNAL ÎN EMISIE",

  "live.voiceCheck": "PROBĂ DE VOCE",

  "live.listenersConnected": "ascultători conectați",

  "live.waitingFirst": "Așteptăm primul ascultător",

  "live.openListener": "Deschide vizualizarea ascultătorului",

  "live.copyLink": "Copiază linkul",

  "live.connectingShort": "Conectăm…",

  "live.stopCheck": "Oprește proba",

  "live.checkMic": "Verifică microfonul",

  "live.start": "Pornește emisiunea",

  "live.stopFromOtherWindow": "Încheie emisiunea din altă fereastră",

  "live.linkCopied": "Linkul ascultătorului a fost copiat",

  "live.linkCopyFailed": "Linkul nu a putut fi copiat. Folosește butonul de deschidere a ascultătorului.",

  "live.micLost": "Microfonul s-a deconectat — emisiunea s-a încheiat",

  "live.listeningNow": "Asculți emisiunea",

  "live.paused": "În pauză",

  "live.reconnecting": "Restabilim legătura",

  "live.connectingState": "Conectare",

  "live.needSound": "Trebuie să pornești sunetul",

  "live.connectFailed": "Conectarea nu a reușit",

  "live.ended": "Emisiune încheiată",

  "live.authorOnAirPlain": "Autorul e în direct",

  "live.noneNow": "Acum nu e nicio emisiune",

  "live.tapToConnect": "Apasă «Ascultă emisiunea» ca să te conectezi.",

  "live.willAppearHere": "Când autorul pornește emisiunea, va apărea aici.",

  "live.pause": "Pauză",

  "live.resume": "Continuă să asculți",

  "live.reconnectingShort": "Restabilim legătura…",

  "live.leave": "Ieși din emisiune",

  "live.tryAgain": "Mai încearcă o dată",

  "live.check": "Verifică emisiunea",

  "live.volumeOff": "Volumul este oprit",

  "live.playing": "Emisiunea e în desfășurare",

  "live.volume": "Volum",

  "live.volumeAria": "Volumul emisiunii",

  "live.infoAuthor": "Controlul emisiunii",

  "live.infoListener": "Ascultare",

  "live.authorTip1": "Verifică unda înainte de emisiune. Lista microfoanelor e disponibilă fără înregistrare.",

  "live.authorTip2": "Amplificarea și oprirea microfonului funcționează în timpul emisiunii.",

  "live.authorTip3": "După încheiere așteaptă trimiterea ultimelor secunde. Apoi poți opri PC-ul.",

  "live.listenerTip1": "Emisiunea trece prin server. În Android 0.9 sunetul e redat de un serviciu separat.",

  "live.listenerTip2": "Volumul se schimbă de aici sau din butoanele telefonului.",

  "live.pilotTitle": "Transmisiune de probă",

  "live.pilotText": "Începe cu un grup mic, până la 8 ascultători. Sunetul trece prin server cu o mică întârziere.",

  "live.pilotNoRecord": "Emisiunea se salvează pe server și apare automat la podcasturi după procesare.",

  "live.otherNetwork": "Verifică internetul și încearcă să te conectezi din nou.",

  "studio.panelTitle": "ÎNREGISTRARE PODCAST",

  "studio.paused": "PAUZĂ",

  "studio.rec": "REC",

  "studio.ready": "GATA DE ÎNREGISTRARE",

  "studio.waiting": "ÎN AȘTEPTARE",

  "studio.levelAria": "Nivelul semnalului microfonului",

  "studio.incomingSignal": "SEMNAL DE INTRARE",

  "studio.noSignal": "FĂRĂ SEMNAL",

  "studio.stopRecording": "Încheie înregistrarea",

  "studio.continue": "Continuă",

  "studio.pause": "Pauză",

  "studio.newRecording": "Înregistrare nouă",

  "studio.startRecording": "Începe înregistrarea",

  "studio.uploadAudio": "Încarcă audio",

  "studio.checkTip": "Verifică unda și nivelul vocii înainte de înregistrare.",

  "studio.connecting": "Conectare…",

  "studio.disconnectInput": "Deconectează intrarea",

  "studio.checkInput": "Verifică intrarea",

  "studio.liveCardTitle": "Mai aproape de ascultători.",

  "studio.liveCardText": "Intră în direct și spune povestea cu vocea ta.",

  "studio.prepareLive": "Pregătește emisiunea",

  "studio.pilotFootnote": "Pilot: până la 8 ascultători",

  "studio.quickStoryTitle": "Ai ceva de povestit?",

  "studio.quickStoryText": "Creează o poveste în text.",

  "studio.writeStory": "Scrie o poveste",

  "studio.lastRecording": "Ultima înregistrare",

  "studio.localDraft": "Ciornă pe acest dispozitiv",

  "studio.download": "Descarcă",

  "studio.preparing": "Pregătim înregistrarea…",

  "studio.publishEpisode": "Pregătește episodul",

  "studio.libraryTitle": "Biblioteca ta",

  "studio.librarySubtitle": "Conținutul care rămâne.",

  "studio.supportTile": "Susținere",

  "studio.donationSet": "Linkul este conectat",

  "studio.donationMissing": "Adaugă un link pentru donații",

  "studio.monitorDaw": "Pentru monitorizarea FL Studio: căștile în Komplete, INPUT/HOST pe HOST; ascultarea CABLE Output — în Komplete 1/2.",

  "studio.monitorMic": "Pentru monitorizarea vocii folosește căști și Direct Monitor de pe interfața audio.",

  "studio.uploadEpisode": "Încarcă un episod",

  "studio.newStory": "Scrie o poveste",

  "studio.ready0": "Studioul e gata",

  "filter.all": "Toate",

  "filter.published": "Publicate",

  "filter.drafts": "Ciorne",

  "empty.sectionEmpty": "Secțiunea este încă goală",

  "empty.firstPodcast": "Aici va apărea primul episod",

  "empty.firstVideo": "Aici va apărea primul videoclip",

  "empty.firstStory": "Aici va apărea prima poveste",

  "empty.listener": "Autorul nu a adăugat încă publicații în această secțiune.",

  "empty.podcastHint": "Înregistrează un podcast în studio sau încarcă un fișier audio gata făcut.",

  "empty.videoHint": "Adaugă un link de pe YouTube, Rutube, VK sau TikTok — se va reda chiar aici.",

  "empty.storyHint": "Scrie o poveste și publică-o pentru ascultători.",

  "empty.toStudio": "În studio",

  "empty.addVideo": "Adaugă video",

  "post.podcast": "PODCAST",

  "post.video": "VIDEO",

  "post.story": "POVESTE",

  "post.published": "Publicat",

  "post.draft": "Ciornă",

  "post.listen": "Ascultă",

  "post.watch": "Vezi",

  "post.read": "Citește",

  "post.listenAria": "Ascultă {title}",

  "post.watchAria": "Vezi {title}",

  "post.readAria": "Citește {title}",

  "post.edit": "Editează",

  "post.unpublish": "Retrage din publicare",

  "post.publish": "Publică",

  "post.delete": "Șterge",

  "post.defaultVideo": "Video True Thrills",

  "post.defaultPodcast": "Episod audio True Thrills",

  "post.movedToDrafts": "Mutat la ciorne",

  "post.publishedToast": "Publicat",

  "post.gone": "Publicarea nu mai este disponibilă",

  "editor.editing": "Editare",

  "editor.newStory": "Poveste nouă",

  "editor.newVideo": "Video nou",

  "editor.newPodcast": "Pregătește podcastul",

  "editor.storyHint": "Salvează ciorna sau publică povestea.",

  "editor.videoHint": "Lipește linkul videoclipului — ascultătorul îl va vedea în aplicație.",

  "editor.podcastHint": "Adaugă titlul și descrierea episodului.",

  "editor.title": "Titlu",

  "editor.titleStory": "Titlul poveștii",

  "editor.titleVideo": "Titlul videoclipului",

  "editor.titleEpisode": "Titlul episodului",

  "editor.description": "Descriere scurtă",

  "editor.descriptionPlaceholder": "Câteva cuvinte pentru ascultător",

  "editor.storyText": "Textul poveștii",

  "editor.storyPlaceholder": "Începe să povestești…",

  "editor.videoUrl": "Linkul videoclipului",

  "editor.videoNote": "YouTube, Rutube, VK Video, TikTok sau un link direct către un fișier MP4. Restul linkurilor se deschid pe platformă.",

  "editor.audioOfEpisode": "Audio episodului",

  "editor.audioReady": "{size} MB · gata de încărcat",

  "editor.audioMissing": "Nu e ales niciun fișier audio",

  "editor.toDrafts": "La ciorne",

  "editor.publish": "Publică",

  "editor.saving": "Salvăm…",

  "editor.needTitle": "Scrie un titlu",

  "editor.needStory": "Adaugă textul poveștii",

  "editor.needVideoUrl": "Adaugă linkul videoclipului",

  "editor.needAudio": "Întâi înregistrează sau încarcă audio",

  "editor.publishedToast": "Publicat",

  "editor.draftSaved": "Ciornă salvată",

  "editor.previewTitle": "Previzualizare",

  "reading.eyebrow": "TRUE THRILLS / POVESTE",

  "watching.eyebrow": "TRUE THRILLS / VIDEO",

  "confirm.deleteTitle": "Ștergi «{title}»?",

  "confirm.deleteText": "Publicarea și înregistrarea ei audio vor fi șterse. Acțiunea nu poate fi anulată.",

  "confirm.deleted": "Șters",

  "confirm.discardTitle": "Închizi fără să salvezi?",

  "confirm.discardText": "Modificările textului nu vor fi salvate.",

  "confirm.keepEditing": "Continuă editarea",

  "confirm.close": "Închide",

  "confirm.replaceTitle": "Începi o înregistrare nouă?",

  "confirm.replaceText": "Înregistrarea nouă va înlocui ciorna audio locală. Descarcă sau publică mai întâi înregistrarea anterioară, dacă îți trebuie.",

  "settings.supportTitle": "Butonul de susținere",

  "settings.supportText": "Adaugă linkurile Boosty și PayPal — butonul «Susține» va apărea în antet și pe ecranul principal al ascultătorului. Poți completa un serviciu sau pe amândouă.",

  "settings.saveDonation": "Salvează linkurile",

  "settings.donationSaved": "Link salvat",

  "settings.donationNote": "Plățile sunt procesate de serviciul ales. Aplicația nu păstrează datele cardurilor.",

  "settings.artTitle": "Fundalul notificărilor și al emisiunii",

  "settings.artText": "Imaginea apare în notificarea de redare în fundal (ca o copertă de album) și ca fundal al transmisiunii, dacă episodul nu are copertă proprie. Merge bannerul canalului tău.",

  "settings.artUpload": "Încarcă o imagine",

  "settings.saveArt": "Salvează",

  "settings.artSaved": "Imagine salvată",

  "settings.artNote": "Recomandăm o imagine lată (ca bannerul unui canal YouTube), până la 12 MB.",

  "settings.linksTitle": "Platformele tale",

  "settings.linksText": "Linkurile vor apărea pe ecranul principal al ascultătorului. Un câmp gol scoate platforma.",

  "settings.saveLinks": "Salvează linkurile",

  "settings.linksSaved": "Linkuri salvate",

  "settings.linksNote": "Se acceptă doar adrese HTTPS. Linkurile se deschid în aplicația externă a platformei.",

  "settings.authorTitle": "Autor",

  "settings.authorText": "Susține True Thrills sau intră pe celelalte platforme ale autorului.",

  "settings.channelLinkCopied": "Linkul canalului a fost copiat",

  "settings.channelLinkFailed": "Linkul nu a putut fi copiat.",

  "social.youtube": "YouTube",

  "social.tiktok": "TikTok",

  "social.instagram": "Instagram",

  "social.telegram": "Telegram",

  "social.vk": "VKontakte",

  "social.site": "Site sau altceva",

  "video.watchOnPlatform": "Vezi pe platformă",

  "notif.title": "Notificări pe acest dispozitiv",

  "notif.text": "Primește notificări despre emisiuni și publicări. Nu e nevoie de înregistrare.",

  "notif.optLive": "Începutul emisiunii",

  "notif.optPodcast": "Podcast sau video nou",

  "notif.optStory": "Poveste nouă",

  "notif.enable": "Pornește notificările",

  "notif.disable": "Oprește notificările",

  "notif.test": "Verifică livrarea",

  "notif.unsupported": "Pentru notificări deschide adresa securizată True Thrills (HTTPS) în Chrome pe Android.",

  "notif.note": "Notificările ajung chiar dacă aplicația nu e deschisă. Pentru ecranul de blocare permite-le din setările Android. Economisirea bateriei și oprirea forțată a aplicației (sau a Chrome, dacă intri din browser) pot împiedica livrarea.",

  "notif.enabled": "Notificările sunt pornite pe acest dispozitiv. Verifică livrarea.",

  "notif.disabled": "Notificările sunt oprite.",

  "notif.reEnable": "Pornește notificările din nou.",

  "notif.bridgeMissing": "Puntea pentru notificări nu este disponibilă.",

  "notif.permissionHint": "Permite notificările site-ului în Chrome și notificările Chrome în setările Android.",

  "notif.acceptedFull": "Serviciul a acceptat mesajul. Verifică bara de notificări. Dacă nu apare — verifică permisiunile Chrome și modul «Nu deranja».",

  "notif.accepted": "Serviciul a acceptat mesajul. Verifică bara de notificări.",

  "notif.startFailed": "Notificările nu au pornit. Actualizează aplicația.",

  "notif.androidEnableFailed": "Notificările nu au putut fi pornite. Verifică conexiunea.",

  "push.newPodcast": "Podcast nou True Thrills",

  "push.newVideo": "Video nou True Thrills",

  "push.newStory": "Poveste nouă True Thrills",

  "push.liveTitle": "True Thrills e în direct",

  "push.testTitle": "Verificarea notificărilor",

  "push.testBody": "Emisiunile și publicările noi vor ajunge aici.",

  "push.fallbackTitle": "Publicare nouă",

  "player.album": "Podcasturi",

  "player.aria": "Player: {title}",

  "player.close": "Închide playerul",

  "player.back15": "Înapoi 15 secunde",

  "player.forward15": "Înainte 15 secunde",

  "player.play": "Ascultă",

  "player.pause": "Pauză",

  "player.seekAria": "Derularea podcastului",

  "player.seekValue": "{position} din {duration}",

  "player.measuring": "Calculăm durata…",

  "player.tapToPlay": "Apasă «Ascultă» ca să pornești sunetul.",

  "player.seekFailed": "Derularea nu a reușit. Așteaptă să se încarce înregistrarea.",

  "player.preparingSeek": "Pregătim durata și derularea…",

  "player.loadFailed": "Podcastul nu a putut fi încărcat",

  "player.tooBig": "Înregistrarea depășește 80 MB",

  "player.unavailable": "Audio indisponibil. Încearcă să deschizi podcastul din nou.",

  "player.tapInPlayer": "Apasă redare în player",

  "input.howSound": "Cum intră sunetul",

  "input.mic": "Microfon / interfață audio",

  "input.daw": "Sunet din FL Studio",

  "input.dawHelp": "Alege CABLE Output. În FL Studio trimite Master în CABLE Input, lasă Stereo separation la centru. Vocea, muzica și efectele vor intra împreună.",

  "input.source": "Sursa de sunet",

  "input.savedSource": "Sursă salvată · reîmprospătează lista",

  "input.systemDefault": "Dispozitivul implicit Windows",

  "input.micNumbered": "Microfon {number}",

  "input.channel": "Canalul de intrare",

  "input.channel1": "Intrarea 1 → mono",

  "input.channel2": "Intrarea 2 → mono",

  "input.channelStereo": "Intrările 1 + 2 → stereo",

  "input.searching": "Căutăm dispozitive…",

  "input.refreshDevices": "Reîmprospătează dispozitivele",

  "input.allowAndFind": "Permite microfonul și caută dispozitive",

  "input.listOnlyNote": "Accesul e necesar doar pentru lista de intrări. Înregistrarea nu pornește.",

  "input.noSignal": "Fără semnal",

  "input.tooLoud": "Prea tare. Scade amplificarea ca să eviți distorsiunile.",

  "input.gain": "Amplificarea sunetului de intrare",

  "input.muteAll": "Oprește tot sunetul de intrare",

  "input.lowCut": "Tăierea frecvențelor joase · 80 Hz",

  "capture.noRecorder": "Browserul nu acceptă înregistrarea audio",

  "capture.needHttpsRecord": "Pentru înregistrare e nevoie de HTTPS. Deschide True Thrills pe adresa securizată.",

  "capture.needHttpsMic": "Microfonul e disponibil doar pe HTTPS. Deschide adresa securizată True Thrills.",

  "capture.unsupportedBrowser": "Înregistrarea nu este acceptată. Folosește Edge sau Chrome.",

  "capture.openInChrome": "Deschide aplicația în Edge sau Chrome și permite microfonul.",

  "capture.devicesUnavailable": "Dispozitivele audio nu sunt disponibile în acest browser.",

  "capture.allowMicWindow": "Permite accesul la microfon în fereastra aplicației.",

  "capture.allowMic": "Permite aplicației accesul la microfon.",

  "capture.micNotFound": "Microfonul nu a fost găsit. Verifică conectarea interfeței audio.",

  "capture.inputUnavailable": "Intrarea aleasă nu este disponibilă. Reîmprospătează lista dispozitivelor.",

  "capture.interfaceLost": "Interfața audio s-a deconectat",

  "capture.monoOnly": "Dispozitivul dă mono. Pentru stereo verifică sursa și setările Windows.",

  "capture.stoppedAtLimit": "Înregistrarea s-a oprit la 75 MB. Salvează episodul.",

  "capture.recordError": "Eroare de înregistrare. Salvează fragmentul disponibil.",

  "capture.draftNotSaved": "Ciorna nu s-a salvat pe dispozitiv. Descarcă înregistrarea înainte de a închide.",

  "capture.preparedPartly": "Înregistrarea inițială e salvată, dar pregătirea nu s-a terminat. ",

  "capture.tooBigUpload": "Maximum 80 MB pe înregistrare",

  "capture.emptyFile": "Fișierul audio este gol",

  "capture.uploadFailed": "Fișierul audio nu s-a încărcat",

  "audio.prepareFailed": "Audio nu a putut fi pregătit. Actualizează aplicația și încearcă din nou.",

  "audio.cancelled": "Anulat",

  "audio.tooBig": "Fișierul audio trebuie să aibă până la 80 MB",

  "audio.noTrack": "În fișier nu s-a găsit nicio pistă audio",

  "audio.singleTrack": "Pentru această înregistrare e nevoie de un fișier audio cu o singură pistă",

  "audio.noDuration": "Durata înregistrării nu a putut fi determinată",

  "audio.prepareRecordFailed": "Înregistrarea nu a putut fi pregătită",

  "audio.formatFailed": "Formatul înregistrării nu a putut fi citit",

  "liveHook.starting": "Pornim emisiunea…",

  "liveHook.started": "Emisiunea a pornit",

  "liveHook.startFailed": "Emisiunea nu a putut fi pornită",

  "liveHook.lost": "Legătura s-a pierdut. Verifică internetul și pornește emisiunea din nou.",

  "liveHook.stoppedLost": "Emisiune oprită: legătura s-a pierdut",

  "liveHook.finished": "Emisiune încheiată",

  "liveHook.connectingToAuthor": "Ne conectăm la autor…",

  "liveHook.connected": "Conexiune stabilită. Așteptăm sunetul…",

  "liveHook.listening": "Asculți emisiunea în direct",

  "liveHook.soundReady": "Sunetul e gata. Apasă «Pornește sunetul».",

  "liveHook.tapToEnable": "Apasă «Pornește sunetul» ca să permiți redarea.",

  "liveHook.playFailed": "Sunetul nu a putut fi redat. Conectează-te din nou.",

  "liveHook.noSound": "Nu am reușit să primim sunetul. Încearcă să te conectezi din nou.",

  "liveHook.paused": "Ascultarea e în pauză",

  "liveHook.authorEnded": "Autorul a încheiat emisiunea",

  "liveHook.reconnecting": "Legătura s-a întrerupt. Ne reconectăm…",

  "liveHook.reconnectingServer": "Restabilim legătura cu serverul…",

  "liveHook.failed": "Conexiunea nu s-a stabilit. Încearcă altă rețea și conectează-te din nou.",

  "liveHook.title": "Emisiune live",

  "login.title": "Intrare în studio",

  "login.password": "Parola autorului",

  "login.passwordPlaceholder": "Parolă",

  "login.busy": "Intrăm…",

  "login.failed": "Intrarea nu a reușit",

  "err.serverDown": "Serverul nu răspunde. Reîmprospătează pagina și verifică dacă ești autentificat.",

  "err.server": "Eroare de server",

  "err.generic": "Acțiunea nu a putut fi executată",

  "err.request": "Cererea nu a putut fi executată",

  "err.ownerOnly": "Acces doar pentru autor",

  "err.badOrigin": "Sursa cererii nu este permisă",

  "err.signIn": "Autentifică-te în cont",

  "err.studioClaimed": "Studioul este deja atribuit unui autor",

  "err.donationsUrl": "E nevoie de linkuri HTTPS către Boosty sau PayPal",

  "err.linksUrl": "E nevoie de linkuri HTTPS către platforme cunoscute",

  "err.titleLength": "Scrie un titlu de până la 160 de caractere",

  "err.badKind": "Tip de publicare greșit",

  "err.storyTooLong": "Povestea este prea lungă",

  "err.storyEmpty": "Adaugă textul poveștii",

  "err.videoUrl": "E nevoie de un link HTTPS către video (YouTube, Rutube, VK, TikTok sau un fișier)",

  "err.videoUrlLong": "Linkul videoclipului este prea lung",

  "err.audioMissing": "Adaugă o înregistrare audio",

  "err.audioNotFound": "Fișierul audio nu a fost găsit",

  "err.badLocale": "Limbă necunoscută",

  "err.uploadSize": "Indică mărimea fișierului: de la 1 octet până la 80 MB",

  "err.uploadEmpty": "Fișier gol",

  "err.uploadMismatch": "Fișierul încărcat nu se potrivește ca mărime cu cea declarată",

  "err.uploadType": "Sunt acceptate MP3, WAV, M4A, WebM, OGG și FLAC",

  "err.badStorageKey": "Cheie de stocare nepermisă",

  "err.notFound": "Nu a fost găsit",

  "err.liveTitle": "Scrie titlul emisiunii",

  "err.liveBusy": "Altă emisiune este deja în desfășurare. Încheie-o mai întâi.",

  "err.liveGone": "Emisiunea s-a încheiat deja",

  "err.liveFull": "Emisiunea de probă este plină: până la 8 ascultători",

  "err.badOffer": "Conectare incorectă",

  "err.badAnswer": "Răspuns incorect",

  "err.sessionGone": "Sesiunea nu a fost găsită",

  "err.badPassword": "Parolă greșită",

  "err.unknownAction": "Acțiune necunoscută",

  "err.badPreferences": "Setări incorecte",

  "err.deviceLimit": "Limita pilotului — 100 de dispozitive cu notificări.",

  "err.subscriptionMissing": "Abonamentul nu a fost găsit",

  "err.subscriptionOther": "Abonamentul aparține altui dispozitiv",

  "err.resubscribe": "Oprește și pornește din nou notificările pe acest dispozitiv.",

  "err.testTooSoon": "Reia verificarea peste 30 de secunde",

  "err.testRejected": "Serviciul nu a acceptat notificarea. Oprește și pornește notificările din nou.",

  "err.badSubscription": "Abonament incorect",

  "err.badSubscriptionKey": "Cheie de abonament incorectă",

  "err.badToken": "Token de notificări incorect",

  "err.pushUnsupported": "Notificările sunt acceptate în Chrome pe Android și în Firefox.",

  "err.fcmNotConfigured": "Notificările pentru Android nu sunt configurate pe server (FIREBASE_SERVICE_ACCOUNT_FILE).",

  "err.fcmToken": "Nu s-a putut obține tokenul de acces Firebase",
};
