import http from "node:http";
import app from "../worker/index.js";
const n=process.argv.indexOf("--port");
const port=Number(n<0?process.env.PORT||5173:process.argv[n+1]);
http.createServer(async(req,res)=>{
  try{
    const request=new Request(new URL(req.url,"http://"+req.headers.host),{method:req.method,headers:req.headers,body:["POST","PUT","PATCH"].includes(req.method)?req:undefined,duplex:"half"});
    const response=await app.fetch(request,{SUMMIT_CHAT_SIGNING_KEY:process.env.SUMMIT_CHAT_SIGNING_KEY});res.writeHead(response.status,Object.fromEntries(response.headers));res.end(Buffer.from(await response.arrayBuffer()));
  }catch{res.writeHead(500);res.end();}
}).listen(port,"0.0.0.0");
