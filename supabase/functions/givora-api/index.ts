
import { createClient } from "npm:@supabase/supabase-js@2";
const cors={"Access-Control-Allow-Origin":"*","Access-Control-Allow-Headers":"authorization, apikey, content-type","Access-Control-Allow-Methods":"POST, OPTIONS"};
const reply=(data:any,status=200)=>new Response(JSON.stringify(data),{status,headers:{...cors,"Content-Type":"application/json"}});
async function verify(initData:string,token:string){
 const q=new URLSearchParams(initData), hash=q.get("hash"); if(!hash) throw new Error("Telegram initData отсутствует");
 q.delete("hash"); const check=[...q.entries()].sort(([a],[b])=>a.localeCompare(b)).map(([k,v])=>`${k}=${v}`).join("\n");
 const enc=new TextEncoder(), secret=await crypto.subtle.importKey("raw",enc.encode("WebAppData"),{name:"HMAC",hash:"SHA-256"},false,["sign"]);
 const sk=await crypto.subtle.sign("HMAC",secret,enc.encode(token));
 const key=await crypto.subtle.importKey("raw",sk,{name:"HMAC",hash:"SHA-256"},false,["sign"]);
 const sig=new Uint8Array(await crypto.subtle.sign("HMAC",key,enc.encode(check)));
 const hex=[...sig].map(x=>x.toString(16).padStart(2,"0")).join("");
 if(hex!==hash) throw new Error("Не удалось проверить подпись Telegram");
 const auth=Number(q.get("auth_date")); if(!auth||Date.now()/1000-auth>86400) throw new Error("Сессия Telegram устарела");
 const u=JSON.parse(q.get("user")||"{}"); if(!u.id) throw new Error("Telegram user не найден"); return u;
}
Deno.serve(async(req)=>{
 if(req.method==="OPTIONS") return new Response("ok",{headers:cors});
 try{
  const body=await req.json(), env=Deno.env;
  const token=env.get("BOT_TOKEN")||"", owner=env.get("OWNER_TELEGRAM_ID")||"5304264780";
  if(!token) throw new Error("На сервере не задан BOT_TOKEN");
  const tg=await verify(String(body.initData||""),token);
  const db=createClient(env.get("SUPABASE_URL")!,env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const profile={telegram_id:tg.id,username:tg.username||null,first_name:tg.first_name||null,last_name:tg.last_name||null,photo_url:tg.photo_url||null,role:String(tg.id)===owner?"owner":"user",updated_at:new Date().toISOString()};
  const {error:pe}=await db.from("profiles").upsert(profile,{onConflict:"telegram_id"}); if(pe) throw pe;
  await db.from("wallets").upsert({telegram_id:tg.id},{onConflict:"telegram_id",ignoreDuplicates:true});
  const rawPath=String(body.path||"/"), path=rawPath.split("?")[0], method=String(body.method||"GET").toUpperCase(), data=body.body||{};
  const isAdmin=String(tg.id)===owner;
  const admin=()=>{if(!isAdmin) throw new Error("Доступ только владельцу Givora");};
  const one=async(table:string,cols="*")=>{const {data:d,error}=await db.from(table).select(cols);if(error)throw error;return d||[];};
  if(path==="/api/me"){const {data:w}=await db.from("wallets").select("balance").eq("telegram_id",tg.id).single();return reply({user:{...profile,balance:w?.balance||0,telegramId:tg.id,isAdmin}});}
  if(path==="/api/listings"){const {data:d,error}=await db.from("gifts").select("*").eq("active",true).order("created_at",{ascending:false});if(error)throw error;return reply({listings:d||[]});}
  if(path==="/api/requests"&&method==="POST"){
   const {data:d,error}=await db.from("gift_requests").insert({telegram_id:tg.id,username:tg.username||null,gift_name:"Подарок на проверке",gift_url:null,price:1}).select("id").single();if(error)throw error;
   const chat=env.get("ADMIN_CHAT_ID")||owner;
   await fetch(`https://api.telegram.org/bot${token}/sendMessage`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({chat_id:chat,text:`Новая заявка Givora от ${tg.username?"@"+tg.username:tg.id}. Проверь получение подарка на @GivoraStore. ID: ${d.id}`})}).catch(()=>{});
   return reply({ok:true,requestId:d.id});
  }
  if(path==="/api/history"){const [orders,requests,ledger]=await Promise.all([
   db.from("orders").select("*").eq("buyer_telegram_id",tg.id).order("created_at",{ascending:false}),
   db.from("gift_requests").select("*").eq("telegram_id",tg.id).order("created_at",{ascending:false}),
   db.from("ledger").select("*").eq("telegram_id",tg.id).order("created_at",{ascending:false})]);
   for(const x of [orders,requests,ledger])if(x.error)throw x.error;
   return reply({orders:orders.data||[],requests:requests.data||[],ledger:ledger.data||[]});}
  if(path==="/api/inventory"){const {data:d,error}=await db.from("inventory").select("*").eq("telegram_id",tg.id).order("created_at",{ascending:false});if(error)throw error;return reply({inventory:d||[]});}
  if(path==="/api/promo/redeem"&&method==="POST"){
   const {data:bonus,error}=await db.rpc("givora_redeem_promo",{p_user:tg.id,p_code:String(data.code||"")});if(error)throw error;return reply({ok:true,bonus});
  }
  if(path.startsWith("/api/purchase/")&&method==="POST"){
   const giftId=decodeURIComponent(path.split("/").pop()||"");
   const {data:orderId,error}=await db.rpc("givora_purchase",{p_user:tg.id,p_gift:giftId,p_recipient:String(data.recipientUsername||"").replace(/^@/,"")||null});
   if(error)throw error;return reply({ok:true,orderId});
  }
  if(path.startsWith("/api/admin/")){
   admin();
   if(path==="/api/admin/promos"&&method==="POST"){
    const code=String(data.code||"").trim().toUpperCase(),bonus=Math.floor(Number(data.bonus)),usageLimit=Math.floor(Number(data.usageLimit));
    if(!/^[A-Z0-9_-]{4,40}$/.test(code)||!Number.isSafeInteger(bonus)||bonus<=0||!Number.isSafeInteger(usageLimit)||usageLimit<=0)throw new Error("Проверь код, бонус и лимит");
    const {data:d,error}=await db.from("promos").insert({code,bonus,usage_limit:usageLimit,expires_at:data.expiresAt||null}).select("code,bonus,usage_limit,expires_at").single();if(error)throw error;return reply({promo:d});
   }
   if(path==="/api/admin/requests"){const {data:d,error}=await db.from("gift_requests").select("*").order("created_at",{ascending:false});if(error)throw error;return reply({requests:d||[]});}
   if(path==="/api/admin/users"){const q=new URLSearchParams(rawPath.split("?")[1]||"").get("q")||"";let query=db.from("profiles").select("telegram_id,username,first_name,role,wallets(balance)").limit(50);if(q)query=query.or(`username.ilike.%${q.replace(/[^\w]/g,"")}%,telegram_id.eq.${/^\d+$/.test(q)?q:"0"}`);const {data:d,error}=await query;if(error)throw error;return reply({users:(d||[]).map((u:any)=>({...u,balance:u.wallets?.balance||0}))});}
   if(path==="/api/admin/orders"){const {data:d,error}=await db.from("orders").select("*").order("created_at",{ascending:false});if(error)throw error;return reply({orders:d||[]});}
   if(path==="/api/admin/listings"&&method==="POST"){const {data:d,error}=await db.from("gifts").insert({name:data.name,gift_url:data.giftUrl,price:Number(data.price),seller_telegram_id:r.telegram_id,active:true}).select().single();if(error)throw error;return reply({listing:d});}
   const del=path.match(/^\/api\/admin\/listings\/([^/]+)$/);if(del&&method==="DELETE"){const {error}=await db.from("gifts").update({active:false}).eq("id",del[1]);if(error)throw error;return reply({ok:true});}
   const review=path.match(/^\/api\/admin\/requests\/([^/]+)\/review$/);if(review&&method==="POST"){
    const {data:r,error:re}=await db.from("gift_requests").select("*").eq("id",review[1]).single();if(re)throw re;
    if(r.status!=="pending")throw new Error("Заявка уже обработана");
    if(data.decision==="approve"){if(!data.name||!data.giftUrl||!Number(data.price))throw new Error("Для публикации заполни карточку проверенного подарка");const {error}=await db.from("gifts").insert({name:data.name,gift_url:data.giftUrl,price:Number(data.price),seller_telegram_id:r.telegram_id,active:true});if(error)throw error;}
    const {error}=await db.from("gift_requests").update({status:data.decision==="approve"?"approved":"rejected",reviewed_at:new Date().toISOString()}).eq("id",review[1]);if(error)throw error;return reply({ok:true});
   }
   const credit=path.match(/^\/api\/admin\/users\/(\d+)\/credit$/);if(credit&&method==="POST"){const amount=Math.floor(Number(data.amount));if(!Number.isSafeInteger(amount)||amount<=0||amount>1000000)throw new Error("Некорректная сумма");const id=Number(credit[1]);const {data:w,error}=await db.from("wallets").select("balance").eq("telegram_id",id).single();if(error)throw error;const {error:ue}=await db.from("wallets").update({balance:w.balance+amount}).eq("telegram_id",id);if(ue)throw ue;await db.from("ledger").insert({telegram_id:id,amount,kind:"admin_credit",reference:crypto.randomUUID(),note:"Ручное начисление владельцем"});return reply({ok:true});}
   const order=path.match(/^\/api\/admin\/orders\/([^/]+)\/(delivered|refund)$/);if(order&&method==="POST"){
    const {data:o,error}=await db.from("orders").select("*").eq("id",order[1]).single();if(error)throw error;if(o.status!=="pending_delivery")throw new Error("Заказ уже обработан");
    if(order[2]==="refund"){const {data:w}=await db.from("wallets").select("balance").eq("telegram_id",o.buyer_telegram_id).single();await db.from("wallets").update({balance:Number(w.balance)+o.amount}).eq("telegram_id",o.buyer_telegram_id);await db.from("ledger").insert({telegram_id:o.buyer_telegram_id,amount:o.amount,kind:"refund",reference:`refund:${o.id}`,note:"Возврат по заказу"});}
    else {const {data:g}=await db.from("gifts").select("name,gift_url,seller_telegram_id").eq("id",o.gift_id).single();await db.from("inventory").insert({telegram_id:o.buyer_telegram_id,gift_id:o.gift_id,gift_name:g?.name||"Telegram Gift",gift_url:g?.gift_url,order_id:o.id,status:"delivered"});if(g?.seller_telegram_id){const {data:sw}=await db.from("wallets").select("balance").eq("telegram_id",g.seller_telegram_id).single();await db.from("wallets").update({balance:Number(sw?.balance||0)+Number(o.amount),updated_at:new Date().toISOString()}).eq("telegram_id",g.seller_telegram_id);await db.from("ledger").insert({telegram_id:g.seller_telegram_id,amount:o.amount,kind:"sale",reference:`sale:${o.id}`,note:"Продажа подарка после подтверждения доставки"});}}
    await db.from("orders").update({status:order[2],completed_at:new Date().toISOString()}).eq("id",o.id);return reply({ok:true});
   }
  }
  throw new Error("Неизвестный API endpoint");
 }catch(e){return reply({error:String(e?.message||e),message:String(e?.message||e)},400);}
});
