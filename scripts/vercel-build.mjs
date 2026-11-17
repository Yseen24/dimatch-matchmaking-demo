import fs from "node:fs/promises";
import "./assemble.mjs";
const {default:app}=await import("../worker/index.js");
await fs.mkdir("public",{recursive:true});
for(const [route,path] of [["/","index.html"],["/offline","offline.html"],["/economics.pdf","economics.pdf"],["/source.zip","source.zip"]]){
  const response=await app.fetch(new Request("https://demo.invalid"+route));
  if(!response.ok)throw Error("Unable to build "+route);
  if(route==="/"){
    const page=(await response.text()).replace('<html lang="en">','<html lang="en" data-chat-endpoint="/api/chat">');
    if(!page.includes('data-chat-endpoint="/api/chat"'))throw Error("Missing live chat route");
    await fs.writeFile("public/"+path,page);
  }else await fs.writeFile("public/"+path,new Uint8Array(await response.arrayBuffer()));
}
