const $=id=>document.getElementById(id);
const seed=[
{name:"Liberty Figure",id:"239294",url:"https://t.me/nft/LibertyFigure-239294",img:"https://nft.fragment.com/gift/libertyfigure-239294.large.jpg",price:850,cur:"TON",demo:true},
{name:"Mirage Lamp",id:"40819",url:"https://t.me/nft/MirageLamp-40819",img:"https://nft.fragment.com/gift/miragelamp-40819.large.jpg",price:1200,cur:"USD",demo:true},
{name:"Swag Bag",id:"108183",url:"https://t.me/nft/SwagBag-108183",img:"https://nft.fragment.com/gift/swagbag-108183.large.jpg",price:42000,cur:"Stars",demo:true},
{name:"Mood Pack",id:"120424",url:"https://t.me/nft/MoodPack-120424",img:"https://nft.fragment.com/gift/moodpack-120424.large.jpg",price:600,cur:"TON",demo:true},
{name:"Mood Pack",id:"120391",url:"https://t.me/nft/MoodPack-120391",img:"https://nft.fragment.com/gift/moodpack-120391.large.jpg",price:30000,cur:"Stars",demo:true},
{name:"Demo Collectible",id:"D-006",url:"#",img:"",price:2500,cur:"USD",demo:true}
];
let gifts=JSON.parse(localStorage.givoraGifts||"null")||seed;
let requests=JSON.parse(localStorage.givoraRequests||"[]"),orders=JSON.parse(localStorage.givoraOrders||"[]");
let favs=new Set(JSON.parse(localStorage.givoraFavs||"[]"));
let balances=JSON.parse(localStorage.givoraBalances||'{"TON":1000,"Stars":50000,"USD":2500,"USDT":500}');
let rate=null,adminTab="overview";
function save(){localStorage.givoraGifts=JSON.stringify(gifts);localStorage.givoraRequests=JSON.stringify(requests);localStorage.givoraOrders=JSON.stringify(orders);localStorage.givoraFavs=JSON.stringify([...favs]);localStorage.givoraBalances=JSON.stringify(balances)}
function toast(s){$("toast").textContent=s;$("toast").classList.add("show");setTimeout(()=>$("toast").classList.remove("show"),2300)}
function page(p){document.querySelectorAll(".view").forEach(v=>v.classList.toggle("active",v.id===p));document.querySelectorAll(".nav").forEach(n=>n.classList.toggle("active",n.dataset.page===p));if(p==="admin")renderAdmin();if(p==="orders")renderOrders();if(p==="favorites")renderFavs();if(p==="profile")renderBalances()}
document.querySelectorAll("[data-page]").forEach(b=>b.addEventListener("click",()=>page(b.dataset.page)));$("toCatalog").onclick=()=>$("search").focus();
const ADMIN_USERNAME="harmonydurov";
let currentUsername="";
function isAdmin(){return currentUsername.replace(/^@/,"").toLowerCase()===ADMIN_USERNAME;}
$("adminEntry").onclick=()=>{if(isAdmin())page("admin");else toast("GOD MODE доступен только @"+ADMIN_USERNAME+" в демо-проверке")};
$("theme").onclick=()=>document.body.classList.toggle("light");
function card(g){let tag=g.demo?'<span class="tag">DEMO · TEST LISTING</span>':'<span class="tag">PENDING REVIEW</span>';return `<article class="gift"><div class="giftimg">${g.img?`<img src="${g.img}" alt="${g.name}" onerror="this.style.display='none';this.parentElement.textContent='Gift preview unavailable'">`:'✦'}</div><div class="giftname">${g.name}</div><div class="sub">ID: ${g.id} · ${tag}</div><div class="price">${Number(g.price).toLocaleString()} ${g.cur}</div><div class="giftbuttons"><button onclick="favorite('${g.id}')">${favs.has(g.id)?'♥':'♡'}</button><button class="buy" onclick="buy('${g.id}')">Купить · DEMO</button></div></article>`}
function renderGrid(){let q=$("search").value.toLowerCase(),f=$("filter").value;let list=gifts.filter(g=>(g.name+" "+g.id).toLowerCase().includes(q)&&(f==="all"||(f==="demo"&&g.demo)||(f==="approved"&&!g.demo)));$("grid").innerHTML=list.map(card).join("")||'<div class="empty">Нет объявлений</div>'}
function favorite(id){favs.has(id)?favs.delete(id):favs.add(id);save();renderGrid();renderFavs()}
function renderFavs(){let list=gifts.filter(g=>favs.has(g.id));$("favgrid").innerHTML=list.map(card).join("")||'<div class="empty">Пока нет избранных подарков</div>'}
$("search").oninput=renderGrid;$("filter").onchange=renderGrid;
function openModal(html){$("modalbody").innerHTML=html;$("modal").classList.add("open")}
$("close").onclick=()=>$("modal").classList.remove("open");$("modal").onclick=e=>{if(e.target===$("modal"))$("modal").classList.remove("open")};
function submitGift(){openModal(`<h2>Добавить подарок</h2><p class="muted">Демо-заявка. Реальная передача не выполняется.</p><div class="warning">Для настоящей приёмки позже подключим бота и серверную проверку. Сейчас не отправляй сюда реальные подарки.</div><label>Твой Telegram username</label><input id="requser" placeholder="@username"><label>Ссылка на подарок</label><input id="requrl" placeholder="https://t.me/nft/..."><label>Название подарка</label><input id="reqname" placeholder="Gift name"><label>Желаемая цена</label><input id="reqprice" type="number" placeholder="0"><label>Валюта</label><select id="reqcur"><option>Stars</option><option>TON</option><option>USD</option></select><button class="primary" id="sendreq">Отправить демо-заявку</button>`);$("sendreq").onclick=()=>{let r={id:Date.now(),user:$("requser").value||"@demo_user",url:$("requrl").value,name:$("reqname").value||"User submitted gift",price:+$("reqprice").value||0,cur:$("reqcur").value,status:"pending",time:new Date().toLocaleString()};requests.unshift(r);save();$("modal").classList.remove("open");toast("Демо-заявка отправлена в локальную админ-панель");}}
$("addGift1").onclick=submitGift;$("addGift2").onclick=submitGift;
function buy(id){let g=gifts.find(x=>x.id===id);openModal(`<h2>Демо-покупка</h2><p>${g.name} · ${g.price} ${g.cur}</p><div class="warning">Это симуляция. Никакие реальные Stars, TON, USD или подарки не списываются и не передаются.</div><button class="primary" id="confirmbuy">Подтвердить демо-покупку</button>`);$("confirmbuy").onclick=()=>{orders.unshift({id:Date.now(),name:g.name,price:g.price,cur:g.cur,status:"demo purchase"});save();$("modal").classList.remove("open");toast("Демо-покупка записана");}}
function renderOrders(){$("orderlist").innerHTML=[...requests.map(r=>`<div class="panel"><b>Заявка: ${r.name}</b><p class="muted">${r.user} · ${r.status} · ${r.time}</p></div>`),...orders.map(o=>`<div class="panel"><b>${o.name}</b><p class="muted">${o.price} ${o.cur} · DEMO PURCHASE</p></div>`)].join("")||'<div class="empty">Заявок и покупок пока нет</div>'}
function renderBalances(){let keys=["TON","Stars","USD","USDT"];let h=keys.map(k=>`<div class="bal"><small>${k} · DEMO</small><b>${Number(balances[k]||0).toLocaleString()}</b></div>`).join("");$("profileBalance").innerHTML=h;$("balanceRates").innerHTML=h}
function adminContent(){let c=$("admincontent");if(adminTab==="overview"){c.innerHTML=`<div class="balances"><div class="bal"><small>Объявления</small><b>${gifts.length}</b></div><div class="bal"><small>Заявки</small><b>${requests.length}</b></div><div class="bal"><small>Ожидают</small><b>${requests.filter(r=>r.status==="pending").length}</b></div></div><div class="panel"><h3>Быстрые действия</h3><button class="wide" id="admadd">＋ Создать DEMO-объявление</button><button class="wide" id="clearDemo">Удалить все DEMO-объявления</button><button class="wide" id="export">Экспортировать локальные данные</button></div>`; $("admadd").onclick=addListing;$("clearDemo").onclick=()=>{if(confirm("Удалить все DEMO-объявления?")){gifts=gifts.filter(g=>!g.demo);save();renderAdmin();renderGrid();toast("DEMO-объявления удалены")}};$("export").onclick=()=>{let blob=new Blob([JSON.stringify({gifts,requests,orders,balances},null,2)],{type:"application/json"}),a=document.createElement("a");a.href=URL.createObjectURL(blob);a.download="givora-demo-export.json";a.click()}}
if(adminTab==="listings"){c.innerHTML=`<button class="primary" id="admadd">＋ Добавить объявление</button>`+gifts.map(g=>`<div class="adminrow"><div><b>${g.name}</b><small>ID ${g.id} · ${g.price} ${g.cur} · ${g.demo?'DEMO':'REVIEWED'}</small></div><button class="action bad" data-del="${g.id}">Удалить</button></div>`).join("");$("admadd").onclick=addListing;c.querySelectorAll("[data-del]").forEach(b=>b.onclick=()=>{gifts=gifts.filter(g=>g.id!==b.dataset.del);save();renderAdmin();renderGrid()})}
if(adminTab==="requests"){c.innerHTML=requests.map(r=>`<div class="adminrow"><div><b>${r.name}</b><small>${r.user} · ${r.price} ${r.cur} · ${r.status}</small><small>${r.url||"Ссылка не указана"}</small></div><div>${r.status==="pending"?`<button class="action good" data-approve="${r.id}">Принять</button> <button class="action bad" data-reject="${r.id}">Отклонить</button>`:"Обработано"}</div></div>`).join("")||'<div class="empty">Заявок нет</div>';c.querySelectorAll("[data-approve]").forEach(b=>b.onclick=()=>{let r=requests.find(x=>x.id==b.dataset.approve);r.status="approved demo";gifts.unshift({name:r.name,id:"REQ-"+r.id,url:r.url,img:"",price:r.price,cur:r.cur,demo:true});save();renderAdmin();toast("Демо-заявка принята. Это не проверка реального поступления.")});c.querySelectorAll("[data-reject]").forEach(b=>b.onclick=()=>{requests.find(x=>x.id==b.dataset.reject).status="rejected";save();renderAdmin()})}
if(adminTab==="users"){c.innerHTML=`<div class="panel"><h3>Демо-пользователь</h3><p class="muted">@demo_user · локальная сессия</p>${["TON","Stars","USD","USDT"].map(k=>`<label>${k} demo balance</label><input type="number" id="bal_${k}" value="${balances[k]||0}">`).join("")}<button class="primary" id="saveBalances">Сохранить тестовые балансы</button></div>`;$("saveBalances").onclick=()=>{["TON","Stars","USD","USDT"].forEach(k=>balances[k]=Number($("bal_"+k).value)||0);save();renderBalances();toast("Тестовые балансы изменены")}}
if(adminTab==="settings"){c.innerHTML=`<div class="panel"><h3>Настройки DEMO</h3><p class="muted">Сейчас сайт работает без серверной авторизации. GOD MODE открыт только как локальная демонстрация и не защищён от других посетителей.</p><button class="wide" id="reset">Сбросить все локальные данные к демо-старту</button><button class="wide" id="backup">Экспорт резервной копии</button></div>`;$("reset").onclick=()=>{if(confirm("Сбросить все локальные изменения?")){localStorage.clear();location.reload()}};$("backup").onclick=()=>{let blob=new Blob([JSON.stringify({gifts,requests,orders,balances},null,2)],{type:"application/json"}),a=document.createElement("a");a.href=URL.createObjectURL(blob);a.download="givora-backup.json";a.click()}}
}
function renderAdmin(){document.querySelectorAll(".tab").forEach(b=>b.classList.toggle("active",b.dataset.tab===adminTab));adminContent()}
document.querySelectorAll(".tab").forEach(b=>b.onclick=()=>{adminTab=b.dataset.tab;renderAdmin()});
function addListing(){openModal(`<h2>Новое DEMO-объявление</h2><label>Название</label><input id="newname"><label>Gift ID</label><input id="newid"><label>Изображение URL (необязательно)</label><input id="newimg"><label>Цена</label><input id="newprice" type="number" value="1000"><label>Валюта</label><select id="newcur"><option>Stars</option><option>TON</option><option>USD</option></select><button class="primary" id="createListing">Создать DEMO-объявление</button>`);$("createListing").onclick=()=>{gifts.unshift({name:$("newname").value||"Demo gift",id:$("newid").value||"D-"+Date.now(),img:$("newimg").value,price:+$("newprice").value||0,cur:$("newcur").value,demo:true});save();$("modal").classList.remove("open");renderGrid();renderAdmin();toast("DEMO-объявление добавлено")}}
async function loadRate(){
 $("rate").textContent="Загрузка курса…";
 $("ratetime").textContent="Источники: CoinGecko (TON/USD), Binance (TON/USDT)";
 let usdRate=null,usdtRate=null,used=[];
 const jobs=[
  fetch("https://api.coingecko.com/api/v3/simple/price?ids=the-open-network&vs_currencies=usd").then(async r=>{if(!r.ok)throw Error("CoinGecko HTTP "+r.status);let d=await r.json();let v=Number(d?.["the-open-network"]?.usd);if(!Number.isFinite(v)||v<=0)throw Error("No TON/USD");usdRate=v;used.push("CoinGecko");}),
  fetch("https://api.binance.com/api/v3/ticker/price?symbol=TONUSDT").then(async r=>{if(!r.ok)throw Error("Binance HTTP "+r.status);let d=await r.json();let v=Number(d?.price);if(!Number.isFinite(v)||v<=0)throw Error("No TON/USDT");usdtRate=v;used.push("Binance");})
 ];
 await Promise.allSettled(jobs);
 if(usdRate===null && usdtRate!==null)usdRate=usdtRate;
 if(usdtRate===null && usdRate!==null)usdtRate=usdRate;
 rate=usdRate;
 if(rate!==null){
  $("rate").textContent="1 TON ≈ $"+usdRate.toLocaleString(undefined,{maximumFractionDigits:4})+" / "+usdtRate.toLocaleString(undefined,{maximumFractionDigits:4})+" USDT";
  $("ratetime").textContent="Обновлено: "+new Date().toLocaleTimeString()+" · Источник: "+(used.join(" + ")||"резервный расчёт");
  $("calcsource").textContent="Источники: "+used.join(" + ")+" · USDT и USD могут немного отличаться";
  calc();
 }else{
  $("rate").textContent="Курс временно недоступен";
  $("ratetime").textContent="Оба источника не ответили. Проверь интернет и нажми «Обновить курс».";
  $("calcsource").textContent="Расчёт появится после загрузки курса.";
  $("usd").textContent="—";$("usdt").textContent="—";
 }
}
function calc(){
 let n=Number($("ton").value);
 if(rate!==null&&Number.isFinite(n)&&n>=0){
  $("usd").textContent=(rate*n).toLocaleString(undefined,{style:"currency",currency:"USD",maximumFractionDigits:2});
  $("usdt").textContent=(rate*n).toLocaleString(undefined,{maximumFractionDigits:2})+" USDT";
 }else{$("usd").textContent="—";$("usdt").textContent="—"}
}
$("refresh").onclick=loadRate;$("refresh2").onclick=loadRate;$("ton").oninput=calc;
renderGrid();renderBalances();loadRate();
const tg=window.Telegram?.WebApp;
if(tg){tg.ready();tg.expand();}
if(tg?.initDataUnsafe?.user){
 let u=tg.initDataUnsafe.user; currentUsername=u.username||"";
 $("uname").textContent="@"+(u.username||u.first_name||"telegram_user");
}else{
 // Preview fallback: shows the requested admin account in this DEMO build only.
 currentUsername=ADMIN_USERNAME;
 $("uname").textContent="@"+ADMIN_USERNAME+" · DEMO";
}
$("starbalance").textContent=Number(balances.Stars||0).toLocaleString();

