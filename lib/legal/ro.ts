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
export const ro: LegalPack = {
  "updated": "2026-10-14",
  "privacy": {
    "title": "Politica de confidențialitate",
    "intro": "Această politică explică ce date cu caracter personal sunt prelucrate atunci când folosiți site-ul {site} și aplicația True Thrills pentru Android și Windows (denumite în continuare „serviciul”), în ce scop, cât timp sunt păstrate și ce drepturi aveți. Documentul este întocmit conform Regulamentului general privind protecția datelor (GDPR) și legilor privind protecția datelor din țările în care funcționează serviciul.",
    "sections": [
      {
        "heading": "1. Cine răspunde de datele dumneavoastră",
        "paragraphs": [
          "Operatorul (responsabil de prelucrare) este {controller}. Adresa pentru orice întrebare privind datele personale, cereri și plângeri: {contact}.",
          "Serviciul este un proiect de autor necomercial: podcasturi, videoclipuri, povești și transmisiuni în direct ale canalului True Thrills. Serviciul nu are înregistrare pentru ascultători, reclame sau abonamente plătite. Nu vindem și nu închiriem date personale și nu le folosim pentru publicitate."
        ]
      },
      {
        "heading": "2. Ce date prelucrăm",
        "paragraphs": [
          "Colectăm cât mai puțin. Serviciul nu le cere ascultătorilor numele, adresa de e-mail, numărul de telefon sau date de plată. Se prelucrează următoarele:"
        ],
        "bullets": [
          "Date tehnice ale cererilor: adresa IP, data și ora, adresa paginii solicitate, tipul de browser și de dispozitiv. Le înregistrează jurnalul serverului web la fiecare accesare a serviciului.",
          "Date pentru protecția împotriva abuzurilor: adresa IP sub forma unui hash ireversibil, după care se limitează frecvența cererilor. Adresa în sine nu se păstrează în baza de date.",
          "Contoarele publicațiilor: identificatorul episodului sau al poveștii și un cod aleatoriu al sesiunii curente. După ele se numără deschiderile poveștilor și pornirile audio. Codul sesiunii nu este legat de identitatea dumneavoastră și nu se salvează pe dispozitiv.",
          "Datele notificărilor — doar dacă notificările sunt activate: adresa de abonare a browserului sau tokenul dispozitivului Android, limba aleasă, temele de notificare alese și momentul abonării. Pe Android 12 și versiunile mai vechi sistemul nu afișează o cerere separată de permisiune, de aceea aplicația activează notificările la prima pornire; le puteți dezactiva cu o singură atingere în setările aplicației.",
          "Datele transmisiunii în direct: o cheie temporară de ascultător pe durata transmisiunii. După transmisiune, aceasta se șterge.",
          "Datele comunității — doar dacă autorul a activat comentariile și v-ați creat singur un profil: pseudonimul, hash-ul codului personal de autentificare, comentariile și reclamațiile dumneavoastră.",
          "Mesajele pe care ni le trimiteți la adresa {contact} și datele pe care le includeți în ele."
        ]
      },
      {
        "heading": "3. Scopuri și temeiuri juridice",
        "bullets": [
          "Afișarea episoadelor, videoclipurilor, poveștilor și transmisiunilor la cererea dumneavoastră — executarea solicitării dumneavoastră de a folosi serviciul (art. 6 alin. (1) lit. (b) GDPR).",
          "Funcționarea, securitatea și protecția serviciului împotriva atacurilor, defecțiunilor și abuzurilor — jurnalul serverului, limitarea frecvenței cererilor — interesul legitim al operatorului pentru un serviciu funcțional și protejat (art. 6 alin. (1) lit. (f) GDPR).",
          "Contoarele de deschideri și ascultări, ca autorul să înțeleagă ce interesează publicul — interesul legitim al operatorului (art. 6 alin. (1) lit. (f) GDPR). Contoarele sunt anonimizate și nu permit aflarea cine anume a ascultat.",
          "Notificările despre transmisiuni și episoade noi — consimțământul dumneavoastră (art. 6 alin. (1) lit. (a) GDPR). Îl retrageți oricând, dezactivând notificările în setările serviciului sau ale telefonului.",
          "Profilul și comentariile comunității — consimțământul dumneavoastră (art. 6 alin. (1) lit. (a) GDPR), pe care îl dați creând profilul. Ștergerea profilului îl retrage.",
          "Răspunsurile la solicitările dumneavoastră și exercitarea drepturilor — obligația legală a operatorului (art. 6 alin. (1) lit. (c) GDPR)."
        ]
      },
      {
        "heading": "4. Cookie-uri și stocarea pe dispozitiv",
        "paragraphs": [
          "Serviciul nu folosește cookie-uri de publicitate sau de analiză și nu plasează cookie-uri ale altor companii. Ascultătorilor serviciul nu le plasează niciun cookie. Un cookie de sesiune strict necesar apare doar la autorul canalului când intră în studio, iar la un membru al comunității — după autentificarea în profil, dacă comunitatea este activată.",
          "Ca să nu o luați de fiecare dată de la capăt, serviciul păstrează câteva înregistrări în stocarea locală a browserului sau a aplicației. Aceste înregistrări nu sunt trimise nici serverului, nici terților, iar le puteți șterge golind datele site-ului sau ale aplicației:"
        ],
        "bullets": [
          "locul în care v-ați oprit într-un episod și durata acestuia;",
          "ce publicații ați deschis deja, pentru a elimina eticheta „nou”;",
          "ce carduri ați scos de pe pagina principală și ce rând „Continuă” ați ascuns;",
          "poziția de lectură și setările textului în povești, limba aleasă și volumul."
        ]
      },
      {
        "heading": "5. Videoclipuri încorporate și linkuri către alte site-uri",
        "paragraphs": [
          "Unele videoclipuri sunt încorporate de pe platforme externe: YouTube (în modul youtube-nocookie.com), Rutube, VK sau TikTok. Când deschideți un astfel de videoclip, browserul dumneavoastră accesează direct platforma respectivă și îi transmite adresa IP și datele browserului. Prelucrarea ulterioară este stabilită de politica de confidențialitate a platformei.",
          "Linkurile către paginile canalului din rețelele sociale și către serviciile de susținere voluntară duc pe site-urile altor companii. Accesându-le, intrați sub regulile acestora. Plățile de susținere se efectuează la aceste servicii: datele cardului și ale plății nu ajung la noi."
        ]
      },
      {
        "heading": "6. Cine mai primește date",
        "paragraphs": [
          "Transmitem date doar celor fără de care serviciul nu poate funcționa. Aceștia sunt persoane împuternicite care acționează în numele nostru și conform propriilor obligații contractuale privind protecția datelor:"
        ],
        "bullets": [
          "Oracle (Oracle Cloud Infrastructure) — găzduirea serverului pe care funcționează site-ul, aplicația și baza de date.",
          "Google (Firebase Cloud Messaging) — livrarea notificărilor pe Android. La pornire, aplicația primește de la Google tokenul dispozitivului; acesta ajunge pe serverul nostru doar dacă notificările sunt activate. Google primește tokenul și textul notificării.",
          "Serviciile de notificări push ale browserelor (Google, Mozilla, Apple, Microsoft) — livrarea notificărilor în browser. Textul notificării este criptat cu cheile dispozitivului dumneavoastră, iar serviciul nu îl poate citi.",
          "Autoritățile publice — doar dacă legea o cere în mod expres și doar în limitele acestei cerințe."
        ]
      },
      {
        "heading": "7. Transferul datelor în alte țări",
        "paragraphs": [
          "Serverul serviciului și persoanele împuternicite se pot afla în afara țării dumneavoastră. Google poate prelucra date în SUA. Un astfel de transfer are loc în temeiul deciziei Comisiei Europene privind caracterul adecvat al protecției (EU–US Data Privacy Framework) sau al clauzelor contractuale standard aprobate de Comisia Europeană. O copie a garanțiilor aplicabile poate fi solicitată la adresa {contact}."
        ]
      },
      {
        "heading": "8. Cât timp păstrăm datele",
        "bullets": [
          "Jurnalul serverului web — până la 14 zile, apoi este șters prin rotația automată a jurnalelor serverului.",
          "Hash-urile pentru limitarea frecvenței cererilor — până la sfârșitul ferestrei de limitare, apoi se șterg automat.",
          "Codul sesiunii pentru contoare — 24 de ore. Contoarele în sine se păstrează ca sume anonimizate cât timp există publicația.",
          "Abonarea la notificări — până când o dezactivați sau până când dispozitivul nu mai primește notificări.",
          "Cheia ascultătorului transmisiunii — până la sfârșitul transmisiunii.",
          "Comentariile, reclamațiile și blocările din comunitate — până la treizeci de zile, apoi se șterg automat. Pseudonimul și hash-ul codului de autentificare — cât timp există profilul.",
          "Corespondența cu dumneavoastră — cât timp este necesară pentru a răspunde solicitării și nu mai mult de trei ani.",
          "Copiile de rezervă criptate — se păstrează ultimele treizeci de copii, cele mai vechi se șterg automat."
        ]
      },
      {
        "heading": "9. Cum protejăm datele",
        "paragraphs": [
          "Conexiunea cu serviciul este protejată prin HTTPS. Acces la server are doar operatorul. Programul serviciului rulează sub un utilizator de sistem separat, fără drepturi de administrator. Copiile de rezervă sunt criptate înainte de a părăsi serverul. Codurile de autentificare se păstrează doar sub forma unui hash ireversibil.",
          "Nicio metodă de stocare și transmitere a datelor nu oferă o garanție absolută. Dacă are loc o încălcare a securității care v-ar putea afecta drepturile, vom informa autoritatea de supraveghere și pe dumneavoastră în termenele prevăzute de lege — în serviciu și pe {site}."
        ]
      },
      {
        "heading": "10. Drepturile dumneavoastră",
        "paragraphs": [
          "Aveți dreptul:"
        ],
        "bullets": [
          "să aflați dacă datele dumneavoastră sunt prelucrate și să primiți o copie a acestora (dreptul de acces);",
          "să cereți rectificarea datelor inexacte;",
          "să cereți ștergerea datelor („dreptul de a fi uitat”);",
          "să cereți restricționarea prelucrării;",
          "să primiți datele pe care le-ați furnizat într-un format care poate fi citit automat și să le transmiteți altui operator (dreptul la portabilitate);",
          "să vă opuneți prelucrării întemeiate pe interesul legitim;",
          "să vă retrageți oricând consimțământul. Aceasta nu face ilegală prelucrarea efectuată înainte de retragere;",
          "să depuneți o plângere la autoritatea de supraveghere a protecției datelor din țara în care locuiți sau lucrați ori în care considerați că v-au fost încălcate drepturile."
        ]
      },
      {
        "heading": "11. Cum vă exercitați drepturile",
        "paragraphs": [
          "Scrieți la {contact}. Vă vom răspunde fără întârzieri nejustificate, în cel mult o lună (treizeci de zile) de la primirea cererii. Dacă cererea este complexă, termenul poate fi prelungit cu încă două luni, despre care vă vom anunța. Răspunsul este gratuit. Pentru a nu divulga datele altcuiva, vă putem cere să confirmați că cererea vine de la dumneavoastră.",
          "Majoritatea datelor le puteți șterge singur: dezactivați notificările, goliți datele site-ului sau ale aplicației, iar un membru al comunității își poate exporta și șterge profilul direct în aplicație."
        ]
      },
      {
        "heading": "12. Este obligatoriu să furnizați date",
        "paragraphs": [
          "Nu. Serviciul poate fi folosit fără înregistrare și fără a oferi vreo informație despre dumneavoastră. Datele tehnice ale cererilor sunt transmise automat de browser, fără ele serviciul nu poate afișa pagina. Notificările și profilul comunității sunt opționale."
        ]
      },
      {
        "heading": "13. Decizii automatizate",
        "paragraphs": [
          "Nu luăm decizii bazate exclusiv pe prelucrarea automată, inclusiv crearea de profiluri, care produc efecte juridice asupra dumneavoastră sau vă afectează în mod similar într-o măsură semnificativă."
        ]
      },
      {
        "heading": "14. Copiii",
        "paragraphs": [
          "Serviciul nu este destinat copiilor sub 13 ani. Un profil în comunitate poate fi creat de la 16 ani sau de la vârsta consimțământului digital stabilită de legea țării dumneavoastră. Nu colectăm informații despre vârstă. Dacă aflați că un copil ne-a transmis datele sale, scrieți la {contact}, iar noi le vom șterge."
        ]
      },
      {
        "heading": "15. Modificări ale politicii",
        "paragraphs": [
          "Putem actualiza această politică atunci când se schimbă serviciul sau legea. Data ultimei modificări este indicată în partea de sus a paginii. Despre modificările esențiale vă vom anunța din timp în serviciu."
        ]
      }
    ]
  },
  "rules": {
    "title": "Reguli și condiții",
    "intro": "Aceste condiții reglementează folosirea site-ului {site} și a aplicației True Thrills (denumite în continuare „serviciul”). Operatorul serviciului este {controller}. Folosind serviciul, sunteți de acord cu aceste condiții. Dacă nu sunteți de acord cu ele, vă rugăm să nu folosiți serviciul.",
    "sections": [
      {
        "heading": "1. Ce este serviciul",
        "paragraphs": [
          "Serviciul este platforma de autor gratuită a canalului True Thrills: audio, video, povești în text și transmisiuni în direct. Pentru folosirea serviciului nu este necesară înregistrarea. Funcțiile serviciului pot fi modificate, completate sau întrerupte."
        ]
      },
      {
        "heading": "2. Vârsta",
        "paragraphs": [
          "Serviciul este destinat persoanelor de peste 13 ani. Unele materiale vorbesc despre catastrofe, traume și moartea oamenilor și pot fi greu de suportat. Un profil în comunitate poate fi creat de la 16 ani sau de la vârsta stabilită de legea țării dumneavoastră."
        ]
      },
      {
        "heading": "3. Drepturile asupra materialelor",
        "paragraphs": [
          "Toate episoadele, videoclipurile, textele, copertele, logoul și înregistrările transmisiunilor sunt protejate de dreptul de autor și aparțin operatorului sau sunt folosite de acesta în mod legal. Le puteți asculta, viziona și citi pentru uz personal necomercial și puteți distribui linkuri către ele.",
          "Fără permisiunea scrisă a operatorului este interzis să copiați, să descărcați ocolind funcțiile serviciului, să reîncărcați, să redublați, să modificați, să vindeți și să distribuiți public materialele, precum și să le folosiți pentru antrenarea sistemelor de inteligență artificială."
        ]
      },
      {
        "heading": "4. Utilizare acceptabilă",
        "paragraphs": [
          "Când folosiți serviciul, este interzis:"
        ],
        "bullets": [
          "să încălcați legea și drepturile altor persoane;",
          "să încercați să obțineți acces neautorizat la server, la studioul autorului sau la datele altcuiva;",
          "să perturbați funcționarea serviciului, să creați o încărcare excesivă, să descărcați masiv materiale prin mijloace automate;",
          "să distribuiți programe malițioase și să ocoliți măsurile tehnice de protecție;",
          "să vă dați drept autorul canalului sau drept altă persoană."
        ]
      },
      {
        "heading": "5. Comentarii și comunitate",
        "paragraphs": [
          "Dacă autorul a activat comentariile, răspundeți pentru ceea ce publicați. Publicând un comentariu, permiteți afișarea lui în serviciu până când este șters de dumneavoastră, de autor sau automat la expirarea termenului de păstrare. În comentarii sunt interzise:"
        ],
        "bullets": [
          "amenințările, insultele, hărțuirea și incitarea la ură;",
          "spamul, reclama și linkurile de orice fel;",
          "materialele ilegale și îndemnurile la infracțiuni sau violență;",
          "datele personale ale altora: adrese, telefoane, corespondență, fotografii;",
          "materialele care încalcă drepturile de autor și alte drepturi ale terților."
        ]
      },
      {
        "heading": "6. Moderare",
        "paragraphs": [
          "Comentariile se publică imediat, iar autorul le verifică. O încălcare duce la ștergerea mesajului, iar la repetare — la blocarea profilului. Autorul care a șters un comentariu indică motivul.",
          "Dacă nu sunteți de acord cu o decizie sau doriți să semnalați un material ilegal, scrieți la {contact}. Vom examina solicitarea și vom răspunde în termen de treizeci de zile."
        ]
      },
      {
        "heading": "7. Susținerea voluntară",
        "paragraphs": [
          "Îl puteți susține pe autor dacă doriți, prin servicii de plată terțe. Susținerea este o donație voluntară, nu o cumpărare: nu oferă acces la materiale închise, privilegii sau avantaje, iar toate materialele serviciului rămân gratuite pentru toți.",
          "Plata este procesată de serviciul de plată ales de dumneavoastră conform propriilor reguli. Chestiunile privind rambursarea se soluționează conform regulilor acestui serviciu și normelor imperative ale legii."
        ]
      },
      {
        "heading": "8. Materialele nu constituie sfaturi",
        "paragraphs": [
          "Poveștile despre supraviețuire, sfaturile invitaților din transmisiuni și indicația de respirație de pe pagina transmisiunii au caracter informativ. Ele nu constituie consultanță medicală, psihologică, juridică sau profesională și nu înlocuiesc pregătirea, echipamentul și ajutorul specialiștilor. Dacă aveți nevoie de ajutor, adresați-vă unui medic sau serviciilor de urgență."
        ]
      },
      {
        "heading": "9. Servicii terțe",
        "paragraphs": [
          "Serviciul încorporează videoclipuri de pe platforme externe și conține linkuri către rețele sociale și servicii de plată. Operatorul nu controlează aceste servicii și nu răspunde pentru conținutul și regulile lor. Folosirea lor este reglementată de propriile condiții."
        ]
      },
      {
        "heading": "10. Exonerarea de garanții",
        "paragraphs": [
          "Serviciul este oferit „ca atare” și „în măsura disponibilității”. Este un proiect personal, iar operatorul nu garantează funcționarea neîntreruptă și fără erori, nici disponibilitatea permanentă a unor materiale."
        ]
      },
      {
        "heading": "11. Limitarea răspunderii",
        "paragraphs": [
          "În limitele permise de lege, operatorul nu răspunde pentru prejudiciile indirecte, beneficiul nerealizat și pierderea datelor legate de folosirea serviciului și nici pentru conținutul comentariilor altor utilizatori, dar șterge încălcările când află de ele. Nimic din aceste condiții nu limitează răspunderea pe care legea nu permite să fie limitată și nici drepturile dumneavoastră imperative de consumator."
        ]
      },
      {
        "heading": "12. Încetarea utilizării",
        "paragraphs": [
          "Puteți înceta oricând să folosiți serviciul: ștergeți aplicația, dezactivați notificările, ștergeți profilul din comunitate. Operatorul poate restricționa accesul celor care încalcă aceste condiții și poate înceta funcționarea serviciului, anunțând din timp atunci când este posibil."
        ]
      },
      {
        "heading": "13. Modificarea condițiilor",
        "paragraphs": [
          "Operatorul poate modifica aceste condiții. Data ultimei modificări este indicată în partea de sus a paginii. Despre modificările esențiale vă vom anunța din timp în serviciu. Continuând să folosiți serviciul după intrarea în vigoare a modificărilor, sunteți de acord cu noua versiune."
        ]
      },
      {
        "heading": "14. Legea aplicabilă și litigii",
        "paragraphs": [
          "Acestor condiții li se aplică legea țării în care se află operatorul. Dacă sunteți consumator, păstrați protecția normelor imperative ale țării în care locuiți și dreptul de a vă adresa instanței din acea țară. Înainte de a vă adresa instanței, vă rugăm să scrieți la {contact}: majoritatea problemelor se pot rezolva printr-un mesaj."
        ]
      },
      {
        "heading": "15. Contact",
        "paragraphs": [
          "Întrebările despre aceste condiții, solicitările și plângerile le trimiteți la {contact}."
        ]
      }
    ]
  }
};
