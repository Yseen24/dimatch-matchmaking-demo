export const agentEndpoint="https://vmdezswfiwhcdyicaaqt.supabase.co/functions/v1/dimatch-summit-chat";
const utf8=new TextEncoder();
const asHex=bytes=>Array.from(new Uint8Array(bytes),n=>n.toString(16).padStart(2,"0")).join("");
const base64url=bytes=>btoa(String.fromCharCode(...new Uint8Array(bytes))).replaceAll("+","-").replaceAll("/","_").replace(/=+$/,"");
export async function issueAgentTicket(request,env){
  const reply=(data,status=200)=>new Response(JSON.stringify(data),{status,headers:{"Content-Type":"application/json","Cache-Control":"no-store"}});
  if(request.method!=="POST")return reply({error:"Use POST."},405);
  const origin=request.headers.get("origin"),requestOrigin=new URL(request.url).origin;
  // The private Sites dispatcher may forward the worker request under its internal host.
  const samePage=origin&&(origin===requestOrigin||origin==="https://dimatch-mcp-summit.yassine-tannane.chatgpt.site");
  if(!samePage||!request.headers.get("content-type")?.startsWith("application/json"))return reply({error:"Submit from the DIMATCH page."},403);
  if(!env.SUMMIT_CHAT_SIGNING_KEY)return reply({error:"Live chat is unavailable in this preview. The guided replay is available."},503);
  const raw=await request.text();
  if(utf8.encode(raw).length>10000)return reply({error:"This conversation is too long. Start a new chat."},413);
  let turn;try{turn=JSON.parse(raw);}catch{return reply({error:"Invalid request."},400);}
  if(typeof turn?.question!=="string"||!turn.question.trim()||turn.question.length>950||!Array.isArray(turn.history)||turn.history.length>6)return reply({error:"Enter a question of up to 950 characters."},400);
  const key=await crypto.subtle.importKey("jwk",JSON.parse(env.SUMMIT_CHAT_SIGNING_KEY),{name:"ECDSA",namedCurve:"P-256"},false,["sign"]);
  const claims={aud:"dimatch-summit-chat",origin,exp:Math.floor(Date.now()/1000)+100,hash:asHex(await crypto.subtle.digest("SHA-256",utf8.encode(raw))),nonce:crypto.randomUUID()};
  const payload=base64url(utf8.encode(JSON.stringify(claims)));
  const signature=await crypto.subtle.sign({name:"ECDSA",hash:"SHA-256"},key,utf8.encode(payload));
  return reply({endpoint:agentEndpoint,ticket:payload+"."+base64url(signature)});
}
