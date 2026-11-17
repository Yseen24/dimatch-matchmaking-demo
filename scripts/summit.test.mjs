import test from "node:test";
import assert from "node:assert/strict";
import { Script } from "node:vm";
import app from "../worker/index.js";
import { humanAction } from "../sources/dimatch-demo.mjs";
const request=(method,params={})=>app.fetch(new Request("https://demo.example/mcp",{method:"POST",body:JSON.stringify({jsonrpc:"2.0",id:7,method,params})}));
const tool=async(name,args={})=>(await (await request("tools/call",{name,arguments:args})).json()).result;
async function value(name,args){
  const r=await tool(name,args);
  assert.equal(r.isError,false);
  return JSON.parse(r.content[0].text);
}
test("MCP discovery and five-tool flow stop at human approval",async()=>{
  assert.equal((await (await request("initialize",{protocolVersion:"2025-03-26"})).json()).result.protocolVersion,"2025-03-26");
  assert.ok((await (await request("server/discover")).json()).result.capabilities.tools);
  const list=(await (await request("tools/list")).json()).result.tools;
  assert.equal(list.length,6);
  assert.equal(list.some(t=>t.name==="approve"||t.name==="accept"),false);
  const interest=await value("get_opportunities",{});assert.equal(interest.players.length,14);
  const slot=await value("check_field",{field:interest.requested_field,start:interest.requested_start});
  assert.equal(slot.available,false);
  const [alternate]=slot.alternatives;
  assert.deepEqual(alternate,{field:"Oasis",start:21});
  assert.equal((await value("check_organizer",{start:alternate.start})).available,true);
  const roster=await value("check_players",{start:alternate.start});
  assert.equal(roster.eligible_player_ids.length,10);assert.equal(roster.excluded.length,4);
  const args={...alternate,player_ids:roster.eligible_player_ids};
  assert.equal((await tool("save_proposal",{...args,player_ids:args.player_ids.map((id,i)=>i===0?"demo-1":id)})).isError,true);
  const proposal=await value("save_proposal",args);
  assert.equal(proposal.status,"pending_admin");
  const state={proposal,status:"pending_admin",events:[]};
  assert.throws(()=>humanAction("accept",state));
  humanAction("approve",state);assert.equal(state.events[0].payload.player_ids.length,10);
  humanAction("accept",state);assert.equal(state.events[1].payload.player_id,"demo-5");
  assert.throws(()=>humanAction("accept",state));
});
test("offline download is self-contained and defaults to offline",async()=>{
  const online=await (await app.fetch(new Request("https://demo.example/"))).text();
  const response=await app.fetch(new Request("https://demo.example/offline"));
  assert.match(response.headers.get("content-disposition"),/attachment/);
  const offline=await response.text();assert.match(offline,/const offlineFile = true/);
  assert.doesNotMatch(offline,/(src|href)="https?:|__OFFLINE__|__CODE__|__PHOTO__|__FONT__|__LOGO__/);
  assert.match(offline,/data:application\/pdf;base64,JVBER/);
  assert.match(online,/href="\/economics.pdf"/);
  new Script(offline.match(/<script>([\s\S]*?)<\/script>/)[1]);
});
test("a changed constraint, recovers from a selected timeout and gets human review",async()=>{
  const failed=await tool("check_field",{field:"Oasis",start:22,demo_fault:"venue_timeout"});
  assert.equal(failed.isError,true);assert.equal(JSON.parse(failed.content[0].text).retryable,true);
  const slot=await value("check_field",{field:"Oasis",start:22});assert.equal(slot.available,false);
  const alternate=slot.alternatives[0];assert.equal((await value("check_field",alternate)).available,true);
  const roster=await value("check_players",{start:alternate.start});
  const proposal=await value("save_proposal",{...alternate,player_ids:roster.eligible_player_ids});
  assert.match(proposal.review_url,/start=21#review$/);assert.equal(proposal.status,"pending_admin");
});
test("player searches distinguish open, forming and no compatible match",async()=>{
  const q={date:"2026-11-18",zone:"Oasis",start:20,end:22,format:"5v5"};
  const existing=await value("search_player_matches",q);assert.equal(existing.open_places,1);
  const forming=await value("search_player_matches",{...q,date:"2026-11-19"});assert.equal(forming.interested,6);
  for(const change of [{format:"7v7"},{zone:"Sidi Maarouf"},{end:21},{date:"2026-11-20"}]){
    const result=await value("search_player_matches",{...q,...change});assert.equal(result.category,"no_match");assert.equal(result.request_saved,false);
  }
  assert.equal((await tool("search_player_matches",{...q,end:18})).isError,true);
  const pdf=await app.fetch(new Request("https://demo.example/economics.pdf"));
  assert.equal(pdf.headers.get("Content-Type"),"application/pdf");assert.match((await pdf.text()).slice(0,8),/^%PDF-/);
});
test("OpenAI action dispatch rechecks the alternative and cannot draft through a fixed kickoff",async()=>{
  const {runAgent}=await import("../backend/agent.mjs");
  const makeInfer=(name,args)=>async(messages,tools,finish)=>({model:"test",usage:{input:1,output:1},message:finish?{content:"Checked."}:{tool_calls:[{id:"call",type:"function",function:{name,arguments:JSON.stringify(args)}}]}});
  const args={reply_locale:"en",field:"Oasis",start:22,date:"2026-11-19",format:"5v5",earliest:0,latest:23,alternate_time:true,alternate_field:true,simulate_timeout:true};
  const q={question:"Organize a game.",history:[]};
  const run=await runAgent(q,makeInfer("organize_match",args));
  assert.equal(run.trace[1].failed,true);assert.equal(run.proposal.status,"pending_admin");assert.equal(run.roster.excluded.length,4);
  const fixed=await runAgent(q,makeInfer("organize_match",{...args,alternate_time:false}));
  assert.equal(fixed.proposal,null);assert.ok(!fixed.trace.some(row=>row.tool==="save_proposal"));
  const follow=await runAgent({...q,currentSlot:run.proposal},makeInfer("inspect_roster",{reference:"current_proposal",start:22}));
  assert.equal(follow.roster.start,21);
});
test("live turn tickets require a configured signer and the same page origin",async()=>{
  const mk=(origin)=>new Request("https://demo.example/api/agent-ticket",{method:"POST",headers:{origin,"content-type":"application/json"},body:'{"question":"Who can stay?","history":[]}'});
  assert.equal((await app.fetch(mk("https://another.example"))).status,403);
  assert.equal((await app.fetch(mk("https://demo.example"))).status,503);
});

test("alternative time limits constrain replacement slots without rejecting the requested kickoff",async()=>{
  const {runAgent}=await import("../backend/agent.mjs");
  const run=async(question,start,earliest,latest,alternateTime)=>{
    const parameters={reply_locale:"en",field:"Oasis",start,date:"2026-11-19",format:"5v5",earliest,latest,
      alternate_time:alternateTime,alternate_field:false,simulate_timeout:false};
    const infer=async(messages,tools,finish)=>({model:"test",usage:{input:1,output:1},message:finish
      ?{content:"Checked."}
      :{tool_calls:[{id:"call",type:"function",function:{name:"organize_match",arguments:JSON.stringify(parameters)}}]}});
    return runAgent({question,history:[]},infer);
  };
  for(const [question,hour,lower,upper] of [
    ["An earlier kickoff is allowed.",22,0,21],
    ["A later kickoff is allowed.",20,21,23],
    ["If the original slot is taken, try an earlier time.",21,0,20]
  ]){
    const result=await run(question,hour,lower,upper,true);
    assert.equal(result.proposal?.start,21);
    assert.match(result.answer,/10 players can stay for the full hour/);
    assert.equal(result.usage.length,1);
    assert.equal(result.proposal.status,"pending_admin");
    assert.equal(result.proposal.player_ids.length,10);
    assert.ok(result.trace.some(row=>row.tool==="check_organizer"));
    assert.ok(result.trace.some(row=>row.tool==="check_players"&&row.args.start===21));
  }
  for(const [question,hour,lower,upper,flexible] of [
    ["Keep 22:00 fixed.",22,22,22,false],
    ["Only alternatives before 21:00 are allowed.",22,0,20,true],
    ["A fixed alternative window was malformed.",22,22,20,true]
  ]){
    const result=await run(question,hour,lower,upper,flexible);
    assert.equal(result.proposal,null);
    assert.ok(!result.trace.some(row=>row.tool==="save_proposal"));
  }
});
