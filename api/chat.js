import {agentEndpoint} from "../sources/ticket.mjs";

const json=(error,status)=>Response.json({error},{status,headers:{"cache-control":"no-store"}});
export default {
  async fetch(request){
    if(request.method!=="POST")return json("Use POST.",405);
    if(request.headers.get("origin")!==new URL(request.url).origin||!request.headers.get("content-type")?.startsWith("application/json"))return json("Submit from the DIMATCH page.",403);
    const token=request.headers.get("x-vercel-oidc-token");
    if(!token)return json("Live chat needs the Vercel project's OIDC identity (Team issuer mode).",503);
    const body=await request.text();
    if(new TextEncoder().encode(body).length>10000)return json("This conversation is too long. Start a new chat.",413);
    try{
      const upstream=await fetch(agentEndpoint,{method:"POST",redirect:"error",headers:{"Content-Type":"application/json",Authorization:"Bearer "+token,"x-dimatch-host":"vercel"},body,signal:AbortSignal.timeout(90000)});
      return new Response(upstream.body,{status:upstream.status,headers:{"Content-Type":"application/json","Cache-Control":"no-store"}});
    }catch{return json("The live agent could not be reached. Please retry.",503);}
  }
};
