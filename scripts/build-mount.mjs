import fs from "node:fs/promises";
import path from "node:path";
import "./vercel-build.mjs";

const dest=process.argv[2];
if(!dest)throw Error("Pass an output directory for the production overlay.");
const mount="/MCPDEVSUMMIT",assets=path.join(dest,"public",mount.slice(1));
await fs.mkdir(assets,{recursive:true});
await fs.mkdir(path.join(dest,"api"),{recursive:true});
function mounted(html){
  return html.replaceAll('href="/','href="'+mount+'/')
    .replace('data-chat-endpoint="/api/chat"','data-chat-endpoint="'+mount+'/chat"')
    .replaceAll('fetch("/stage/mcp"','fetch("'+mount+'/stage/mcp"');
}
for(const name of ["index.html","offline.html"]){
  await fs.writeFile(path.join(assets,name),mounted(await fs.readFile("public/"+name,"utf8")));
}
for(const name of ["source.zip","economics.pdf"])await fs.copyFile("public/"+name,path.join(assets,name));
const readme=await fs.readFile("README.md","utf8"),architecture=await fs.readFile("docs/architecture.md","utf8");
await fs.writeFile(path.join(assets,"guide.txt"),readme+"\n\n"+architecture);

const read=file=>fs.readFile(file,"utf8");
const body=async file=>(await read(file)).replace(/^import .*;$/gm,"").replace(/^export /gm,"");
const chat=(await body("api/chat.js")).replace("default {","const liveChat={");
const endpoint=(await read("sources/ticket.mjs")).split("\n")[0].replace(/^export /,"");
const adapter=[endpoint,await body("sources/dimatch-demo.mjs"),await body("sources/summit-tools.mjs"),await body("sources/mcp.mjs"),chat,
`export default {async fetch(request){
  const url=new URL(request.url);
  const action=url.searchParams.get("demoAction") || url.pathname.split("/").pop();
  if(action==="chat")return liveChat.fetch(request);
  const external=action==="mcp"&&!url.pathname.endsWith("/stage/mcp");
  return handleMcp(new Request(new URL(external?"/mcp":"/stage/mcp",url),request),"/MCPDEVSUMMIT");
}};`].join("\n");
await fs.writeFile(path.join(dest,"api","dimatch-matchmaking.js"),adapter);
const routes=[
  {source:mount,destination:mount+"/index.html"},
  ...[["chat","chat"],["mcp","mcp"],["stage/mcp","stage"]].map(([route,action])=>({source:mount+"/"+route,destination:"/api/dimatch-matchmaking?demoAction="+action})),
  {source:mount+"/offline",destination:mount+"/offline.html"},
  {source:mount+"/guide",destination:mount+"/guide.txt"}
];
await fs.writeFile(path.join(dest,"routes.json"),JSON.stringify(routes,null,2)+"\n");
