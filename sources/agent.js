const econ=__ECON__;
const panels={replay:el("replayPane"),agent:el("agentPane"),economics:el("econPane")};
const switchView=()=>{
  const hash=location.hash.slice(1),view=hash==="review"?"agent":Object.hasOwn(panels,hash)?hash:(offlineFile?"replay":"agent");
  for(const [name,panel] of Object.entries(panels)){
    panel.hidden=name!==view;
    const nav=document.querySelector('[data-view="'+name+'"]');
    if(name===view)nav.setAttribute("aria-current","page");else nav.removeAttribute("aria-current");
  }
};
window.addEventListener("hashchange",switchView);
switchView();
const sum=arr=>arr.reduce((acc,x)=>acc+x,0);
const usd=(n,precision=2)=>"$"+n.toFixed(precision);
const inferenceCost=r=>(sum(r.input)*econ.rates.input+sum(r.output)*econ.rates.output)/1e6;
function makeTable(target,headers,rows){
  const table=document.createElement("table");
  function add(values,part,cell){const tr=document.createElement("tr");for(const v of values){const td=document.createElement(cell);td.textContent=v;tr.append(td);}part.append(tr);}
  add(headers,table.createTHead(),"th");const body=table.createTBody();for(const row of rows)add(row,body,"td");
  el(target).append(table);
}
makeTable("runTable",["Outcome","Calls","Tokens","Model cost"],econ.runs.map(r=>[r.label,r.input.length,sum(r.input)+sum(r.output),usd(inferenceCost(r),7)]));
makeTable("marginTable",["Matches / mo","Cost","Revenue","Contribution"],econ.volumes.map((v,i)=>{
  const cost=econ.organizer+econ.admin+econ.messaging+econ.payment+econ.requestsPerMatch*inferenceCost(econ.runs[0])+econ.infrastructure[i]/v;
  const revenue=econ.price*econ.players;
  return [v.toLocaleString("en-US"),usd(cost),usd(revenue),usd(revenue-cost)];
}));
for(let i=0;i<24;i++){const option=new Option(String(i).padStart(2,"0")+":00",String(i));el("slotHour").add(option);}el("slotHour").value="22";
const initialLab=()=>({trace:[],busy:false,attempt:null,proposal:null,pendingRetry:false});
let lab=initialLab();
function setStatus(msg){el("labStatus").textContent=msg;}
function drawLab(){
  el("slotGo").disabled=lab.busy;
  for(const id of ["slotField","slotHour","allowAlt","failOnce"])el(id).disabled=lab.busy;
  el("approveLab").hidden=lab.proposal?.status!=="pending_admin"||lab.busy;
  el("retryLab").hidden=!lab.pendingRetry||lab.busy;
  el("labLogLabel").textContent="Tool trace · "+lab.trace.length+" call"+(lab.trace.length===1?"":"s");
  const entries=lab.trace.map(row=>{
    const box=document.createElement("details"),header=document.createElement("summary"),pre=document.createElement("pre");
    box.className="trace-line";header.textContent=row.tool+" · "+(row.failed?"failed":"ok")+" · "+row.ms+" ms";
    pre.textContent=JSON.stringify({arguments:row.args,result:row.result},null,2);box.append(header,pre);return box;
  });
  el("labLog").replaceChildren(...entries);
}
async function labTool(name,args){
  const start=performance.now();let result,failed=false;
  try{
    if(offlineFile){
      if(name==="check_field"&&args.demo_fault) {failed=true;result={code:"DEMO_VENUE_TIMEOUT",synthetic:true,retryable:true};}
      else result=executeTool(name,args,{});
    }else{
      const val=await rpc("tools/call",{name,arguments:args});failed=!!val.isError;
      result=JSON.parse(val.content.find(b=>b.type==="text").text);
    }
    if(failed)throw Error(result.message||result.code||"The MCP tool failed.");
    return result;
  }catch(e){failed=true;result=result||{message:e.message};throw e;}
  finally{lab.trace.push({tool:name,args,result,failed,ms:Math.round(performance.now()-start)});drawLab();}
}
const readForm=()=>({field:el("slotField").value,start:Number(el("slotHour").value),alternatives:el("allowAlt").checked,fault:el("failOnce").checked});
async function runSlot(retry=false){
  if(lab.busy)return;
  if(!retry){lab=initialLab();lab.attempt=readForm();el("labDetails").open=false;}
  const q=lab.attempt;if(!q)return;
  lab.busy=true;lab.pendingRetry=false;drawLab();setStatus("Checking the fixture…");
  try{
    if(!retry){
      if(!offlineFile){await rpc("initialize",{protocolVersion:"2025-03-26",capabilities:{},clientInfo:{name:"dimatch-slot-check",version:"1.1"}});await rpc("notifications/initialized",{},true);await rpc("tools/list");}
      await labTool("get_opportunities",{});
    }
    let slot={field:q.field,start:q.start},info;
    try{info=await labTool("check_field",{...slot,...(!retry&&q.fault?{demo_fault:"venue_timeout"}:{})});}
    catch(e){lab.pendingRetry=true;setStatus("The venue check failed. Availability is unknown. Retry the same read; no proposal exists.");el("labDetails").open=true;return;}
    if(!info.available){
      if(!q.alternatives||!info.alternatives?.length){setStatus("No eligible proposal. The requested pitch is unavailable and the request allows no usable alternative.");return;}
      slot=info.alternatives[0];info=await labTool("check_field",slot);
      if(!info.available){setStatus("The alternative is unavailable. No proposal was created.");return;}
    }
    const organizer=await labTool("check_organizer",{start:slot.start}),roster=await labTool("check_players",{start:slot.start});
    if(!organizer.available||roster.eligible_player_ids.length<10){setStatus("The slot lacks an organizer or ten eligible players. No proposal was created.");return;}
    lab.proposal=await labTool("save_proposal",{...slot,player_ids:roster.eligible_player_ids.slice(0,10)});
    setStatus(slot.field+" at "+slot.start+":00 · "+roster.eligible_player_ids.length+" eligible, "+roster.excluded.length+" excluded. Proposal pending admin approval. Zero invitations sent.");
  }catch(e){setStatus("Check incomplete. "+e.message+" Start a new check to retry.");el("labDetails").open=true;}
  finally{lab.busy=false;drawLab();}
}
el("slotForm").addEventListener("submit",e=>{e.preventDefault();runSlot();});
el("retryLab").addEventListener("click",()=>runSlot(true));
el("slotForm").addEventListener("change",()=>{lab=initialLab();setStatus("Inputs changed. Check this slot to create a new trace.");drawLab();});
el("approveLab").addEventListener("click",()=>{
  if(lab.proposal?.status!=="pending_admin")return;
  const h=humanAction("approve",{status:"pending_admin",proposal:lab.proposal,events:[]});
  setStatus("Demo admin approved. "+h.events[0].payload.player_ids.length+" simulated invitations created in this tab. Zero players have accepted.");drawLab();
});
if(offlineFile){
  el("pdfLink").href="data:application/pdf;base64,__OFFLINE_FACT__";el("pdfLink").download="DIMATCH_Fact_Sheet.pdf";
  el("labIntro").textContent="Offline mode executes the fixture on this device. It makes zero network or model calls. Live OpenAI chat requires the hosted demo.";
}
if(location.hash==="#review"){
  el("manualTools").open=true;
  const params=new URLSearchParams(location.search);
  if(params.get("field")==="Oasis"&&params.get("start")==="21"){
    el("slotField").value="Oasis";el("slotHour").value="21";el("allowAlt").checked=false;
    setStatus("Chat proposal received for Oasis at 21:00. Check this slot to revalidate its players and organizer before approval.");
  }else setStatus("This review link is incomplete. Choose a slot to check.");
}
drawLab();
