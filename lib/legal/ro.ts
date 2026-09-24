import type {LegalPack} from './types';

export const ro: LegalPack = {
  updated: '2026-09-25',
  privacy: {
    title: 'Politica de confidențialitate',
    intro:
      'True Thrills este un canal cu podcasturi, videoclipuri, texte și transmisiuni în direct. Aplicația și site-ul rulează pe serverul propriu al autorului și nu afișează reclame. Acest document explică ce date trec prin serviciu, de ce și ce se poate face cu ele.',
    sections: [
      {
        heading: 'Cine prelucrează datele',
        paragraphs: [
          'Responsabil de prelucrare este {controller}. Pentru orice întrebare legată de acest document, scrie la {contact}.',
          'Site-ul și aplicația rulează pe un server închiriat (Oracle Cloud). Datele sunt păstrate pe acest server și în copii criptate pe care autorul le ține în afara serverului.',
        ],
      },
      {
        heading: 'Ce rămâne doar pe dispozitivul tău',
        paragraphs: [
          'Aplicația reține în memoria browserului sau a WebView câteva lucruri, ca să nu începi de fiecare dată de la zero. Aceste însemnări nu pleacă nicăieri: nici la server, nici la terți.',
        ],
        bullets: [
          'locul în care te-ai oprit într-un episod și durata lui;',
          'ce publicații ai deschis deja — ca eticheta „nou” să dispară;',
          'ce carduri ai scos de pe pagina principală și ce rând „Continuă” ai ascuns;',
          'poziția și mărimea literei în poveștile scrise.',
        ],
      },
      {
        heading: 'Ce ajunge pe server',
        bullets: [
          'Jurnalul obișnuit al serverului web: adresa IP, ora, adresa paginii, versiunea browserului. Este necesar pentru a vedea defecțiunile și a deosebi oamenii de roboți. Durata păstrării o stabilește rotația jurnalelor sistemului de operare.',
          'Notificările — doar dacă le-ai activat: adresa abonamentului browserului tău sau tokenul dispozitivului Android, limba aleasă, temele selectate și momentul abonării. Fără acestea notificarea nu are unde să ajungă.',
          'Transmisiunea: sunetul vine prin HTTPS de pe același server. Pe durata transmisiunii se eliberează o cheie temporară de ascultător, ca linkul să nu poată fi împărțit în afară.',
        ],
      },
      {
        heading: 'Cui pleacă datele în afară',
        bullets: [
          'Google (Firebase Cloud Messaging) — livrează notificările pe Android. Google primește tokenul dispozitivului și textul notificării. Fără notificări activate nu există nicio cerere către Google.',
          'Oracle Cloud — găzduirea serverului. Ca orice găzduire, are tehnic acces la discurile mașinii.',
          'Nimănui altcuiva. În aplicație nu există rețele publicitare, contoare, pixeli sau analiză de la terți.',
        ],
      },
      {
        heading: 'Comentariile și profilul ascultătorului',
        paragraphs: [
          'În aplicație există codul comunității: un profil sub pseudonim și comentarii în transmisiune. Cât timp este oprit, nu se creează și nu se păstrează niciun profil și niciun comentariu.',
          'Când autorul îl va porni, profilul se creează fără nume, e-mail sau telefon: aplicația dă un pseudonim și un cod personal de acces. Pe server nu se păstrează codul însuși, ci amprenta lui ireversibilă.',
        ],
        bullets: [
          'pseudonimul și amprenta codului de acces — cât timp profilul există;',
          'amprentele sesiunilor active — o săptămână de la ultima folosire;',
          'comentariile, sesizările și listele de blocați — până la treizeci de zile, apoi se șterg singure;',
          'ștergerea profilului șterge tot ce s-a enumerat, imediat și fără posibilitate de recuperare.',
        ],
      },
      {
        heading: 'Cât timp se păstrează',
        bullets: [
          'Publicațiile canalului și înregistrările transmisiunilor — până când autorul le șterge.',
          'Abonamentul la notificări — până îl oprești sau până dispozitivul încetează să primească notificări.',
          'Comentariile comunității — treizeci de zile.',
          'Jurnalul serverului web — după rotația jurnalelor sistemului de operare.',
          'Copiile criptate ale bazei — cel mult ultimele treizeci; cele vechi se șterg singure.',
        ],
      },
      {
        heading: 'Drepturile tale',
        paragraphs: [
          'Poți cere ce date există despre tine, o copie a lor, corectarea sau ștergerea lor, te poți opune prelucrării și îți poți retrage consimțământul pentru notificări. Trimite cererea la {contact}; răspunsul vine în treizeci de zile.',
          'Dacă folosești un profil de comunitate, exportul și ștergerea sunt disponibile direct în aplicație, fără corespondență.',
          'Dacă consideri că drepturile tale au fost încălcate, te poți adresa autorității de supraveghere a protecției datelor din țara ta.',
        ],
      },
      {
        heading: 'Temeiurile prelucrării',
        bullets: [
          'Consimțământul — notificările și profilul de comunitate. Se retrage oricând, oprindu-le din aplicație.',
          'Interesul legitim — jurnalul serverului web și protecția împotriva abuzurilor: fără el serviciul nu poate fi nici întreținut, nici apărat.',
          'Îndeplinirea cererii tale — afișarea episoadelor și a transmisiunilor pentru care ai venit.',
        ],
      },
      {
        heading: 'Copiii',
        paragraphs: [
          'Serviciul nu este destinat copiilor sub 13 ani, iar profilul de comunitate — celor sub 16 ani sau sub vârsta consimțământului stabilită de legea țării tale. Nu verificăm vârsta și nu o colectăm. Dacă astfel de date au ajuns la noi din greșeală, scrie la {contact} și le vom șterge.',
        ],
      },
      {
        heading: 'Securitate',
        paragraphs: [
          'Legătura cu serviciul este protejată prin HTTPS. Aplicația rulează sub un utilizator de sistem fără shell și fără drepturi de administrator. Copiile datelor sunt criptate înainte să părăsească serverul. Codul personal de acces în comunitate se păstrează doar ca amprentă ireversibilă.',
          'Niciun mod de păstrare nu oferă garanție deplină. Dacă are loc o scurgere care îți afectează datele, autorul va anunța acest lucru în aplicație și pe {site}.',
        ],
      },
      {
        heading: 'Modificări',
        paragraphs: [
          'Documentul se poate schimba. Data ultimei modificări este sus, pe pagină. Despre schimbările importante autorul va anunța în aplicație înainte ca ele să intre în vigoare.',
        ],
      },
    ],
  },
  rules: {
    title: 'Reguli și condiții',
    intro:
      'Reguli scurte: ce se poate, ce nu se poate și ce se întâmplă la încălcare. Folosind aplicația, ești de acord cu ele.',
    sections: [
      {
        heading: 'Conținutul canalului',
        paragraphs: [
          'Toate episoadele, videoclipurile, textele, copertele și înregistrările transmisiunilor aparțin autorului canalului. Le poți asculta, privi și citi liber. Copierea, reîncărcarea, redublarea și distribuirea — doar cu permisiune scrisă.',
        ],
      },
      {
        heading: 'Regulile comunității',
        paragraphs: ['Dacă autorul a pornit comentariile, în ele sunt interzise:'],
        bullets: [
          'amenințările, insultele, hărțuirea și instigarea la ură;',
          'spamul, reclama și linkurile de orice fel;',
          'materialele ilegale și îndemnurile la infracțiuni;',
          'datele personale ale altora — adrese, telefoane, corespondență;',
          'pretinderea că ești autorul canalului sau altă persoană.',
        ],
      },
      {
        heading: 'Moderarea',
        paragraphs: [
          'Comentariile apar imediat, iar autorul le verifică. Încălcarea duce la ștergerea mesajului, iar la repetare — la blocarea profilului. Decizia se explică: comentariul șters arată motivul celui care l-a scris.',
          'Nu ești de acord cu decizia — scrie la {contact}. Autorul răspunde în treizeci de zile.',
        ],
      },
      {
        heading: 'Sprijinul pentru autor',
        paragraphs: [
          'Sprijinul este voluntar. El nu cumpără nimic: nu există și nu vor exista episoade închise, privilegii, insigne sau prioritate la comentarii contra cost — tot conținutul rămâne gratuit pentru toți.',
          'Banii merg pe server, echipament și muncă. Sprijinul voluntar nu se restituie; condițiile de restituire le stabilește platforma prin care ai plătit.',
        ],
      },
      {
        heading: 'Răspunderea',
        paragraphs: [
          'Serviciul este oferit așa cum este. Autorul nu promite funcționare neîntreruptă: este un proiect personal pe un singur server. Autorul nu răspunde pentru conținutul comentariilor altora, dar șterge încălcările când află de ele.',
        ],
      },
      {
        heading: 'Încetarea',
        paragraphs: [
          'Poți înceta oricând să folosești serviciul: șterge aplicația, oprește notificările, șterge profilul de comunitate. Autorul poate închide accesul unui profil care încalcă regulile și poate închide serviciul cu totul, anunțând acest lucru în aplicație.',
        ],
      },
    ],
  },
};
