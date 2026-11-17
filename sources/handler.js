export default {async fetch(request,env={}){
  const path=new URL(request.url).pathname;
  if(path==="/source.zip"&&request.method==="GET"){
    return new Response(Uint8Array.from(atob(SOURCE_ZIP),c=>c.charCodeAt(0)),{headers:{"Content-Type":"application/zip","Content-Disposition":'attachment; filename="DIMATCH_Source.zip"'}});
  }
  if(path==="/api/agent-ticket")return issueAgentTicket(request,env);
  if(path==="/mcp"||path==="/stage/mcp")return handleMcp(request);
  if(path==="/economics.pdf"&&request.method==="GET"){
    const bytes=Uint8Array.from(atob(FACT_PDF),c=>c.charCodeAt(0));
    return new Response(bytes,{headers:{"Content-Type":"application/pdf","Content-Disposition":'inline; filename="DIMATCH_Fact_Sheet.pdf"'}});
  }
  if((path==="/"||path==="/offline")&&request.method==="GET"){
    return new Response(path==="/offline"?OFFLINE:PAGE,{headers:{"Content-Type":"text/html; charset=utf-8","Cache-Control":"no-store","X-Content-Type-Options":"nosniff",...(path==="/offline"?{"Content-Disposition":'attachment; filename="DIMATCH_Matchmaking_Demo.html"'}:{})}});
  }
  return new Response("Not found",{status:404});
}};
