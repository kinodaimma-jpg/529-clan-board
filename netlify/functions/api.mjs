import crypto from "node:crypto";

const env = process.env;
const base = () => {
  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) throw new Error("서버 환경변수가 설정되지 않았습니다.");
  return env.SUPABASE_URL.replace(/\/$/, "") + "/rest/v1";
};
const headers = () => ({ apikey: env.SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`, "Content-Type": "application/json" });
const db = async (path, options={}) => {
  const r = await fetch(base()+path, { ...options, headers: { ...headers(), ...(options.headers||{}) } });
  const t = await r.text(); let data; try { data=t?JSON.parse(t):null } catch { data=t }
  if (!r.ok) { const msg = data?.message || data?.hint || "데이터베이스 요청에 실패했습니다."; throw new Error(msg); }
  return data;
};
const json = (statusCode, body) => ({ statusCode, headers: { "Content-Type":"application/json", "Cache-Control":"no-store" }, body: JSON.stringify(body) });
const parse = e => { try{return JSON.parse(e.body||"{}")}catch{return {}} };
const sign = payload => {
  const b=Buffer.from(JSON.stringify(payload)).toString("base64url");
  const sig=crypto.createHmac("sha256",env.SESSION_SECRET).update(b).digest("base64url");
  return b+"."+sig;
};
const verify = e => {
  const t=(e.headers?.authorization||e.headers?.Authorization||"").replace(/^Bearer\s+/i,"");
  const [b,s]=t.split("."); if(!b||!s) return false;
  const expected=crypto.createHmac("sha256",env.SESSION_SECRET).update(b).digest();
  let got; try{got=Buffer.from(s,"base64url")}catch{return false}
  if(got.length!==expected.length||!crypto.timingSafeEqual(got,expected))return false;
  try{const p=JSON.parse(Buffer.from(b,"base64url").toString());return p.exp>Date.now()?p:null}catch{return null}
};
const hashPw = async pw => { const salt=crypto.randomBytes(16).toString("hex"); const key=await new Promise((res,rej)=>crypto.scrypt(pw,salt,64,(e,k)=>e?rej(e):res(k))); return salt+":"+key.toString("hex"); };
const checkPw = async (pw, stored) => { try{const [salt,h]=stored.split(":");const key=await new Promise((res,rej)=>crypto.scrypt(pw,salt,64,(e,k)=>e?rej(e):res(k)));const old=Buffer.from(h,"hex");return old.length===key.length&&crypto.timingSafeEqual(old,key)}catch{return false} };
const one = async path => { const x=await db(path); return Array.isArray(x)?x[0]:x; };
const postSelect = "id,author,title,body,category,views,created_at,comments(id,author,body,created_at),likes(id,voter_id)";
const ACTIONS=["노래하는","춤추는","웃는","달리는","졸린","신나는","수줍은","장난치는","산책하는","먹보인","용감한","엉뚱한"];
const COLORS=["빨간","주황","노란","초록","파란","남색","보라","분홍","민트","하늘색","검은","하얀"];
const ANIMALS=["강아지","고양이","호랑이","토끼","곰","여우","판다","수달","쿼카","펭귄","햄스터","다람쥐"];
const koreaDateKey = () => {
 const parts=new Intl.DateTimeFormat("en-CA",{timeZone:"Asia/Seoul",year:"numeric",month:"2-digit",day:"2-digit"}).formatToParts(new Date());
 const values=Object.fromEntries(parts.map(part=>[part.type,part.value]));
 return values.year+"-"+values.month+"-"+values.day;
};
const anonymousName = voter => {
 const dailyKey=String(voter||"anonymous")+"|"+koreaDateKey();
 const digest=crypto.createHash("sha256").update(dailyKey).digest();
 return ACTIONS[digest[0]%ACTIONS.length]+" "+COLORS[digest[1]%COLORS.length]+" "+ANIMALS[digest[2]%ANIMALS.length];
};
const isPrivatePost = p => (p?.category||"free")==="report";

const getPost = async id => {
 const p=await one(`/posts?select=${encodeURIComponent(postSelect)}&id=eq.${encodeURIComponent(id)}&limit=1`);
 if(!p)return null;
 return p;
};
const shapePost = (p, voter) => ({...p, liked_by_me: !!voter && (p.likes||[]).some(l=>l.voter_id===voter), likes:(p.likes||[]).map(l=>({id:l.id}))});
export const handler = async (event, runtimeEnv = process.env) => {
 const env = runtimeEnv;
 try {
  const path=(event.path||"").replace(/^\/.netlify\/functions\/api/,"").replace(/^\/api/,"")||"/";
  const method=event.httpMethod;
  const body=parse(event);
  if(path==="/gate"&&method==="POST"){
   if(!env.CLAN_PASSWORD||!env.SESSION_SECRET) return json(500,{error:"관리자가 서버 환경변수를 먼저 설정해야 합니다."});
   if(typeof body.password!=="string"||body.password!==env.CLAN_PASSWORD)return json(401,{error:"클랜 비밀번호가 올바르지 않습니다."});
   return json(200,{token:sign({role:"clan",exp:Date.now()+7*24*60*60*1000})});
  }
  if(path==="/admin/gate"&&method==="POST"){
   if(!env.ADMIN_PASSWORD||!env.SESSION_SECRET)return json(500,{error:"관리자 비밀번호 환경변수 ADMIN_PASSWORD를 설정해 주세요."});
   if(typeof body.password!=="string"||body.password!==env.ADMIN_PASSWORD)return json(401,{error:"관리자 비밀번호가 올바르지 않습니다."});
   return json(200,{token:sign({role:"admin",exp:Date.now()+12*60*60*1000})});
  }
  const session=verify(event);
  if(!session)return json(401,{error:"인증이 만료됐습니다. 클랜 비밀번호를 다시 입력해 주세요."});
  const isAdmin=session.role==="admin";
  if(path==="/banner"&&method==="GET"){
   const row=await one("/app_settings?select=value&key=eq.banner&limit=1");
   return json(200,row?.value||{});
  }
  if(path==="/banner"&&method==="PUT"){
   if(!isAdmin)return json(403,{error:"배너 편집은 관리자만 할 수 있습니다."});
   const value={eyebrow:String(body.eyebrow||"").slice(0,40),title:String(body.title||"").slice(0,100),desc:String(body.desc||"").slice(0,100),image:typeof body.image==="string"?body.image:""};
   if(value.image.length>4_500_000)return json(413,{error:"배너 이미지가 너무 큽니다. 더 작은 이미지로 다시 시도해 주세요."});
   await db("/app_settings?on_conflict=key",{method:"POST",headers:{"Prefer":"resolution=merge-duplicates,return=minimal"},body:JSON.stringify({key:"banner",value,updated_at:new Date().toISOString()})});
   return json(200,{ok:true});
  }
  if(path==="/categories"&&method==="GET"){
   const row=await one("/app_settings?select=value&key=eq.categories&limit=1");
   const defaults=[{key:"free",label:"자유"},{key:"suggestion",label:"건의사항"},{key:"report",label:"비매너"},{key:"notice",label:"공지사항"}];
   return json(200,Array.isArray(row?.value?.items)?row.value:{items:defaults});
  }
  if(path==="/categories"&&method==="PUT"){
   if(!isAdmin)return json(403,{error:"카테고리 변경은 관리자만 할 수 있습니다."});
   const allowed=["free","suggestion","report","notice"];
   if(!Array.isArray(body.items)||body.items.length!==4||body.items.some(x=>!allowed.includes(x.key)||typeof x.label!=="string"||!x.label.trim()||x.label.trim().length>20)||new Set(body.items.map(x=>x.key)).size!==4||new Set(body.items.map(x=>x.label.trim())).size!==4)return json(400,{error:"카테고리 4개의 이름을 서로 다르게 입력해 주세요."});
   const value={items:body.items.map(x=>({key:x.key,label:x.label.trim()}))};
   await db("/app_settings?on_conflict=key",{method:"POST",headers:{"Prefer":"resolution=merge-duplicates,return=minimal"},body:JSON.stringify({key:"categories",value,updated_at:new Date().toISOString()})});
   return json(200,value);
  }
  if(path==="/posts"&&method==="GET"){
   const rows=await db(`/posts?select=${encodeURIComponent(postSelect)}&order=created_at.desc&limit=200`);
   const voter=(event.headers?.["x-voter-id"]||event.headers?.["X-Voter-Id"]||"");
   return json(200,rows.filter(p=>isAdmin||!isPrivatePost(p)).map(p=>shapePost(p,voter)));
  }
  if(path==="/posts"&&method==="POST"){
   const {title,body:content,password,author,category}=body;
   if(!title?.trim()||!content?.trim()||!password||password.length<4)return json(400,{error:"제목, 내용과 4자 이상 비밀번호를 입력해 주세요."});
   const allowedCategories=["free","suggestion","report","notice"];
   if(!allowedCategories.includes(category))return json(400,{error:"게시글 카테고리를 선택해 주세요."});
   const voter=(event.headers?.["x-voter-id"]||event.headers?.["X-Voter-Id"]||"");
   if(!/^[0-9a-f-]{36}$/i.test(voter))return json(400,{error:"작성자 정보를 확인할 수 없습니다. 새로고침 후 다시 시도해 주세요."});
   const password_hash=await hashPw(password);
   const slot=await db("/rpc/claim_post_slot",{method:"POST",body:JSON.stringify({p_voter_id:voter})});
   if(slot!==true)return json(429,{error:"게시글은 1분에 한 번만 작성할 수 있어요. 잠시 후 다시 시도해 주세요."});
   const rows=await db("/posts",{method:"POST",headers:{"Prefer":"return=representation"},body:JSON.stringify({author:isAdmin?"관리자":anonymousName(voter),title:title.trim().slice(0,80),body:content.trim().slice(0,3000),category,password_hash})});
   return json(201,{id:rows[0].id});
  }
  const m=path.match(/^\/posts\/([0-9a-f-]+)(?:\/(comments|like|view))?$/i);
  if(m){
   const id=m[1],action=m[2];
   if(action==="comments"&&method==="POST"){
    const target=await getPost(id);if(!target)return json(404,{error:"게시글을 찾을 수 없습니다."});
    if(!isAdmin&&isPrivatePost(target))return json(403,{error:"비매너 게시판은 관리자만 이용할 수 있습니다."});
    if(!body.body?.trim())return json(400,{error:"댓글 내용을 입력해 주세요."});
    const voter=(event.headers?.["x-voter-id"]||event.headers?.["X-Voter-Id"]||"");
    if(!isAdmin&&!/^[0-9a-f-]{36}$/i.test(voter))return json(400,{error:"작성자 정보를 확인할 수 없습니다."});
    await db("/comments",{method:"POST",body:JSON.stringify({post_id:id,author:isAdmin?"관리자":anonymousName(voter),body:body.body.trim().slice(0,500)})});
    return json(201,{ok:true});
   }
   if(action==="like"&&method==="POST"){
    const target=await getPost(id);if(!target)return json(404,{error:"게시글을 찾을 수 없습니다."});
    if(!isAdmin&&isPrivatePost(target))return json(403,{error:"비매너 게시판은 관리자만 이용할 수 있습니다."});
    if(!/^[0-9a-f-]{36}$/i.test(body.voter_id||""))return json(400,{error:"추천 정보를 확인할 수 없습니다."});
    const r=await fetch(base()+`/likes?on_conflict=post_id,voter_id`,{method:"POST",headers:{...headers(),"Prefer":"resolution=ignore-duplicates,return=minimal"},body:JSON.stringify({post_id:id,voter_id:body.voter_id})});
    if(!r.ok)throw new Error("추천 처리에 실패했습니다.");
    return json(200,{ok:true});
   }
   if(action==="view"&&method==="POST"){
    const target=await getPost(id);if(!target)return json(404,{error:"게시글을 찾을 수 없습니다."});
    if(!isAdmin&&isPrivatePost(target))return json(403,{error:"비매너 게시판은 관리자만 이용할 수 있습니다."});
    await db("/rpc/increment_post_views",{method:"POST",body:JSON.stringify({post_uuid:id})});
    return json(200,{ok:true});
   }
   if(!action&&method==="GET"){
    const p=await getPost(id);if(!p||(!isAdmin&&isPrivatePost(p)))return json(404,{error:"게시글을 찾을 수 없습니다."});const voter=(event.headers?.["x-voter-id"]||event.headers?.["X-Voter-Id"]||"");return json(200,shapePost(p,voter));
   }
   if(!action&&(method==="PATCH"||method==="DELETE")){
    const rows=await db(`/posts?select=id,password_hash&id=eq.${encodeURIComponent(id)}&limit=1`);
    if(!rows.length)return json(404,{error:"게시글을 찾을 수 없습니다."});
    if(!isAdmin){const target=await one(`/posts?select=category&id=eq.${encodeURIComponent(id)}&limit=1`);if(isPrivatePost(target))return json(403,{error:"비매너 게시판은 관리자만 관리할 수 있습니다."});}
    if(!isAdmin&&!await checkPw(body.password||"",rows[0].password_hash))return json(403,{error:"게시글 비밀번호가 일치하지 않습니다."});
    if(method==="DELETE"){await db(`/posts?id=eq.${encodeURIComponent(id)}`,{method:"DELETE"});return json(200,{ok:true})}
    if(!body.title?.trim()||!body.body?.trim())return json(400,{error:"제목과 내용을 입력해 주세요."});
    const allowedCategories=["free","suggestion","report","notice"];
    if(!allowedCategories.includes(body.category))return json(400,{error:"게시글 카테고리를 선택해 주세요."});
    await db(`/posts?id=eq.${encodeURIComponent(id)}`,{method:"PATCH",body:JSON.stringify({title:body.title.trim().slice(0,80),body:body.body.trim().slice(0,3000),category:body.category})});
    return json(200,{ok:true});
   }
  }
  const adminComment=path.match(/^\/comments\/([0-9a-f-]+)$/i);
  if(adminComment&&method==="DELETE"){
   if(!isAdmin)return json(403,{error:"관리자 권한이 필요합니다."});
   await db(`/comments?id=eq.${encodeURIComponent(adminComment[1])}`,{method:"DELETE"});
   return json(200,{ok:true});
  }
  if(path==="/admin/check"&&method==="GET")return json(200,{admin:isAdmin});
  return json(404,{error:"요청한 주소를 찾을 수 없습니다."});
 } catch(err) {
  console.error(err);
  return json(500,{error:err.message||"서버 오류가 발생했습니다."});
 }
};