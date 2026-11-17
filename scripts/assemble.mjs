import fs from "node:fs";
import {execFileSync} from "node:child_process";
fs.mkdirSync("worker",{recursive:true});
execFileSync("python3",["scripts/package-source.py","worker/demo-source.zip"]);
const sourceArchive=fs.readFileSync("worker/demo-source.zip").toString("base64");
const read=p=>fs.readFileSync(p,"utf8");
const assets="sources/assets/";
const as64=p=>fs.readFileSync(assets+p).toString("base64");
const template=read("sources/page.html").replace("__AGENT_PANE__",()=>read("sources/agent.html"));
const domain=read("sources/dimatch-demo.mjs").replace(/^export /gm,"");
const additions=read("sources/summit-tools.mjs").replace(/^import .*;$/gm,"").replace(/^export /gm,"");
const agent=read("sources/agent.js").replace("__ECON__",()=>read("sources/economics.json"));
const page=template.replace("__CODE__",()=>[domain,read("sources/stage.js"),agent,read("sources/chat.js")].join("\n"))
  .replace("__LOGO__",as64("wordmark.webp")).replace("__PHOTO__",as64("match.webp")).replace("__FONT__",as64("display.woff"));
const html=page.replace("__OFFLINE__","false").replace("__OFFLINE_FACT__","");
const pdf=as64("DIMATCH_Fact_Sheet.pdf");
const shared=p=>read(p).replace(/^import .*;$/gm,"").replace(/^export /gm,"");
const script=["const SOURCE_ZIP = "+JSON.stringify(sourceArchive)+";",domain,additions,shared("sources/mcp.mjs"),shared("sources/ticket.mjs"),"const PAGE = "+JSON.stringify(html)+";", "const FACT_PDF = "+JSON.stringify(pdf)+";",
  "const OFFLINE=PAGE.replace('const offlineFile = false','const offlineFile = true').replace('data:application/pdf;base64,\\\"','data:application/pdf;base64,'+FACT_PDF+'\\\"');",
  read("sources/handler.js")].join("\n");
fs.writeFileSync("worker/index.js",script);
