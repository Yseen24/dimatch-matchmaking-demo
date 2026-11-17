const sampleQuestion=el("chatInput").value;
let chatTurns=[],chatBusy=false,activeProposal=null;
function chatNode(tag,text,className){
  const node=document.createElement(tag);node.textContent=text;
  if(className)node.className=className;return node;
}
function bubble(who,text){
  const row=chatNode("div","","message "+(who==="DIMATCH"?"agent":"agent"));
  row.append(chatNode("strong",who),chatNode("p",text));el("chatLog").append(row);
  el("chatLog").scrollTop=el("chatLog").scrollHeight;
  return row;
}
function clearEvidence(){
  for(const id of ["chatEvidence","chatTraceList","chatUsage","approvalStatus"])el(id).replaceChildren();
  el("chatTrace").hidden=true;el("approveChat").hidden=true;el("evidenceIntro").hidden=false;
}
function showEvidence(turn){
  clearEvidence();
  el("evidenceIntro").hidden=true;
  const node=el("chatEvidence"),r=turn.roster,p=turn.proposal;
  if(p){node.append(chatNode("h3",p.field+" · "+p.start+":00–"+(p.start+1)+":00 · "+p.format),chatNode("p","Organizer available · awaiting demo admin approval","proposalStatus rosterText"));}
  if(r){
    node.append(chatNode("h3",r.eligible_player_ids.length+" eligible for "+r.start+":00–"+r.end+":00"),chatNode("p",r.eligible_player_ids.join(", ")||"None","rosterText"));
    if(r.excluded.length)node.append(chatNode("h3",r.excluded.length+" unavailable"),chatNode("p",r.excluded.map(x=>x.id+" ("+x.from+":00–"+x.until+":00)").join(", "),"rosterText"));
  }
  el("approveChat").hidden=!activeProposal||activeProposal.status!=="pending_admin";
  for(const row of turn.trace){
    const d=document.createElement("details");d.className="trace-line";
    d.append(chatNode("summary",row.tool+" · "+(row.failed?"failed":"ok")),chatNode("pre",JSON.stringify({arguments:row.args,result:row.result},null,2)));el("chatTraceList").append(d);
  }
  el("chatTraceLabel").textContent=turn.trace.length+" MCP tool call"+(turn.trace.length===1?"":"s");
  el("chatTrace").hidden=turn.trace.length===0;
  const input=turn.usage.reduce((n,u)=>n+u.input,0),output=turn.usage.reduce((n,u)=>n+u.output,0);
  el("chatUsage").textContent=turn.model+" · "+turn.usage.length+" model call"+(turn.usage.length===1?"":"s")+" · "+input.toLocaleString()+" input / "+output.toLocaleString()+" output tokens";
}
function chatControls(){
  el("sendMessage").disabled=chatBusy||offlineFile;el("chatInput").disabled=chatBusy||offlineFile;
  el("resetChat").hidden=!chatTurns.length;el("resetChat").disabled=chatBusy;
  el("sendMessage").textContent=chatBusy?"Checking…":"Send to agent";
  for(const b of el("chatExamples").querySelectorAll("button"))b.disabled=chatBusy||offlineFile;
}
async function getJson(url,init){
  const res=await fetch(url,init);
  const data=await res.json().catch(()=>({error:"The service returned an unreadable response."}));
  if(!res.ok)throw Error(data.error||"The service could not complete this turn.");return data;
}
async function sendTurn(e){
  e.preventDefault();const question=el("chatInput").value.trim();
  if(!question||chatBusy||offlineFile)return;
  const history=chatTurns.slice(-6);
  const currentSlot=activeProposal?{field:activeProposal.field,start:activeProposal.start,status:activeProposal.status}:null;
  const raw=JSON.stringify({question,history,currentSlot});
  chatBusy=true;chatControls();el("approveChat").hidden=true;
  const questionBubble=bubble("You",question);
  el("chatStatus").textContent="Waiting for OpenAI and the DIMATCH tools…";
  try{
    const localRoute=document.documentElement.dataset.chatEndpoint;
    const ticket=localRoute?{endpoint:localRoute}:await getJson("/api/agent-ticket",{method:"POST",headers:{"Content-Type":"application/json"},body:raw});
    const turn=await getJson(ticket.endpoint,{method:"POST",credentials:"omit",headers:{"Content-Type":"application/json",...(ticket.ticket?{Authorization:"Bearer "+ticket.ticket}:{})},body:raw,signal:AbortSignal.timeout(100000)});
    const prior=activeProposal;activeProposal=turn.proposal||null;
    if(!activeProposal&&prior&&turn.roster?.start===prior.start&&turn.trace.every(x=>x.tool==="check_players"||x.tool==="get_opportunities"))activeProposal=prior;
    if(activeProposal&&prior?.status==="invited"&&prior.start===activeProposal.start&&prior.field===activeProposal.field)activeProposal.status="invited";
    chatTurns.push({role:"user",content:question},{role:"assistant",content:turn.answer.slice(0,800)});
    bubble("DIMATCH",turn.answer);showEvidence(turn);
    if(activeProposal?.status==="invited")el("approvalStatus").textContent="Already approved in this conversation. Ten simulated invitations are in the demo inbox.";
    el("chatInput").value="";el("chatInput").placeholder="Ask a follow-up or change a constraint";el("chatStatus").textContent="";
  }catch(err){
    questionBubble.remove();activeProposal=null;clearEvidence();
    el("chatStatus").textContent=(err.message==="Failed to fetch"?"Couldn’t reach the live agent. Check the connection and retry.":err.message)+" Your message is still here.";
  }finally{chatBusy=false;chatControls();el("chatInput").focus({preventScroll:true});}
}
el("chatForm").addEventListener("submit",sendTurn);
el("chatInput").addEventListener("keydown",e=>{if(e.key==="Enter"&&!e.shiftKey&&!e.isComposing){e.preventDefault();el("chatForm").requestSubmit();}});
document.querySelectorAll("[data-example]").forEach(b=>b.addEventListener("click",()=>{el("chatInput").value=b.dataset.example;el("chatInput").focus();}));
el("resetChat").addEventListener("click",()=>{activeProposal=null;chatTurns=[];el("chatLog").replaceChildren();clearEvidence();el("chatInput").value=sampleQuestion;el("chatStatus").textContent="";chatControls();});
el("approveChat").addEventListener("click",()=>{
  if(chatBusy||activeProposal?.status!=="pending_admin")return;
  const s=humanAction("approve",{status:"pending_admin",proposal:activeProposal,events:[]});
  const message="Demo admin approved the proposal. "+s.events[0].payload.player_ids.length+" simulated invitations were created in this tab. No player has accepted.";
  el("approveChat").hidden=true;el("approvalStatus").textContent=message;bubble("Demo admin",message);
  chatTurns.push({role:"user",content:"I approved the synthetic proposal using the DIMATCH approval button."});
  const line=el("chatEvidence").querySelector(".proposalStatus");if(line)line.textContent="Demo admin approved · simulated invitations only";
});
if(offlineFile){el("sourceLink").hidden=true;el("chatIntro").textContent="Live OpenAI chat is available on the hosted DIMATCH site. Use Guided replay or Manual fixture check to present offline.";el("chatExamples").hidden=true;}
chatControls();
