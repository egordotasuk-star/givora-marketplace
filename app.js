(() => {
"use strict";
const $ = id => document.getElementById(id);
const tg = window.Telegram?.WebApp;
const API_BASE = String(window.GIVORA_API_BASE || "").replace(/\/+$/, "");
const ADMIN_LABEL = "@harmonydurov";
let me = null, listings = [], historyData = {orders:[], ledger:[], requests:[]}, inventoryData = [];
let favs = new Set(JSON.parse(localStorage.getItem("givoraFavs") || "[]"));
let rate = null, activePage = "catalog", adminTab = "overview";
const money = n => Number(n || 0).toLocaleString("ru-RU");
const safe = s => String(s ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
function toast(s) { $("toast").textContent=s; $("toast").classList.add("show"); setTimeout(()=>$("toast").classList.remove("show"),2600); }
function setStatus(s, bad=false) { const el=$("statusline"); if(el){el.textContent=s;el.classList.toggle("error",bad);} }
function api(path, options={}) {
  if (!API_BASE || API_BASE.includes("YOUR-API")) return Promise.reject(new Error("API-адрес ещё не настроен"));
  if (!tg?.initData) return Promise.reject(new Error("Открой Givora через Telegram Mini App"));
  const headers = {...(options.headers||{}), "Authorization":`tma ${tg.initData}`};
  if (options.body) headers["Content-Type"]="application/json";
  return fetch(`${API_BASE}${path}`, {...options, headers}).then(async r=>{
    const data=await r.json().catch(()=>({}));
    if(!r.ok) throw new Error(data.message || data.error || `Ошибка сервера (${r.status})`);
    return data;
  });
}
function page(p) {
  activePage=p;
  document.querySelectorAll(".view").forEach(v=>v.classList.toggle("active",v.id===p));
  document.querySelectorAll(".nav").forEach(n=>n.classList.toggle("active",n.dataset.page===p));
  if(p==="profile") renderProfile();
  if(p==="favorites") renderFavs();
  if(p==="orders") loadHistory().then(renderOrders).catch(e=>toast(e.message));
  if(p==="admin") renderAdmin().catch(e=>toast(e.message));
}
document.querySelectorAll("[data-page]").forEach(b=>b.addEventListener("click",()=>page(b.dataset.page)));
$("toCatalog").onclick=()=>$("search").focus();
$("theme").onclick=()=>document.body.classList.toggle("light");
function giftImage(g) {
  if (g.image_url) return g.image_url;
  const slug=String(g.gift_url||"").split("/").pop();
  return slug ? `https://nft.fragment.com/gift/${encodeURIComponent(slug)}.large.jpg` : "";
}
function card(g) {
  const id=String(g.id), img=giftImage(g);
  return `<article class="gift">
    <div class="giftimg">${img?`<img src="${safe(img)}" alt="${safe(g.name)}" loading="lazy" onerror="this.style.display='none'">`:"✦"}</div>
    <div class="giftname">${safe(g.name)}</div><div class="sub">ID: ${safe(g.gift_id || id)} · Givora</div>
    <div class="price">${money(g.price)} ⭐</div>
    <div class="giftbuttons"><button data-fav="${safe(id)}" aria-label="В избранное">${favs.has(id)?"♥":"♡"}</button>
    <button class="buy" data-buy="${safe(id)}">Купить</button></div></article>`;
}
function bindCards(root) {
  root.querySelectorAll("[data-fav]").forEach(b=>b.onclick=()=>{const id=b.dataset.fav;favs.has(id)?favs.delete(id):favs.add(id);localStorage.setItem("givoraFavs",JSON.stringify([...favs]));renderGrid();if(activePage==="favorites")renderFavs();});
  root.querySelectorAll("[data-buy]").forEach(b=>b.onclick=()=>confirmPurchase(b.dataset.buy));
}
function renderGrid() {
  const q=($("search").value||"").toLowerCase();
  const rows=listings.filter(g=>(`${g.name} ${g.gift_id}`).toLowerCase().includes(q));
  $("grid").innerHTML=rows.map(card).join("")||'<div class="empty">Пока нет доступных подарков</div>';
  bindCards($("grid"));
}
function renderFavs() {
  const rows=listings.filter(g=>favs.has(String(g.id)));
  $("favgrid").innerHTML=rows.map(card).join("")||'<div class="empty">Пока нет избранных подарков</div>';
  bindCards($("favgrid"));
}
$("search").oninput=renderGrid;
$("filter").innerHTML='<option value="all">Все подарки</option>';
function openModal(html) { $("modalbody").innerHTML=html; $("modal").classList.add("open"); }
function closeModal() { $("modal").classList.remove("open"); }
$("close").onclick=closeModal;
$("modal").onclick=e=>{if(e.target===$("modal"))closeModal();};
$("addGift1").onclick=$("addGift2").onclick=()=>{
  openModal(`<h2>Предложить подарок</h2>
  <p class="muted">После заявки нужно передать коллекционный подарок на проверку аккаунту <b>@GivoraStore</b>. Размещение появится только после ручной проверки администратором.</p>
  <label>Название подарка</label><input id="reqname" maxlength="100" placeholder="Например, Liberty Figure">
  <label>Ссылка Telegram NFT</label><input id="requrl" placeholder="https://t.me/nft/LibertyFigure-239294">
  <label>Желаемая цена · Givora Stars</label><input id="reqprice" type="number" min="1" step="1" placeholder="1000">
  <button class="primary" id="sendreq">Отправить заявку</button>`);
  $("sendreq").onclick=async()=>{
    try {
      const payload={giftName:$("reqname").value.trim(),giftUrl:$("requrl").value.trim(),price:Number($("reqprice").value)};
      await api("/api/requests",{method:"POST",body:JSON.stringify(payload)});
      closeModal(); await loadHistory(); toast("Заявка отправлена администратору");
    } catch(e){toast(e.message);}
  };
};
async function confirmPurchase(id) {
  const g=listings.find(x=>String(x.id)===String(id)); if(!g)return;
  openModal(`<h2>Кому отправить подарок?</h2><p>${safe(g.name)} · <b>${money(g.price)} ⭐</b></p>
  <label>Telegram username получателя (необязательно)</label><input id="recipientUsername" maxlength="64" placeholder="@username">
  <p class="muted">Оставь поле пустым, чтобы подарок поступил тебе. Получатель должен хотя бы один раз открыть Givora. Физическая передача Telegram-подарка подтверждается администратором отдельно.</p>
  <button class="primary" id="confirmbuy">Купить за ${money(g.price)} ⭐</button>`);
  $("confirmbuy").onclick=async()=>{
    $("confirmbuy").disabled=true;
    try {
      const result=await api(`/api/purchase/${encodeURIComponent(id)}`,{method:"POST",body:JSON.stringify({recipientUsername:$("recipientUsername").value.trim()})});
      closeModal(); toast(`Заказ №${result.orderId} создан`); await refreshAll();
    } catch(e){$("confirmbuy").disabled=false;toast(e.message);}
  };
}
async function loadHistory(){historyData=await api("/api/history");return historyData;}
function renderProfile() {
  const tgUser=tg?.initDataUnsafe?.user||{};
  const first=me?.firstName||tgUser.first_name||"Пользователь";
  const last=me?.lastName||tgUser.last_name||"";
  const username=me?.username||tgUser.username||"";
  const fullName=`${first} ${last}`.trim();
  $("profileName").textContent=fullName;
  $("uname").textContent=username?`@${username}`:"Имя пользователя Telegram";
  $("profileId").textContent=`Telegram ID: ${me?.telegramId||me?.telegram_id||tgUser.id||"—"}`;
  const avatar=$("profileAvatar");
  avatar.textContent=(first[0]||"G").toUpperCase();
  const photo=me?.photoUrl||tgUser.photo_url;
  if(photo){avatar.innerHTML=`<img src="${safe(photo)}" alt="Аватар" referrerpolicy="no-referrer">`;}
  $("profileBalance").innerHTML=`<div class="bal"><small>Givora Stars ⭐</small><b>${money(me?.balance)} ⭐</b></div>`;
  $("balanceRates").innerHTML=`<div class="bal"><small>Доступный баланс</small><b>${money(me?.balance)} ⭐</b></div>`;
  $("starbalance").textContent=money(me?.balance);
  const expiry=me?.moderatorExpiresAt?new Date(me.moderatorExpiresAt).toLocaleDateString("ru-RU"):null;
  $("adminHint").textContent=me?.isAdmin
    ? `Администратор Givora · модераторский статус активен${expiry?` до ${expiry}`:""}`
    : me?.isModerator ? `Модератор Givora · статус до ${expiry||"уточняется"}` : "Ваш профиль на маркетплейсе Givora";
  $("adminEntry").style.display=me?.isAdmin?"block":"none";
}
$("supportLink").onclick=()=>window.open("https://t.me/Givorasupport","_blank");
$("adminEntry").onclick=()=>{if(me?.isAdmin)page("admin");};
function renderOrders() {
  const inv=inventoryData.map(g=>`<div class="panel"><b>${safe(g.gift_name)}</b><p class="muted">Статус подарка: ${safe(g.status)} · Заказ №${safe(g.order_id)}</p><a href="${safe(g.gift_url)}" target="_blank" rel="noopener">Открыть подарок</a></div>`);
  $("inventorylist").innerHTML=inv.join("")||'<div class="empty">Подарков пока нет</div>';
  const req=(historyData.requests||[]).map(r=>`<div class="panel"><b>Заявка: ${safe(r.gift_name)}</b><p class="muted">Цена: ${money(r.price)} ⭐ · Статус: ${safe(r.status)}</p></div>`);
  const ord=(historyData.orders||[]).map(o=>`<div class="panel"><b>Заказ №${safe(o.id)}</b><p class="muted">${money(o.amount)} ⭐ · ${safe(o.status)}</p></div>`);
  const led=(historyData.ledger||[]).map(l=>`<div class="panel"><b>${safe(l.kind)}</b><p class="muted">${Number(l.amount)>0?"+":""}${money(l.amount)} ⭐ · ${safe(l.note||"")}</p></div>`);
  $("orderlist").innerHTML=[...ord,...req,...led].join("")||'<div class="empty">История пока пуста</div>';
}
async function renderAdmin() {
  if(!me?.isAdmin) throw new Error("Доступ только администратору");
  document.querySelectorAll(".tab").forEach(b=>b.classList.toggle("active",b.dataset.tab===adminTab));
  const c=$("admincontent"); c.innerHTML='<div class="empty">Загрузка…</div>';
  if(adminTab==="overview"){
    const [rq,us,od]=await Promise.all([api("/api/admin/requests"),api("/api/admin/users"),api("/api/admin/orders")]);
    c.innerHTML=`<div class="balances"><div class="bal"><small>Заявки</small><b>${rq.requests.length}</b></div><div class="bal"><small>Пользователи</small><b>${us.users.length}</b></div><div class="bal"><small>Заказы</small><b>${od.orders.length}</b></div></div>
      <div class="panel"><h3>Администрирование</h3><button class="wide" id="goRequests">Заявки на размещение</button><button class="wide" id="goListings">Каталог</button><button class="wide" id="goUsers">Пользователи и начисления</button><button class="wide" id="goOrders">Заказы и доставка</button></div>`;
    [["goRequests","requests"],["goListings","listings"],["goUsers","users"],["goOrders","orders"]].forEach(([id,t])=>$(id).onclick=()=>{adminTab=t;renderAdmin().catch(e=>toast(e.message));});
  }
  if(adminTab==="requests"){
    const d=await api("/api/admin/requests");
    c.innerHTML=d.requests.map(r=>`<div class="adminrow"><div><b>${safe(r.gift_name)}</b><small>@${safe(r.username||"user")} · ${money(r.price)} ⭐</small><small><a href="${safe(r.gift_url)}" target="_blank" rel="noopener">Открыть подарок</a> · ${safe(r.status)}</small></div><div>${r.status==="pending"?`<button class="action good" data-approve="${r.id}">Принять</button> <button class="action bad" data-reject="${r.id}">Отклонить</button>`:"Обработано"}</div></div>`).join("")||'<div class="empty">Заявок нет</div>';
    c.querySelectorAll("[data-approve]").forEach(b=>b.onclick=()=>reviewRequest(b.dataset.approve,"approve"));
    c.querySelectorAll("[data-reject]").forEach(b=>b.onclick=()=>reviewRequest(b.dataset.reject,"reject"));
  }
  if(adminTab==="listings"){
    const d=await api("/api/listings");
    c.innerHTML=`<button class="primary" id="admadd">＋ Добавить подарок со склада Givora</button>`+
      d.listings.map(g=>`<div class="adminrow"><div><b>${safe(g.name)}</b><small>${safe(g.gift_id)} · ${money(g.price)} ⭐</small></div><button class="action bad" data-del="${g.id}">Снять</button></div>`).join("");
    $("admadd").onclick=addListing;
    c.querySelectorAll("[data-del]").forEach(b=>b.onclick=async()=>{try{await api(`/api/admin/listings/${b.dataset.del}`,{method:"DELETE"});await renderAdmin();await refreshListings();}catch(e){toast(e.message);}});
  }
  if(adminTab==="users"){
    c.innerHTML=`<div class="panel"><h3>Пользователи</h3><input id="userquery" placeholder="Telegram username или ID"><button class="outline" id="findusers">Найти</button><div id="userresults"></div></div>`;
    $("findusers").onclick=async()=>{try{const d=await api(`/api/admin/users?q=${encodeURIComponent($("userquery").value)}`);$("userresults").innerHTML=d.users.map(u=>`<div class="adminrow"><div><b>${safe(u.username?"@"+u.username:u.first_name)}</b><small>ID: ${safe(u.telegram_id)} · Баланс ${money(u.balance)} ⭐</small></div><button class="action good" data-credit="${safe(u.telegram_id)}">Начислить</button></div>`).join("")||"Пользователей не найдено";$("userresults").querySelectorAll("[data-credit]").forEach(b=>b.onclick=()=>creditUser(b.dataset.credit));}catch(e){toast(e.message);}};
  }
  if(adminTab==="orders"){
    const d=await api("/api/admin/orders");
    c.innerHTML=d.orders.map(o=>`<div class="adminrow"><div><b>Заказ №${safe(o.id)} · ${money(o.amount)} ⭐</b><small>Покупатель: ${safe(o.buyer_username || o.buyer_id)} · Получатель: ${safe(o.recipient_username || o.recipient_id || "не указан")} · Статус: ${safe(o.status)}</small></div><div>${o.status==="pending_delivery"?`<button class="action good" data-delivered="${o.id}">Доставка выполнена</button><button class="action bad" data-refund="${o.id}">Возврат</button>`:safe(o.status)}</div></div>`).join("")||'<div class="empty">Заказов нет</div>';
    c.querySelectorAll("[data-delivered]").forEach(b=>b.onclick=()=>finishOrder(b.dataset.delivered,"delivered"));
    c.querySelectorAll("[data-refund]").forEach(b=>b.onclick=()=>finishOrder(b.dataset.refund,"refund"));
  }
  if(adminTab==="settings"){
    c.innerHTML=`<div class="panel"><h3>Валюта и безопасность</h3><p>Givora Stars — внутренняя валюта сервиса. Это не Telegram Stars, не электронные деньги и не средство вывода. Ручное начисление доступно только администратору.</p><p>Администратор: ${ADMIN_LABEL}</p></div>`;
  }
}
async function reviewRequest(id,decision){try{await api(`/api/admin/requests/${id}/review`,{method:"POST",body:JSON.stringify({decision})});toast("Заявка обработана");await renderAdmin();await refreshListings();}catch(e){toast(e.message);}}
function addListing(){
 openModal(`<h2>Добавить подарок</h2><p class="muted">Добавляй только подарок, фактически полученный на аккаунт GivoraStore и проверенный тобой.</p>
 <label>Название</label><input id="newname" maxlength="100"><label>Ссылка на NFT</label><input id="newurl" placeholder="https://t.me/nft/..."><label>Цена · Givora Stars</label><input id="newprice" type="number" min="1" step="1"><button class="primary" id="createListing">Добавить в каталог</button>`);
 $("createListing").onclick=async()=>{try{await api("/api/admin/listings",{method:"POST",body:JSON.stringify({name:$("newname").value.trim(),giftUrl:$("newurl").value.trim(),price:Number($("newprice").value)})});closeModal();await refreshListings();await renderAdmin();toast("Подарок добавлен");}catch(e){toast(e.message);}};
}
async function creditUser(id){
 openModal(`<h2>Начислить Givora Stars</h2><p>Пользователь ID: ${safe(id)}</p><label>Количество звёзд</label><input id="creditamount" type="number" min="1" step="1"><button class="primary" id="creditconfirm">Начислить</button>`);
 $("creditconfirm").onclick=async()=>{try{await api(`/api/admin/users/${encodeURIComponent(id)}/credit`,{method:"POST",body:JSON.stringify({amount:Number($("creditamount").value)})});closeModal();toast("Баланс начислен");await renderAdmin();}catch(e){toast(e.message);}};
}
async function finishOrder(id,action){
 const msg=action==="delivered"?"Подтверди, что Telegram-подарок действительно отправлен покупателю.":"Подтверди возврат Givora Stars покупателю.";
 if(!confirm(msg))return;
 try{await api(`/api/admin/orders/${id}/${action}`,{method:"POST",body:"{}"});toast("Заказ обновлён");await renderAdmin();}catch(e){toast(e.message);}
}
document.querySelectorAll(".tab").forEach(b=>b.onclick=()=>{adminTab=b.dataset.tab;renderAdmin().catch(e=>toast(e.message));});
async function refreshListings(){const d=await api("/api/listings");listings=d.listings;renderGrid();renderFavs();}
async function refreshAll(){const [m]=await Promise.all([api("/api/me"),refreshListings(),loadHistory()]);me=m.user;const inv=await api("/api/inventory");inventoryData=inv.inventory;renderProfile();if(activePage==="orders")renderOrders();}
async function loadRate(){
 $("rate").textContent="Загрузка курса…";
 let usd=null,usdt=null;
 const jobs=[
  fetch("https://api.coingecko.com/api/v3/simple/price?ids=the-open-network&vs_currencies=usd").then(r=>r.json()).then(d=>usd=Number(d?.["the-open-network"]?.usd)),
  fetch("https://api.binance.com/api/v3/ticker/price?symbol=TONUSDT").then(r=>r.json()).then(d=>usdt=Number(d?.price))
 ];
 await Promise.allSettled(jobs);
 if(!Number.isFinite(usd)||usd<=0)usd=usdt;
 if(!Number.isFinite(usdt)||usdt<=0)usdt=usd;
 rate=Number.isFinite(usd)&&usd>0?usd:null;
 if(rate){$("rate").textContent=`1 TON ≈ $${usd.toFixed(4)} / ${usdt.toFixed(4)} USDT`;$("ratetime").textContent=`Обновлено ${new Date().toLocaleTimeString()}`;$("calcsource").textContent="Ориентировочный рыночный курс TON";calc();}
 else{$("rate").textContent="Курс временно недоступен";$("calcsource").textContent="Попробуй обновить позже";}
}
function calc(){const n=Number($("ton").value);$("usd").textContent=rate!==null&&n>=0?(rate*n).toLocaleString("en-US",{style:"currency",currency:"USD"}):"—";$("usdt").textContent=rate!==null&&n>=0?`${(rate*n).toFixed(2)} USDT`:"—";}
$("refresh").onclick=$("refresh2").onclick=loadRate;$("ton").oninput=calc;
async function boot(){
 if(tg){tg.ready();tg.expand();}
 if(!API_BASE||API_BASE.includes("YOUR-API")){setStatus("API не подключён: настрой адрес серверного API в config.js.",true);return;}
 if(!tg?.initData){setStatus("Для входа открой Givora через Telegram Mini App.",true);return;}
 setStatus("Подключаем аккаунт Telegram…");
 try{await refreshAll();setStatus("Подключено к Givora");}
 catch(e){setStatus(`Не удалось подключиться: ${e.message}`,true);}
 loadRate();
}
boot();
})();