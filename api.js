"use strict";
const API_KEY = "AIzaSyDNTqyhfJb7G9kRjVPG0HIkI02CZvLCdhY";
const PROJECT_ID = "learner-support-portal-427a9";
const AUTH_URL = "https://identitytoolkit.googleapis.com/v1";
const FIRESTORE_URL = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents`;

function saveSession(s){ localStorage.setItem("fb_session", JSON.stringify(s)); }
export function getSession(){ try{ return JSON.parse(localStorage.getItem("fb_session")); }catch{ return null; } }
export function signOut(){ localStorage.removeItem("fb_session"); }

export async function signIn(email, password){
  const res = await fetch(`${AUTH_URL}/accounts:signInWithPassword?key=${API_KEY}`,{
    method:"POST", headers:{"Content-Type":"application/json"},
    body: JSON.stringify({email, password, returnSecureToken:true})
  });
  const data = await res.json();
  if(!res.ok) throw new Error(data.error?.message || "Login failed - "+JSON.stringify(data));
  saveSession(data); return data;
}
export async function signUp(email, password){
  const res = await fetch(`${AUTH_URL}/accounts:signUp?key=${API_KEY}`,{
    method:"POST", headers:{"Content-Type":"application/json"},
    body: JSON.stringify({email, password, returnSecureToken:true})
  });
  const data = await res.json();
  if(!res.ok) throw new Error(data.error?.message || "Signup failed");
  saveSession(data); return data;
}

function toValue(v){
  if(v===null) return {nullValue:null};
  if(typeof v==="boolean") return {booleanValue:v};
  if(typeof v==="number") return Number.isInteger(v)?{integerValue:String(v)}:{doubleValue:v};
  if(typeof v==="string") return {stringValue:v};
  if(v instanceof Date) return {timestampValue:v.toISOString()};
  if(Array.isArray(v)) return {arrayValue:{values:v.map(toValue)}};
  if(typeof v==="object") return {mapValue:{fields:Object.fromEntries(Object.entries(v).map(([k,val])=>[k,toValue(val)]))}};
  return {stringValue:String(v)};
}
function fromValue(v){
  if(!v) return null;
  if("stringValue" in v) return v.stringValue;
  if("booleanValue" in v) return v.booleanValue;
  if("integerValue" in v) return parseInt(v.integerValue,10);
  if("doubleValue" in v) return v.doubleValue;
  if("timestampValue" in v) return v.timestampValue;
  if("nullValue" in v) return null;
  if("arrayValue" in v) return (v.arrayValue.values||[]).map(fromValue);
  if("mapValue" in v){ const o={}; for(const [k,val] of Object.entries(v.mapValue.fields||{})) o[k]=fromValue(val); return o; }
  return null;
}
function fromDoc(d){
  if(!d) return null;
  const id = d.name.split("/").pop();
  const fields = {};
  for(const [k,val] of Object.entries(d.fields||{})) fields[k]=fromValue(val);
  return {id,...fields};
}
async function fsFetch(path, opts={}){
  const sess = getSession();
  if(!sess) throw new Error("Not authenticated - please login");
  const res = await fetch(`${FIRESTORE_URL}/${path}?key=${API_KEY}`,{
   ...opts,
    headers: {"Content-Type":"application/json","Authorization":`Bearer ${sess.idToken}`,...(opts.headers||{})}
  });
  const data = await res.json();
  if(!res.ok) throw new Error(data.error?.message || "Firestore error");
  return data;
}
export async function getDoc(col, id){ const data = await fsFetch(`${col}/${id}`); return fromDoc(data); }
export async function setDoc(col, id, obj){ await fsFetch(`${col}/${id}`,{method:"PATCH", body: JSON.stringify({fields: Object.fromEntries(Object.entries(obj).map(([k,v])=>[k,toValue(v)]))})}); }
export async function create(col, obj){ const data = await fsFetch(col,{method:"POST", body: JSON.stringify({fields: Object.fromEntries(Object.entries(obj).map(([k,v])=>[k,toValue(v)]))})}); return fromDoc(data); }
export async function update(col, id, patch){ const mask = Object.keys(patch).map(k=>`updateMask.fieldPaths=${k}`).join("&"); const data = await fsFetch(`${col}/${id}?${mask}`,{method:"PATCH", body: JSON.stringify({fields: Object.fromEntries(Object.entries(patch).map(([k,v])=>[k,toValue(v)]))})}); return fromDoc(data); }
export async function remove(col, id){ await fsFetch(`${col}/${id}`,{method:"DELETE"}); }
export async function listAll(col){ const data = await fsFetch(col); return (data.documents||[]).map(fromDoc); }
export async function listMine(col, uid){
  const data = await fsFetch(`${col}:runQuery`,{method:"POST", body: JSON.stringify({structuredQuery:{from:[{collectionId:col}], where:{fieldFilter:{field:{fieldPath:"userId"}, op:"EQUAL", value:{stringValue:uid}}}}})});
  return (data||[]).map(r=>fromDoc(r.document)).filter(Boolean);
}