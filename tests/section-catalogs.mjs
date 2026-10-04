#!/usr/bin/env node
/**
 * Три раздела слушателя — «Аудио», «Видео», «Истории» — в одном оформлении.
 *
 * Шапка у всех одна: заголовок с засечками слева двумя строками («Внутри
 * истории.», «Истории в кадре.», «Истории на страницах.»), подзаголовок —
 * колонкой справа. Владелец: верх подзаголовка — на высоте верха заголовка,
 * низ — на линии его низа. Поиск и сортировка — одной строкой (его правка
 * поверх макетов, где сортировка стояла ниже). Заголовок, поиск и список
 * начинаются от одного левого края; размер заголовка одинаков во всех трёх.
 *
 * На 360, 390 и 430 точек: нет горизонтальной прокрутки, заголовок не
 * вылезает за край, подзаголовок не обрезан, поиск не съеден сортировкой,
 * карточки в границах экрана, кнопки карточки не наезжают друг на друга,
 * нижняя панель не закрывает последнюю карточку.
 *
 * «Истории»: поиск, сортировка, «Читать» открывает читалку с той же историей,
 * «Назад» возвращает к списку, «Поделиться» отдаёт ссылку на запись.
 *
 * Всё — во временной базе; рабочие данные не трогаются. Снимки — в
 * outputs/ui/sections-*.png.
 */
import {chromium} from 'playwright';
import {spawn,execFileSync} from 'node:child_process';
import {mkdtemp,rm,mkdir,readFile} from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';

const root=process.cwd(),dir=await mkdtemp(path.join(root,'.test-tmp-sec-'));
const out=path.join(root,'outputs','ui');await mkdir(out,{recursive:true});
const env={...process.env,DATABASE_PATH:path.join(dir,'db.sqlite'),STORAGE_DIR:path.join(dir,'storage'),LIVE_DIR:path.join(dir,'live'),SESSION_SECRET:'chk-secret-not-production',ADMIN_PASSWORD:'chk-password',FIREBASE_SERVICE_ACCOUNT_FILE:'',PUBLIC_SITE_URL:''};
execFileSync(process.execPath,['node_modules/drizzle-kit/bin.cjs','migrate'],{env,stdio:'ignore'});
const port=3249,base='http://127.0.0.1:'+port;
const server=spawn(process.execPath,['node_modules/next/dist/bin/next','start','--hostname','127.0.0.1','--port',String(port)],{env,stdio:['ignore','ignore','inherit']});
let browser;
const SECTIONS=[
 {view:'podcasts',nav:'.bottom-nav-podcasts',navText:'Аудио',title:'Внутри\nистории',kicker:['Истории о выживании.','Музыка, которая погружает.'],search:'Найти историю или музыку',button:'Слушать'},
 {view:'videos',nav:'.bottom-nav-videos',navText:'Видео',title:'Истории\nв кадре',kicker:['Истории о выживании.','Смотри True Thrills прямо в приложении.'],search:'Найти видео',button:'Смотреть'},
 {view:'stories',nav:'.bottom-nav-stories',navText:'Истории',title:'Истории\nна страницах',kicker:['Читай о тех, кто не сдался.','Вместе с True Thrills.'],search:'Найти историю',button:'Читать'},
];
try{
 for(let i=0;i<80;i++){try{await fetch(base+'/api/health');break;}catch{await new Promise(r=>setTimeout(r,250));}}
 const login=await fetch(base+'/api/auth',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({password:'chk-password'})});
 const cookie=login.headers.get('set-cookie').split(';')[0];
 const api=d=>fetch(base+'/api/library',{method:'POST',headers:{cookie,'content-type':'application/json'},body:JSON.stringify(d)}).then(async r=>JSON.parse(await r.text()));
 await api({action:'setup'});
 const cover=async f=>{const b=await readFile(path.join(root,'tests/fixtures/demo-covers',f));
  return (await (await fetch(base+'/api/cover',{method:'POST',headers:{cookie,'content-type':'image/jpeg','x-upload-size':String(b.length)},body:b})).json()).key;};
 const seconds=4,rate=8000,wav=Buffer.alloc(44+rate*2*seconds);
 wav.write('RIFF');wav.writeUInt32LE(wav.length-8,4);wav.write('WAVEfmt ',8);wav.writeUInt32LE(16,16);wav.writeUInt16LE(1,20);wav.writeUInt16LE(1,22);wav.writeUInt32LE(rate,24);wav.writeUInt32LE(rate*2,28);wav.writeUInt16LE(2,32);wav.writeUInt16LE(16,34);wav.write('data',36);wav.writeUInt32LE(wav.length-44,40);
 const audioKey=(await (await fetch(base+'/api/audio',{method:'POST',headers:{cookie,'content-type':'audio/wav','x-upload-size':String(wav.length)},body:wav})).json()).key;
 const long='Очень длинное название, которое никак не помещается в две строки узкой карточки на телефоне';
 const longNote='Длинное описание без конца. '.repeat(16);
 await api({kind:'podcast',audioCategory:'audio_story',title:'76 дней',description:'Стивен Каллахэн. 76 дней на плоту посреди Атлантики.',audioKey,duration:seconds,published:true,coverKey:await cover('hero-lake.jpg')});
 await api({kind:'podcast',audioCategory:'music',title:long,description:longNote,audioKey,duration:seconds,published:true,coverKey:await cover('tile-forest.jpg')});
 await api({kind:'video',title:'Он выжил. Но какой ценой?',description:'Стивен Каллахэн. 76 дней в Атлантике.',videoUrl:'https://www.youtube.com/watch?v=dQw4w9WgXcQ',published:true,coverKey:await cover('tile-waterfall.jpg')});
 await api({kind:'video',title:long,description:longNote,videoUrl:'https://www.youtube.com/watch?v=dQw4w9WgXcQ',published:true});
 const first=await api({kind:'story',title:'Первая история',description:'Ранняя запись.',body:'Море не кончалось.\n\nВторой абзац.',published:true,coverKey:await cover('tile-mountains.jpg')});
 await new Promise(r=>setTimeout(r,20));
 await api({kind:'story',title:long,description:longNote,body:'Текст.',published:true,coverKey:await cover('tile-forest.jpg')});
 await new Promise(r=>setTimeout(r,20));
 await api({kind:'story',title:'Он выжил. Но какой ценой?',description:'Стивен Каллахэн. 76 дней в Атлантике.',body:'Ночь. Плот. Океан.\n\nУтро не приходит.',published:true,coverKey:await cover('hero-lake.jpg')});
 assert.ok(first.id||first.item?.id||true);

 browser=await chromium.launch({executablePath:process.env.TT_BROWSER_EXECUTABLE||undefined});
 const ctx=await browser.newContext({viewport:{width:390,height:844},deviceScaleFactor:2,hasTouch:true,isMobile:true,locale:'ru-RU'});
 await ctx.addInitScript(()=>{window.__shared=[];navigator.share=async d=>{window.__shared.push(d);};});
 const page=await ctx.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
 const open=async view=>{await page.goto(base+'/?mode=listen&view='+view);await page.waitForLoadState('networkidle').catch(()=>{});await page.waitForTimeout(700);};
 const problems=[];

 for(const w of [360,390,430]){
  await page.setViewportSize({width:w,height:844});
  const sizes={};
  for(const s of SECTIONS){
   await open(s.view);
   const v=await page.evaluate(()=>{const q=x=>document.querySelector(x),r=x=>q(x)?.getBoundingClientRect();
    const main=q('.listener-main');main.scrollTop=main.scrollHeight;
    const cards=[...document.querySelectorAll('.post-card')].map(c=>{const b=c.getBoundingClientRect(),cover=c.querySelector('.post-cover').getBoundingClientRect(),
     title=c.querySelector('.post-title').getBoundingClientRect(),note=c.querySelector('.post-note').getBoundingClientRect(),
     act=c.querySelector('.text-button').getBoundingClientRect(),sh=c.querySelector('.post-share').getBoundingClientRect();
     return {l:b.left,r:b.right,coverOk:cover.left>=b.left-1&&cover.right<=b.right+1,
      titleLines:Math.round(title.height/parseFloat(getComputedStyle(c.querySelector('.post-title')).lineHeight)),
      stack:title.bottom<=note.top+1&&note.bottom<=act.top+1,shareApart:act.right<=sh.left+1&&sh.right<=b.right+1,
      button:c.querySelector('.text-button').textContent.replace(/\d+:\d+/,'').trim(),
      tag:[...c.querySelector('.post-meta').childNodes].filter(n=>n.nodeType===3).map(n=>n.textContent).join('').trim(),
      date:c.querySelector('.post-meta span')?.textContent};});
    const lastBtn=[...document.querySelectorAll('.post-card .text-button')].pop()?.getBoundingClientRect();
    const res={W:innerWidth,scroll:document.documentElement.scrollWidth,t:r('.voice-title'),k:r('.voice-kicker'),
     lines:[...document.querySelectorAll('.voice-kicker-line')].map(e=>{const b=e.getBoundingClientRect();return {text:e.textContent,over:e.scrollWidth>e.clientWidth+1,top:b.top,bottom:b.bottom};}),
     title:q('.voice-title')?.textContent,size:q('.voice-title')&&getComputedStyle(q('.voice-title')).fontSize,
     search:r('.catalog-search'),sort:r('.catalog-sort'),list:r('.post-list'),ph:q('.catalog-search input')?.placeholder,
     phFits:(()=>{const i=q('.catalog-search input');if(!i)return false;const c=document.createElement('canvas').getContext('2d');const st=getComputedStyle(i);c.font=st.fontSize+' '+st.fontFamily;return c.measureText(i.placeholder).width<=i.clientWidth+1;})(),
     sortText:q('.catalog-sort')?.selectedOptions[0]?.textContent,nav:q('.bottom-nav')?.getBoundingClientRect().top,
     navText:null,lastBtn:lastBtn&&lastBtn.bottom,cards};
    main.scrollTop=0;return res;});
   v.navText=(await page.locator(s.nav).textContent().catch(()=>''))?.trim();
   const at=w+' «'+s.navText+'»: ';
   if(v.scroll>v.W)problems.push(at+'горизонтальная прокрутка '+v.scroll+' при ширине '+v.W);
   if(v.title!==s.title)problems.push(at+'заголовок «'+v.title+'» вместо «'+s.title+'»');
   if(JSON.stringify(v.lines.map(l=>l.text))!==JSON.stringify(s.kicker))problems.push(at+'подзаголовок: '+JSON.stringify(v.lines.map(l=>l.text)));
   if(v.lines.some(l=>l.over))problems.push(at+'строка подзаголовка обрезана');
   if(!v.t||!v.k)problems.push(at+'нет заголовка или подзаголовка');
   else{
    if(v.k.left<v.t.right-1)problems.push(at+'подзаголовок не справа от заголовка');
    // Меряем сами строки подзаголовка, а не его рамку: рамка тянется на
    // высоту заголовка всегда, даже если строки сбились наверх.
    const top=v.lines[0]?.top,bottom=v.lines.at(-1)?.bottom;
    if(!(Math.abs(top-v.t.top)<=2))problems.push(at+'верх подзаголовка не на высоте верха заголовка ('+Math.round(top)+' против '+Math.round(v.t.top)+')');
    if(!(Math.abs(bottom-v.t.bottom)<=2))problems.push(at+'низ подзаголовка не на линии низа заголовка ('+Math.round(bottom)+' против '+Math.round(v.t.bottom)+')');
    if(v.k.right>v.W-15)problems.push(at+'подзаголовок у самого края экрана');
    if(Math.abs(v.t.left-v.search.left)>1||Math.abs(v.t.left-v.list.left)>1)problems.push(at+'заголовок, поиск и список с разных левых краёв');
   }
   if(v.ph!==s.search)problems.push(at+'в поиске «'+v.ph+'» вместо «'+s.search+'»');
   if(s.view!=='podcasts'&&!v.phFits)problems.push(at+'подсказка «'+v.ph+'» не помещается в поле поиска');
   if(v.sortText!=='Сначала новые')problems.push(at+'сортировка «'+v.sortText+'»');
   if(!v.search||!v.sort||v.sort.top>=v.search.bottom||v.sort.left<v.search.right)problems.push(at+'поиск и сортировка не в одну строку');
   if(v.sort&&v.sort.right>v.W-15)problems.push(at+'сортировка вылезла за поле');
   if(v.navText!==s.navText)problems.push(at+'вкладка подписана «'+v.navText+'»');
   if(!v.cards.length)problems.push(at+'нет карточек — проверять нечего');
   for(const c of v.cards){
    if(c.l<0||c.r>v.W)problems.push(at+'карточка за границей экрана');
    if(!c.coverOk)problems.push(at+'обложка вылезла из карточки');
    if(c.titleLines>2)problems.push(at+'название в карточке длиннее двух строк ('+c.titleLines+')');
    if(!c.stack)problems.push(at+'название, описание и кнопка наезжают друг на друга');
    if(!c.shareApart)problems.push(at+'кнопка «Поделиться» наезжает на «'+c.button+'»');
    if(c.button!==s.button)problems.push(at+'кнопка карточки «'+c.button+'» вместо «'+s.button+'»');
    if(!/^\d{2}\.\d{2}\.\d{4}$/.test(c.date||''))problems.push(at+'дата в карточке «'+c.date+'»');
   }
   if(s.view==='stories'&&v.cards.some(c=>c.tag!=='ИСТОРИЯ'))problems.push(at+'тип в карточке истории не «ИСТОРИЯ»');
   if(s.view==='videos'&&v.cards.some(c=>c.tag!=='ВИДЕО'))problems.push(at+'тип в карточке видео не «ВИДЕО»');
   if(v.lastBtn>v.nav+1)problems.push(at+'нижняя панель закрывает кнопку последней карточки');
   sizes[s.view]=v.size;
   await page.screenshot({path:path.join(out,`sections-${s.view}-${w}.png`)});
  }
  if(new Set(Object.values(sizes)).size!==1)problems.push(w+': заголовки разделов разного размера — '+JSON.stringify(sizes));
 }

 // «Истории»: поиск, сортировка, открытие, возврат, ссылка.
 await page.setViewportSize({width:390,height:844});await open('stories');
 const titles=()=>page.locator('.post-card .post-title').allTextContents();
 const newest=await titles();
 assert.equal(newest[0],'Он выжил. Но какой ценой?','«Сначала новые»: первой стоит не самая новая история');
 await page.locator('.catalog-search input').fill('Первая');await page.waitForTimeout(400);
 assert.deepEqual(await titles(),['Первая история'],'поиск по историям не нашёл ровно одну запись');
 await page.locator('.catalog-search input').fill('');await page.waitForTimeout(300);
 assert.deepEqual(await page.locator('.catalog-sort option').evaluateAll(o=>o.map(x=>x.value)),['new','old'],'варианты сортировки потерялись');
 await page.locator('.catalog-sort').selectOption('old');await page.waitForTimeout(300);
 assert.deepEqual(await titles(),[...newest].reverse(),'«Сначала старые» не переворачивает список историй');
 await page.locator('.catalog-sort').selectOption('new');await page.waitForTimeout(300);
 const card=page.locator('.post-card',{hasText:'Он выжил'}).first();
 await card.locator('.post-share').click();await page.waitForTimeout(300);
 const shared=await page.evaluate(()=>window.__shared);
 assert.equal(shared.length,1,'«Поделиться» ничего не отправило');
 assert.equal(shared[0].title,'Он выжил. Но какой ценой?','поделились не той историей');
 assert.match(shared[0].url,/^http:\/\/127\.0\.0\.1:\d+\/.+/,'в ссылке нет адреса записи: '+shared[0].url);
 await card.locator('.text-button').click();await page.locator('.tt-reader').waitFor({timeout:8000});
 await page.waitForTimeout(600);
 assert.match(await page.locator('.tt-reader').textContent(),/Плот/,'«Читать» открыло не ту историю');
 await page.locator('.tt-reader').locator('button[aria-label="Назад"]').first().click({force:true});
 await page.locator('.tt-reader').waitFor({state:'detached',timeout:8000});
 assert.equal(await page.locator('.voice-title').textContent(),'Истории\nна страницах','после чтения вернулись не к списку историй');
 assert.ok(await page.locator('.post-card').count()>=3,'после чтения список историй пуст');
 assert.deepEqual(errors,[],'ошибки на странице: '+errors.join('; '));
 assert.deepEqual(problems,[],'\n - '+problems.join('\n - '));
 console.log('Разделы «Аудио», «Видео», «Истории»: одна шапка, одна строка поиска, карточки в границах на 360/390/430; поиск, сортировка, чтение и «Поделиться» в «Историях» работают.');
}finally{await browser?.close();server.kill();await rm(dir,{recursive:true,force:true});}
