import {isVercelDemo} from "./vercel-auth.ts";
import {runAgent} from "./agent.mjs";
import publicKey from "./public-key.json" with {type:"json"};
const bytes=new TextEncoder();
const un64=(s:string)=>Uint8Array.from(atob(s.replaceAll("-","+").replaceAll("_","/")),c=>c.charCodeAt(0));
const key=crypto.subtle.importKey("jwk",publicKey,{name:"ECDSA",namedCurve:"P-256"},false,["verify"]);
const model="gpt-4.1-mini-2025-04-14";
const consumed=new Map<string,number>();
async function authorized(req:Request,body:string){
  try{
    const token=req.headers.get("authorization")?.match(/^Bearer ([\w-]+\.[\w-]+)$/)?.[1];
    if(!token||token.length>1400)return false;
    const [payload,sig]=token.split(".");
    if(!await crypto.subtle.verify({name:"ECDSA",hash:"SHA-256"},await key,un64(sig),bytes.encode(payload)))return false;
    const v=JSON.parse(new TextDecoder().decode(un64(payload))),now=Date.now()/1000;
    const hash=Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256",bytes.encode(body))),n=>n.toString(16).padStart(2,"0")).join("");
    if(v.aud!=="dimatch-summit-chat"||v.origin!==req.headers.get("origin")||v.exp<now||v.exp>now+115||v.hash!==hash||typeof v.nonce!=="string")return false;
    for(const [id,until] of consumed)if(until<now)consumed.delete(id);
    if(consumed.has(v.nonce))return false;
    consumed.set(v.nonce,v.exp);return true;
  }catch{return false;}
}
async function infer(messages:any[],tools:any[],final:boolean){
  const env=(key:string)=>Deno.env.get(key)||"";
  if(env("DIMATCH_MODEL_PROVIDER")!=="openai"||env("DIMATCH_PAID_TEST_CAMPAIGN")!=="qwen-demo-usd1-20261112"||(env("OPENAI_MODEL")||model)!==model||!env("OPENAI_API_KEY"))throw Error("OpenAI is unavailable in the current demo configuration.");
  const params={model,messages,tools:tools.map(t=>({type:"function",function:{name:t.name,description:t.description,parameters:t.inputSchema}})),tool_choice:final?"none":"required",parallel_tool_calls:false,temperature:0,max_completion_tokens:700,store:false};
  const body=JSON.stringify(params);
  if(bytes.encode(body).length>16384)throw Error("The conversation reached its context limit. Start a new chat.");
  const service=env("SUPABASE_SERVICE_ROLE_KEY");
  const quota=await fetch(env("SUPABASE_URL")+"/rest/v1/rpc/reserve_dimatch_paid_test_call",{method:"POST",headers:{apikey:service,authorization:"Bearer "+service,"content-type":"application/json"},body:JSON.stringify({p_provider:"openai"})});
  if(!quota.ok)throw Error("The demo budget could not be checked. Please retry.");
  if(await quota.json()!==true)throw Error("The demo OpenAI allowance has been reached. The guided replay is available.");
  const res=await fetch("https://api.openai.com/v1/chat/completions",{method:"POST",headers:{authorization:"Bearer "+env("OPENAI_API_KEY"),"content-type":"application/json"},body,signal:AbortSignal.timeout(25000)});
  if(!res.ok)throw Error("OpenAI returned HTTP "+res.status+". Please retry or use the guided replay.");
  const data=await res.json();
  return {message:data.choices[0].message,model:data.model,usage:{input:data.usage.prompt_tokens,output:data.usage.completion_tokens}};
}
Deno.serve(async(req:Request)=>{
  const origin=req.headers.get("origin")||"null";
  const headers={"access-control-allow-origin":origin,"access-control-allow-methods":"POST, OPTIONS","access-control-allow-headers":"authorization, content-type","vary":"Origin","cache-control":"no-store","content-type":"application/json"};
  const respond=(data:unknown,status=200)=>new Response(JSON.stringify(data),{status,headers});
  if(req.method==="OPTIONS")return new Response(null,{status:204,headers});
  if(req.method!=="POST")return respond({error:"POST required."},405);
  const raw=await req.text();
  if(bytes.encode(raw).length>10000)return respond({error:"Request too long."},413);
  const verified=req.headers.get("x-dimatch-host")==="vercel"?await isVercelDemo(req):await authorized(req,raw);
  if(!verified)return respond({error:"This turn has expired. Submit it again from DIMATCH."},403);
  try{
    const turn=JSON.parse(raw);
    if(typeof turn.question!=="string"||!turn.question.trim()||turn.question.length>950||!Array.isArray(turn.history)||turn.history.length>6)return respond({error:"Invalid chat turn."},400);
    return respond(await runAgent(turn,infer));
  }catch(e){return respond({error:e instanceof Error?e.message:"The agent could not finish this turn."},503);}
});
