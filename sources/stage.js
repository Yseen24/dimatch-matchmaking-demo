const offlineFile = __OFFLINE__ || location.protocol === "file:";
const el = id => document.getElementById(id);
const stages = [
  ["Player request", "“Can we play at Atlantic at eight?”", "A player wants an evening game in Casablanca. The first tool checks how many people expressed interest and when each can play.", "Read player demand"],
  ["Demand found", "Fourteen want to play.", "All 14 fictional players are free at 20:00. Before promising anyone a place, the agent checks the requested pitch.", "Check Atlantic at 20:00"],
  ["Pitch unavailable", "Atlantic is booked. Oasis has 21:00.", "The pitch tool returns a slot an hour later. The agent still needs an organizer and enough players who can stay until 22:00.", "Recheck organizer & players"],
  ["Eligibility checked", "Ten can stay for the full match.", "The organizer is available. Four players must leave by 21:00. Moving the kickoff leaves exactly enough eligible players for 5v5.", "Prepare the proposal"],
  ["Human decision", "Oasis 5v5 is ready for approval.", "Ten eligible players, one available organizer and a 21:00 kickoff. The proposal is pending. Only the admin can release the simulated invitations.", "Approve as demo admin"],
  ["Simulated invitations", "Ten invited. Each player decides.", "Approval creates ten invitations in the demo inbox. No one has accepted yet. Acting as fictional player 05 changes only that player’s response.", "Accept as player 05"],
  ["Player response", "One accepted. Nine are pending.", "The agent helped form a viable match. Each invited player still controls their own place. The match is awaiting the remaining replies.", "Replay from the start"]
];
let state, busy = false, requestId = 0;
function fresh(){return {i:0,trace:[],demand:null,field:null,organizer:null,roster:null,proposal:null,human:{status:"pending_admin",events:[],proposal:null}};}
function mode(){return el("mode").value;}
function storeSession(){
  try{sessionStorage.setItem("dimatch-summit-session-v1",JSON.stringify({state,mode:mode()}));}catch{}
}
function restore(){
  state=fresh();
  if(offlineFile){el("mode").value="offline";el("mode").querySelector('[value="live"]').disabled=true;el("download").hidden=true;}
  try{
    const saved=JSON.parse(sessionStorage.getItem("dimatch-summit-session-v1"));
    if(saved && Array.isArray(saved.state?.trace) && Number.isInteger(saved.state.i) && saved.state.i>=0 && saved.state.i<stages.length && saved.state.human && ["live","offline"].includes(saved.mode) && (!offlineFile || saved.mode==="offline")){
      state=saved.state;el("mode").value=saved.mode;
    }
  }catch{}
}
function reset(){
  state=fresh();el("error").textContent="";el("trace").open=false;storeSession();render();
}
async function rpc(method,params={},notification=false){
  const id=++requestId;
  const message={jsonrpc:"2.0",method,params};
  if(!notification)message.id=id;
  const res=await fetch("/stage/mcp",{method:"POST",headers:{"Content-Type":"application/json","Accept":"application/json, text/event-stream","MCP-Protocol-Version":"2025-03-26"},body:JSON.stringify(message),signal:AbortSignal.timeout(10000)});
  if(!res.ok)throw Error("The MCP server could not be reached.");
  if(notification)return;
  const reply=await res.json();
  if(reply.id!==id||reply.jsonrpc!=="2.0"||reply.error)throw Error("The MCP response was incomplete.");
  return reply.result;
}
async function call(tool,args){
  // A partial step can be retried without duplicating a successful tool event.
  const previous=state.trace.find(row=>row.tool===tool && JSON.stringify(row.args)===JSON.stringify(args));
  if(previous)return previous.result;
  let result;
  if(mode()==="live"){
    if(!state.trace.length){
      const session=await rpc("initialize",{protocolVersion:"2025-03-26",capabilities:{},clientInfo:{name:"dimatch-summit",version:"1.0"}});
      if(!session.capabilities?.tools)throw Error("Tool discovery failed.");
      await rpc("notifications/initialized",{},true);
      const listed=await rpc("tools/list");
      if(!tools.every(t=>listed.tools.some(x=>x.name===t.name)))throw Error("The demo tool set is incomplete.");
    }
    const value=await rpc("tools/call",{name:tool,arguments:args});
    if(value.isError)throw Error("The tool rejected the request.");
    result=JSON.parse(value.content.find(block=>block.type==="text").text);
  }else{
    result=executeTool(tool,args,{});
  }
  state.trace.push({tool,args,result});
  return result;
}
async function advance(){
  if(busy)return;
  if(state.i===6){reset();return;}
  busy=true;el("error").textContent="";render();
  try{
    switch(state.i){
      case 0:state.demand=await call("get_opportunities",{});break;
      case 1:state.field=await call("check_field",{field:state.demand.requested_field,start:state.demand.requested_start});break;
      case 2:{
        const alt=state.field.alternatives[0];state.organizer=await call("check_organizer",{start:alt.start});
        state.roster=await call("check_players",{start:alt.start});break;
      }
      case 3:{
        const alt=state.field.alternatives[0];
        if(!state.organizer.available)throw Error("The organizer is unavailable.");
        state.proposal=await call("save_proposal",{field:alt.field,start:alt.start,player_ids:state.roster.eligible_player_ids});
        state.human.proposal={...state.proposal};break;
      }
      case 4:humanAction("approve",state.human);break;
      case 5:humanAction("accept",state.human);break;
    }
    state.i++;
  }catch(e){
    el("error").textContent=(e.message||"The action could not finish.")+" Retry this step or select Offline replay to start again.";
  }finally{busy=false;storeSession();render();}
}
function drawBoard(){
  const i=state.i,players=state.demand?.players||[],eligible=state.roster?.eligible_player_ids||[];
  const invited=state.human.events.find(e=>e.kind==="demo_notification")?.payload.player_ids||[];
  const accepted=state.human.events.filter(e=>e.kind==="accepted").map(e=>e.payload.player_id);
  const qty=i===0?"—":i<3?players.length:i<5?eligible.length:i===5?invited.length:accepted.length;
  el("board-title").textContent=i<2?"Atlantic · El Hank":"Oasis · Casablanca";
  el("board-sub").textContent=i<2?"19 Nov · 20:00 requested":"19 Nov · 21:00–22:00 alternative";
  el("count").replaceChildren(String(qty));
  const unit=document.createElement("small");unit.textContent=i===0?"":i<3?"interested":i<5?"eligible":i===5?"invited":"accepted";el("count").append(unit);
  const dots=Array.from({length:14},(_,index)=>{
    const player=players[index],dot=document.createElement("span");dot.textContent=i===0?"·":String(index+1).padStart(2,"0");dot.className="player";
    if(i===0)dot.classList.add("empty");
    else if(i>=3)dot.classList.add(accepted.includes(player.id)?"accept":eligible.includes(player.id)?"yes":"out");
    return dot;
  });
  el("squad").replaceChildren(...dots);
  el("legend").textContent=i===0?"Waiting for the first tool call.":i<3?"14 expressions of interest · Individual positions show fictional player numbers.":i<5?"10 eligible · 4 crossed out because their windows end at 21:00":i===5?"10 invitations pending · 0 accepted": "Player 05 accepted · 9 invitations pending · 4 excluded";
}
function drawTrace(){
  el("trace-label").textContent="MCP tool trace · "+state.trace.length+"/5";
  if(!state.trace.length){el("calls").textContent="Run the first step to see the tool input and output.";return;}
  const calls=state.trace.map((row,idx)=>{
    const details=document.createElement("details");details.className="trace-line";
    const head=document.createElement("summary");head.textContent=String(idx+1).padStart(2,"0")+"  "+row.tool;
    const pre=document.createElement("pre");pre.textContent=JSON.stringify({arguments:row.args,result:row.result},null,2);
    details.append(head,pre);return details;
  });
  el("calls").replaceChildren(...calls);
}
function render(){
  const [role,title,desc,action]=stages[state.i];
  el("role").textContent=role;el("title").textContent=title;el("desc").textContent=desc;
  el("step").textContent="STEP "+(state.i+1)+" / "+stages.length;
  el("progress").innerHTML=stages.map((_,i)=>i<=state.i?'<i class="on"></i>':'<i></i>').join("");
  el("next").textContent=busy?"Running…":action+"  →";el("next").disabled=busy;
  el("restart").disabled=busy;el("mode").disabled=busy;drawBoard();drawTrace();
}
el("mode").addEventListener("change",reset);el("restart").addEventListener("click",reset);el("next").addEventListener("click",advance);
restore();render();
