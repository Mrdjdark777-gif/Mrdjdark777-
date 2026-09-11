import type { ru} from './ru';

// Українська. Тип вимагає всі ключі з ru.ts — забутий переклад не збереться.
export const uk: Record<keyof typeof ru, string> = {

  "err.liveUpload": "Не вдалося передати звук ефіру на сервер.",

  "err.liveRecorder": "Для передавання ефіру потрібен браузер із записом WebM/Opus. Онови Windows WebView2.",

  "err.liveLimit": "Досягнуто ліміт ефіру: до 8 годин або 1 ГіБ вхідного звуку.",

  "err.liveSequence": "Порушено порядок передавання. Отриману частину збережено.",

  "err.livePreparing": "Сервер готує звук ефіру.",

  "err.liveDisk": "На сервері мало вільного місця. Звільни місце перед ефіром.",

  "err.liveWorker": "Службу ефірів ще не запущено на сервері. Виконай встановлення обслуговування 0.9.",

  "post.liveArchive": "Запис ефіру",

  "liveArchive.empty": "Тут з'являться записи твоїх ефірів.",

  "liveArchive.download": "Завантажити запис",

  "liveArchive.retryAction": "Повторити обробку",

  "liveArchive.failed": "Не вдалося обробити запис. Отримані фрагменти збережено.",

  "liveArchive.ready": "Запис доступний у подкастах",

  "liveArchive.processingState": "Готуємо запис",

  "liveArchive.closing": "Завершуємо запис",

  "liveArchive.receivingState": "Ефір записується",

  "liveArchive.title": "Записи ефірів",

  "liveArchive.ended": "Ефір завершено. Запис з'явиться в подкастах після обробки.",

  "liveArchive.buffering": "Під'єднуємо звук із сервера…",

  "liveArchive.processing": "Ефір завершено. Сервер готує запис — ПК можна вимкнути.",

  "liveArchive.partial": "Передавання перервалося. Сервер збереже отриману частину; непереданий звук міг загубитися.",

  "liveArchive.retry": "Відновлюємо передавання на сервер…",

  "liveArchive.receiving": "Звук передається на сервер і зберігається",

  "liveArchive.saving": "Передаємо останні секунди… Не закривай застосунок.",

  "donate.configure": "Додати посилання",

  "donate.unavailable": "Автор ще не додав посилання для донату.",

  "donate.setup": "Додай своє посилання: кнопка з'явиться у слухачів на головній і в ефірі.",

  "donate.free": "Увесь контент безкоштовний. Підтримка — лише за бажанням.",

  "donate.action": "Донат",

  "donate.boosty": "Boosty",

  "donate.paypal": "PayPal",

  "err.loginLimited": "Забагато спроб. Зачекай 10 хвилин.",

  "err.coverUrl": "Для обкладинки потрібне посилання HTTPS.",

  "err.coverType": "Обкладинка має бути JPEG, PNG, WebP або GIF",

  "err.coverSize": "Файл обкладинки — до 12 МБ",

  "err.coverEmpty": "Порожній файл обкладинки",

  "err.coverUpload": "Не вдалося завантажити обкладинку",

  "err.coverNotFound": "Завантажену обкладинку не знайдено",

  "editor.cover": "Обкладинка",

  "editor.coverUpload": "Завантажити обкладинку",

  "editor.coverNote": "Вертикальна обкладинка 9:16 — наприклад 1080×1920. Вона заповнює картку по висоті; інше співвідношення обріжеться по центру.",

  "editor.coverUrlPlaceholder": "або встав посилання https://…",

  "editor.coverTooBig": "Файл обкладинки — до 12 МБ",

  "err.nativeUnavailable": "Онови застосунок і Android System WebView.",

  "err.notificationsBlocked": "Дозволь сповіщення в налаштуваннях телефона.",

  "err.playback": "Не вдалося відтворити подкаст. Перевір з'єднання та натисни відтворення.",

  "notif.blocked": "Телефон блокує сповіщення True Thrills.",

  "notif.openSettings": "Налаштування телефона",

  "notif.lastReceived": "Останнє сповіщення прийнято телефоном",

  "player.rate": "Швидкість",

  "player.sleep": "Таймер сну",

  "player.sleepOff": "Вимкнено",

  "player.minutes": "хв",

  "home.continue": "Продовжити слухати",

  "home.latest": "Остання публікація",

  "reader.size": "Розмір тексту",

  "common.retry": "Повторити",

  "common.refresh": "Оновити",

  "common.cancel": "Скасувати",

  "common.login": "Увійти",

  "common.loading": "Завантажуємо студію…",

  "common.link": "Посилання",

  "common.mb": "МБ",

  "meta.title": "True Thrills — студія та подкасти",

  "meta.description": "Подкасти, історії та прямі ефіри True Thrills.",

  "nav.podcasts": "Подкасти",

  "nav.videos": "Відео",

  "nav.home": "Головна",

  "nav.stories": "Історії",

  "nav.live": "Ефір",

  "header.settings": "Налаштування",

  "header.support": "Донат",

  "header.toStudio": "У студію",

  "header.asListener": "Як слухач",

  "header.logout": "Вийти",

  "header.loginAuthor": "Увійти як автор",

  "setup.eyebrow": "TRUE THRILLS / ПЕРШИЙ ЗАПУСК",

  "setup.title": "Твоя студія готова\nдо першого запису.",

  "setup.text": "Закріпи студію за своїм акаунтом. Тільки ти зможеш публікувати випуски, писати історії та запускати ефіри.",

  "setup.cta": "Відкрити мою студію",

  "setup.note": "Зараз застосунок доступний тільки тобі. Доступ для аудиторії під'єднується окремо.",

  "heading.eyebrowAuthor": "TRUE THRILLS / WORKSPACE",

  "heading.eyebrowListener": "TRUE THRILLS / СЛУХАЧЕВІ",

  "heading.homeAuthor": "Що робимо сьогодні?",

  "heading.homeListener": "True Thrills",

  "heading.studio": "Усе починається з голосу.",

  "heading.podcasts": "Подкасти",

  "heading.videos": "Відео",

  "heading.stories": "Історії",

  "heading.live": "Прямий ефір",

  "heading.settings": "Налаштування",

  "desc.homeAuthor": "Запис, відео, історія чи ефір — почни з головного.",

  "desc.homeListener": "Відео, подкасти та історії — в одному місці.",

  "desc.studio": "Запиши. Розкажи. Дай почути.",

  "footer.tagline": "Твоя історія. Твій голос.",

  "desc.podcastsAuthor": "Твої випуски — від чернетки до публікації.",

  "desc.podcastsListener": "Усі опубліковані випуски True Thrills.",

  "desc.videosAuthor": "Посилання на твої відео — слухач дивиться їх просто тут.",

  "desc.videosListener": "Відео True Thrills — просто в застосунку.",

  "desc.storiesAuthor": "Місце для історій, які ти хочеш розповісти.",

  "desc.storiesListener": "Історії True Thrills у текстовому форматі.",

  "desc.live": "Голос і слухачі. У реальному часі.",

  "desc.settingsAuthor": "Підтримка, майданчики та сповіщення.",

  "desc.settingsListener": "Сповіщення, майданчики та підтримка автора.",

  "home.record": "Записати\nвипуск",

  "home.addVideo": "Додати\nвідео",

  "home.writeStory": "Написати\nісторію",

  "home.startLive": "Почати\nефір",

  "home.shareChannel": "Поділитися\nканалом",

  "home.watchVideos": "Дивитися\nвідео",

  "home.listenPodcasts": "Слухати\nподкасти",

  "home.readStories": "Читати\nісторії",

  "home.liveNow": "Прямий\nефір",

  "home.socialCaption": "Автор на інших майданчиках",

  "support.title": "Донат",

  "support.setupTitle": "Кнопку підтримки не під'єднано",

  "support.setupText": "Додай платіжне посилання — воно з'явиться у слухачів у шапці та на головному екрані.",

  "support.subtitle": "Разовий донат або підписка на сторінці автора.",

  "live.youAreListening": "ВИ СЛУХАЄТЕ ЕФІР",

  "live.authorOnAir": "АВТОР У ПРЯМОМУ ЕФІРІ",

  "live.open": "Відкрити ефір",

  "live.continueListening": "Продовжити слухати",

  "live.enableSound": "Увімкнути звук",

  "live.connecting": "Під'єднуємося…",

  "live.backToLive": "Повернутися до ефіру",

  "live.listen": "Слухати ефір",

  "live.refreshFailed": "Не вдалося оновити статус ефіру.",

  "live.micOnNote": "Мікрофон увімкнено · ефір триває",

  "live.stop": "Завершити ефір",

  "live.stopped": "Ефір завершено",

  "live.alreadyEnded": "Цей ефір уже завершено",

  "live.running": "Ефір триває",

  "live.starting": "Запускаємо ефір…",

  "live.preparing": "Підготовка ефіру",

  "live.micReady": "Мікрофон готовий. Можна перевірити голос.",

  "live.pickSource": "Спочатку вибери джерело звуку.",

  "live.titleField": "Назва ефіру",

  "live.coverField": "Обкладинка ефіру",

  "live.coverUpload": "Завантажити обкладинку",

  "live.coverChange": "Вибрати іншу",

  "live.coverNote": "Показується слухачам на сторінці ефіру. Якщо не завантажити — візьметься загальний банер каналу.",

  "live.titlePlaceholder": "Про що сьогодні розкажеш?",

  "live.titleRequired": "Вкажи назву ефіру",

  "live.micOff": "МІКРОФОН ВИМКНЕНО",

  "live.signalOnAir": "СИГНАЛ В ЕФІРІ",

  "live.voiceCheck": "ПЕРЕВІРКА ГОЛОСУ",

  "live.listenersConnected": "під'єднано слухачів",

  "live.waitingFirst": "Чекаємо першого слухача",

  "live.openListener": "Відкрити слухача",

  "live.copyLink": "Скопіювати посилання",

  "live.connectingShort": "Під'єднуємо…",

  "live.stopCheck": "Вимкнути перевірку",

  "live.checkMic": "Перевірити мікрофон",

  "live.start": "Почати ефір",

  "live.stopFromOtherWindow": "Завершити ефір з іншого вікна",

  "live.linkCopied": "Посилання слухача скопійовано",

  "live.linkCopyFailed": "Не вдалося скопіювати посилання. Скористайся кнопкою відкриття слухача.",

  "live.micLost": "Мікрофон від'єднано — ефір завершено",

  "live.listeningNow": "Ви слухаєте ефір",

  "live.paused": "На паузі",

  "live.reconnecting": "Відновлюємо зв'язок",

  "live.connectingState": "Під'єднання",

  "live.needSound": "Потрібно увімкнути звук",

  "live.connectFailed": "Не вдалося під'єднатися",

  "live.ended": "Ефір завершено",

  "live.authorOnAirPlain": "Автор в ефірі",

  "live.noneNow": "Зараз ефіру немає",

  "live.tapToConnect": "Натисни «Слухати ефір», щоб під'єднатися.",

  "live.willAppearHere": "Коли автор почне ефір, він з'явиться тут.",

  "live.pause": "Пауза",

  "live.resume": "Продовжити слухати",

  "live.reconnectingShort": "Відновлюємо зв'язок…",

  "live.leave": "Вийти з ефіру",

  "live.tryAgain": "Спробувати ще раз",

  "live.check": "Перевірити ефір",

  "live.volumeOff": "Гучність вимкнено",

  "live.playing": "Ефір триває",

  "live.volume": "Гучність",

  "live.volumeAria": "Гучність ефіру",

  "live.infoAuthor": "Контроль ефіру",

  "live.infoListener": "Прослуховування",

  "live.authorTip1": "Перевір хвилю до початку ефіру. Список мікрофонів доступний без запису.",

  "live.authorTip2": "Підсилення та вимкнення мікрофона працюють під час ефіру.",

  "live.authorTip3": "Після завершення дочекайся передавання останніх секунд. Потім ПК можна вимкнути.",

  "live.listenerTip1": "Ефір іде через сервер. В Android 0.9 звук відтворює окрема служба.",

  "live.listenerTip2": "Гучність можна змінити тут або кнопками телефона.",

  "live.pilotTitle": "Тестова трансляція",

  "live.pilotText": "Почни з невеликої групи до 8 слухачів. Звук іде через сервер із невеликою затримкою.",

  "live.pilotNoRecord": "Ефір зберігається на сервері й автоматично з'являється в подкастах після обробки.",

  "live.otherNetwork": "Перевір інтернет і спробуй під'єднатися знову.",

  "studio.panelTitle": "ЗАПИС ПОДКАСТА",

  "studio.paused": "ПАУЗА",

  "studio.rec": "REC",

  "studio.ready": "ГОТОВИЙ ДО ЗАПИСУ",

  "studio.waiting": "ОЧІКУВАННЯ",

  "studio.levelAria": "Рівень сигналу мікрофона",

  "studio.incomingSignal": "ВХІДНИЙ СИГНАЛ",

  "studio.noSignal": "НЕМАЄ СИГНАЛУ",

  "studio.stopRecording": "Завершити запис",

  "studio.continue": "Продовжити",

  "studio.pause": "Пауза",

  "studio.newRecording": "Новий запис",

  "studio.startRecording": "Почати запис",

  "studio.uploadAudio": "Завантажити аудіо",

  "studio.checkTip": "Перевір хвилю та рівень голосу перед записом.",

  "studio.connecting": "Під'єднання…",

  "studio.disconnectInput": "Від'єднати вхід",

  "studio.checkInput": "Перевірити вхід",

  "studio.liveCardTitle": "Ближче до слухачів.",

  "studio.liveCardText": "Вийди в ефір і розкажи історію своїм голосом.",

  "studio.prepareLive": "Підготувати ефір",

  "studio.pilotFootnote": "Пілот: до 8 слухачів",

  "studio.quickStoryTitle": "Є що розповісти?",

  "studio.quickStoryText": "Створи текстову історію.",

  "studio.writeStory": "Написати історію",

  "studio.lastRecording": "Останній запис",

  "studio.localDraft": "Чернетка на цьому пристрої",

  "studio.download": "Завантажити",

  "studio.preparing": "Готуємо запис…",

  "studio.publishEpisode": "Оформити випуск",

  "studio.libraryTitle": "Твоя бібліотека",

  "studio.librarySubtitle": "Контент, який залишається.",

  "studio.supportTile": "Підтримка",

  "studio.donationSet": "Посилання під'єднано",

  "studio.donationMissing": "Додати посилання для донатів",

  "studio.monitorDaw": "Для контролю FL Studio: навушники в Komplete, INPUT/HOST до HOST; прослуховування CABLE Output — у Komplete 1/2.",

  "studio.monitorMic": "Для контролю голосу використовуй навушники та Direct Monitor аудіоінтерфейса.",

  "studio.uploadEpisode": "Завантажити випуск",

  "studio.newStory": "Написати історію",

  "studio.ready0": "Студія готова",

  "filter.all": "Усі",

  "filter.published": "Опубліковано",

  "filter.drafts": "Чернетки",

  "empty.sectionEmpty": "У цьому розділі поки порожньо",

  "empty.firstPodcast": "Тут з'явиться перший випуск",

  "empty.firstVideo": "Тут з'явиться перше відео",

  "empty.firstStory": "Тут з'явиться перша історія",

  "empty.listener": "Автор ще не додав публікацій у цей розділ.",

  "empty.podcastHint": "Запиши подкаст у студії або завантаж готове аудіо.",

  "empty.videoHint": "Додай посилання на відео з YouTube, Rutube, VK або TikTok — воно програватиметься просто тут.",

  "empty.storyHint": "Напиши історію та опублікуй її для слухачів.",

  "empty.toStudio": "У студію",

  "empty.addVideo": "Додати відео",

  "post.podcast": "ПОДКАСТ",

  "post.video": "ВІДЕО",

  "post.story": "ІСТОРІЯ",

  "post.published": "Опубліковано",

  "post.draft": "Чернетка",

  "post.listen": "Слухати",

  "post.watch": "Дивитися",

  "post.read": "Читати",

  "post.listenAria": "Слухати {title}",

  "post.watchAria": "Дивитися {title}",

  "post.readAria": "Читати {title}",

  "post.edit": "Редагувати",

  "post.unpublish": "Зняти з публікації",

  "post.publish": "Опублікувати",

  "post.delete": "Видалити",

  "post.defaultVideo": "Відео True Thrills",

  "post.defaultPodcast": "Аудіовипуск True Thrills",

  "post.movedToDrafts": "Переміщено в чернетки",

  "post.publishedToast": "Опубліковано",

  "post.gone": "Публікація більше недоступна",

  "editor.editing": "Редагування",

  "editor.newStory": "Нова історія",

  "editor.newVideo": "Нове відео",

  "editor.newPodcast": "Оформити подкаст",

  "editor.storyHint": "Збережи чернетку або опублікуй історію.",

  "editor.videoHint": "Встав посилання на відео — слухач подивиться його всередині застосунку.",

  "editor.podcastHint": "Додай назву та опис випуску.",

  "editor.title": "Назва",

  "editor.titleStory": "Назва історії",

  "editor.titleVideo": "Назва відео",

  "editor.titleEpisode": "Назва випуску",

  "editor.description": "Короткий опис",

  "editor.descriptionPlaceholder": "Кілька слів для слухача",

  "editor.storyText": "Текст історії",

  "editor.storyPlaceholder": "Починай розповідати…",

  "editor.videoUrl": "Посилання на відео",

  "editor.videoNote": "YouTube, Rutube, VK Відео, TikTok або пряме посилання на файл MP4. Решта посилань відкриються на майданчику.",

  "editor.audioOfEpisode": "Аудіо випуску",

  "editor.audioReady": "{size} МБ · готово до завантаження",

  "editor.audioMissing": "Аудіо не вибрано",

  "editor.toDrafts": "У чернетки",

  "editor.publish": "Опублікувати",

  "editor.saving": "Зберігаємо…",

  "editor.needTitle": "Вкажи назву",

  "editor.needStory": "Додай текст історії",

  "editor.needVideoUrl": "Додай посилання на відео",

  "editor.needAudio": "Спочатку запиши або завантаж аудіо",

  "editor.publishedToast": "Опубліковано",

  "editor.draftSaved": "Чернетку збережено",

  "editor.previewTitle": "Попередній перегляд",

  "reading.eyebrow": "TRUE THRILLS / ІСТОРІЯ",

  "watching.eyebrow": "TRUE THRILLS / ВІДЕО",

  "confirm.deleteTitle": "Видалити «{title}»?",

  "confirm.deleteText": "Публікацію та її аудіозапис буде видалено. Цю дію не можна скасувати.",

  "confirm.deleted": "Видалено",

  "confirm.discardTitle": "Закрити без збереження?",

  "confirm.discardText": "Зміни тексту не буде збережено.",

  "confirm.keepEditing": "Продовжити редагування",

  "confirm.close": "Закрити",

  "confirm.replaceTitle": "Почати новий запис?",

  "confirm.replaceText": "Новий запис замінить локальну аудіочернетку. Спочатку завантаж або опублікуй попередній запис, якщо він потрібен.",

  "settings.supportTitle": "Кнопка підтримки",

  "settings.supportText": "Додай посилання на Boosty і PayPal — кнопка «Підтримати» з'явиться в шапці та на головному екрані слухача. Можна заповнити один сервіс або обидва одразу.",

  "settings.saveDonation": "Зберегти посилання",

  "settings.donationSaved": "Посилання збережено",

  "settings.donationNote": "Платежі обробляє вибраний сервіс. Застосунок не зберігає дані карток.",

  "settings.artTitle": "Фон сповіщень та ефіру",

  "settings.artText": "Картинка показується у сповіщенні про фонове відтворення (як обкладинка альбому) і як фон трансляції, якщо у випуску немає власної обкладинки. Підійде банер твого каналу.",

  "settings.artUpload": "Завантажити зображення",

  "settings.saveArt": "Зберегти",

  "settings.artSaved": "Зображення збережено",

  "settings.artNote": "Рекомендуємо широке зображення (як банер YouTube-каналу), до 12 МБ.",

  "settings.linksTitle": "Твої майданчики",

  "settings.linksText": "Посилання з'являться на головному екрані слухача. Порожнє поле прибирає майданчик.",

  "settings.saveLinks": "Зберегти посилання",

  "settings.linksSaved": "Посилання збережено",

  "settings.linksNote": "Приймаються лише адреси HTTPS. Посилання відкриваються у зовнішньому застосунку майданчика.",

  "settings.authorTitle": "Автор",

  "settings.authorText": "Підтримай True Thrills або зазирни на інші майданчики автора.",

  "settings.channelLinkCopied": "Посилання на канал скопійовано",

  "settings.channelLinkFailed": "Не вдалося скопіювати посилання.",

  "social.youtube": "YouTube",

  "social.tiktok": "TikTok",

  "social.instagram": "Instagram",

  "social.telegram": "Telegram",

  "social.vk": "ВКонтакте",

  "social.site": "Сайт або інше",

  "video.watchOnPlatform": "Дивитися на майданчику",

  "notif.title": "Сповіщення на цьому пристрої",

  "notif.text": "Отримуй сповіщення про ефіри та публікації. Реєстрація не потрібна.",

  "notif.optLive": "Початок ефіру",

  "notif.optPodcast": "Новий подкаст або відео",

  "notif.optStory": "Нова історія",

  "notif.enable": "Увімкнути сповіщення",

  "notif.disable": "Вимкнути сповіщення",

  "notif.test": "Перевірити доставку",

  "notif.unsupported": "Для сповіщень відкрий захищену адресу True Thrills (HTTPS) у Chrome на Android.",

  "notif.note": "Сповіщення приходять навіть без відкритого застосунку. Для екрана блокування дозволь їх у налаштуваннях Android. Енергозбереження та примусова зупинка застосунку (або Chrome — при доступі через браузер) можуть заважати доставці.",

  "notif.enabled": "Сповіщення увімкнено на цьому пристрої. Перевір доставку.",

  "notif.disabled": "Сповіщення вимкнено.",

  "notif.reEnable": "Увімкни сповіщення заново.",

  "notif.bridgeMissing": "Міст сповіщень недоступний.",

  "notif.permissionHint": "Дозволь сповіщення сайту в Chrome і сповіщення самого Chrome у налаштуваннях Android.",

  "notif.acceptedFull": "Сервіс прийняв повідомлення. Перевір шторку телефона. Якщо його немає — перевір дозволи Chrome і режим «Не турбувати».",

  "notif.accepted": "Сервіс прийняв повідомлення. Перевір шторку телефона.",

  "notif.startFailed": "Сповіщення не запустилися. Онови застосунок.",

  "notif.androidEnableFailed": "Не вдалося увімкнути сповіщення. Перевір з'єднання.",

  "push.newPodcast": "Новий подкаст True Thrills",

  "push.newVideo": "Нове відео True Thrills",

  "push.newStory": "Нова історія True Thrills",

  "push.liveTitle": "True Thrills в ефірі",

  "push.testTitle": "Перевірка сповіщень",

  "push.testBody": "Нові ефіри та публікації надходитимуть сюди.",

  "push.fallbackTitle": "Нова публікація",

  "player.album": "Подкасти",

  "player.aria": "Плеєр: {title}",

  "player.close": "Закрити плеєр",

  "player.back15": "Назад на 15 секунд",

  "player.forward15": "Вперед на 15 секунд",

  "player.play": "Слухати",

  "player.pause": "Пауза",

  "player.seekAria": "Перемотування подкаста",

  "player.seekValue": "{position} з {duration}",

  "player.measuring": "Визначаємо тривалість…",

  "player.tapToPlay": "Натисни «Слухати», щоб увімкнути звук.",

  "player.seekFailed": "Не вдалося перемотати. Дочекайся завантаження запису.",

  "player.preparingSeek": "Готуємо тривалість і перемотування…",

  "player.loadFailed": "Не вдалося завантажити подкаст",

  "player.tooBig": "Запис перевищує 80 МБ",

  "player.unavailable": "Аудіо недоступне. Спробуй відкрити подкаст ще раз.",

  "player.tapInPlayer": "Натисни відтворення у плеєрі",

  "input.howSound": "Як надходить звук",

  "input.mic": "Мікрофон / аудіоінтерфейс",

  "input.daw": "Звук із FL Studio",

  "input.dawHelp": "Вибери CABLE Output. У FL Studio спрямуй Master у CABLE Input, Stereo separation залиш по центру. Голос, музика та ефекти надійдуть разом.",

  "input.source": "Джерело звуку",

  "input.savedSource": "Збережене джерело · онови список",

  "input.systemDefault": "Пристрій Windows за замовчуванням",

  "input.micNumbered": "Мікрофон {number}",

  "input.channel": "Канал входу",

  "input.channel1": "Вхід 1 → моно",

  "input.channel2": "Вхід 2 → моно",

  "input.channelStereo": "Входи 1 + 2 → стерео",

  "input.searching": "Шукаємо пристрої…",

  "input.refreshDevices": "Оновити пристрої",

  "input.allowAndFind": "Дозволити мікрофон і знайти пристрої",

  "input.listOnlyNote": "Доступ потрібен лише для списку входів. Запис не почнеться.",

  "input.noSignal": "Немає сигналу",

  "input.tooLoud": "Надто гучно. Зменш підсилення, щоб уникнути спотворень.",

  "input.gain": "Підсилення вхідного звуку",

  "input.muteAll": "Вимкнути весь вхідний звук",

  "input.lowCut": "Зріз низьких частот · 80 Гц",

  "capture.noRecorder": "Браузер не підтримує запис аудіо",

  "capture.needHttpsRecord": "Для запису потрібен HTTPS. Відкрий True Thrills за захищеною адресою.",

  "capture.needHttpsMic": "Мікрофон доступний лише через HTTPS. Відкрий захищену адресу True Thrills.",

  "capture.unsupportedBrowser": "Запис не підтримується. Використовуй Edge або Chrome.",

  "capture.openInChrome": "Відкрий застосунок в Edge або Chrome і дозволь мікрофон.",

  "capture.devicesUnavailable": "Аудіопристрої недоступні в цьому браузері.",

  "capture.allowMicWindow": "Дозволь доступ до мікрофона у вікні застосунку.",

  "capture.allowMic": "Дозволь застосунку доступ до мікрофона.",

  "capture.micNotFound": "Мікрофон не знайдено. Перевір підключення аудіоінтерфейса.",

  "capture.inputUnavailable": "Вибраний вхід недоступний. Онови список пристроїв.",

  "capture.interfaceLost": "Аудіоінтерфейс від'єднано",

  "capture.monoOnly": "Пристрій віддає моно. Для стерео перевір джерело та налаштування Windows.",

  "capture.stoppedAtLimit": "Запис зупинено на 75 МБ. Збережи випуск.",

  "capture.recordError": "Помилка запису. Збережи доступний фрагмент.",

  "capture.draftNotSaved": "Чернетка не збереглася на пристрої. Завантаж запис перед закриттям.",

  "capture.preparedPartly": "Вихідний запис збережено, але підготовку не завершено. ",

  "capture.tooBigUpload": "Максимум 80 МБ на запис",

  "capture.emptyFile": "Аудіофайл порожній",

  "capture.uploadFailed": "Аудіо не завантажилося",

  "audio.prepareFailed": "Не вдалося підготувати аудіо. Онови застосунок і спробуй знову.",

  "audio.cancelled": "Скасовано",

  "audio.tooBig": "Аудіофайл має бути розміром до 80 МБ",

  "audio.noTrack": "У файлі не знайдено аудіодоріжку",

  "audio.singleTrack": "Для цього запису потрібен аудіофайл з однією доріжкою",

  "audio.noDuration": "Не вдалося визначити тривалість запису",

  "audio.prepareRecordFailed": "Не вдалося підготувати запис",

  "audio.formatFailed": "Не вдалося прочитати формат запису",

  "liveHook.starting": "Запускаємо ефір…",

  "liveHook.started": "Ефір запущено",

  "liveHook.startFailed": "Не вдалося запустити ефір",

  "liveHook.lost": "Зв'язок втрачено. Перевір інтернет і запусти ефір заново.",

  "liveHook.stoppedLost": "Ефір зупинено: втрачено зв'язок",

  "liveHook.finished": "Ефір завершено",

  "liveHook.connectingToAuthor": "Під'єднуємося до автора…",

  "liveHook.connected": "З'єднання встановлено. Очікуємо звук…",

  "liveHook.listening": "Ви слухаєте прямий ефір",

  "liveHook.soundReady": "Звук готовий. Натисни «Увімкнути звук».",

  "liveHook.tapToEnable": "Натисни «Увімкнути звук», щоб дозволити відтворення.",

  "liveHook.playFailed": "Не вдалося відтворити звук. Під'єднайся ще раз.",

  "liveHook.noSound": "Не вдалося отримати звук. Спробуй під'єднатися ще раз.",

  "liveHook.paused": "Прослуховування на паузі",

  "liveHook.authorEnded": "Автор завершив ефір",

  "liveHook.reconnecting": "Зв'язок перервався. Перепід'єднуємося…",

  "liveHook.reconnectingServer": "Відновлюємо зв'язок із сервером…",

  "liveHook.failed": "З'єднання не встановилося. Спробуй іншу мережу та під'єднайся знову.",

  "liveHook.title": "Прямий ефір",

  "login.title": "Вхід до студії",

  "login.password": "Пароль автора",

  "login.passwordPlaceholder": "Пароль",

  "login.busy": "Входимо…",

  "login.failed": "Не вдалося увійти",

  "err.serverDown": "Сервер недоступний. Онови сторінку та перевір вхід в акаунт.",

  "err.server": "Помилка сервера",

  "err.generic": "Не вдалося виконати дію",

  "err.request": "Не вдалося виконати запит",

  "err.ownerOnly": "Доступ лише для автора",

  "err.badOrigin": "Неприпустиме джерело запиту",

  "err.signIn": "Увійди в акаунт",

  "err.studioClaimed": "Студію вже закріплено за автором",

  "err.donationsUrl": "Потрібні посилання HTTPS на Boosty або PayPal",

  "err.linksUrl": "Потрібні посилання HTTPS на відомі майданчики",

  "err.titleLength": "Вкажи назву до 160 символів",

  "err.badKind": "Невірний тип публікації",

  "err.storyTooLong": "Історія задовга",

  "err.storyEmpty": "Додай текст історії",

  "err.videoUrl": "Потрібне посилання HTTPS на відео (YouTube, Rutube, VK, TikTok або файл)",

  "err.videoUrlLong": "Посилання на відео задовге",

  "err.audioMissing": "Додай аудіозапис",

  "err.audioNotFound": "Аудіофайл не знайдено",

  "err.badLocale": "Невідома мова",

  "err.uploadSize": "Вкажи розмір файлу: від 1 байта до 80 МБ",

  "err.uploadEmpty": "Порожній файл",

  "err.uploadMismatch": "Завантажений файл не збігається за розміром із заявленим",

  "err.uploadType": "Підтримуються MP3, WAV, M4A, WebM, OGG і FLAC",

  "err.badStorageKey": "Неприпустимий ключ сховища",

  "err.notFound": "Не знайдено",

  "err.liveTitle": "Вкажи назву ефіру",

  "err.liveBusy": "Інший ефір уже триває. Спочатку заверши його.",

  "err.liveGone": "Ефір уже завершено",

  "err.liveFull": "Тестовий ефір заповнено: до 8 слухачів",

  "err.badOffer": "Некоректне підключення",

  "err.badAnswer": "Некоректна відповідь",

  "err.sessionGone": "Сесію не знайдено",

  "err.badPassword": "Невірний пароль",

  "err.unknownAction": "Невідома дія",

  "err.badPreferences": "Некоректні налаштування",

  "err.deviceLimit": "Ліміт пілота — 100 пристроїв зі сповіщеннями.",

  "err.subscriptionMissing": "Підписку не знайдено",

  "err.subscriptionOther": "Підписка належить іншому пристрою",

  "err.resubscribe": "Вимкни та знову увімкни сповіщення на цьому пристрої.",

  "err.testTooSoon": "Повтори перевірку через 30 секунд",

  "err.testRejected": "Сервіс не прийняв сповіщення. Вимкни та увімкни сповіщення заново.",

  "err.badSubscription": "Некоректна підписка",

  "err.badSubscriptionKey": "Некоректний ключ підписки",

  "err.badToken": "Некоректний токен сповіщень",

  "err.pushUnsupported": "Сповіщення підтримуються в Chrome на Android і Firefox.",

  "err.fcmNotConfigured": "Сповіщення для Android не налаштовано на сервері (FIREBASE_SERVICE_ACCOUNT_FILE).",

  "err.fcmToken": "Не вдалося отримати токен доступу Firebase",
};
