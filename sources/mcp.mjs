import {executeTool} from "./dimatch-demo.mjs";
import {summitDefinitions,searchPlayer,playerSearch} from "./summit-tools.mjs";
const response=(v,status=200)=>new Response(JSON.stringify(v),{status,headers:{"Content-Type":"application/json","Cache-Control":"no-store"}});
export async function handleMcp(request,reviewBase="/"){
  if(request.method!=="POST")return new Response("POST required",{status:405,headers:{Allow:"POST"}});
  let m;try{m=await request.json();}catch{return response({jsonrpc:"2.0",id:null,error:{code:-32700,message:"Invalid JSON"}},400);}
  const id=m?.id??null;
  const ok=result=>response({jsonrpc:"2.0",id,result});
  const fail=(code,message,status=200)=>response({jsonrpc:"2.0",id,error:{code,message}},status);
  if(m?.jsonrpc!=="2.0"||typeof m.method!=="string")return fail(-32600,"Invalid request",400);
  if(m.method.startsWith("notifications/"))return new Response(null,{status:202});
  if(m.method==="server/discover")return ok({supportedVersions:["2026-07-28","2025-03-26"],capabilities:{tools:{}}});
  if(m.method==="initialize")return ok({protocolVersion:m.params?.protocolVersion==="2026-07-28"?"2026-07-28":"2025-03-26",capabilities:{tools:{}},serverInfo:{name:"DIMATCH Matchmaking",version:"1.1.0"}});
  if(m.method==="ping")return ok({});
  if(m.method==="tools/list")return ok({tools:summitDefinitions()});
  if(m.method!=="tools/call")return fail(-32601,"Method not found");
  const name=m.params?.name,args=m.params?.arguments,definition=summitDefinitions().find(t=>t.name===name);
  if(!definition)return fail(-32602,"Unknown tool");
  const schema=definition.inputSchema;
  const valid=(v,s)=>s.type==="integer"?Number.isInteger(v):s.type==="array"?Array.isArray(v)&&v.length<=14&&v.every(x=>typeof x==="string"&&x.length<=20):typeof v===s.type&&(!s.enum||s.enum.includes(v))&&(typeof v!=="string"||v.length<=80);
  const result=(data,isError=false)=>ok({content:[{type:"text",text:JSON.stringify(data)}],isError});
  try{
    if(!args||typeof args!=="object"||Array.isArray(args)||schema.required.some(k=>!(k in args))||Object.keys(args).some(k=>!Object.hasOwn(schema.properties,k)||!valid(args[k],schema.properties[k])))throw Error("Invalid tool arguments");
    if(name==="check_field"&&args.demo_fault==="venue_timeout")return result({code:"DEMO_VENUE_TIMEOUT",synthetic:true,retryable:true,next_action:"Retry the same read without demo_fault. Venue availability is unknown until it succeeds."},true);
    if("start" in args&&(args.start<0||args.start>23))return result({code:"INVALID_HOUR",message:"Use a whole clock hour from 0 through 23. For 22:00 send start=22. Correct and retry.",retryable:true},true);
    const data=name===playerSearch.name?searchPlayer(args):executeTool(name,args,{});
    if(name==="save_proposal"&&new URL(request.url).pathname==="/mcp"){
      data.review_url=new URL(request.url).origin+reviewBase+"?field="+encodeURIComponent(data.field)+"&start="+data.start+"#review";
      data.review_note="Share this link. The organizer rechecks the fixed fixture and approves simulated invitations in their browser. No invitations have been sent.";
    }
    return result(data);
  }catch{return result({code:"INVALID_DEMO_REQUEST",synthetic:true,retryable:false,message:"Check the time, venue, format and ten unique eligible players before retrying."},true);}
}
