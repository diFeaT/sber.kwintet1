/* Серверная часть сайта: аккаунты, роли, профиль, проекты, чат, панель команды, записи, расчёт.
   Логика перенесена из прежнего index.html без изменений контрактов (таблицы profiles, projects, conversations,
   messages, leads, bookings; RPC email_by_username, username_taken, delete_my_account, delete_project, submit_project,
   review_project, set_role, slot_load, book_slot, cancel_booking). Изменено только подключение к новому конструктору
   и подтверждения (ask() вместо confirm()). */
import { $, esc, fmt, showMsg, gtoast, ask } from './util.js';
import { PST, ROLE_RU } from './data.js';
import { calcProject, calcHTML, sumCalc } from './calc.js';
import { studio } from './studio.js';
import { ensureThree, THREEMSG } from './three-loader.js';
import { initHome, pauseHome } from './site.js';
import { initReady, saveCurrentAsReady, saveReadyEdit } from './ready.js';
import { chatForProject, generalChat } from './chats.js';


    /* навигация */
    const VIEWS=['home','config','profile','staff','calc','business','ready'];
    function go(v,anchor,opts){
     if(v==='interior'){v='config';opts=Object.assign({mode:'interior'},opts)}
     VIEWS.forEach(x=>{$('#view-'+x).hidden=x!==v});$('#view-chat').hidden=true;
     document.body.dataset.view=v;
     if(v==='config'){pauseHome();$('#view-config').hidden=false;studio.open(opts||{})}else studio.pause();
     if(v==='home')initHome();
     if(v==='ready')initReady(sb,PROF&&PROF.role);
     if(v==='profile'){renderProfile()}
     if(v==='staff'){renderStaff()}
     if(anchor){setTimeout(()=>{const el=document.getElementById(anchor);el&&el.scrollIntoView()},20)}else{window.scrollTo(0,0)}
     $$nav(v)
    }
    function $$nav(v){document.querySelectorAll('header nav [data-go]').forEach(b=>{const on=b.dataset.go===v&&!b.dataset.anchor;if(on)b.setAttribute('aria-current','page');else b.removeAttribute('aria-current')})}
    document.addEventListener('click',e=>{
     const b=e.target.closest('[data-go]');if(!b)return;
     const o={};if(b.dataset.pick)o.model=b.dataset.pick;if(b.dataset.ready)o.ready=b.dataset.ready;
     go(b.dataset.go,b.dataset.anchor,o);
    });
    $('#lead').addEventListener('submit',e=>{e.preventDefault();submitLead(e.target)});
    $('#bizForm').addEventListener('submit',e=>{e.preventDefault();submitBiz(e.target)});
    /* заявка от предпринимателя: пишем в существующую таблицу leads (адресат — менеджер), сайт и комментарий — в теме */
    async function submitBiz(form){const ok=$('#bizOk'),say=t=>{ok.textContent=t;ok.style.display='block'};
     const fd=new FormData(form),name=String(fd.get('name')||'').trim(),phone=String(fd.get('phone')||'').trim(),site=String(fd.get('site')||'').trim(),msg=String(fd.get('message')||'').trim();
     if(fd.get('website'))return say('Спасибо!');
     if(!sb)return say('Приём заявок пока не настроен. Напишите нам на почту или позвоните.');
     if(name.length<2||phone.replace(/\D/g,'').length<6||!site)return say('Проверьте имя, телефон и адрес сайта.');
     let last=0;try{last=+localStorage.getItem('biz_ts')||0}catch(e){}
     if(Date.now()-last<60000)return say('Заявка уже отправлена. Если нужно отправить ещё одну, подождите минуту.');
     const btn=form.querySelector('button[type=submit]');btn.disabled=true;
     const topic=('Предприниматель. Сайт: '+site+(msg?'. '+msg:'')).slice(0,200);
     const{error}=await sb.from('leads').insert({name,phone,topic,recipient:'manager'});
     btn.disabled=false;
     if(error)return say('Не удалось отправить заявку. Попробуйте ещё раз или позвоните нам.');
     try{localStorage.setItem('biz_ts',String(Date.now()))}catch(e){}
     say('Спасибо, '+name+'! Свяжемся с вами в течение рабочего дня.');form.reset()}
    /* ===== Supabase: аккаунты, роли, диалоги, проекты, записи ===== */
    const cfg=window.APP_CONFIG||{};
    const BUILD='2026-10-14, роли и обращения'; // метка версии: видна на странице ?diag=1, помогает понять, что загрузилась свежая версия
    const cfgOk=!!(cfg.SUPABASE_URL&&cfg.SUPABASE_ANON_KEY&&!/YOUR-/.test(cfg.SUPABASE_URL+cfg.SUPABASE_ANON_KEY));
    // запрос без ответа дольше 15 секунд считается ошибкой сети (иначе кнопка «зависает»)
    const fetchT=(u,o)=>{o=o||{};const c=new AbortController(),t=setTimeout(()=>c.abort(),15000);return fetch(u,{...o,signal:o.signal||c.signal}).finally(()=>clearTimeout(t))};
    const sb=(window.supabase&&cfgOk)?window.supabase.createClient(cfg.SUPABASE_URL,cfg.SUPABASE_ANON_KEY,{global:{fetch:fetchT}}):null;
    const NOSB=(cfgOk&&!window.supabase)
     ?'Не загрузилась библиотека входа. Возможно, её скрипт недоступен в вашей сети. Обновите страницу или попробуйте другую сеть.'
     :'Сервер аккаунтов не настроен: заполните config.js (см. README).';
    const NETMSG='Не удалось связаться с сервером аккаунтов. Проверьте интернет. Если другие сайты открываются, возможно, ваш провайдер ограничивает доступ к сервису: попробуйте другую сеть (например, мобильную) или VPN.';
    const isNetErr=e=>!!e&&(e.status===0||e.name==='AuthRetryableFetchError'||/fetch|network|load failed|abort|timeout|ECONN/i.test(String(e.message||'')));
    const TZ=cfg.TIMEZONE||'Europe/Moscow',TZL=cfg.TIMEZONE_LABEL||'Москва';
    const WORK={from:cfg.WORK_FROM!=null?cfg.WORK_FROM:10,to:cfg.WORK_TO!=null?cfg.WORK_TO:19,days:cfg.WORK_DAYS||[1,2,3,4,5,6],ahead:cfg.SLOT_DAYS_AHEAD||14};
    let PROF=null,recovery=false,amode='in',gtt;
    const isStaff=()=>!!PROF&&(PROF.role==='owner'||PROF.role==='manager'||PROF.role==='designer');
    const EMAIL_RE=/^[^@\s]+@[^@\s]+\.[^@\s]+$/,USER_RE=/^(?=.*[a-z_])[a-z0-9_]{3,20}$/i;
    const okName=n=>n.length>=3&&n.split(' ').length>=2;
    const redirect=()=>location.origin+location.pathname;
    const LST={new:'Новая',in_work:'В работе',done:'Закрыта'},LCLS={new:'submitted',in_work:'paid',done:'approved'};
    const fmtDT=iso=>new Intl.DateTimeFormat('ru-RU',{timeZone:TZ,weekday:'short',day:'numeric',month:'long',hour:'2-digit',minute:'2-digit'}).format(new Date(iso));
    const fmtD=iso=>new Intl.DateTimeFormat('ru-RU',{timeZone:TZ,day:'numeric',month:'long',year:'numeric'}).format(new Date(iso));
    const hhmm=d=>new Intl.DateTimeFormat('ru-RU',{timeZone:TZ,hour:'2-digit',minute:'2-digit'}).format(d);
    
    let HAS_PHONE=false; // есть ли в базе колонка phone (выполнена ли миграция 04)
    async function loadProfile(){
     if(!sb)return;
     const{data:{session}}=await sb.auth.getSession();
     if(!session){PROF=null;authUI();return}
     let r=await sb.from('profiles').select('id,username,full_name,role,phone').eq('id',session.user.id).maybeSingle();
     if(r.error){r=await sb.from('profiles').select('id,username,full_name,role').eq('id',session.user.id).maybeSingle();HAS_PHONE=false}else HAS_PHONE=true;
     const su=session.user||{},authPhone=su.phone?'+'+String(su.phone).replace(/\D/g,''):'';
     PROF=r.data?{...r.data,email:su.email||'',phone:r.data.phone||authPhone}:null;authUI();
    }
    function authUI(){const p=PROF;$('#authBtn').textContent=p?p.full_name:'Войти';$('#outBtn').hidden=!p;$('#staffBtn').hidden=!isStaff();
     const n=document.querySelector('#lead [name=name]');if(p&&n&&!n.value)n.value=p.full_name}
    async function signOut(){if(sb){await sb.removeAllChannels();await sb.auth.signOut()}
     PROF=null;CH.id=null;ST.id=null;studio.resetSession();authUI();go('home')}
    
    /* окна: общее закрытие по Esc и клику на фон */
    document.addEventListener('keydown',e=>{if(e.key==='Escape')document.querySelectorAll('.modal:not([hidden]):not(#confirmModal)').forEach(m=>m.hidden=true)});
    document.addEventListener('click',e=>{if(e.target.classList&&e.target.classList.contains('modal'))e.target.hidden=true});
    
    /* окно входа / регистрации: две отдельные формы, чтобы браузер мог запомнить и подставить логин */
    const amsg=t=>showMsg('#aMsg',t);
    function setMode(m){amode=m;[...$('#authTabs').children].forEach(c=>c.setAttribute('aria-pressed',c.dataset.t===m));
     [...$('#authTabs').children].forEach(c=>c.setAttribute('aria-pressed',c.dataset.t===(m==='upph'?'up':m)));
     $('#loginForm').hidden=m!=='in';$('#signupForm').hidden=m!=='up';$('#phoneSignupForm').hidden=m!=='upph';
     $('#authT').textContent=m==='in'?'Вход':'Регистрация';amsg(sb?'':NOSB)}
    function openAuth(){setMode('in');$('#authModal').hidden=false;setTimeout(()=>$('#lLogin').focus(),30)}
    function closeAuth(){$('#authModal').hidden=true}
    async function emailFor(login){if(login.includes('@'))return login;const{data,error}=await sb.rpc('email_by_username',{u:login});if(error){const x=new Error(error.message||'rpc');x.raw=error;throw x}return data||null}
    // Просим браузер сохранить логин и пароль. Chrome и Edge понимают этот вызов, остальные браузеры предлагают сохранить сами при отправке формы.
    function rememberCreds(id,pass,name){try{if(window.PasswordCredential&&navigator.credentials)navigator.credentials.store(new PasswordCredential({id,password:pass,name:name||id}))}catch(e){}}
    // Сообщение об ошибке: сетевой сбой и ошибка сервера различаются, техническая причина показывается, чтобы было что проверять.
    const netDetail=e=>{const m=String((e&&e.message)||e||'').replace(/^(Type|Abort|AuthRetryableFetch)?Error:\s*/,'').slice(0,100);return m?' Техническая причина: '+m+'.':''};
    const explain=e=>isNetErr(e)?NETMSG+netDetail(e):'Ошибка сервера: '+String((e&&e.message)||e||'неизвестная ошибка').slice(0,150);
    function loginError(er){
     if(isNetErr(er))return explain(er);
     if(/confirm/i.test(er.message))return 'Подтвердите почту по ссылке из письма.';
     if(er.status===429)return 'Слишком много попыток входа. Подождите несколько минут и попробуйте снова.';
     if(er.status>=500)return explain(er);
     return 'Неверный логин или пароль.'}
    async function doLogin(lg,pass){ // возвращает текст ошибки или пустую строку при успехе
     if(!sb)return NOSB;
     if(!lg)return 'Введите почту или юзернейм.';
     if(pass.length<6)return 'Пароль должен быть не короче 6 символов.';
     const ph=looksPhone(lg);
     if(ph){let r2;try{r2=await sb.auth.signInWithPassword({phone:ph,password:pass})}catch(e){return explain(e)}
      if(r2.error)return loginError(r2.error);
      rememberCreds(lg,pass);return ''}
     let email;try{email=await emailFor(lg)}catch(e){return explain(e.raw||e)}
     if(!email)return 'Неверный логин или пароль.';
     let res;try{res=await sb.auth.signInWithPassword({email,password:pass})}catch(e){return explain(e)}
     if(res.error)return loginError(res.error);
     rememberCreds(lg,pass);return ''}
    async function doSignup(nm,un,ml,pass){ // возвращает {ok:true} или {msg:'...'}
     if(!sb)return{msg:NOSB};
     if(!okName(nm))return{msg:'Укажите имя и фамилию.'};
     if(!USER_RE.test(un))return{msg:'Юзернейм: 3–20 символов, латиница, цифры и _; нужна хотя бы одна буква.'};
     if(!EMAIL_RE.test(ml))return{msg:'Введите корректную почту.'};
     if(pass.length<6)return{msg:'Пароль должен быть не короче 6 символов.'};
     let t;try{t=await sb.rpc('username_taken',{u:un})}catch(e){return{msg:explain(e)}}
     if(t.error)return{msg:explain(t.error)};
     if(t.data)return{msg:'Такой юзернейм уже занят.'};
     let r;try{r=await sb.auth.signUp({email:ml,password:pass,options:{data:{username:un,full_name:nm},emailRedirectTo:redirect()}})}catch(e){return{msg:explain(e)}}
     if(r.error)return{msg:isNetErr(r.error)?explain(r.error):/registered|already/i.test(r.error.message)?'Эта почта уже зарегистрирована.':r.error.message};
     const data=r.data;
     if(data.user&&data.user.identities&&data.user.identities.length===0)return{msg:'Эта почта уже зарегистрирована.'};
     if(!data.session)return{msg:'Мы отправили письмо: подтвердите почту по ссылке и войдите.'};
     rememberCreds(un,pass,nm);return{ok:true}}
    $('#authBtn').onclick=()=>{PROF?openProfile('profile'):openAuth()};
    $('#outBtn').onclick=signOut;
    $('#staffBtn').onclick=()=>go('staff');
    $('#authX').onclick=closeAuth;
    $('#authTabs').addEventListener('click',e=>{const b=e.target.closest('[data-t]');if(b)setMode(b.dataset.t)});
    $('#loginForm').addEventListener('submit',async e=>{e.preventDefault();amsg('');const btn=$('#lSubmit');btn.disabled=true;
     try{const err=await doLogin($('#lLogin').value.trim(),$('#lPass').value);if(err)amsg(err);else{closeAuth();$('#lPass').value=''}}
     catch(x){amsg('Не удалось связаться с сервером. Попробуйте ещё раз.')}
     finally{btn.disabled=false}});
    $('#signupForm').addEventListener('submit',async e=>{e.preventDefault();amsg('');const btn=$('#sSubmit');btn.disabled=true;
     try{const r=await doSignup($('#sName').value.trim().replace(/\s+/g,' '),$('#sUser').value.trim(),$('#sMail').value.trim().toLowerCase(),$('#sPass').value);
      if(r.ok){closeAuth();$('#sPass').value=''}else amsg(r.msg)}
     catch(x){amsg('Не удалось связаться с сервером. Попробуйте ещё раз.')}
     finally{btn.disabled=false}});
    $('#aForgot').onclick=async()=>{if(!sb)return amsg(NOSB);const lg=$('#lLogin').value.trim();if(!lg)return amsg('Введите почту, юзернейм или телефон в поле выше.');
     if(looksPhone(lg))return amsg('Пароль восстанавливается по почте. Если к аккаунту почта не привязана, напишите нам. Чтобы не потерять доступ, добавьте почту в личном кабинете.');
     try{const email=await emailFor(lg);if(email)await sb.auth.resetPasswordForEmail(email,{redirectTo:redirect()})}catch(e){return amsg(explain(e.raw||e))}
     amsg('Если такой аккаунт есть, мы отправили письмо со ссылкой для смены пароля.')};
    if(sb)sb.auth.onAuthStateChange(ev=>{
     if(ev==='PASSWORD_RECOVERY'){recovery=true;setTimeout(async()=>{await loadProfile();openProfile('profile')},0)}
     else if(['SIGNED_IN','SIGNED_OUT','USER_UPDATED'].includes(ev)){setTimeout(loadProfile,0)}});
    
    /* ===== вход и регистрация по номеру телефона и паролю (без кода из SMS) ===== */
    const PHONE_ON=cfg.PHONE_AUTH===true;
    // '8 (999) 123-45-67', '+7 999 123 45 67', '9991234567' -> '+79991234567'; иностранные номера только с «+»
    function normPhone(v){let d=String(v||'').trim();
     if(d.startsWith('+')){const x=d.replace(/\D/g,'');if(x[0]==='7'&&x.length!==11)return '';return x.length>=8&&x.length<=15?'+'+x:''}
     d=d.replace(/\D/g,'');
     if(d.length===11&&(d[0]==='8'||d[0]==='7'))return '+7'+d.slice(1);
     if(d.length===10)return '+7'+d;
     return ''}
    const showPhone=p=>String(p||'').replace(/^\+7(\d{3})(\d{3})(\d{2})(\d{2})$/,'+7 $1 $2-$3-$4');
    // Похоже ли введённое на номер телефона (а не на почту или юзернейм): только цифры, пробелы, скобки, дефисы, «+»
    const looksPhone=v=>(PHONE_ON&&!String(v).includes('@')&&/^[+\d\s\-()]+$/.test(String(v).trim()))?normPhone(v):'';
    // Повторная проверка пароля перед чувствительными действиями; работает и для аккаунтов без почты
    async function reauth(pw){
     if(!pw||!PROF)return false;
     const id=PROF.email?{email:PROF.email}:(PROF.phone?{phone:PROF.phone}:null);
     if(!id)return false;
     try{const{error}=await sb.auth.signInWithPassword({...id,password:pw});return !error}catch(e){return false}}
    async function doSignupPhone(nm,phoneRaw,pass,consent){ // {ok:true} или {msg:'...'}
     if(!sb)return{msg:NOSB};
     if(!PHONE_ON)return{msg:'Регистрация по телефону не включена на этом сайте.'};
     if(!okName(nm))return{msg:'Укажите имя и фамилию.'};
     const ph=normPhone(phoneRaw);if(!ph)return{msg:'Введите номер телефона, например +7 999 123-45-67.'};
     if(pass.length<6)return{msg:'Пароль должен быть не короче 6 символов.'};
     if(!consent)return{msg:'Подтвердите согласие на обработку номера телефона.'};
     let r;try{r=await sb.auth.signUp({phone:ph,password:pass,options:{data:{full_name:nm}}})}catch(e){return{msg:explain(e)}}
     if(r.error){const m=String(r.error.message||'');
      if(isNetErr(r.error))return{msg:explain(r.error)};
      if(/already|registered/i.test(m))return{msg:'Этот номер уже зарегистрирован. Войдите по номеру и паролю.'};
      if(/sms|provider|otp/i.test(m))return{msg:'Регистрация по телефону не настроена на сервере (см. README, раздел про вход по телефону).'};
      return{msg:explain(r.error)}}
     if(!r.data||!r.data.session)return{msg:'На сервере включено подтверждение номера по SMS, а этот сайт его не использует. Отключите «Enable phone confirmations» в настройках Supabase (см. README).'};
     rememberCreds(ph,pass,nm);return{ok:true}}
    $('#phoneSignupForm').addEventListener('submit',async e=>{e.preventDefault();amsg('');const btn=$('#rSubmit');btn.disabled=true;
     try{const r=await doSignupPhone($('#rName').value.trim().replace(/\s+/g,' '),$('#rPhone').value,$('#rPass').value,$('#rOk').checked);
      if(r.ok){closeAuth();$('#rPass').value=''}else amsg(r.msg)}
     catch(x){amsg(NETMSG)}
     finally{btn.disabled=false}});
    $('#goPhoneUp').onclick=()=>setMode('upph');
    $('#goEmailUp').onclick=()=>setMode('up');
    $('#goPhoneUp').hidden=!PHONE_ON;
    if(PHONE_ON){$('#lLogin').placeholder='Почта, юзернейм или телефон';$('#lLogin').setAttribute('aria-label','Почта, юзернейм или телефон')}
    /* карточка «Телефон для входа» в кабинете */
    const lkmsg=t=>showMsg('#lkMsg',t);
    function renderPhoneCard(){const c=$('#phoneCard');c.hidden=!PHONE_ON||!PROF;if(c.hidden)return;
     $('#phCur').textContent=PROF.phone?'Ваш номер для входа: '+showPhone(PROF.phone)+'. Войти можно по номеру и вашему паролю.':'Номер не добавлен. Добавьте его, чтобы входить по номеру телефона и тому же паролю.';
     $('#lkSend').textContent=PROF.phone?'Изменить номер':'Добавить номер';$('#lkPass').value='';lkmsg('')}
    async function savePhone(raw,pass,consent){ // {ok:true,msg} или {msg}
     if(!sb||!PROF)return{msg:NOSB};
     const ph=normPhone(raw);if(!ph)return{msg:'Введите номер телефона, например +7 999 123-45-67.'};
     if(!consent)return{msg:'Подтвердите согласие на обработку номера телефона.'};
     if(!(await reauth(pass)))return{msg:'Введите текущий пароль, чтобы изменить номер.'};
     let r;try{r=await sb.auth.updateUser({phone:ph})}catch(e){return{msg:explain(e)}}
     if(r.error)return{msg:isNetErr(r.error)?explain(r.error):/already|registered/i.test(String(r.error.message))?'Этот номер уже привязан к другому аккаунту.':explain(r.error)};
     if(r.data&&r.data.user&&r.data.user.new_phone)return{msg:'На сервере включено подтверждение номера по SMS, а этот сайт его не использует. Отключите «Enable phone confirmations» в настройках Supabase (см. README).'};
     return{ok:true,msg:'Номер сохранён. Теперь можно входить по номеру и вашему паролю.'}}
    $('#linkForm').addEventListener('submit',async e=>{e.preventDefault();lkmsg('');const btn=$('#lkSend');btn.disabled=true;
     try{const r=await savePhone($('#lkNum').value,$('#lkPass').value,$('#lkOk').checked);
      if(r.ok){await loadProfile();renderPhoneCard();$('#lkNum').value='';}
      lkmsg(r.msg)}
     catch(x){lkmsg(NETMSG)}
     finally{btn.disabled=false}});
    
    /* обращения с формы внизу главной страницы */
    async function submitLead(form){const ok=$('#leadOk'),say=t=>{ok.textContent=t;ok.style.display='block'};
     const fd=new FormData(form),name=String(fd.get('name')||'').trim(),phone=String(fd.get('phone')||'').trim(),topic=String(fd.get('topic')||'').trim().slice(0,200),recipient=String(fd.get('recipient')||'');
     if(fd.get('website'))return say('Спасибо!');
     if(!sb)return say('Приём обращений пока не настроен. Позвоните нам или напишите в чат.');
     if(name.length<2||phone.replace(/\D/g,'').length<6)return say('Проверьте имя и телефон.');
     if(recipient!=='manager'&&recipient!=='designer')return say('Выберите, кому адресовать обращение: менеджеру или дизайнеру.');
     let last=0;try{last=+localStorage.getItem('lead_ts')||0}catch(e){}
     if(Date.now()-last<60000)return say('Обращение уже отправлено. Если нужно отправить ещё одно, подождите минуту.');
     const btn=form.querySelector('button[type=submit]');btn.disabled=true;
     const to=recipient==='designer'?'дизайнеру':'менеджеру';
     // Если в базе ещё нет колонок recipient/topic (не выполнены миграции 05 и 06), адресат и тема дописываются к тексту, чтобы ничего не потерялось.
     const attempts=[
      {name,phone,topic:topic||null,recipient},
      {name,phone,topic:('Кому: '+to+(topic?'. '+topic:'')).slice(0,200)},
      {name:(name+' — кому: '+to+(topic?'. '+topic:'')).slice(0,80),phone}];
     let error=null;
     for(const row of attempts){({error}=await sb.from('leads').insert(row));if(!error||!/recipient|topic/i.test(String(error.message||'')))break}
     btn.disabled=false;
     if(error)return say('Не удалось отправить обращение. Попробуйте ещё раз или позвоните нам.');
     try{localStorage.setItem('lead_ts',String(Date.now()))}catch(e){}
     say('Спасибо, '+name+'! '+(recipient==='designer'?'Дизайнер':'Менеджер')+' свяжется с вами в течение 15 минут в рабочее время.');form.reset()}
    

    /* ===== загрузка проекта в конструктор ===== */
    async function loadProject(c,meta,preview){
     if(!c||!Array.isArray(c.rooms))return gtoast('Проект повреждён и не может быть открыт.');
     go('config');
     const r=await studio.loadProject(c,meta,preview);
     if(r&&r.error)return gtoast(r.error);
     if(r&&r.notes&&r.notes.length)gtoast(r.notes.join(' '));
     else gtoast(preview?'Проект клиента открыт для просмотра. Изменения не сохраняются.':(meta&&meta.status==='paid'?'Проект оплачен: отправить изменения нельзя.':'Проект загружен. Если измените его и отправите снова, потребуется новое согласование.'))}

    /* ===== личный кабинет ===== */
    let PTAB='profile',MY=[],CALCP=null;
    function openProfile(tab){PTAB=tab||'profile';go('profile')}
    const pmsg=t=>showMsg('#pMsg',t);
    function renderProfile(){if(!PROF){go('home');openAuth();return}
     if(recovery)PTAB='profile';
     [...$('#profTabs').children].forEach(b=>b.setAttribute('aria-pressed',b.dataset.pt===PTAB));
     ['profile','projects','bookings'].forEach(t=>$('#pt-'+t).hidden=t!==PTAB);
     if(PTAB==='profile'){$('#pName').value=PROF.full_name;$('#pUser').value=PROF.username;$('#pMail').value=PROF.email;$('#pOld').value='';$('#pNew').value='';
      $('#pOld').closest('label').hidden=recovery;$('#pMail').placeholder=PROF.email?'':'Добавьте почту: по ней можно восстановить пароль';
      pmsg(recovery?'Введите новый пароль и нажмите «Сохранить».':(PROF.full_name==='Клиент'?'Укажите имя и фамилию: так вас увидит дизайнер.':''));renderPhoneCard()}
     if(PTAB==='projects')loadMyProjects();
     if(PTAB==='bookings')initBookings()}
    $('#profTabs').addEventListener('click',e=>{const b=e.target.closest('[data-pt]');if(b){PTAB=b.dataset.pt;renderProfile()}});
    $('#pForm').addEventListener('submit',async e=>{e.preventDefault();if(!sb||!PROF)return;
     const nm=$('#pName').value.trim().replace(/\s+/g,' '),un=$('#pUser').value.trim(),ml=$('#pMail').value.trim().toLowerCase(),old=$('#pOld').value,np=$('#pNew').value;
     if(recovery){if(np.length<6)return pmsg('Новый пароль должен быть не короче 6 символов.');
      const{error}=await sb.auth.updateUser({password:np});if(error)return pmsg(error.message);
      recovery=false;$('#pOld').closest('label').hidden=false;$('#pNew').value='';return pmsg('Пароль изменён.')}
     if(!okName(nm))return pmsg('Укажите имя и фамилию.');
     if(!USER_RE.test(un))return pmsg('Юзернейм: 3–20 символов, латиница, цифры и _; нужна хотя бы одна буква.');
     if(PROF.email?!EMAIL_RE.test(ml):(ml&&!EMAIL_RE.test(ml)))return pmsg('Введите корректную почту.');
     if(np&&np.length<6)return pmsg('Новый пароль должен быть не короче 6 символов.');
     if(!(await reauth(old)))return pmsg('Для сохранения введите текущий пароль.');
     const{error:pe}=await sb.from('profiles').update({username:un,full_name:nm}).eq('id',PROF.id);
     if(pe)return pmsg(pe.code==='23505'?'Такой юзернейм уже занят.':'Не удалось сохранить: '+pe.message);
     let note='Данные сохранены.';
     if(np){const{error}=await sb.auth.updateUser({password:np});if(error)return pmsg(error.message);note+=' Пароль изменён.'}
     if(ml&&ml!==PROF.email){const{error}=await sb.auth.updateUser({email:ml},{emailRedirectTo:redirect()});if(error)return pmsg(error.message);note+=' Подтвердите новый адрес по письму.'}
     await loadProfile();$('#pOld').value='';$('#pNew').value='';pmsg(note)});
    $('#pOut').onclick=signOut;
    $('#pDel').onclick=async()=>{if(!sb||!PROF)return;
     if(!(await reauth($('#pOld').value)))return pmsg('Для удаления введите текущий пароль.');
     const{error}=await sb.rpc('delete_my_account');if(error)return pmsg(error.message);
     await signOut()};
    
    /* мои проекты */
    async function loadMyProjects(){const box=$('#myProjects');box.innerHTML='<p class="who">Загрузка…</p>';
     const{data,error}=await sb.from('projects').select('id,title,status,price,submitted_at,review_note,approved_at,archived_at').eq('client_id',PROF.id).order('submitted_at',{ascending:false});
     if(error){box.innerHTML='<p class="who">Не удалось загрузить проекты.</p>';return}
     MY=data||[];
     box.innerHTML=MY.length?MY.map(p=>`<div class="card" data-pid="${p.id}" style="margin-bottom:12px"><div class="send" style="align-items:center;flex-wrap:wrap"><h3 style="margin:0;flex:1">${esc(p.title)}</h3><span class="badge b-${p.archived_at?'archived':p.status}">${p.archived_at?'В архиве':(PST[p.status]||p.status)}</span></div><p class="who" style="margin:6px 0">Отправлен ${esc(fmtD(p.submitted_at))} · модули ≈ ${fmt(+p.price)}${p.approved_at?' · согласован '+esc(fmtD(p.approved_at)):''}</p>${p.review_note?`<p style="margin:6px 0"><b>Комментарий дизайнера:</b> ${esc(p.review_note)}</p>`:''}<div class="row"><button class="btn ghost" data-act="open">Открыть в конструкторе</button>${(p.status==='approved'||p.status==='paid')?'<button class="btn" data-act="calc">Расчёт и стоимость</button>':''}<button class="btn ghost" data-act="chat">Написать дизайнеру</button>${p.status!=='paid'?'<button class="btn ghost danger" data-act="del">Удалить</button>':''}</div></div>`).join(''):'<div class="card"><p style="margin:0">Вы ещё не отправляли проекты на согласование. Соберите дом в конструкторе и нажмите «Отправить дизайнеру».</p><button class="btn" style="margin-top:12px" data-go="config">Открыть конструктор</button></div>'}
    $('#myProjects').addEventListener('click',async e=>{const b=e.target.closest('[data-act]');if(!b)return;
     const card=b.closest('[data-pid]'),p=card&&MY.find(x=>x.id===card.dataset.pid);if(!p)return;
     const act=b.dataset.act;
     if(act==='open'||act==='calc'){const col=act==='open'?'config':'calc';b.disabled=true;
      const{data,error}=await sb.from('projects').select(col).eq('id',p.id).single();b.disabled=false;
      if(error||!data)return gtoast('Не удалось загрузить данные проекта. Проверьте соединение.');
      if(act==='open')loadProject(data.config,{id:p.id,title:p.title,status:p.status});else showCalc({...p,calc:data.calc})}
     else if(act==='chat')openChat('profile',p.id);
     else if(act==='del')deleteProject(p)});
    async function deleteProject(p){
     if(!(await ask('Удалить проект «'+p.title+'»? Это действие нельзя отменить.'+(p.status==='approved'?' Проект уже согласован, расчёт будет потерян.':''),{ok:'Удалить',danger:true,title:'Удалить проект'})))return;
     const{error}=await sb.rpc('delete_project',{p_id:p.id});
     if(error)return gtoast(error.message);
     if(studio.getSession().projectId===p.id)studio.resetSession();
     gtoast('Проект удалён');loadMyProjects()}
    
    /* страница расчёта */
    function showCalc(p){if(!p.calc)return gtoast('Расчёт ещё не готов.');CALCP=p;
     $('#calcTitle').textContent='Расчёт: '+p.title;
     $('#calcMeta').textContent=(PST[p.status]||'')+(p.approved_at?' · согласован '+fmtD(p.approved_at):'');
     $('#calcBody').innerHTML=calcHTML(p.calc);$('#payBtn').hidden=p.status==='paid';go('calc')}
    $('#calcBack').onclick=()=>openProfile('projects');
    $('#printBtn').onclick=()=>window.print();
    function goToPayment(p){ // точка подключения оплаты
     if(cfg.PAYMENT_URL){location.href=cfg.PAYMENT_URL+(cfg.PAYMENT_URL.includes('?')?'&':'?')+'project='+encodeURIComponent(p.id)+'&amount='+p.calc.total;return}
     gtoast('Оплата пока не подключена. Менеджер пришлёт реквизиты в чате.')}
    $('#payBtn').onclick=()=>{if(CALCP)goToPayment(CALCP)};
    
    /* отправка проекта на согласование */
    let submitFrom='config';
    const smmsg=t=>showMsg('#smMsg',t);
    function openSubmit(from){
     if(!sb)return gtoast(NOSB);
     if(!studio.hasRooms())return gtoast('Сначала добавьте хотя бы одну комнату.');
     if(!PROF){openAuth();amsg('Войдите или зарегистрируйтесь, чтобы отправить проект дизайнеру.');return}
     submitFrom=from||'config';
     const ses=studio.getSession(),inf=studio.info();
     $('#smTitle').value=ses.title||('Проект от '+new Date().toLocaleDateString('ru-RU'));
     $('#smInfo').textContent=`Комнат: ${inf.rooms}, площадь ${inf.area} м², модули ≈ ${fmt(inf.price)}. Фундамент и мебель дизайнер посчитает при согласовании.`;
     $('#smNewWrap').hidden=!ses.projectId;$('#smNew').checked=false;smmsg('');$('#submitModal').hidden=false;setTimeout(()=>$('#smTitle').focus(),30)}
    $('#smX').onclick=()=>$('#submitModal').hidden=true;
    $('#smGo').onclick=async()=>{const title=$('#smTitle').value.trim();if(!title)return smmsg('Введите название проекта.');
     const ses=studio.getSession();
     $('#smGo').disabled=true;$('#smGo').classList.add('loading');
     let res;try{res=await sb.rpc('submit_project',{p_id:(ses.projectId&&!$('#smNew').checked)?ses.projectId:null,p_title:title,p_config:studio.serialize(),p_price:studio.price()})}catch(e){res={error:e}}
     $('#smGo').disabled=false;$('#smGo').classList.remove('loading');
     const{data,error}=res;
     if(error)return smmsg(isNetErr(error)?explain(error):(error.message||'Не удалось отправить проект.'));
     studio.markSubmitted(data,title);$('#submitModal').hidden=true;gtoast('Проект отправлен на согласование','ok');openChat(submitFrom,data)};
    $('#toChat').onclick=()=>openSubmit('config');
    $('#stuDelete').onclick=async()=>{const ses=studio.getSession();if(!ses.projectId||!sb)return;
     if(!(await ask('Удалить проект «'+(ses.title||'Проект')+'»? Это действие нельзя отменить.',{ok:'Удалить',danger:true,title:'Удалить проект'})))return;
     const{error}=await sb.rpc('delete_project',{p_id:ses.projectId});
     if(error)return gtoast(error.message);
     studio.resetSession();gtoast('Проект удалён')};
    
    /* запись на консультацию */
    const BK={days:[],day:null,slot:null};
    function companyToday(){const p=Object.fromEntries(new Intl.DateTimeFormat('en-US',{timeZone:TZ,year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date()).map(x=>[x.type,x.value]));return[+p.year,+p.month,+p.day]}
    function zonedTime(y,m,d,h){const guess=Date.UTC(y,m-1,d,h);
     const p=Object.fromEntries(new Intl.DateTimeFormat('en-US',{timeZone:TZ,hourCycle:'h23',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit'}).formatToParts(new Date(guess)).map(x=>[x.type,x.value]));
     return new Date(guess-(Date.UTC(+p.year,+p.month-1,+p.day,+p.hour,+p.minute)-guess))}
    function bkDays(){const[y,m,d]=companyToday(),out=[];
     for(let i=0;i<WORK.ahead;i++){const dt=new Date(Date.UTC(y,m-1,d+i));if(WORK.days.includes(dt.getUTCDay()))out.push({y:dt.getUTCFullYear(),m:dt.getUTCMonth()+1,d:dt.getUTCDate(),dt})}return out}
    const bkmsg=t=>showMsg('#bkMsg',t);
    async function initBookings(){BK.day=null;BK.slot=null;$('#bkGo').disabled=true;bkmsg('');
     $('#bkTz').textContent='Время указано по часовому поясу: '+TZL+'. Консультация длится 1 час.';
     BK.days=bkDays();
     $('#bkDays').innerHTML=BK.days.map((x,i)=>`<button class="chip" data-di="${i}" aria-pressed="false">${esc(new Intl.DateTimeFormat('ru-RU',{timeZone:'UTC',weekday:'short',day:'numeric',month:'short'}).format(x.dt))}</button>`).join('');
     $('#bkSlots').innerHTML='<p class="who" style="margin:0">Сначала выберите дату.</p>';
     const{data}=await sb.from('projects').select('id,title').eq('client_id',PROF.id).order('submitted_at',{ascending:false});
     $('#bkProject').innerHTML='<option value="">— без проекта —</option>'+(data||[]).map(p=>`<option value="${p.id}">${esc(p.title)}</option>`).join('');
     loadMyBookings()}
    async function loadSlots(){const x=BK.day;if(!x)return;BK.slot=null;$('#bkGo').disabled=true;
     const from=zonedTime(x.y,x.m,x.d,WORK.from),to=zonedTime(x.y,x.m,x.d,WORK.to);
     $('#bkSlots').innerHTML='<p class="who" style="margin:0">Загрузка…</p>';
     const{data,error}=await sb.rpc('slot_load',{p_from:from.toISOString(),p_to:to.toISOString()});
     if(error){$('#bkSlots').innerHTML='<p class="who" style="margin:0">Не удалось загрузить расписание.</p>';return}
     const map={};(data||[]).forEach(r=>{map[new Date(r.slot_start).getTime()]=r});
     let html='';
     for(let h=WORK.from;h<WORK.to;h++){const s=zonedTime(x.y,x.m,x.d,h),e=zonedTime(x.y,x.m,x.d,h+1),t=s.getTime(),info=map[t];
      const past=t<Date.now()+3600e3,full=info&&info.taken>=info.capacity,mine=info&&info.mine;
      const state=mine?'вы записаны':past?'недоступно':full?'занято':'свободно';
      html+=`<button class="chip" data-t="${s.toISOString()}" aria-pressed="false"${(past||full||mine)?' disabled':''}>${hhmm(s)}–${hhmm(e)}<small>${state}</small></button>`}
     $('#bkSlots').innerHTML=html||'<p class="who" style="margin:0">На эту дату слотов нет.</p>'}
    $('#bkDays').addEventListener('click',e=>{const b=e.target.closest('[data-di]');if(!b)return;
     [...$('#bkDays').children].forEach(x=>x.setAttribute('aria-pressed',x===b));BK.day=BK.days[+b.dataset.di];bkmsg('');loadSlots()});
    $('#bkSlots').addEventListener('click',e=>{const b=e.target.closest('[data-t]');if(!b||b.disabled)return;
     [...$('#bkSlots').children].forEach(x=>x.setAttribute('aria-pressed',x===b));BK.slot=b.dataset.t;$('#bkGo').disabled=false});
    $('#bkGo').onclick=async()=>{if(!BK.slot)return;$('#bkGo').disabled=true;
     const{error}=await sb.rpc('book_slot',{p_start:BK.slot,p_topic:$('#bkTopic').value.trim()||null,p_project:$('#bkProject').value||null});
     if(error){bkmsg(error.message);await loadSlots();return}
     bkmsg('Вы записаны на '+fmtDT(BK.slot)+' ('+TZL+').');$('#bkTopic').value='';await loadSlots();loadMyBookings()};
    async function loadMyBookings(){const box=$('#myBookings');
     const{data,error}=await sb.from('bookings').select('id,starts_at,status,topic,designer:profiles!bookings_designer_id_fkey(full_name),project:projects(title)').eq('client_id',PROF.id).order('starts_at',{ascending:false}).limit(30);
     if(error){box.innerHTML='<p class="who">Не удалось загрузить записи.</p>';return}
     const now=Date.now();
     box.innerHTML=(data&&data.length)?data.map(b=>{const past=new Date(b.starts_at).getTime()<now,
      st=b.status==='cancelled'?['Отменена','revision']:b.status==='done'?['Проведена','approved']:past?['Прошла','approved']:['Запланирована','submitted'];
      return `<div class="card" style="margin-bottom:10px"><div class="send" style="align-items:center;flex-wrap:wrap"><b style="flex:1">${esc(fmtDT(b.starts_at))}</b><span class="badge b-${st[1]}">${st[0]}</span></div><p class="who" style="margin:6px 0">${b.designer?'Дизайнер: '+esc(b.designer.full_name):'Дизайнер будет назначен'}${b.project?' · проект «'+esc(b.project.title)+'»':''}</p>${b.topic?`<p style="margin:6px 0">${esc(b.topic)}</p>`:''}${b.status==='booked'&&!past?`<button class="chip" data-cancel="${b.id}">Отменить запись</button>`:''}</div>`}).join(''):'<p class="who">У вас пока нет записей.</p>'}
    $('#myBookings').addEventListener('click',async e=>{const b=e.target.closest('[data-cancel]');if(!b)return;
     if(!(await ask('Отменить запись на консультацию?',{ok:'Отменить запись',cancel:'Оставить',danger:true,title:'Отмена записи'})))return;
     const{error}=await sb.rpc('cancel_booking',{p_id:b.dataset.cancel});
     gtoast(error?error.message:'Запись отменена');loadMyBookings();if(BK.day)loadSlots()});
    
    /* чат с дизайнером */
    const CH={id:null,seen:new Set(),ch:null};
    let chatFrom='config';
    function renderMsg(box,m,seen){if(seen.has(m.id))return;seen.add(m.id);
     const mine=PROF&&m.sender_id===PROF.id,d=document.createElement('div');d.className='msg '+(mine?'me':'them');
     d.textContent=(mine?'':(m.sender_name||'Команда')+'\n')+m.body;box.appendChild(d);box.scrollTop=1e5}
    async function postMsg(state,box,body){
     const{data,error}=await sb.from('messages').insert({conversation_id:state.id,body}).select().single();
     if(error){gtoast('Не отправлено: '+error.message);return false}
     renderMsg(box,data,state.seen);return true}
    async function openChat(from,projectId){chatFrom=from||'config';
     if(!sb){gtoast(NOSB);return}
     if(!PROF){openAuth();amsg('Войдите или зарегистрируйтесь, чтобы написать дизайнеру.');return}
     ['home','config','profile','staff','calc'].forEach(v=>$('#view-'+v).hidden=true);studio.pause();$('#view-chat').hidden=false;window.scrollTo(0,0);
     $('#chat').innerHTML='';CH.seen=new Set();
     // у проекта свой чат (projects.conversation_id); без проекта — общий чат клиента
     const got=projectId?await chatForProject(sb,projectId):await generalChat(sb,PROF.id);
     if(got.error){gtoast('Не удалось открыть диалог: '+(got.error.message||'ошибка'));return}
     CH.id=got.conv.id;
     const{data:msgs}=await sb.from('messages').select('*').eq('conversation_id',CH.id).order('created_at');
     (msgs||[]).forEach(m=>renderMsg($('#chat'),m,CH.seen));
     if(CH.ch)sb.removeChannel(CH.ch);
     CH.ch=sb.channel('c-'+CH.id).on('postgres_changes',{event:'INSERT',schema:'public',table:'messages',filter:'conversation_id=eq.'+CH.id},p=>renderMsg($('#chat'),p.new,CH.seen)).subscribe()}
    $('#sendForm').addEventListener('submit',e=>{e.preventDefault();const v=$('#msgIn').value.trim();if(!v||!CH.id)return;$('#msgIn').value='';postMsg(CH,$('#chat'),v)});
    $('#sendCfg').onclick=()=>openSubmit(chatFrom);
    $('#chatMine').onclick=()=>openProfile('projects');
    $('#editCfg').onclick=()=>go(chatFrom);
    
    /* ===== панель команды ===== */
    const ST={id:null,pid:null,cid:null,clients:[],seen:new Set(),ch:null,list:[],designers:[],team:[],projects:[],t:null,leadFilter:'new',leadRecip:'all',showArchive:false};
    let STAB='plans';
    async function renderStaff(){if(!sb||!isStaff()){go('home');return}
     // что видит каждая роль: владелец всё, дизайнер планировки, обращения и записи, менеджер только обращения
     const allowed=PROF.role==='owner'?['projects','plans','leads','bookings','team']:PROF.role==='manager'?['projects','leads']:['plans','leads','bookings'];
     [...$('#stTabs').children].forEach(b=>{b.hidden=!allowed.includes(b.dataset.st)});
     if(!allowed.includes(STAB))STAB=allowed[0];
     $('#stRole').textContent='Ваша роль: '+(ROLE_RU[PROF.role]||PROF.role)+'.';
     if(ST.ch)sb.removeChannel(ST.ch);
     const later=()=>{clearTimeout(ST.t);ST.t=setTimeout(refreshStaff,400)};
     ST.ch=sb.channel('staff')
      .on('postgres_changes',{event:'INSERT',schema:'public',table:'messages'},p=>{if(p.new.conversation_id===ST.id)renderMsg($('#stChat'),p.new,ST.seen);later()})
      .on('postgres_changes',{event:'*',schema:'public',table:'conversations'},later)
      .on('postgres_changes',{event:'*',schema:'public',table:'projects'},later)
      .on('postgres_changes',{event:'*',schema:'public',table:'leads'},later)
      .on('postgres_changes',{event:'*',schema:'public',table:'bookings'},later).subscribe();
     staffTab(STAB)}
    function staffTab(t){STAB=t;[...$('#stTabs').children].forEach(b=>b.setAttribute('aria-pressed',b.dataset.st===t));
     ['projects','plans','leads','bookings','team'].forEach(x=>$('#st-'+x).hidden=x!==t);refreshStaff()}
    $('#stTabs').addEventListener('click',e=>{const b=e.target.closest('[data-st]');if(b)staffTab(b.dataset.st)});
    async function refreshStaff(){if(!sb||!isStaff())return;refreshBadges();
     if(STAB==='projects')await refreshProjectsTab();else if(STAB==='plans')await refreshPlans();else if(STAB==='leads')await refreshLeads();else if(STAB==='team')await refreshTeam();else await refreshBookings()}
    async function refreshBadges(){
     const cnt=async(t,f)=>{const{count}=await f(sb.from(t).select('id',{count:'exact',head:true}));return count||0};
     const mgr=PROF&&PROF.role==='manager'; // менеджеру проекты и записи не показываются
     const[a,b,c]=await Promise.all([mgr?0:cnt('projects',q=>q.eq('status','submitted').is('archived_at',null)),cnt('leads',q=>q.eq('status','new')),mgr?0:cnt('bookings',q=>q.eq('status','booked').gte('starts_at',new Date().toISOString()))]);
     $('#bPlans').textContent=a?a+' на согласовании':'';$('#bLeads').textContent=b?b+' новых':'';$('#bBook').textContent=c?c+' предстоит':''}
    
    /* раздел «Проекты»: владелец видит все проекты и архивирует их; менеджер видит актуальные и открывает нужный для работы */
    const PJ={f:'active',clientOf:{}};
    async function refreshProjectsTab(){
     const owner=PROF.role==='owner';
     $('#projIntro').textContent=owner?'Все проекты клиентов. Архивные проекты можно вернуть из архива в любой момент.':'Актуальные проекты клиентов. Откройте проект, чтобы посмотреть его и работать с ним.';
     $('#stProjFilters').hidden=!owner;
     [...$('#stProjFilters').children].forEach(b=>b.setAttribute('aria-pressed',b.dataset.pf===PJ.f));
     const[pj,cv]=await Promise.all([
      sb.from('projects').select('id,title,status,price,conversation_id,submitted_at,archived_at').order('submitted_at',{ascending:false}).limit(300),
      sb.from('conversations').select('id,client:profiles!conversations_client_id_fkey(full_name,username)')]);
     if(pj.error){$('#projList').innerHTML='<p class="who">Не удалось загрузить проекты: '+esc(pj.error.message)+'</p>';return}
     (cv.data||[]).forEach(c=>{PJ.clientOf[c.id]=c.client&&c.client.full_name||'Клиент'});
     const all=pj.data||[],act=all.filter(p=>!p.archived_at),arc=all.filter(p=>p.archived_at);
     const sub=act.filter(p=>p.status==='submitted').length;
     $('#bProj').textContent=sub?sub+' на согласовании':'';
     const list=!owner?act:PJ.f==='archived'?arc:PJ.f==='all'?all:act;
     $('#projList').innerHTML=list.length?list.map(p=>{const cl=PJ.clientOf[p.conversation_id]||'Клиент';
      const btn=owner&&p.status==='submitted'&&!p.archived_at?'Проверить':'Открыть';
      return `<div class="send" style="align-items:center;margin-bottom:8px;flex-wrap:wrap"><span style="flex:1;min-width:200px"><b>${esc(p.title)}</b><br><span class="who">${esc(cl)} · ${esc(fmtD(p.submitted_at))} · ≈ ${fmt(+p.price)}</span></span><span class="badge b-${p.archived_at?'archived':p.status}">${p.archived_at?'В архиве':(PST[p.status]||p.status)}</span><button class="chip" type="button" data-rv="${p.id}">${btn}</button>${owner?`<button class="chip" type="button" data-arch="${p.id}" data-on="${p.archived_at?0:1}">${p.archived_at?'Вернуть из архива':'В архив'}</button>`:''}</div>`}).join('')
      :'<p class="who" style="margin:0">'+(owner&&PJ.f==='archived'?'В архиве проектов нет.':'Актуальных проектов пока нет.')+'</p>';
    }
    $('#stProjFilters').addEventListener('click',e=>{const b=e.target.closest('[data-pf]');if(!b)return;PJ.f=b.dataset.pf;refreshProjectsTab()});
    $('#projList').addEventListener('click',async e=>{
     const a=e.target.closest('[data-arch]');
     if(a){const toArchive=a.dataset.on==='1';
      const{error}=await sb.rpc(toArchive?'archive_project':'unarchive_project',{p_id:a.dataset.arch});
      if(error)return gtoast('Ошибка: '+error.message);
      gtoast(toArchive?'Проект перемещён в архив':'Проект возвращён из архива');refreshStaff();return}
     const b=e.target.closest('[data-rv]');if(b)openReview(b.dataset.rv)});

    /* раздел «Планировки»: один клиент — одна строка; проект выбирается внутри, и уже по нему открывается диалог */
    async function loadDesigners(){
     const{data}=await sb.from('profiles').select('id,username,full_name,role').eq('role','designer').order('full_name');
     ST.designers=data||[];
    }
    async function refreshPlans(){
     if(PROF.role==='owner')await refreshTeam();else await loadDesigners();
     const[cv,pj]=await Promise.all([
      sb.from('conversations').select('id,status,designer_id,client_id,client:profiles!conversations_client_id_fkey(full_name,username'+(HAS_PHONE?',phone':'')+'),designer:profiles!conversations_designer_id_fkey(full_name)').neq('status','closed').order('updated_at',{ascending:false}),
      sb.from('projects').select('id,title,status,price,conversation_id,submitted_at,archived_at').order('submitted_at',{ascending:false})]);
     ST.list=cv.data||[];ST.projects=pj.data||[];
     // все диалоги одного клиента собираются в одну строку
     const groups=new Map();
     ST.list.forEach(c=>{const g=groups.get(c.client_id)||{id:c.client_id,client:c.client,convs:[]};g.convs.push(c);groups.set(c.client_id,g)});
     ST.clients=[...groups.values()];
     $('#convList').innerHTML=ST.clients.length?ST.clients.map(g=>{const ps=ST.projects.filter(p=>!p.archived_at&&g.convs.some(c=>c.id===p.conversation_id));
      const n=ps.filter(p=>p.status==='submitted').length,ds=[...new Set(g.convs.map(c=>c.designer&&c.designer.full_name).filter(Boolean))];
      return `<button class="chip" data-cid="${g.id}" aria-pressed="${g.id===ST.cid}" style="width:100%;margin-bottom:8px">${esc(g.client&&g.client.full_name||'Клиент')}<small>@${esc(g.client&&g.client.username||'')}${g.client&&g.client.phone?' · '+esc(g.client.phone):''} · проектов: ${ps.length} · ${ds.length?esc(ds.join(', ')):'без дизайнера'}${n?' · на согласовании: '+n:''}</small></button>`}).join(''):'<p class="who">Диалогов пока нет.</p>';
     if(ST.cid)renderClientProjects()}
    // проекты выбранного клиента: дизайнер и диалог назначаются по конкретному проекту
    function renderClientProjects(){const box=$('#stProjects'),g=ST.clients&&ST.clients.find(x=>x.id===ST.cid);box.hidden=!g;if(!g)return;
     const cv=ST.list.find(x=>x.id===ST.id);$('#stDelChat').hidden=!cv||!canCloseChat(cv);
     const items=[];g.convs.forEach(c=>{const ps=ST.projects.filter(p=>p.conversation_id===c.id);
      if(!ps.length)items.push({c,p:null});ps.forEach(p=>items.push({c,p}))});
     const arch=items.filter(i=>i.p&&i.p.archived_at),shown=ST.showArchive?items:items.filter(i=>!i.p||!i.p.archived_at);
     const sees=PROF.role==='owner'||PROF.role==='designer';
     box.innerHTML='<div class="who" style="margin-bottom:6px">Проекты клиента</div>'+(sees&&arch.length?`<button class="chip" type="button" data-toggle-arch style="margin-bottom:8px">${ST.showArchive?'Скрыть архив':'Показать архив'} (${arch.length})</button>`:'')+(shown.length?shown.map(({c,p})=>{const on=c.id===ST.id&&(p?p.id===ST.pid:true),ca=!!p&&(PROF.role==='owner'||(PROF.role==='designer'&&c.designer_id===PROF.id));
      return `<div class="send" style="align-items:center;margin-bottom:6px;flex-wrap:wrap"><span style="flex:1"><b>${p?esc(p.title):'Общий диалог'}</b> <span class="who">${p?esc(fmtD(p.submitted_at))+' · ≈ '+fmt(+p.price)+' · ':''}${c.designer?esc(c.designer.full_name):'без дизайнера'}</span></span>${p?`<span class="badge b-${p.archived_at?'archived':p.status}">${p.archived_at?'В архиве':(PST[p.status]||p.status)}</span>`:''}<button class="chip" type="button" data-cv="${c.id}" data-pid="${p?p.id:''}" aria-pressed="${on}">${on?'Открыт':'Открыть'}</button>${p?`<button class="chip" type="button" data-rv="${p.id}">${p.status==='submitted'?'Проверить':'Открыть'}</button>`:''}${ca?`<button class="chip" type="button" data-arch="${p.id}" data-on="${p.archived_at?0:1}">${p.archived_at?'Вернуть из архива':'В архив'}</button>`:''}</div>`}).join(''):'<p class="who" style="margin:0">'+(arch.length?'Активных проектов нет. Они в архиве.':'Клиент ещё не отправлял проекты.')+'</p>')}
    $('#stProjects').addEventListener('click',async e=>{
     if(e.target.closest('[data-toggle-arch]')){ST.showArchive=!ST.showArchive;renderClientProjects();return}
     const v=e.target.closest('[data-cv]');if(v){openConv(v.dataset.cv,v.dataset.pid||null);return}
     const a=e.target.closest('[data-arch]');
     if(a){const toArchive=a.dataset.on==='1';
      const{error}=await sb.rpc(toArchive?'archive_project':'unarchive_project',{p_id:a.dataset.arch});
      if(error)return gtoast('Ошибка: '+error.message);
      gtoast(toArchive?'Проект перемещён в архив':'Проект возвращён из архива');refreshStaff();return}
     const b=e.target.closest('[data-rv]');if(b)openReview(b.dataset.rv)});
    async function refreshTeam(){
     const{data}=await sb.from('profiles').select('id,username,full_name,role').in('role',['designer','manager']).order('full_name');
     ST.team=data||[];ST.designers=ST.team.filter(m=>m.role==='designer');
     $('#teamList').innerHTML=ST.team.length?ST.team.map(m=>`<div class="send" style="margin-bottom:6px;align-items:center;flex-wrap:wrap"><span style="flex:1">${esc(m.full_name)} <span class="who">@${esc(m.username)}</span></span><select data-role-for="${m.id}" aria-label="Роль: ${esc(m.full_name)}" style="width:auto;max-width:260px"><option value="manager"${m.role==='manager'?' selected':''}>Менеджер</option><option value="designer"${m.role==='designer'?' selected':''}>Дизайнер</option><option value="client">Снять роль (обычный клиент)</option></select></div>`).join(''):'<p class="who">Сотрудников пока нет. Назначьте менеджера или дизайнера по юзернейму.</p>'}
    $('#teamAdd').addEventListener('submit',async e=>{e.preventDefault();const u=$('#teamUser').value.trim().replace(/^@/,'');if(!u||!sb)return;
     const{data}=await sb.from('profiles').select('id,role').ilike('username',u.replace(/[\\_%]/g,'\\$&')).maybeSingle();
     if(!data)return gtoast('Пользователь не найден');
     const role=$('#teamRole').value;
     const{error}=await sb.rpc('set_role',{target:data.id,new_role:role});
     if(error)return gtoast('Ошибка: '+error.message);$('#teamUser').value='';gtoast(role==='manager'?'Менеджер назначен':'Дизайнер назначен');refreshStaff()});
    $('#teamList').addEventListener('change',async e=>{const sel=e.target.closest('[data-role-for]');if(!sel)return;
     const{error}=await sb.rpc('set_role',{target:sel.dataset.roleFor,new_role:sel.value});
     gtoast(error?'Ошибка: '+error.message:(sel.value==='client'?'Роль снята':'Роль изменена'));refreshStaff()});
    // назначение дизайнера: владелец и менеджер назначают любого дизайнера; дизайнер берёт свободный проект или снимает себя
    function renderAssign(c){const box=$('#stAssign');const r=PROF.role;box.hidden=!c;if(box.hidden)return;
     const canAny=r==='owner'||r==='manager',free=!c.designer_id,mine=c.designer_id===PROF.id;
     const hint=free?'Проект без дизайнера.':mine?'Вы ведёте этот проект.':'Ведёт: '+(c.designer?c.designer.full_name:'другой дизайнер')+'.';
     let body='';
     if(canAny)body=`<div class="send"><select id="asSel" aria-label="Дизайнер"><option value="">— не назначен —</option>${ST.designers.map(d=>`<option value="${d.id}"${d.id===c.designer_id?' selected':''}>${esc(d.full_name)} (@${esc(d.username)})</option>`).join('')}</select><button class="btn" id="asBtn" type="button">Сохранить</button></div>`;
     else if(r==='designer'&&free)body=`<button class="btn" id="asBtn" type="button" data-take="1">Взять проект в работу</button>`;
     else if(r==='designer'&&mine)body=`<button class="btn ghost" id="asBtn" type="button" data-take="0">Снять себя с проекта</button>`;
     box.innerHTML=`<div class="who" style="margin-bottom:6px">Дизайнер проекта · ${hint}</div>${body}`;
     const btn=$('#asBtn');if(!btn)return;
     btn.onclick=async()=>{let designer;
      if(canAny)designer=$('#asSel').value||null;else designer=btn.dataset.take==='1'?PROF.id:null;
      const{error}=await sb.from('conversations').update({designer_id:designer}).eq('id',c.id);
      gtoast(error?'Ошибка: '+error.message:'Сохранено');refreshStaff()}}
    // открыть диалог проекта (или общий диалог клиента) справа
    async function openConv(cid,pid){
     const c=ST.list.find(x=>x.id===cid);if(!c)return;
     ST.id=cid;ST.pid=pid||null;ST.seen=new Set();
     [...$('#stProjects').querySelectorAll('[data-cv]')].forEach(x=>{const on=x.dataset.cv===cid&&(x.dataset.pid||null)===ST.pid;x.setAttribute('aria-pressed',on);x.textContent=on?'Открыт':'Открыть'});
     const g=ST.clients.find(x=>x.id===ST.cid);
     $('#stTitle').textContent=(g&&g.client&&g.client.full_name||'Клиент')+' (@'+(g&&g.client&&g.client.username||'')+(g&&g.client&&g.client.phone?', '+g.client.phone:'')+')'+(pid?' · '+(ST.projects.find(p=>p.id===pid)||{}).title:'');
     $('#stChat').innerHTML='';$('#stForm').hidden=false;renderAssign(c);renderClientProjects();
     const{data}=await sb.from('messages').select('*').eq('conversation_id',ST.id).order('created_at');
     (data||[]).forEach(m=>renderMsg($('#stChat'),m,ST.seen))}
    $('#convList').addEventListener('click',async e=>{const b=e.target.closest('[data-cid]');if(!b)return;
     ST.cid=b.dataset.cid;ST.id=null;ST.pid=null;ST.showArchive=false;
     [...$('#convList').children].forEach(x=>x.setAttribute('aria-pressed',x===b));
     const g=ST.clients.find(x=>x.id===ST.cid);if(!g)return;
     $('#stTitle').textContent=(g.client&&g.client.full_name||'Клиент')+' (@'+(g.client&&g.client.username||'')+(g.client&&g.client.phone?', '+g.client.phone:'')+')';
     $('#stChat').innerHTML='';$('#stForm').hidden=true;$('#stAssign').hidden=true;$('#stDelChat').hidden=true;
     renderClientProjects()});
    $('#stForm').addEventListener('submit',e=>{e.preventDefault();const v=$('#stIn').value.trim();if(!v||!ST.id)return;$('#stIn').value='';postMsg(ST,$('#stChat'),v)});
    // чат можно удалить, когда все проекты клиента в этом диалоге оплачены (проект завершён)
    function canCloseChat(c){const ps=ST.projects.filter(p=>p.conversation_id===c.id);return ps.length>0&&ps.every(p=>p.status==='paid')}
    $('#stDelChat').onclick=async()=>{const c=ST.list.find(x=>x.id===ST.id);if(!c||!canCloseChat(c))return;
     if(!(await ask('Удалить чат с клиентом «'+(c.client&&c.client.full_name||'Клиент')+'»? Чат пропадёт из панели, проект клиента останется.',{ok:'Удалить чат',danger:true,title:'Удалить чат'})))return;
     const{error}=await sb.from('conversations').update({status:'closed'}).eq('id',c.id);
     if(error)return gtoast('Ошибка: '+error.message);
     ST.id=null;ST.pid=null;$('#stTitle').textContent='Выберите диалог';$('#stChat').innerHTML='';
     ['#stForm','#stAssign','#stDelChat'].forEach(s=>$(s).hidden=true);
     renderClientProjects();
     gtoast('Чат удалён');refreshStaff()};
    
    /* окно проверки проекта */
    const RV={p:null,calc:null,adj:[]};
    const rvmsg=t=>showMsg('#rvMsg',t);
    async function openReview(id){
     const{data:p,error}=await sb.from('projects').select('id,title,status,price,config,calc,review_note,conversation_id,archived_at').eq('id',id).single();
     if(error||!p)return gtoast('Не удалось загрузить проект');
     RV.p=p;RV.calc=(p.status==='approved'||p.status==='paid')&&p.calc?p.calc:calcProject(p.config);
     RV.adj=(RV.calc.adjustments||[]).map(a=>({name:a.name,amount:a.amount}));
     const conv=ST.list.find(c=>c.id===p.conversation_id),editable=p.status==='submitted'&&!p.archived_at&&PROF.role!=='manager'; // менеджер только просматривает; согласует дизайнер или владелец
     $('#rvT').textContent=p.title;$('#rvMeta').textContent=(conv&&conv.client?conv.client.full_name:(PJ.clientOf[p.conversation_id]||'Клиент'))+' · '+(PST[p.status]||p.status);
     $('#rvNote').value=p.review_note||'';$('#rvNote').disabled=!editable;
     $('#rvOk').hidden=$('#rvRev').hidden=!editable;$('#rvAdjBox').hidden=!editable;
     renderAdj();renderRvCalc();rvmsg('');$('#reviewModal').hidden=false}
    function renderRvCalc(){RV.calc.adjustments=RV.adj.map(a=>({name:String(a.name||'').slice(0,80),amount:Math.round(+a.amount||0)}));sumCalc(RV.calc);$('#rvCalc').innerHTML=calcHTML(RV.calc)}
    function renderAdj(){$('#rvAdj').innerHTML=RV.adj.map((a,i)=>`<div class="send" style="margin-bottom:6px" data-ai="${i}"><input class="ai-name" placeholder="Название (например, скидка)" maxlength="80" value="${esc(a.name)}" aria-label="Название"><input class="ai-amt" type="number" step="1000" placeholder="Сумма, ₽ (минус — скидка)" value="${esc(a.amount)}" aria-label="Сумма" style="max-width:200px"><button class="chip" type="button" data-ad="${i}" aria-label="Удалить">×</button></div>`).join('')}
    $('#rvAddAdj').onclick=()=>{RV.adj.push({name:'',amount:0});renderAdj()};
    $('#rvAdj').addEventListener('input',e=>{const row=e.target.closest('[data-ai]');if(!row)return;const a=RV.adj[+row.dataset.ai];
     if(e.target.classList.contains('ai-name'))a.name=e.target.value;else a.amount=e.target.value;renderRvCalc()});
    $('#rvAdj').addEventListener('click',e=>{const b=e.target.closest('[data-ad]');if(!b)return;RV.adj.splice(+b.dataset.ad,1);renderAdj();renderRvCalc()});
    $('#rvX').onclick=()=>$('#reviewModal').hidden=true;
    $('#rv3d').onclick=()=>{$('#reviewModal').hidden=true;loadProject(RV.p.config,null,true)};
    async function decide(decision){if(!RV.p)return;const note=$('#rvNote').value.trim();
     if(decision==='revision'&&!note)return rvmsg('Напишите, что нужно доработать.');
     if(decision==='approved'&&RV.adj.some(a=>(+a.amount||0)!==0&&!String(a.name||'').trim()))return rvmsg('Укажите название для каждой корректировки.');
     $('#rvOk').disabled=$('#rvRev').disabled=true;
     if(decision==='approved')renderRvCalc();
     const{error}=await sb.rpc('review_project',{p_id:RV.p.id,p_decision:decision,p_note:note||null,p_calc:decision==='approved'?RV.calc:null});
     $('#rvOk').disabled=$('#rvRev').disabled=false;
     if(error)return rvmsg(error.message);
     $('#reviewModal').hidden=true;gtoast(decision==='approved'?'Проект согласован, клиент увидит расчёт':'Проект возвращён на доработку');refreshStaff()}
    $('#rvOk').onclick=()=>decide('approved');
    $('#rvRev').onclick=()=>decide('revision');
    
    /* раздел «Обращения» (форма внизу главной страницы) */
    let LEADS_RECIP=false; // есть ли в базе колонка recipient (выполнена ли миграция 06)
    async function refreshLeads(){
     const owner=PROF.role==='owner';
     const q=cols=>{let x=sb.from('leads').select(cols).order('created_at',{ascending:false}).limit(200);
      if(ST.leadFilter!=='all')x=x.eq('status',ST.leadFilter);
      if(owner&&ST.leadRecip!=='all')x=x.eq('recipient',ST.leadRecip);return x};
     const base='id,name,phone,status,created_at,taker:profiles!leads_taken_by_fkey(full_name)';
     let r=await q(base+',topic,recipient');LEADS_RECIP=!r.error;
     if(r.error&&/recipient|topic/i.test(String(r.error.message||'')))r=await q(base+',topic');
     if(r.error&&/topic/i.test(String(r.error.message||'')))r=await q(base);
     const{data,error}=r;
     $('#leadRecipFilters').hidden=!(owner&&LEADS_RECIP);
     const intro={owner:'Все обращения с формы «Получить консультацию» внизу главной страницы: и адресованные менеджеру, и дизайнеру. Это не диалоги по планировке.',
      manager:'Обращения с формы внизу главной страницы, которые клиенты адресовали менеджеру.',designer:'Обращения с формы внизу главной страницы, которые клиенты адресовали дизайнеру. Диалоги по планировке находятся в разделе «Планировки».'};
     $('#leadIntro').textContent=LEADS_RECIP?(intro[PROF.role]||intro.owner):'Обращения с формы «Получить консультацию» внизу главной страницы. Это не диалоги по планировке.';
     if(error){$('#leadList').innerHTML='<p class="who">Не удалось загрузить обращения.</p>';return}
     $('#leadList').innerHTML=(data&&data.length)?data.map(l=>{const rc=l.recipient==='designer'?['дизайнеру','approved','to-manager','Передать менеджеру']:['менеджеру','submitted','to-designer','Передать дизайнеру'];
      return `<div class="card" style="margin-bottom:10px"><div class="send" style="align-items:center;flex-wrap:wrap"><b style="flex:1">${esc(l.name)}</b>${LEADS_RECIP?`<span class="badge b-${rc[1]}">Кому: ${rc[0]}</span>`:''}<span class="badge b-${LCLS[l.status]}">${LST[l.status]}</span></div><p style="margin:6px 0"><a href="tel:${esc(l.phone.replace(/[^\d+]/g,''))}">${esc(l.phone)}</a> <span class="who">· ${esc(fmtDT(l.created_at))}${l.taker?' · взял(а): '+esc(l.taker.full_name):''}</span></p>${l.topic?`<p style="margin:6px 0"><b>Тема:</b> ${esc(l.topic)}</p>`:''}<div class="row">${l.status==='new'?`<button class="btn" data-la="take" data-id="${l.id}">Взять в работу</button>`:''}${l.status==='in_work'?`<button class="btn" data-la="done" data-id="${l.id}">Закрыть</button>`:''}${l.status==='done'?`<button class="btn ghost" data-la="take" data-id="${l.id}">Вернуть в работу</button>`:''}${LEADS_RECIP?`<button class="btn ghost" data-la="${rc[2]}" data-id="${l.id}">${rc[3]}</button>`:''}</div></div>`}).join(''):'<p class="who">Обращений нет.</p>'}
    $('#leadRecipFilters').addEventListener('click',e=>{const b=e.target.closest('[data-lr]');if(!b)return;ST.leadRecip=b.dataset.lr;
     [...$('#leadRecipFilters').children].forEach(x=>x.setAttribute('aria-pressed',x===b));refreshLeads()});
    $('#leadFilters').addEventListener('click',e=>{const b=e.target.closest('[data-lf]');if(!b)return;ST.leadFilter=b.dataset.lf;
     [...$('#leadFilters').children].forEach(x=>x.setAttribute('aria-pressed',x===b));refreshLeads()});
    $('#leadList').addEventListener('click',async e=>{const b=e.target.closest('[data-la]');if(!b)return;
     const a=b.dataset.la;
     // при передаче другому адресату обращение снова становится новым и ни за кем не закреплено
     const patch=a==='done'?{status:'done'}:a==='to-designer'?{recipient:'designer',status:'new',taken_by:null}:a==='to-manager'?{recipient:'manager',status:'new',taken_by:null}:{status:'in_work',taken_by:PROF.id};
     const{error}=await sb.from('leads').update(patch).eq('id',b.dataset.id);
     gtoast(error?'Ошибка: '+error.message:'Сохранено');refreshStaff()});
    
    /* раздел «Записи на консультацию» */
    async function refreshBookings(){
     const{data,error}=await sb.from('bookings').select('id,starts_at,status,topic,designer_id,client:profiles!bookings_client_id_fkey(full_name,username'+(HAS_PHONE?',phone':'')+'),designer:profiles!bookings_designer_id_fkey(full_name),project:projects(title)').gte('starts_at',new Date(Date.now()-7*864e5).toISOString()).order('starts_at').limit(200);
     if(error){$('#bookList').innerHTML='<p class="who">Не удалось загрузить записи.</p>';return}
     const now=Date.now();
     $('#bookList').innerHTML=(data&&data.length)?data.map(b=>{const past=new Date(b.starts_at).getTime()<now,
      st=b.status==='cancelled'?['Отменена','revision']:b.status==='done'?['Проведена','approved']:past?['Время прошло','paid']:['Запланирована','submitted'],
      mine=b.designer_id===PROF.id,canAct=b.status==='booked'&&(PROF.role==='owner'||mine||!b.designer_id);
      return `<div class="card" style="margin-bottom:10px"><div class="send" style="align-items:center;flex-wrap:wrap"><b style="flex:1">${esc(fmtDT(b.starts_at))}</b><span class="badge b-${st[1]}">${st[0]}</span></div><p style="margin:6px 0">${esc(b.client&&b.client.full_name||'Клиент')} <span class="who">@${esc(b.client&&b.client.username||'')}${b.client&&b.client.phone?' · '+esc(b.client.phone):''} · ${b.designer?'дизайнер: '+esc(b.designer.full_name):'дизайнер не назначен'}${b.project?' · проект «'+esc(b.project.title)+'»':''}</span></p>${b.topic?`<p style="margin:6px 0">${esc(b.topic)}</p>`:''}<div class="row">${(b.status==='booked'&&!b.designer_id)?`<button class="btn" data-ba="claim" data-id="${b.id}">Взять себе</button>`:''}${canAct&&b.designer_id?`<button class="btn" data-ba="done" data-id="${b.id}">Отметить проведённой</button>`:''}${canAct?`<button class="btn ghost" data-ba="cancel" data-id="${b.id}">Отменить</button>`:''}</div></div>`}).join(''):'<p class="who">Записей нет.</p>'}
    $('#bookList').addEventListener('click',async e=>{const b=e.target.closest('[data-ba]');if(!b)return;
     const a=b.dataset.ba,patch=a==='claim'?{designer_id:PROF.id}:a==='done'?{status:'done'}:{status:'cancelled'};
     if(a==='cancel'&&!(await ask('Отменить запись клиента?',{ok:'Отменить запись',cancel:'Оставить',danger:true,title:'Отмена записи'})))return;
     const{error}=await sb.from('bookings').update(patch).eq('id',b.dataset.id);
     gtoast(error?'Ошибка: '+error.message:'Сохранено');refreshStaff()});
    
    /* диагностика связи: откройте сайт с добавкой ?diag=1 к адресу */
    async function runDiag(){
     const box=document.createElement('div');
     box.style.cssText='position:fixed;inset:10px;z-index:100;overflow:auto;background:#10201a;color:#e9efeb;padding:16px;border-radius:12px;font:14px/1.5 monospace;white-space:pre-wrap';
     document.body.appendChild(box);
     const lines=[],bad=[],out=()=>{box.textContent=lines.join('\n')};
     const add=(ok,name,detail)=>{if(!ok)bad.push(name);lines.push((ok?'OK      ':'ОШИБКА ')+name+(detail?' — '+detail:''));out()};
     const timed=async(name,fn)=>{const t=performance.now();
      try{const d=await Promise.race([fn(),new Promise((_,rej)=>setTimeout(()=>rej(new Error('нет ответа за 10 с')),10000))]);add(true,name,d+', '+Math.round(performance.now()-t)+' мс')}
      catch(e){add(false,name,(e&&e.message||String(e))+', '+Math.round(performance.now()-t)+' мс')}};
     lines.push('ДИАГНОСТИКА САЙТА. Сделайте скриншот этого окна и пришлите.','');
     lines.push('Страница: '+location.origin+location.pathname);
     lines.push('Браузер: '+navigator.userAgent);
     lines.push('Соединение https: '+(window.isSecureContext?'да':'нет'));
     lines.push('Версия сайта: '+BUILD);
     lines.push('Вход по телефону (PHONE_AUTH в config.js): '+(PHONE_ON?'включён':'ВЫКЛЮЧЕН, ссылки на регистрацию по телефону не будет'),'');out();
     add(cfgOk,'config.js заполнен');
     add(!!window.supabase,'Библиотека входа загружена');
     await timed('3D-модуль three.js загружается',async()=>{if(!(await ensureThree()))throw new Error('не загрузился');return 'загружен'});
     if(cfgOk){
      const base=cfg.SUPABASE_URL.replace(/\/$/,''),h={apikey:cfg.SUPABASE_ANON_KEY},j={...h,'Content-Type':'application/json'};
      await timed('Сервер аккаунтов, маленький ответ',async()=>{const r=await fetch(base+'/auth/v1/health',{headers:h});return 'HTTP '+r.status});
      await timed('База данных, запрос функции',async()=>{const r=await fetch(base+'/rest/v1/rpc/username_taken',{method:'POST',headers:j,body:JSON.stringify({u:'diag_probe_user'})});return 'HTTP '+r.status});
      await timed('Вход, проверка связи (неверные данные: это нормально)',async()=>{const r=await fetch(base+'/auth/v1/token?grant_type=password',{method:'POST',headers:j,body:JSON.stringify({email:'diag@example.invalid',password:'x'})});return 'HTTP '+r.status});
      await timed('Крупный ответ сервера (проверка лимита 16 КБ)',async()=>{const r=await fetch(base+'/rest/v1/',{headers:h});const t=await r.text();return 'HTTP '+r.status+', получено '+t.length+' символов'});
      await timed('Чат в реальном времени (WebSocket)',()=>new Promise((res,rej)=>{let w;try{w=new WebSocket(base.replace(/^http/,'ws')+'/realtime/v1/websocket?apikey='+encodeURIComponent(cfg.SUPABASE_ANON_KEY)+'&vsn=1.0.0')}catch(e){return rej(e)}
       w.onopen=()=>{w.close();res('соединение установлено')};w.onerror=()=>rej(new Error('соединение не установилось'))}))}
     lines.push('');const has=n=>bad.some(b=>b.includes(n));
     if(!bad.length)lines.push('ИТОГ: связь в порядке. Если вход всё равно не работает, пришлите текст сообщения под формой входа.');
     else{lines.push('ИТОГ:');
      if(has('Библиотека входа'))lines.push('• Не загрузилась библиотека входа. Положите файл vendor/supabase.js в репозиторий (см. README).');
      if(has('three.js'))lines.push('• Не грузится 3D-модуль: конструктор не откроется. Положите файл vendor/three.min.js в репозиторий (см. README).');
      if(has('Сервер аккаунтов')||has('База данных')||has('Вход,')||has('Крупный ответ'))lines.push('• Запросы к серверу Supabase не проходят или обрываются: вероятно, ограничение провайдера. Нужен прокси или другой хостинг сервера (см. README).');
      if(has('Чат в реальном'))lines.push('• Чат в реальном времени не подключается; вход и проекты при этом могут работать.')}
     out()}
    if(/[?&]diag=1/.test(location.search||''))runDiag();
    
    studio.init({user:()=>PROF,go:(v)=>go(v),canManageReady:()=>!!PROF&&(PROF.role==='owner'||PROF.role==='creative')});
    // открыть готовый дом из базы в конструкторе (тот же загрузчик, что и у сохранённых проектов)
    window.__openReadyDb=d=>{go('config',null,{readyConfig:d})};
    $('#toReady').onclick=()=>{if(!sb||!PROF)return;const d=studio.readyDraft();if(!d.rooms)return gtoast('Сначала добавьте хотя бы одну комнату.');$('#readyName').value='';$('#readyNote').value='';$('#readyPub').checked=true;$('#readyMsg').textContent='';$('#readyModal').hidden=false;setTimeout(()=>$('#readyName').focus(),30)};
    $('#readyX').onclick=()=>$('#readyModal').hidden=true;
    $('#readyForm').addEventListener('submit',async e=>{e.preventDefault();const btn=$('#readyGo');btn.disabled=true;
     const r=await saveCurrentAsReady({name:$('#readyName').value,note:$('#readyNote').value,published:$('#readyPub').checked},studio.readyDraft());
     btn.disabled=false;if(r.error){$('#readyMsg').textContent=r.error;return}
     $('#readyModal').hidden=true;gtoast('Дом добавлен в готовые','ok')});
    $('#readyEditX').onclick=()=>$('#readyEditModal').hidden=true;
    $('#readyEditForm').addEventListener('submit',async e=>{e.preventDefault();const id=e.currentTarget.dataset.id;
     const r=await saveReadyEdit(id,$('#readyEditName').value,$('#readyEditNote').value);
     if(r.error)return gtoast(r.error);$('#readyEditModal').hidden=true;gtoast('Сохранено','ok')});
    authUI();loadProfile();
    go('home');
