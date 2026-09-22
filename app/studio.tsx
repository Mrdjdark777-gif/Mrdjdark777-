'use client';
import {LiveArchives} from '@/components/studio/live-archives';
import {ShareSheet} from '@/components/studio/share-sheet';
import {shareRoute,shareUrl,type SharePayload} from '@/lib/share';
import {Artwork} from '@/components/studio/artwork';
import {useCallback,useEffect,useRef,useState} from 'react';
import {MoreHorizontal,Mic,Radio,BookOpen,Headphones,SlidersHorizontal,Search,ArrowUpRight,Plus,Upload,Square,Play,Heart,Check,Volume2,FileAudio,ChevronRight,Trash2,Eye,EyeOff,Pencil,Pin,PinOff,Loader2,LogOut,Share2,Video,Music2,Camera,Send,MessageCircle,Globe,Link2,Wind,Image as ImageIcon,AudioLines} from 'lucide-react';
import {Tabs,TabsList,TabsTrigger} from '@/components/ui/tabs';
import {Dialog,DialogContent,DialogHeader,DialogTitle,DialogDescription} from '@/components/ui/dialog';
import {AlertDialog,AlertDialogContent,AlertDialogHeader,AlertDialogTitle,AlertDialogDescription,AlertDialogFooter,AlertDialogCancel,AlertDialogAction} from '@/components/ui/alert-dialog';
import {Toaster,toast} from 'sonner';
import {useCapture} from '@/hooks/use-capture';
import {useLive} from '@/hooks/use-live';
import {hasNativeClient,nativeCall,stopNativePlayer} from '@/lib/native-client';
import {saveProgress,unhideResume} from '@/lib/listening-progress';
import {HomeSceneView} from '@/components/studio/home-scene-view';
import {StoryReader} from '@/components/studio/story-reader';
import {PodcastPlayer} from '@/components/studio/podcast-player';
import {isLiveArchive} from '@/lib/player-presentation';
import {nextEpisode} from '@/lib/next-episode';
import {LiquidMetalButton} from '@/components/ui/liquid-metal-button';
import {BeamsBackground} from '@/components/ui/beams-background';
import {KineticGrid} from '@/components/ui/kinetic-grid';
import {useWideScreen} from '@/hooks/use-wide-screen';
import {sendDesktopCommand} from '@/lib/desktop-shell';
import {useDesktopApp} from '@/hooks/use-desktop-app';
import {pushBackLayer,runBack,BACK_OVERLAY,BACK_NAV} from '@/lib/back-stack';
import {VoiceHeader} from '@/components/studio/voice-header';
import {LiveStageView} from '@/components/studio/live-stage-view';
import {InputPicker,SignalMeter,AudioControls} from '@/components/studio/audio-console';
import {NotificationSettings} from '@/components/studio/notification-settings';
import {Slider} from '@/components/ui/slider';
import {api,clock,parseClock,errorText,haptic,coverSrc} from '@/lib/client';
import {VideoFrame} from '@/components/studio/video-player';
import {APP_RELEASE} from '@/lib/app-release';
import {AndroidMark} from '@/components/studio/android-mark';
import {markSeen,readSeen} from '@/lib/seen-posts';
import {YoutubeIcon,BoostyIcon,PaypalIcon} from '@/components/studio/brand-icons';
import {SOCIALS,DONATIONS,type SocialKind,type SocialLink,type DonationKind,type DonationLink} from '@/lib/video';
import {useT} from '@/components/i18n-provider';

type Post={id:string;kind:string;title:string;description:string;body:string;audioKey:string|null;videoUrl:string|null;coverUrl:string|null;coverKey:string|null;duration:number;published:number;createdAt:number};
type Data={archivePending?:boolean;items:Post[];isOwner:boolean;needsSetup:boolean;signedIn:boolean;donations:DonationLink[];links:SocialLink[];live:{id:string;title:string;description?:string;startedAt:number|null;cover:boolean}|null;pinned:string|null;calmArt?:string|null};
const SOCIAL_ICON:Record<SocialKind,React.ComponentType<{size?:number}>>={youtube:YoutubeIcon,tiktok:Music2,instagram:Camera,telegram:Send,vk:MessageCircle,site:Globe};
const DONATION_ICON:Record<DonationKind,React.ComponentType<{size?:number}>>={boosty:BoostyIcon,paypal:PaypalIcon};
const LISTEN_VIEWS=['home','podcasts','videos','stories','live','settings'];
// Страницы записи больше нет: её открывали только из панели, а звуковой тракт
// целиком живёт на экране эфира.
const RETIRED_VIEWS:Record<string,string>={studio:'live'};
// Цвета сняты пипеткой с логотипа и лежат так же, как на нём самом: закат
// наверху, дорога и горы внизу. Раскладка частот при этом прежняя — бас внизу,
// верхние частоты наверху, — поэтому шкала цвета идёт навстречу номеру полосы.
export default function Studio(){
 const {t,tag,locale}=useT();
 const noticeHandler=useRef<(url:string)=>Promise<void>>(async()=>{});
 const [coverUrl,setCoverUrl]=useState('');
 const [discardText,setDiscardText]=useState(false);
 const [data,setData]=useState<Data|null>(null),[error,setError]=useState(''),[view,setView]=useState('home'),[audience,setAudience]=useState(false);
 const [archiveOpen,setArchiveOpen]=useState(false),[archiveQuery,setArchiveQuery]=useState('');
 // Что слушатель уже открывал. Карточка нового выпуска после этого уходит:
 // висеть «новым» тем, что уже слушали, она не должна.
 const [seen,setSeen]=useState<string[]>([]);
 // Чем делимся прямо сейчас. На телефоне окно не открывается: там лист даёт
 // система, а это состояние остаётся пустым.
 const [sharing,setSharing]=useState<SharePayload|null>(null);
 // Описания в списке обрезаны двумя строками. Раскрытые запоминаем по выпуску:
 // человек читает одно, а не разворачивает весь каталог.
 const [openNotes,setOpenNotes]=useState<string[]>([]);
 // Продолжать с места — только по просьбе со строки «Продолжить». Из каталога
 // выпуск начинается сначала: человек выбрал его заново, а не вернулся к нему.
 // Откуда играть выпуск. Три случая, и решает их страница, а не плеер:
 // 'begin' — открыли из каталога, играем сначала;
 // 'resume' — попросили строкой «Продолжить», встаём на сохранённое место;
 // 'keep' — экран пересоздали (поворот, возврат в приложение), звук всё это
 // время шёл сам: позицию не трогаем вовсе.
 const [playFrom,setPlayFrom]=useState<'begin'|'resume'|'keep'>('begin');
 const [donateOpen,setDonateOpen]=useState(false);
 const [title,setTitle]=useState(''),[description,setDescription]=useState(''),[body,setBody]=useState(''),[editing,setEditing]=useState<Post|null>(null),[editor,setEditor]=useState<'story'|'podcast'|'video'|null>(null),[saving,setSaving]=useState(false),[donationDraft,setDonationDraft]=useState<Record<string,string>>({}),[linkDraft,setLinkDraft]=useState<Record<string,string>>({}),[videoUrl,setVideoUrl]=useState(''),[coverFile,setCoverFile]=useState<File|null>(null),[coverPreview,setCoverPreview]=useState(''),[channelArtFile,setChannelArtFile]=useState<File|null>(null),[channelArtPreview,setChannelArtPreview]=useState('/api/cover?id=channel'),[artMissing,setArtMissing]=useState(false),[liveCoverFile,setLiveCoverFile]=useState<File|null>(null),[liveCoverPreview,setLiveCoverPreview]=useState(''),[watching,setWatching]=useState<Post|null>(null),[liveTitle,setLiveTitle]=useState(''),[liveNote,setLiveNote]=useState(''),[filter,setFilter]=useState('published'),[reading,setReading]=useState<Post|null>(null),[playing,setPlaying]=useState<Post|null>(null),[playerAutoplay,setPlayerAutoplay]=useState(true),[playerExpanded,setPlayerExpanded]=useState(true),[query,setQuery]=useState(''),[sort,setSort]=useState<'new'|'old'>('new'),[confirmDelete,setConfirmDelete]=useState<Post|null>(null),[dirty,setDirty]=useState(false),[replaceRecording,setReplaceRecording]=useState(false),[videoDuration,setVideoDuration]=useState(''),[calmFile,setCalmFile]=useState<File|null>(null),[calmPreview,setCalmPreview]=useState(''),[calmMissing,setCalmMissing]=useState(false);
 // Картинка круга покоя живёт под одним адресом, поэтому в ссылку идёт версия:
 // иначе браузер и WebView показывают прежнюю, пока не истечёт их кэш.
 const calmSrc=data?.calmArt?'/api/cover?id=calm&v='+encodeURIComponent(data.calmArt):'';
 const wideScreen=useWideScreen();
 // Мост появляется только внутри оконного приложения; в браузере кнопок нет.
 const shell=useDesktopApp();
 const [shellOpen,setShellOpen]=useState(false);
 const capture=useCapture(),live=useLive(),player=useRef<HTMLAudioElement|null>(null),fileInput=useRef<HTMLInputElement|null>(null),coverInput=useRef<HTMLInputElement|null>(null),channelArtInput=useRef<HTMLInputElement|null>(null),calmInput=useRef<HTMLInputElement|null>(null),liveCoverInput=useRef<HTMLInputElement|null>(null);
 const author=!!data?.isOwner&&!audience;
 useEffect(()=>{const update=()=>setSeen(readSeen());update();
  window.addEventListener('tt-seen',update);
  return()=>window.removeEventListener('tt-seen',update);},[]);
 // У слушателя страница не прокручивается сама: приложение становится
 // колонкой высотой в окно, а прокручивается только содержимое раздела. Так
 // исчезает «резиновая» прокрутка на пару десятков пикселей там, где всё и
 // так помещается, а длинные списки прокручиваются как прежде. Расчёт высоты
 // делает CSS — здесь только признаки экрана.
 useEffect(()=>{
  const listener=!author&&!!data&&!data.needsSetup;
  document.body.classList.toggle('tt-shell-locked',listener);
    return()=>{document.body.classList.remove('tt-shell-locked');};
 },[author,view,data]);
 // Ссылку на приложение показываем только в браузере: внутри самого
 // приложения и в окне студии на ПК предлагать его скачать незачем.
 const appLink=!shell&&!hasNativeClient()?(
  <a className="support-strip app-strip tt-pressable" href={APP_RELEASE.href} download>
   <AndroidMark/>
   <span className="support-strip-label">{t('app.download')}</span>
   <span className="support-strip-note">{APP_RELEASE.version}</span>
   <ChevronRight size={18}/>
  </a>):null;
 // Оформление студии — только автору на широком экране. Слушателю страница
 // канала показывается одинаково и в браузере на ПК, и в приложении.
 const wide=wideScreen&&author;
 useEffect(()=>{const native=window as Window & {chrome?:{webview?:{postMessage:(message:string)=>void}}};native.chrome?.webview?.postMessage(capture.recording||!!live.hosting?'true-thrills:active':'true-thrills:idle');},[capture.recording,live.hosting]);
 const [liveNow,setLiveNow]=useState<Data['live']>(null),[liveError,setLiveError]=useState(false);
 const liveStatus=liveNow;
 // Сколько уже идёт эфир. Время берётся с сервера (момент выхода в эфир), а
 // тикает локально раз в секунду — только пока открыта вкладка эфира.
 const [now,setNow]=useState(0);
 useEffect(()=>{if(view!=='live'||!liveStatus?.startedAt)return;const update=()=>setNow(Date.now());const first=setTimeout(update,0),timer=setInterval(update,1000);return()=>{clearTimeout(first);clearInterval(timer);};},[view,liveStatus?.startedAt]);
 const elapsed=liveStatus?.startedAt&&now?clock(Math.max(0,Math.floor((now-liveStatus.startedAt)/1000))):'';
 // Системная кнопка «Назад» на Android. Порядок задан спецификацией: меню,
 // полный плеер, листы поверх экрана, возврат на главную — и только потом
 // нажатие уходит системе и приложение закрывается. Меню и плеер регистрируют
 // себя сами, здесь остаются листы и навигация.
 useEffect(()=>{
  if(!reading&&!watching)return;
  return pushBackLayer(BACK_OVERLAY,()=>{setReading(null);setWatching(null);return true;});
 },[reading,watching]);
 useEffect(()=>{
  if(view==='home')return;
  return pushBackLayer(BACK_NAV,()=>{setView('home');return true;});
 },[view]);
 // Мост для WebView: Android спрашивает у страницы, есть ли что закрыть.
 useEffect(()=>{
  const host=window as Window&{trueThrills?:{back:()=>boolean}};
  host.trueThrills={...host.trueThrills,back:runBack};
  return()=>{delete host.trueThrills;};
 },[]);
 const liveRequest=useRef(false);
 const refreshLive=useCallback(async()=>{if(liveRequest.current)return;liveRequest.current=true;try{const r=await api<{live:Data['live']}>('live?status=1');setLiveNow(r.live);setLiveError(false);}catch{setLiveError(true);}finally{liveRequest.current=false;}},[]);
 // eslint-disable-next-line react-hooks/set-state-in-effect -- Subscribe to server live state and fetch its initial snapshot.
 useEffect(()=>{void refreshLive();const timer=setInterval(()=>void refreshLive(),3000);const resume=()=>{if(document.visibilityState==='visible')void refreshLive();};document.addEventListener('visibilitychange',resume);window.addEventListener('focus',resume);return()=>{clearInterval(timer);document.removeEventListener('visibilitychange',resume);window.removeEventListener('focus',resume);};},[refreshLive]);
 // eslint-disable-next-line react-hooks/exhaustive-deps -- Срабатывает на смену готовности микрофона или состояния эфира; live и t здесь только читаются.
 useEffect(()=>{if(live.hosting&&!capture.ready){void live.stop().catch(()=>{});toast.error(t('live.micLost'));}},[capture.ready,live.hosting]);
 const load=useCallback(async()=>{try{const d=await api<Data>('library');setData(d);setError('');return d as Data;}catch(e){setError(errorText(e));return null;}},[]);
 // Заставка держится минимум 900 мс, чтобы не мигать на быстрой сети, и
 // гаснет после первого ответа сервера — успешного или с ошибкой.
 const [splash,setSplash]=useState<'on'|'out'|'off'>('on'),bootAt=useRef(0);
 useEffect(()=>{if(!bootAt.current)bootAt.current=Date.now();if(splash!=='on'||(!data&&!error))return;const timer=setTimeout(()=>{setSplash('out');setTimeout(()=>setSplash('off'),420);},Math.max(0,900-(Date.now()-bootAt.current)));return()=>clearTimeout(timer);},[data,error,splash]);
 // eslint-disable-next-line react-hooks/set-state-in-effect -- Initial server synchronization updates loading/error state; runs once per load. player handshake only.
 useEffect(()=>{load().then(d=>{if(d){setDonationDraft(Object.fromEntries((d.donations??[]).map(x=>[x.kind,x.url])));setLinkDraft(Object.fromEntries((d.links??[]).map(l=>[l.kind,l.url])));const q=new URLSearchParams(location.search);if(q.get('mode')==='listen'){setAudience(true);setView(LISTEN_VIEWS.includes(q.get('view')??'')?q.get('view')!:'home');}else if(d.isOwner&&LISTEN_VIEWS.includes(q.get('view')||''))setView(q.get('view')!);else if(!d.isOwner&&!d.needsSetup)setView('home');if(q.has('post')||q.has('broadcast'))void noticeHandler.current(location.href);else if(hasNativeClient())void nativeCall<{id:string;active:boolean;playing:boolean;position:number;duration:number}>('player.state').then(state=>{
  // Восстановление, а не запуск. Экран пересоздался, а нативный плеер всё это
  // время работал сам: он мог играть, а мог стоять на паузе. Раньше эфир при
  // этом запускался заново, а поставленный на паузу выпуск просто исчезал с
  // экрана — плеера нет, хотя он есть. Показываем как есть и ничего не
  // трогаем.
  setPlayerAutoplay(state.playing);
  if(state.active&&state.id.startsWith('live:')){setView('live');void live.listen(state.id.slice(5),undefined,state.playing);return;}
  const post=d.items.find(p=>p.id===state.id&&p.kind==='podcast');
  // Фоновый плеер при запуске может ответить нулём, если он уже остановлен.
  // Записывать такой ответ нельзя: он стирал место остановки при каждом
  // открытии приложения.
  if(post){if(state.active||state.position>0)saveProgress(post.id,state.position/1000,state.duration/1000);if(state.active){setPlayFrom('keep');setPlaying(post);}}
 }).catch(()=>{});}});const timer=setInterval(()=>void load(),15000);const resume=()=>{if(document.visibilityState==='visible')void load();};document.addEventListener('visibilitychange',resume);window.addEventListener('focus',resume);return()=>{clearInterval(timer);document.removeEventListener('visibilitychange',resume);window.removeEventListener('focus',resume);};
 // eslint-disable-next-line react-hooks/exhaustive-deps -- live читается один раз при восстановлении нативного плеера; в зависимостях он перезапускал бы синхронизацию на каждый кадр эфира.
 },[load]);
 useEffect(()=>{if(!('serviceWorker'in navigator))return;navigator.serviceWorker.register('/sw.js',{updateViaCache:'none'}).catch(()=>{});const handler=(e:MessageEvent)=>{if(e.data?.type==='tt-notification'&&typeof e.data.url==='string')void noticeHandler.current(e.data.url);};navigator.serviceWorker.addEventListener('message',handler);return()=>navigator.serviceWorker.removeEventListener('message',handler);},[]);

 useEffect(()=>{const guard=(e:BeforeUnloadEvent)=>{if(dirty||saving){e.preventDefault();e.returnValue='';}};window.addEventListener('beforeunload',guard);return()=>window.removeEventListener('beforeunload',guard);},[dirty,saving]);
 useEffect(()=>{if(editor==='story'&&!editing){try{localStorage.setItem('tt-story-draft',JSON.stringify({title,description,body}));}catch{}}},[editor,editing,title,description,body]);
 const run=async(fn:()=>Promise<unknown>,message?:string)=>{try{await fn();if(message)toast.success(message);await load();}catch(e){toast.error(errorText(e));}};
 function openEditor(kind:'story'|'podcast'|'video',p?:Post){setEditing(p??null);setVideoDuration(kind==='video'&&p?.duration?clock(p.duration):'');setTitle(p?.title??'');setDescription(p?.description??'');setBody(p?.body??'');setVideoUrl(p?.videoUrl??'');setCoverUrl(p?.coverUrl??'');setCoverFile(null);setCoverPreview(p?coverSrc(p):'');setDirty(false);setEditor(kind);if(kind==='story'&&!p){try{const saved=JSON.parse(localStorage.getItem('tt-story-draft')||'null');if(saved){setTitle(saved.title||'');setBody(saved.body||'');setDescription(saved.description||'');}}catch{}}}
 async function setup(){setSaving(true);await run(async()=>{await api('library',{action:'setup'});setView('home');},t('studio.ready0'));setSaving(false);}
 async function uploadFile(b:Blob){if(!b.size)throw new Error(t('capture.emptyFile'));if(b.size>80*1024*1024)throw new Error(t('capture.tooBigUpload'));let mime=b.type||'audio/mpeg';if(mime==='video/webm')mime='audio/webm';if(mime==='audio/x-m4a')mime='audio/mp4';const r=await fetch('/api/audio',{method:'POST',headers:{'Content-Type':mime,'X-Upload-Size':String(b.size)},body:b});const d=await r.json() as {error?:string;key:string};if(!r.ok)throw new Error(d.error?t(d.error.replace(/^#/,'')):t('capture.uploadFailed'));return d.key as string;}
 async function uploadCover(f:File){if(!f.size)throw new Error(t('capture.emptyFile'));if(f.size>12*1024*1024)throw new Error(t('editor.coverTooBig'));const r=await fetch('/api/cover',{method:'POST',headers:{'Content-Type':f.type,'X-Upload-Size':String(f.size)},body:f});const d=await r.json() as {error?:string;key:string};if(!r.ok)throw new Error(d.error?t(d.error.replace(/^#/,'')):t('capture.uploadFailed'));return d.key as string;}
 async function save(published:boolean){
  if(!title.trim()){toast.error(t('editor.needTitle'));return;}if(editor==='story'&&!body.trim()){toast.error(t('editor.needStory'));return;}if(editor==='video'&&!videoUrl.trim()){toast.error(t('editor.needVideoUrl'));return;}
  const videoSeconds=editor==='video'?parseClock(videoDuration):0;
  if(videoSeconds===null){toast.error(t('editor.badDuration'));return;}
  setSaving(true);
  try{const audioKey=editor==='podcast'?(editing?.audioKey??(capture.blob?await uploadFile(capture.blob):null)):null;if(editor==='podcast'&&!audioKey)throw new Error(t('editor.needAudio'));
   const coverKey=coverFile?await uploadCover(coverFile):(coverUrl.trim()?null:(editing?.coverKey??null));
   await api('library',{id:editing?.id,kind:editor,title,description,body,videoUrl,coverUrl,coverKey,audioKey,duration:editor==='video'?videoSeconds:(editing?.duration??(editor==='podcast'?capture.seconds:0)),published});if(editor==='story'&&!editing){try{localStorage.removeItem('tt-story-draft');}catch{}}setEditor(null);setDirty(false);toast.success(published?t('editor.publishedToast'):t('editor.draftSaved'));setView(editor==='story'?'stories':editor==='video'?'videos':'podcasts');await load();
  }catch(e){toast.error(errorText(e));}finally{setSaving(false);}
 }
 async function pickFile(e:React.ChangeEvent<HTMLInputElement>){const file=e.target.files?.[0];e.target.value='';if(!file)return;if(file.size>80*1024*1024){toast.error(t('capture.tooBigUpload'));return;}await capture.accept(file);openEditor('podcast');setTitle(file.name.replace(/\.[^.]+$/,''));}
 async function startLive(){if(!liveTitle.trim()){toast.error(t('live.titleRequired'));return;}stopNativePlayer();player.current?.pause();live.leave();const s=capture.stream.current??await capture.connect();if(s){let cover:string|undefined;if(liveCoverFile){try{cover=await uploadCover(liveCoverFile);}catch(e){toast.error(errorText(e));return;}}await live.start(liveTitle,s,cover,liveNote);await refreshLive();await load();}}
 async function stopLive(){await run(()=>live.stop(),t('live.stopped'));capture.release();await refreshLive();}
 /**
  * Один путь для всех кнопок «Поделиться»: сначала системный лист телефона,
  * затем navigator.share браузера и только на ПК — своё окно.
  */
 async function share(path:string,title:string){
  const payload:SharePayload={url:shareUrl(path,location.origin),title};
  const route=shareRoute({native:hasNativeClient(),webShare:typeof navigator!=='undefined'&&!!navigator.share});
  if(route==='native'){try{await nativeCall('ui.share',{...payload});return;}catch{/* системного листа нет — покажем своё окно */}}
  if(route==='web'){try{await navigator.share(payload);return;}catch(e){if((e as Error)?.name==='AbortError')return;}}
  setSharing(payload);
 }
 function openLive(){
  setView('live');
  if(author)return;
  if(!liveStatus){void refreshLive();return;}
  if(live.joined&&live.activeId===liveStatus.id){
   if(live.phase==='paused'||live.phase==='blocked')void live.resume();
   return;
  }
  stopNativePlayer();player.current?.pause();setPlaying(null);
  // Start within this click so the browser receives the listener's user gesture.
  void live.listen(liveStatus.id,liveStatus.title);
 }
 function playPost(p:Post,resume=false){live.leave();setPlayFrom(resume?'resume':'begin');setPlayerAutoplay(true);setPlayerExpanded(true);setPlaying(p);setTimeout(()=>{player.current?.play().catch(()=>toast.info(t('player.tapInPlayer')));},50);}
 // Видео и подкаст не должны звучать одновременно, поэтому открытие видео
 // останавливает аудиоплеер и выходит из эфира.
 function openPost(p:Post,resume=false){markSeen(p.id);unhideResume(p.id);if(p.kind==='podcast'){playPost(p,resume);return;}if(p.kind==='video'){stopNativePlayer();player.current?.pause();setPlaying(null);live.leave();setWatching(p);return;}setReading(p);}
 useEffect(()=>{noticeHandler.current=async(raw:string)=>{const url=new URL(raw,location.origin);if(url.origin!==location.origin||url.pathname!=='/'||capture.recording||live.hosting)return;setAudience(true);setFilter('published');const v=url.searchParams.get('view');setView(LISTEN_VIEWS.includes(v??'')?v!:'home');
  if(url.searchParams.has('post')){const fresh=await load(),p=fresh?.items.find(p=>p.id===url.searchParams.get('post'));if(p)openPost(p);else toast.info(t('post.gone'));}
  if(url.searchParams.has('broadcast')){try{const r=await api<{live:Data['live']}>('live?status=1');setLiveNow(r.live);if(r.live?.id===url.searchParams.get('broadcast')){stopNativePlayer();player.current?.pause();setPlaying(null);void live.listen(r.live.id,r.live.title);}else toast.info(t('live.alreadyEnded'));}catch(e){toast.error(errorText(e));}}
 };});
 const visible=(data?.items??[]).filter(p=>(author||p.published===1)&&(!author||p.published===(filter==='published'?1:0)));
 const count=(kind:string)=>(data?.items??[]).filter(p=>p.kind===kind&&!(kind==='podcast'&&isLiveArchive(p.audioKey))&&(author||p.published===1)).length;
 const inputChoice=<InputPicker capture={capture} locked={capture.recording||!!live.hosting}/>;
 // Смена вкладки сворачивает развёрнутый плеер: лист закрывал бы то, ради
 // чего человек нажал на вкладку.
 // «Всё начинается с голоса.» — последние два слова во всех четырёх языках
 // и есть смысловой акцент, их и подсвечиваем.
 const accent=(text:string)=>{const words=text.split(' ');if(words.length<3)return text;return <>{words.slice(0,-2).join(' ')+' '}<span className="accent">{words.slice(-2).join(' ')}</span></>;};
 const goto=(v:string)=>{setView(RETIRED_VIEWS[v]??v);setFilter('published');setQuery('');setPlayerExpanded(false);};
 const listKind=view==='podcasts'?'podcast':view==='videos'?'video':'story';
 const sectionOrder=visible.filter(p=>p.kind==='podcast'&&!isLiveArchive(p.audioKey)).sort((a,b)=>sort==='new'?b.createdAt-a.createdAt:a.createdAt-b.createdAt);
 // Записи эфиров живут в разделе «Эфир»: это не подкасты, а то, что осталось
 // от прямых включений.
 // Главная слушателя тоже не знает про записи эфиров: иначе запись становилась
 // и обложкой плитки «Подкасты», и поводом для значка «новое».
 const homePosts=(data?.items??[]).filter(p=>!(p.kind==='podcast'&&isLiveArchive(p.audioKey)));
 const liveArchives=visible.filter(p=>p.kind==='podcast'&&isLiveArchive(p.audioKey)).sort((a,b)=>b.createdAt-a.createdAt);
 const archiveNeedle=archiveQuery.trim().toLowerCase();
 const archiveShown=archiveNeedle?liveArchives.filter(p=>p.title.toLowerCase().includes(archiveNeedle)):liveArchives;
 const needle=query.trim().toLowerCase();
 // Эфир и подкаст — разные вещи: записи эфиров живут в архиве эфиров и в
 // каталог подкастов не попадают ни у слушателя, ни у автора.
 const listed=visible.filter(p=>p.kind===listKind&&!(p.kind==='podcast'&&isLiveArchive(p.audioKey))&&(!needle||(p.title+' '+p.description).toLowerCase().includes(needle))).sort((a,b)=>sort==='new'?b.createdAt-a.createdAt:a.createdAt-b.createdAt);
 const socialRow=data?.links?.length?<div className="social-row">{data.links.map(l=>{const Icon=SOCIAL_ICON[l.kind]??Globe;return <a key={l.kind+l.url} className="social-chip" href={l.url} target="_blank" rel="noopener noreferrer"><Icon size={16}/>{t(SOCIALS.find(s=>s.kind===l.kind)?.labelKey??'common.link')}</a>;})}</div>:null;
 // PayPal в России не работает, Boosty за её пределами почти никто не знает.
 // Сердечко в шапке ведёт только на одну ссылку, поэтому выбираем её по языку
 // телефона: итальянский — PayPal, остальные — Boosty. Если нужной платформы у
 // автора нет, берём ту, что настроена. В блоке поддержки видны обе.
 const heartLink=data?.donations?.find(d=>d.kind===(locale==='it'?'paypal':'boosty'))??data?.donations?.[0];

 return <>
 <Toaster theme="dark" richColors position="top-center"/>
 <div className={'app-shell '+(author?'is-author':'is-listener')+(!author&&view==='home'?' is-immersive':'')}>
 {splash!=='off'&&<div className={'splash'+(splash==='out'?' splash-out':'')} aria-hidden="true"><img src="/brand/logo.png?v=0.4.1" width="96" height="96" alt=""/><span className="splash-bar"><span/></span></div>}
 <div className="status-bar-veil" aria-hidden="true"/>
 <header className="top-header">
  <button type="button" className="top-header-brand" aria-label={t('nav.home')} onClick={()=>{haptic();goto('home');}}>{wide?<LiquidMetalButton viewMode="icon" size={96} interactive={false} icon={<img className="brand-inside-metal" src="/brand/logo.png?v=0.4.1" width="82" height="82" alt=""/>}/>:<img src="/brand/logo.png?v=0.4.1" width="34" height="34" alt=""/>}<span className="wordmark">True Thrills</span></button>
  <div className="top-header-actions">
   {shell&&<div className="shell-menu">
    <button className="quiet-button tt-pressable" aria-label={t('shell.menu')} title={t('shell.menu')} aria-expanded={shellOpen} onClick={()=>setShellOpen(v=>!v)}><MoreHorizontal size={20}/></button>
    {shellOpen&&<><button className="shell-menu-veil" aria-label={t('common.cancel')} onClick={()=>setShellOpen(false)}/>
     <div className="shell-menu-list" role="menu">
      <button role="menuitem" onClick={()=>{setShellOpen(false);sendDesktopCommand('reload');}}>{t('common.refresh')}</button>
      <button role="menuitem" onClick={()=>{setShellOpen(false);sendDesktopCommand('browser');}}>{t('shell.browser')}</button>
      <button role="menuitem" onClick={()=>{setShellOpen(false);sendDesktopCommand('fullscreen');}}>{t('shell.fullscreen')}</button>
      <button role="menuitem" onClick={()=>{setShellOpen(false);sendDesktopCommand('about');}}>{t('shell.about')}</button>
     </div></>}
   </div>}
   {/* Сердечко открывает небольшое окно с площадками: в настройках просьбам о
     поддержке не место, а одна зашитая ссылка прятала вторую площадку. */}
 {!author&&!!data?.donations?.length&&<button type="button" className="support-button" aria-label={t('donate.action')} onClick={()=>{haptic();setDonateOpen(true);}}><Heart size={19}/><span>{t('header.support')}</span></button>}
   {/* Поделиться каналом — там же, где поиск и настройки: слушателю больше негде. */}
   {!author&&data&&!data.needsSetup&&<button className="quiet-button tt-pressable" aria-label={t('share.action')} title={t('share.action')} onClick={()=>{haptic();void share('/?mode=listen&view=home',t('share.channel'));}}><Share2 size={19}/></button>}
   {!author&&data&&!data.needsSetup&&<button className="quiet-button tt-pressable" aria-label={t('header.settings')} title={t('header.settings')} onClick={()=>{haptic();goto('settings');}}><SlidersHorizontal size={20}/></button>}
   {author&&<button className="quiet-button" aria-label={t('header.logout')} title={t('header.logout')} onClick={()=>void run(async()=>{await api('auth',{action:'logout'});location.href='/login';})}><LogOut size={18}/></button>}
  </div>
 </header>
 <main className={'main-content '+(!author?'listener-main':'')} data-view={view}>
 {error&&<div className="error-box" role="alert">{error}<button onClick={()=>void load()}>{t('common.retry')}</button></div>}
 {!data&&!error&&<div className="loading-state"><Loader2 className="spin"/>{t('common.loading')}</div>}
 {data?.needsSetup&&<section className="setup-card"><span className="eyebrow">{t('setup.eyebrow')}</span><h1 className="wrap-lines">{t('setup.title')}</h1><p>{t('setup.text')}</p>{data.signedIn?<button className="primary-button" onClick={()=>void setup()} disabled={saving}>{t('setup.cta')}<ArrowUpRight size={18}/></button>:<a className="primary-button" href="/login">{t('common.login')}</a>}<small>{t('setup.note')}</small></section>}
 {data&&!data.needsSetup&&<>
 {!((view==='home'||view==='live'||view==='podcasts')&&!author)&&<div className="page-heading"><div><h1>{view==='home'?t('heading.homeAuthor'):view==='studio'?accent(t('heading.studio')):view==='podcasts'?t('heading.podcasts'):view==='videos'?t('heading.videos'):view==='stories'?t('heading.stories'):view==='live'?t('heading.live'):t('heading.settings')}</h1><p className="heading-description">{view==='home'?t('desc.homeAuthor'):view==='studio'?t('desc.studio'):view==='podcasts'?(author?t('desc.podcastsAuthor'):t('desc.podcastsListener')):view==='videos'?(author?t('desc.videosAuthor'):t('desc.videosListener')):view==='stories'?(author?t('desc.storiesAuthor'):t('desc.storiesListener')):view==='live'?t('desc.live'):(author?t('desc.settingsAuthor'):t('desc.settingsListener'))}</p></div>{author&&view==='podcasts'&&<button className="primary-button" onClick={()=>fileInput.current?.click()}><Upload size={17}/>{t('studio.uploadEpisode')}</button>}{author&&view==='videos'&&<button className="primary-button" onClick={()=>openEditor('video')}><Plus size={18}/>{t('home.addVideo')}</button>}{author&&view==='stories'&&<button className="primary-button" onClick={()=>openEditor('story')}><Plus size={18}/>{t('studio.newStory')}</button>}</div>}
 {liveError&&<div className="live-refresh-warning" role="status">{t('live.refreshFailed')}<button onClick={()=>void refreshLive()}>{t('common.refresh')}</button></div>}
 {liveStatus&&view!=='live'&&!(view==='home'&&!author)&&<button type="button" className="onair-banner onair-notice" onClick={openLive}><span className="onair-symbol"><Radio size={25}/></span><span className="onair-copy"><span className="onair-label">{live.joined&&live.activeId===liveStatus.id&&live.listening?t('live.youAreListening'):t('live.authorOnAir')}</span><strong>{liveStatus.title}</strong></span><span className="primary-button">{author?t('live.open'):live.joined&&live.activeId===liveStatus.id?(live.phase==='paused'?t('live.continueListening'):live.phase==='blocked'?t('live.enableSound'):live.connecting||live.phase==='reconnecting'?t('live.connecting'):t('live.backToLive')):t('live.listen')}<ChevronRight size={17}/></span></button>}
 {author&&live.hosting&&view!=='live'&&<div className="host-running-note">{t('live.micOnNote')}<button onClick={()=>void stopLive()}>{t('live.stop')}</button></div>}
 {view==='home'&&author&&<div className="home-actions">
 <button className="home-tile" onClick={()=>openEditor('video')}>{wide?<LiquidMetalButton viewMode="icon" size={44} interactive={false} icon={<Video size={19} color="#6FE7DE"/>}/>:<Video size={22}/>}<span>{t('home.addVideo')}</span></button>
 <button className="home-tile" onClick={()=>openEditor('story')}>{wide?<LiquidMetalButton viewMode="icon" size={44} interactive={false} icon={<BookOpen size={19} color="#6FE7DE"/>}/>:<BookOpen size={22}/>}<span>{t('home.writeStory')}</span></button>
 <button className="home-tile home-tile-live" onClick={()=>goto('live')}>{wide?<LiquidMetalButton viewMode="icon" size={44} interactive={false} icon={<Radio size={19} color="#6FE7DE"/>}/>:<Radio size={22}/>}<span>{t('home.startLive')}</span></button>
 <button className="home-tile" onClick={()=>void share('/?mode=listen&view=home',t('share.channel'))}>{wide?<LiquidMetalButton viewMode="icon" size={44} interactive={false} icon={<Share2 size={19} color="#6FE7DE"/>}/>:<Share2 size={22}/>}<span>{t('share.action')}</span></button>
 </div>}

 {/* Счётчики разделов переехали сюда со страницы записи: сама страница ушла,
     а быстрый доступ к тому, что уже опубликовано, нужен. */}
 {view==='home'&&author&&<><div className="library-heading"><h2>{t('studio.libraryTitle')}</h2><span>{t('studio.librarySubtitle')}</span></div><div className="library-tiles"><button onClick={()=>setView('podcasts')}><span className="tile-icon"><Headphones/></span><div><strong>{count('podcast')}</strong><span>{t('nav.podcasts')}</span></div><ChevronRight/></button><button onClick={()=>setView('videos')}><span className="tile-icon"><Video/></span><div><strong>{count('video')}</strong><span>{t('nav.videos')}</span></div><ChevronRight/></button><button onClick={()=>setView('stories')}><span className="tile-icon"><BookOpen/></span><div><strong>{count('story')}</strong><span>{t('nav.stories')}</span></div><ChevronRight/></button></div></>}
 {view==='home'&&!author&&<HomeSceneView posts={homePosts} links={socialRow} live={liveStatus} onOpen={openPost} onOpenLive={openLive} appLink={appLink}
  archive={<button type="button" className="support-strip archive-strip tt-pressable" onClick={()=>{haptic();setArchiveOpen(true);goto('live');
    // С главной человек идёт именно за записями: подводим к списку сразу,
    // иначе он открывается ниже сгиба и выглядит как «ничего не произошло».
    setTimeout(()=>document.querySelector('.live-archive-list')?.scrollIntoView({block:'start',behavior:'smooth'}),260);}}>
   <AudioLines size={19}/><span className="support-strip-label">{t('live.archiveTitle')}</span><ChevronRight size={18}/></button>}
  support={heartLink?<a className="support-strip tt-pressable" href={heartLink.url} target="_blank" rel="noopener noreferrer"><Heart size={19}/><span className="support-strip-label">{t('header.support')}</span><ChevronRight size={18}/></a>:<span className="support-strip is-empty"><Heart size={19}/><span className="support-strip-label">{t('header.support')}</span><span className="support-strip-note">{t('donate.unavailable')}</span></span>}
  liveAction={live.joined&&live.activeId===liveStatus?.id?(live.phase==='paused'?t('live.continueListening'):live.phase==='blocked'?t('live.enableSound'):live.connecting||live.phase==='reconnecting'?t('live.connecting'):t('live.backToLive')):t('live.listen')}
  pinned={data.pinned}
  sections={[{kind:'podcast',label:t('nav.podcasts'),go:()=>goto('podcasts')},{kind:'video',label:t('nav.videos'),go:()=>goto('videos')},{kind:'story',label:t('nav.stories'),go:()=>goto('stories')}]}/>}
 {(view==='podcasts'||view==='stories'||view==='videos')&&<>
 {!author&&view==='podcasts'&&<VoiceHeader haptic={haptic}
  latest={(()=>{const fresh=visible.filter(p=>p.kind==='podcast'&&!isLiveArchive(p.audioKey)&&!seen.includes(p.id)).sort((a,b)=>b.createdAt-a.createdAt)[0];return fresh?{id:fresh.id,title:fresh.title,duration:fresh.duration}:null;})()}
  onOpen={episode=>{const post=(data?.items??[]).find(p=>p.id===episode.id);if(post)openPost(post);}}/>}
 {!author&&<div className="catalog-tools"><label className="catalog-search"><Search size={18}/><input type="search" value={query} placeholder={t('catalog.search')} aria-label={t('catalog.search')} onChange={e=>setQuery(e.target.value)}/></label><select className="catalog-sort" aria-label={t('catalog.sortAria')} value={sort} onChange={e=>setSort(e.target.value as 'new'|'old')}><option value="new">{t('catalog.sortNew')}</option><option value="old">{t('catalog.sortOld')}</option></select></div>}
 {author&&<Tabs value={filter} onValueChange={setFilter}><TabsList className="filter-tabs"><TabsTrigger value="published">{t('filter.published')}</TabsTrigger><TabsTrigger value="draft">{t('filter.drafts')}</TabsTrigger></TabsList></Tabs>}
 {listed.length===0?<section className="empty-state"><span className="empty-icon">{view==='podcasts'?<Headphones size={36}/>:view==='videos'?<Video size={36}/>:<BookOpen size={36}/>}</span><h2>{needle?t('catalog.nothingFound'):count(view==='podcasts'?'podcast':view==='videos'?'video':'story')?t('empty.sectionEmpty'):view==='podcasts'?t('empty.firstPodcast'):view==='videos'?t('empty.firstVideo'):t('empty.firstStory')}</h2><p>{!author?t('empty.listener'):view==='podcasts'?t('empty.podcastHint'):view==='videos'?t('empty.videoHint'):t('empty.storyHint')}</p>{author&&<button className="secondary-button" onClick={()=>view==='podcasts'?fileInput.current?.click():openEditor(view==='videos'?'video':'story')}><Plus size={17}/>{view==='podcasts'?t('studio.uploadEpisode'):view==='videos'?t('empty.addVideo'):t('studio.writeStory')}</button>}</section>:<div className="post-list">{listed.map((p,i)=><article className="post-card" key={p.id}><button className={'post-cover '+(p.kind==='story'?'story-cover':p.kind==='video'?'video-cover':'')} onClick={()=>openPost(p)} aria-label={t(p.kind==='podcast'?'post.listenAria':p.kind==='video'?'post.watchAria':'post.readAria',{title:p.title})}>{p.coverKey||p.coverUrl?<img className="post-cover-image" src={coverSrc(p)} loading="lazy" referrerPolicy="no-referrer" alt=""/>:p.kind==='podcast'?<img className="post-logo" src="/brand/logo.png?v=0.4.1" width="76" height="76" alt=""/>:p.kind==='video'?<Play size={30}/>:<BookOpen size={34}/>}{p.kind!=='video'&&<span>{String(listed.length-i).padStart(2,'0')}</span>}</button><div className="post-content"><div className="post-meta">{p.kind==='podcast'?(isLiveArchive(p.audioKey)?t('post.liveArchive'):t('post.podcast')):p.kind==='video'?t('post.video'):t('post.story')}<span>{author?new Date(p.createdAt).toLocaleString(tag,{dateStyle:'short',timeStyle:'short'}):new Date(p.createdAt).toLocaleDateString(tag)}</span>{author&&<span className={'publish-tag '+(p.published?'published':'')}>{p.published?t('post.published'):t('post.draft')}</span>}</div><button className="post-title" onClick={()=>openPost(p)}>{p.title}</button><p className={'post-note'+(openNotes.includes(p.id)?' is-open':'')} role="button" tabIndex={0} onClick={()=>{haptic();setOpenNotes(v=>v.includes(p.id)?v.filter(x=>x!==p.id):[...v,p.id]);}} onKeyDown={e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();setOpenNotes(v=>v.includes(p.id)?v.filter(x=>x!==p.id):[...v,p.id]);}}}>{p.description||(p.kind==='story'?p.body.slice(0,130):p.kind==='video'?t('post.defaultVideo'):t('post.defaultPodcast'))}</p><div className="post-actions"><button className="text-button" onClick={()=>openPost(p)}>{p.kind==='podcast'?<Play size={15}/>:p.kind==='video'?<Video size={15}/>:<BookOpen size={15}/>} {p.kind==='podcast'?t('post.listen'):p.kind==='video'?t('post.watch'):t('post.read')}{p.duration>0&&<span>{clock(p.duration)}</span>}</button>{author&&<><button aria-label={t('post.edit')} title={t('post.edit')} onClick={()=>openEditor(p.kind as 'podcast'|'story'|'video',p)}><Pencil size={16}/></button><button aria-label={p.published?t('post.unpublish'):t('post.publish')} title={p.published?t('post.unpublish'):t('post.publish')} onClick={()=>void run(()=>api('library',{action:'visibility',id:p.id,published:!p.published}),p.published?t('post.movedToDrafts'):t('post.publishedToast'))}>{p.published?<EyeOff size={16}/>:<Eye size={16}/>}</button><button aria-label={data.pinned===p.id?t('post.unpin'):t('post.pin')} title={data.pinned===p.id?t('post.unpin'):t('post.pin')} data-active={data.pinned===p.id} onClick={()=>void run(()=>api('library',{action:'pin',id:data.pinned===p.id?'':p.id}),data.pinned===p.id?t('post.unpinned'):t('post.pinned'))}>{data.pinned===p.id?<PinOff size={16}/>:<Pin size={16}/>}</button><button aria-label={t('post.delete')} title={t('post.delete')} onClick={()=>setConfirmDelete(p)}><Trash2 size={16}/></button></>}</div></div></article>)}</div>}
 </>}
 {view==='live'&&author&&<LiveArchives onEdit={id=>{const post=(data?.items??[]).find(p=>p.id===id);if(post)openEditor(post.kind as 'podcast',post);}}/>}{view==='live'&&<div className="live-layout"><section className="live-main-panel live-console">
 {author?<>
 <div className={'session-status '+(live.hosting?'is-onair':'')} role="status"><Radio size={21}/><div><strong>{live.hosting?t('live.running'):live.connecting?t('live.starting'):t('live.preparing')}</strong><span>{live.hostStatus||(capture.ready?t('live.micReady'):t('live.pickSource'))}</span></div>{live.hosting&&<span className="live-timer">{clock(live.hostSeconds)}</span>}</div>
 <label className="field">{t('live.titleField')}<input maxLength={160} value={liveTitle} disabled={!!live.hosting} placeholder={t('live.titlePlaceholder')} onChange={e=>setLiveTitle(e.target.value)}/></label>
 {/* Описание эфира: слушатель видит его на экране эфира, а после окончания оно
     становится описанием записи — писать, о чём эфир, нужно один раз. */}
 <label className="field live-note-field">{t('live.noteField')}<textarea maxLength={2000} rows={3} value={liveNote} disabled={!!live.hosting} placeholder={t('live.notePlaceholder')} onChange={e=>setLiveNote(e.target.value)}/></label>
 {!live.hosting&&<div className="field"><span>{t('live.coverField')}</span><div className="cover-picker">{liveCoverPreview&&<img className="cover-preview live-cover-preview" src={liveCoverPreview} alt=""/>}<div className="cover-picker-actions"><button type="button" className="secondary-button" onClick={()=>liveCoverInput.current?.click()}><Upload size={16}/>{liveCoverFile?t('live.coverChange'):t('live.coverUpload')}</button><input type="file" accept="image/jpeg,image/png,image/webp,image/gif" ref={liveCoverInput} hidden onChange={e=>{const f=e.target.files?.[0];if(f){setLiveCoverFile(f);setLiveCoverPreview(URL.createObjectURL(f));}e.target.value='';}}/><small className="editor-hint">{t('live.coverNote')}</small></div></div></div>}
 {inputChoice}
 <SignalMeter samples={capture.samples} level={capture.level} clipping={capture.clipping} active={capture.ready&&!capture.muted} label={capture.muted?t('live.micOff'):live.hosting?t('live.signalOnAir'):t('live.voiceCheck')}/>
 <AudioControls capture={capture}/>
 {live.hosting?<><div className="broadcast-summary"><Headphones size={20}/><strong>{live.listeners}</strong><span>{live.listeners?t('live.listenersConnected'):t('live.waitingFirst')}</span></div><div className="listener-link-actions"><a className="secondary-button" href="/?mode=listen&view=live" target="_blank" rel="noopener noreferrer"><Eye size={17}/>{t('live.openListener')}</a><button className="quiet-button" onClick={()=>void share('/?mode=listen&view=live',t('share.live'))}>{t('share.action')}</button></div><button className="primary-button stop-live-button" disabled={live.connecting} onClick={()=>void stopLive()}><Square size={17}/>{live.connecting?t('liveArchive.saving'):t('live.stop')}</button></>:<div className="preflight-actions"><button className="secondary-button" disabled={capture.busy||live.connecting||capture.recording} onClick={()=>capture.ready?capture.release():void capture.connect()}><Volume2 size={17}/>{capture.busy?t('live.connectingShort'):capture.ready?t('live.stopCheck'):t('live.checkMic')}</button><button className="primary-button" disabled={live.connecting||capture.recording||capture.busy||capture.discovering} onClick={()=>void startLive()}>{live.connecting?<Loader2 className="spin" size={18}/>:<Radio size={18}/>}{t('live.start')}</button></div>}
 {liveStatus&&!live.hosting&&<button className="quiet-button" onClick={()=>void run(async()=>{await api('live',{action:'stop',id:liveStatus!.id});await refreshLive();},t('live.stopped'))}>{t('live.stopFromOtherWindow')}</button>}
 </>:<>
 <LiveStageView levels={live.levels} calmSrc={calmSrc} about={liveStatus?.description??''} title={liveStatus?.title??'True Thrills Live'} note={liveStatus?t('live.tapToConnect'):t('live.willAppearHere')}
  cover={liveStatus?.cover?'/api/cover?id=live:'+liveStatus.id:undefined} phase={live.phase} onAir={!!liveStatus} joined={live.joined}
  elapsed={elapsed} status={live.status} hint={live.phase==='error'?t('live.otherNetwork'):''} onListen={openLive} onPause={live.pause} onArchive={()=>setArchiveOpen(v=>{if(v)setArchiveQuery('');return !v;})} archiveOpen={archiveOpen}
  archive={<div className="live-archive-list">
   {/* Поиск живёт внутри раскрытого архива: в закрытом виде искать негде. */}
   {liveArchives.length>0&&<label className="live-archive-search"><Search size={16}/><input type="search" value={archiveQuery} placeholder={t('live.archiveSearch')} aria-label={t('live.archiveSearch')} onChange={e=>setArchiveQuery(e.target.value)}/></label>}
   {/* Пока воркер сшивает последнюю запись, архив честно говорит об этом:
       пустой список после только что законченного эфира читается как «записи
       пропали». */}
   {data.archivePending&&<p className="live-archive-empty">{t('live.archivePending')}</p>}
   {archiveShown.length===0?<p className="live-archive-empty">{liveArchives.length?t('catalog.nothingFound'):t('live.archiveEmpty')}</p>
    :archiveShown.map(p=><button type="button" key={p.id} className="live-archive-row tt-pressable" onClick={()=>{haptic();openPost(p);}}>
     <span className="live-archive-art"><Artwork src={coverSrc(p)} fallback={<img src="/brand/logo.png?v=0.4.1" width="44" height="44" alt=""/>} alt=""/></span>
     <span className="live-archive-row-copy"><strong>{p.title}</strong><span>{new Date(p.createdAt).toLocaleDateString(tag)}{p.duration>0?' · '+clock(p.duration):''}</span></span>
     <Play size={15} fill="currentColor"/></button>)}
  </div>}
  volume={live.joined?<div className="listener-volume"><label htmlFor="live-volume"><Volume2 size={18}/><span>{live.volume}%</span></label><Slider id="live-volume" aria-label={t('live.volumeAria')} value={[live.volume]} min={0} max={100} step={1} onValueChange={v=>live.setVolume(v[0])}/></div>:null}
  support={heartLink?<a className="support-strip tt-pressable" href={heartLink.url} target="_blank" rel="noopener noreferrer"><Heart size={19}/><span className="support-strip-copy"><strong className="support-strip-label">{t('donate.supportLive')}</strong><span>{t('donate.supportLiveNote')}</span></span><ChevronRight size={18}/></a>:<span className="support-strip is-empty"><Heart size={19}/><span className="support-strip-copy"><strong className="support-strip-label">{t('donate.supportLive')}</strong><span>{t('donate.unavailable')}</span></span></span>}/>
 {live.listening&&live.volume===0&&<div className="receiving-status">{t('live.volumeOff')}</div>}
 {live.joined&&<button className="quiet-button live-leave" onClick={live.leave}><LogOut size={18}/>{t('live.leave')}</button>}

 </>}
 </section>{author?<aside className="live-info"><h3>{t('live.infoAuthor')}</h3><p><Mic size={18}/>{t('live.authorTip1')}</p><p><Volume2 size={18}/>{t('live.authorTip2')}</p><p><Headphones size={18}/>{t('live.authorTip3')}</p><div className="pilot-note"><strong>{t('live.pilotTitle')}</strong><p>{t('live.pilotText')}</p><p>{t('live.pilotNoRecord')}</p></div></aside>:null}</div>}
 {(view==='settings'||(view==='home'&&author))&&<div className="settings-grid">
 {!author&&<NotificationSettings author={author}/>}
 {/* Строка поддержки на главной и в разделах ведёт на одну площадку — ту,
     что уместна по языку телефона. Обе должны оставаться доступны, поэтому
     здесь стоит карточка со всеми настроенными ссылками. Без неё вторая
     площадка исчезала из приложения совсем. */}
 {author?<>
 {view==='settings'&&<section className="settings-panel wide-panel"><div className="section-icon"><Heart size={22}/></div><h2>{t('settings.supportTitle')}</h2><p>{t('settings.supportText')}</p><div className="links-grid">{DONATIONS.map(dp=><label className="field" key={dp.kind}>{t(dp.labelKey)}<input type="url" value={donationDraft[dp.kind]??''} placeholder="https://…" onChange={e=>setDonationDraft(prev=>({...prev,[dp.kind]:e.target.value}))}/></label>)}</div><button className="primary-button" onClick={()=>void run(()=>api('library',{action:'donations',links:DONATIONS.map(dp=>({kind:dp.kind,url:(donationDraft[dp.kind]??'').trim()})).filter(l=>l.url)}),t('settings.donationSaved'))}><Check size={17}/>{t('settings.saveDonation')}</button><small>{t('settings.donationNote')}</small></section>}
 {view==='home'&&<section className="settings-panel"><div className="section-icon"><Wind size={22}/></div><h2>{t('settings.calmTitle')}</h2><p>{t('settings.calmText')}</p>{!calmMissing&&(calmPreview||calmSrc)&&<img className="channel-art-preview calm-art-preview" src={calmPreview||calmSrc} alt="" onError={()=>setCalmMissing(true)}/>}<button type="button" className="secondary-button" onClick={()=>calmInput.current?.click()}><Upload size={16}/>{t('settings.artUpload')}</button><input type="file" accept="image/jpeg,image/png,image/webp,image/gif" ref={calmInput} hidden onChange={e=>{const f=e.target.files?.[0];if(f){setCalmFile(f);setCalmPreview(URL.createObjectURL(f));setCalmMissing(false);}e.target.value='';}}/>{!calmMissing&&(calmPreview||calmSrc)&&<button type="button" className="quiet-button" onClick={()=>void run(async()=>{await api('library',{action:'calmArt',key:''});setCalmFile(null);setCalmPreview('');setCalmMissing(true);},t('settings.artRemoved'))}><Trash2 size={16}/>{t('settings.artRemove')}</button>}{calmFile&&<button className="primary-button" onClick={()=>void run(async()=>{const key=await uploadCover(calmFile);await api('library',{action:'calmArt',key});setCalmFile(null);},t('settings.artSaved'))}><Check size={17}/>{t('settings.saveArt')}</button>}<small>{t('settings.calmNote')}</small></section>}
 {view==='settings'&&<section className="settings-panel"><div className="section-icon"><ImageIcon size={22}/></div><h2>{t('settings.artTitle')}</h2><p>{t('settings.artText')}</p>{!artMissing&&<img className="channel-art-preview" src={channelArtPreview} alt="" onError={()=>setArtMissing(true)}/>}<button type="button" className="secondary-button" onClick={()=>channelArtInput.current?.click()}><Upload size={16}/>{t('settings.artUpload')}</button><input type="file" accept="image/jpeg,image/png,image/webp,image/gif" ref={channelArtInput} hidden onChange={e=>{const f=e.target.files?.[0];if(f){setChannelArtFile(f);setChannelArtPreview(URL.createObjectURL(f));setArtMissing(false);}e.target.value='';}}/>{!artMissing&&channelArtPreview&&<button type="button" className="quiet-button" onClick={()=>void run(async()=>{await api('library',{action:'channelArt',key:''});setChannelArtFile(null);setChannelArtPreview('');setArtMissing(true);},t('settings.artRemoved'))}><Trash2 size={16}/>{t('settings.artRemove')}</button>}{channelArtFile&&<button className="primary-button" onClick={()=>void run(async()=>{const key=await uploadCover(channelArtFile);await api('library',{action:'channelArt',key});setChannelArtFile(null);},t('settings.artSaved'))}><Check size={17}/>{t('settings.saveArt')}</button>}<small>{t('settings.artNote')}</small></section>}
 {view==='settings'&&<section className="settings-panel wide-panel"><div className="section-icon"><Link2 size={22}/></div><h2>{t('settings.linksTitle')}</h2><p>{t('settings.linksText')}</p><div className="links-grid">{SOCIALS.map(sc=><label className="field" key={sc.kind}>{t(sc.labelKey)}<input type="url" value={linkDraft[sc.kind]??''} placeholder="https://…" onChange={e=>setLinkDraft(prev=>({...prev,[sc.kind]:e.target.value}))}/></label>)}</div><button className="primary-button" onClick={()=>void run(()=>api('library',{action:'links',links:SOCIALS.map(sc=>({kind:sc.kind,url:(linkDraft[sc.kind]??'').trim()})).filter(l=>l.url)}),t('settings.linksSaved'))}><Check size={17}/>{t('settings.saveLinks')}</button><small>{t('settings.linksNote')}</small></section>}
 </>:null}
 </div>}
 </>}
 {!(view==='home'&&!author)&&<footer className="content-footer"><span>© {new Date().getFullYear()} True Thrills · Dumitru Paiul</span><span>{t('footer.rights')}</span>{view==='settings'&&<span className="footer-studio">Created by DarK Creative Studio</span>}</footer>}
 </main>
 {wide&&<div className="tt-beams" aria-hidden="true"><BeamsBackground><></></BeamsBackground></div>}
 {/* Фон-сетка — у слушателя и не на главной: там во весь кадр лежит обложка,
     под ней сетки не видно, а рисовать её впустую незачем. В студии фон не
     нужен вовсе: там работают. */}
 {!author&&view!=='home'&&data&&!data.needsSetup&&<KineticGrid/>}
 {!author&&data&&!data.needsSetup&&<footer className="site-footer">
 <span className="site-footer-brand"><img src="/brand/logo.png?v=0.4.1" width="28" height="28" alt=""/>True Thrills</span>
 <a className="site-footer-app" href={APP_RELEASE.href} download><AndroidMark size={16}/>{t('app.download')}<span>{APP_RELEASE.version}</span></a>
 {!!heartLink&&<a className="site-footer-link" href={heartLink.url} target="_blank" rel="noopener noreferrer">{t('header.support')}</a>}
 <span className="site-footer-note">{t('app.footerNote')}</span>
</footer>}
{data&&!data.needsSetup&&<nav className="bottom-nav">
 <button className="bottom-nav-item bottom-nav-podcasts tt-pressable" data-active={view==='podcasts'} aria-label={t('nav.podcasts')} onClick={()=>{haptic();goto('podcasts');}}>{liveStatus&&<span className="bottom-nav-dot"/>}{wide?<LiquidMetalButton viewMode="icon" size={38} interactive={false} icon={<Headphones size={18} color="#6FE7DE"/>}/>:<Headphones size={22}/>}<span>{t('nav.podcasts')}</span></button>
 <button className="bottom-nav-item bottom-nav-videos tt-pressable" data-active={view==='videos'} aria-label={t('nav.videos')} onClick={()=>{haptic();goto('videos');}}>{wide?<LiquidMetalButton viewMode="icon" size={38} interactive={false} icon={<Video size={18} color="#6FE7DE"/>}/>:<Video size={22}/>}<span>{t('nav.videos')}</span></button>
 <button className="bottom-nav-item bottom-nav-home tt-pressable" data-active={view==='home'} aria-label={t('nav.home')} onClick={()=>{haptic();goto('home');}}>{wide?<LiquidMetalButton viewMode="icon" size={38} interactive={false} icon={<img className="brand-inside-metal" src="/brand/logo.png?v=0.4.1" width="28" height="28" alt=""/>}/>:<img className="nav-brand-mark" src="/brand/logo.png?v=0.4.1" width="30" height="30" alt=""/>}<span>{t('nav.home')}</span></button>
 <button className="bottom-nav-item bottom-nav-live tt-pressable" data-active={view==='live'} aria-label={t('nav.live')} onClick={()=>{haptic();goto('live');}}>{wide?<LiquidMetalButton viewMode="icon" size={38} interactive={false} icon={<Radio size={18} color="#6FE7DE"/>}/>:<Radio size={22}/>}<span>{t('nav.live')}</span>{liveStatus&&<span className="bottom-nav-dot" aria-hidden="true"/>}</button>
 <button className="bottom-nav-item bottom-nav-stories tt-pressable" data-active={view==='stories'} aria-label={t('nav.stories')} onClick={()=>{haptic();goto('stories');}}>{wide?<LiquidMetalButton viewMode="icon" size={38} interactive={false} icon={<BookOpen size={18} color="#6FE7DE"/>}/>:<BookOpen size={22}/>}<span>{t('nav.stories')}</span></button>
 {author&&<button className="bottom-nav-item bottom-nav-settings tt-pressable" data-active={view==='settings'} aria-label={t('header.settings')} onClick={()=>{haptic();goto('settings');}}>{wide?<LiquidMetalButton viewMode="icon" size={38} interactive={false} icon={<SlidersHorizontal size={18} color="#6FE7DE"/>}/>:<SlidersHorizontal size={22}/>}<span>{t('header.settings')}</span></button>}
 </nav>}
 </div>
 <input type="file" accept="audio/*,.mp3,.wav,.m4a,.webm,.ogg,.flac" ref={fileInput} onChange={pickFile} hidden/>
 {playing&&<PodcastPlayer key={playing.id+':'+playFrom} src={'/api/audio?id='+playing.id} title={playing.title} duration={playing.duration} cover={coverSrc(playing)||undefined} note={playing.description||undefined} archived={isLiveArchive(playing.audioKey)} supportUrl={heartLink?.url} from={playFrom} onShare={()=>void share('/?mode=listen&post='+playing.id,playing.title)}
  next={(()=>{const after=nextEpisode(sectionOrder,playing.id);return after?{id:after.id,title:after.title,duration:after.duration,cover:coverSrc(after)||undefined}:null;})()}
  onNext={id=>{const post=(data?.items??[]).find(p=>p.id===id);if(post)playPost(post);}} audioRef={player} autoplay={playerAutoplay} expanded={playerExpanded} onExpand={setPlayerExpanded} onClose={()=>{stopNativePlayer();player.current?.pause();setPlaying(null);}}/>}
 <Dialog open={!!editor} onOpenChange={o=>{if(!o&&!saving){setEditor(null);}}}><DialogContent className="editor-dialog" onInteractOutside={e=>{if(dirty||saving)e.preventDefault();}} onEscapeKeyDown={e=>{if(dirty||saving)e.preventDefault();}} showCloseButton={!saving&&!dirty}><DialogHeader><DialogTitle>{editing?t('editor.editing'):editor==='story'?t('editor.newStory'):editor==='video'?t('editor.newVideo'):t('editor.newPodcast')}</DialogTitle><DialogDescription>{editor==='story'?t('editor.storyHint'):editor==='video'?t('editor.videoHint'):t('editor.podcastHint')}</DialogDescription></DialogHeader><label className="field">{t('editor.title')}<input value={title} maxLength={160} onChange={e=>{setTitle(e.target.value);setDirty(true);}} placeholder={editor==='story'?t('editor.titleStory'):editor==='video'?t('editor.titleVideo'):t('editor.titleEpisode')}/></label><label className="field">{t('editor.description')}<textarea value={description} maxLength={2000} rows={2} onChange={e=>{setDescription(e.target.value);setDirty(true);}} placeholder={t('editor.descriptionPlaceholder')}/></label><div className="field"><span>{t('editor.cover')}</span><div className="cover-picker">{coverPreview&&<img className="cover-preview" src={coverPreview} alt=""/>}<div className="cover-picker-actions"><button type="button" className="secondary-button" onClick={()=>coverInput.current?.click()}><Upload size={16}/>{t('editor.coverUpload')}</button><input type="file" accept="image/jpeg,image/png,image/webp,image/gif" ref={coverInput} hidden onChange={e=>{const f=e.target.files?.[0];if(f){setCoverFile(f);setCoverUrl('');setCoverPreview(URL.createObjectURL(f));setDirty(true);}e.target.value='';}}/><input type="url" value={coverUrl} maxLength={2000} placeholder={t('editor.coverUrlPlaceholder')} onChange={e=>{setCoverUrl(e.target.value);setCoverFile(null);setCoverPreview(e.target.value);setDirty(true);}}/><small className="editor-hint">{t('editor.coverNote')}</small></div></div></div>{editor==='story'?<label className="field">{t('editor.storyText')}<textarea className="story-textarea" value={body} maxLength={150000} rows={10} onChange={e=>{setBody(e.target.value);setDirty(true);}} placeholder={t('editor.storyPlaceholder')}/></label>:editor==='video'?<><label className="field">{t('editor.videoUrl')}<input type="url" value={videoUrl} onChange={e=>{setVideoUrl(e.target.value);setDirty(true);}} placeholder="https://youtu.be/…"/></label><label className="field">{t('editor.videoDuration')}<input inputMode="numeric" value={videoDuration} maxLength={10} onChange={e=>{setVideoDuration(e.target.value);setDirty(true);}} placeholder={t('editor.videoDurationPlaceholder')}/><small className="editor-hint">{t('editor.videoDurationNote')}</small></label><small className="editor-hint">{t('editor.videoNote')}</small></>:<div className="audio-editor-preview"><FileAudio size={22}/><span>{editing?t('editor.audioOfEpisode'):capture.blob?t('editor.audioReady',{size:(capture.blob.size/1024/1024).toFixed(1)}):t('editor.audioMissing')}</span>{!editing&&capture.url&&<audio controls src={capture.url}/>}</div>}<div className="editor-actions"><button className="quiet-button" disabled={saving} onClick={()=>{if(dirty){setDiscardText(true);}else setEditor(null);}}>{t('common.cancel')}</button><button className="secondary-button" disabled={saving} onClick={()=>void save(false)}>{t('editor.toDrafts')}</button><button className="primary-button" disabled={saving} onClick={()=>void save(true)}>{saving?<Loader2 className="spin" size={17}/>:<ArrowUpRight size={17}/>} {saving?t('editor.saving'):t('editor.publish')}</button></div>{editor==='video'&&!!videoUrl.trim()&&<div className="editor-preview"><span className="editor-preview-label">{t('editor.previewLabel')}</span><VideoFrame url={videoUrl.trim()} title={title||t('editor.previewTitle')} autoplay={false}/></div>}</DialogContent></Dialog>
 <Dialog open={!!reading} onOpenChange={o=>{if(!o)setReading(null);}}><DialogContent className="reading-dialog" onOpenAutoFocus={e=>e.preventDefault()}><DialogHeader><DialogDescription>{t('reading.eyebrow')}</DialogDescription><DialogTitle>{reading?.title}</DialogTitle></DialogHeader>{reading?.description&&<p className="reading-intro">{reading.description}</p>}<StoryReader key={reading?.id} id={reading?.id??''} body={reading?.body??''}/></DialogContent></Dialog>
 <Dialog open={!!watching} onOpenChange={o=>{if(!o)setWatching(null);}}><DialogContent className="video-dialog"><DialogHeader><DialogDescription>{t('watching.eyebrow')}</DialogDescription><DialogTitle>{watching?.title}</DialogTitle></DialogHeader>{!!watching?.videoUrl&&<VideoFrame url={watching.videoUrl} title={watching.title}/>}{!!watching?.description&&<p className="reading-intro">{watching.description}</p>}</DialogContent></Dialog>
 <ShareSheet key={sharing?.url??''} payload={sharing} onClose={()=>setSharing(null)}/>
 <Dialog open={donateOpen} onOpenChange={setDonateOpen}><DialogContent className="donate-dialog">
  <DialogHeader><DialogTitle>{t('donate.action')}</DialogTitle></DialogHeader>
  <div className="donate-choices">
   {(data?.donations??[]).map(dn=>{const Icon=DONATION_ICON[dn.kind];
    return <a key={dn.kind} className="donate-choice tt-pressable" href={dn.url} target="_blank" rel="noopener noreferrer" onClick={()=>setDonateOpen(false)}>
     <Icon size={30}/><span>{t(DONATIONS.find(x=>x.kind===dn.kind)?.labelKey??'common.link')}</span></a>;})}
  </div>
  <p className="donate-note">{t('donate.free')}</p>
 </DialogContent></Dialog>
 <AlertDialog open={!!confirmDelete} onOpenChange={o=>{if(!o)setConfirmDelete(null);}}><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>{t('confirm.deleteTitle',{title:confirmDelete?.title??''})}</AlertDialogTitle><AlertDialogDescription>{t('confirm.deleteText')}</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel>{t('common.cancel')}</AlertDialogCancel><AlertDialogAction onClick={()=>void run(()=>api('library',{action:'delete',id:confirmDelete?.id}),t('confirm.deleted'))}>{t('post.delete')}</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>
 <AlertDialog open={discardText} onOpenChange={setDiscardText}><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>{t('confirm.discardTitle')}</AlertDialogTitle><AlertDialogDescription>{t('confirm.discardText')}</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel>{t('confirm.keepEditing')}</AlertDialogCancel><AlertDialogAction onClick={()=>{setEditor(null);setDirty(false);}}>{t('confirm.close')}</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>
 <AlertDialog open={replaceRecording} onOpenChange={setReplaceRecording}><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>{t('confirm.replaceTitle')}</AlertDialogTitle><AlertDialogDescription>{t('confirm.replaceText')}</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel>{t('common.cancel')}</AlertDialogCancel><AlertDialogAction onClick={()=>void capture.start()}>{t('studio.startRecording')}</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>
 </>;
}
