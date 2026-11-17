import {handleMcp} from "../sources/mcp.mjs";
const base="You are DIMATCH's Casablanca football matchmaking agent, inside a football matchmaking demo. Speak the user's language. The fictional clock is 18 Nov 2026. The default organizer fixture is a one-hour 5v5 on 19 Nov 2026. No real bookings, messages or payments. Never approve or accept on the user's behalf.";
const integer=(description,max=23)=>({type:"integer",minimum:0,maximum:max,description});
const string=description=>({type:"string",description});
const flag=description=>({type:"boolean",description});
function action(name,description,properties,required=Object.keys(properties)){
  return {name,description,inputSchema:{type:"object",properties,required,additionalProperties:false}};
}
const actions=[
  action("organize_match","Choose when asked to organize, find a replacement for, or recheck a group match with changed constraints. This checks and drafts any feasible proposal.",{
    reply_locale:{type:"string",enum:["en","fr","ar","ary","other"],description:"Language of the reply: English, French, Arabic, Moroccan Darija, or other."},
    field:string("Requested venue, e.g. Oasis or Atlantic."),start:integer("Requested whole clock hour: 22:00 is 22."),date:string("YYYY-MM-DD. The default organizer fixture date is 2026-11-19."),format:string("5v5 unless the user specifies another format."),
    alternate_time:flag("True when another kickoff is permitted, including an earlier-only or later-only alternative. False when the kickoff is fixed."),
    alternate_field:flag("True when another venue is allowed. A fixed venue forbids changing it."),earliest:integer("Inclusive lower bound for REPLACEMENTS only. Default 0. For earlier than 22:00 use 0 unless another lower bound was stated."),latest:integer("Inclusive upper bound for REPLACEMENTS only. Default 23. For earlier than 22:00 use 21. The preferred kickoff is checked independently."),simulate_timeout:flag("True only if explicitly requested.")
  }),
  action("inspect_roster","Choose for who can stay, who has to leave, exclusions, why a player cannot stay, or an availability breakdown. For a follow-up use the current proposal.",{reference:{type:"string",enum:["current_proposal","specific_hour"]},start:integer("Clock hour for a specific-hour question; use the current displayed kickoff for an implicit follow-up.")}),
  action("search_player_matches","Choose when an individual player seeks an existing open or forming game.",{date:string("YYYY-MM-DD"),zone:string("Casablanca zone"),start:integer("Earliest available clock hour"),end:integer("Latest available clock hour",24),format:{type:"string",enum:["5v5","7v7","flexible"]}}),
  action("conversation_reply","Choose for general explanation, missing necessary information, or a request for a human-only action. Do not choose this for actionable scheduling or roster requests.",{answer:string("Concise response. Never assert fresh availability without tools.")})
];
// Use verified tool values for the on-screen approval summary.
function proposalSummary(locale,proposal,roster){
  const count=roster.eligible_player_ids.length;
  const excluded=roster.excluded.map(player=>player.id).join(", ") || "—";
  const slot=proposal.field+" · "+roster.start+":00–"+roster.end+":00 · "+proposal.format;
  const summaries={
    en:`${count} players can stay for the full hour. Unavailable (${roster.excluded.length}): ${excluded}. The organizer is available. The proposal awaits your approval.`,
    fr:`${count} joueurs sont disponibles pendant toute l’heure. Indisponibles (${roster.excluded.length}) : ${excluded}. L’organisateur est disponible. La proposition attend votre validation.`,
    ar:`يمكن لـ ${count} لاعبين البقاء طوال الساعة. غير المتاحين (${roster.excluded.length}): ${excluded}. المنظم متاح والمقترح بانتظار موافقتك.`,
    ary:`كاينين ${count} لعابة يقدرو يبقاو الساعة كاملة. اللي ما متاحينش (${roster.excluded.length}): ${excluded}. المنظّم متاح والماتش كيتسنّى الموافقة ديالك.`
  };
  return summaries[locale] ? slot+". "+summaries[locale] : null;
}
async function rpc(method,params,id){
  const req=new Request("https://dimatch.internal/stage/mcp",{method:"POST",body:JSON.stringify({jsonrpc:"2.0",id,method,params})});
  const envelope=await (await handleMcp(req)).json();
  if(envelope.error)throw Error("MCP request failed.");return envelope.result;
}
export async function runAgent(turn,infer){
  const prior=turn.currentSlot?.field==="Oasis"&&turn.currentSlot.start===21?{field:"Oasis",start:21,status:turn.currentSlot.status==="invited"?"invited":"pending_admin"}:null;
  const system=base+" Choose exactly one matchmaking action. Preserve all explicit constraints. A roster follow-up without a new hour refers to the displayed proposal. Never request confirmation to draft. Approval is for simulated invitations. Current proposal: "+JSON.stringify(prior)+".";
  const history=(turn.history||[]).slice(-6).map(row=>({role:row.role==="assistant"?"assistant":"user",content:String(row.content).slice(0,800)}));
  const messages=[{role:"system",content:system},...history,{role:"user",content:turn.question}];
  const pick=await infer(messages,actions,false),call=pick.message.tool_calls?.[0];
  if(!call||!actions.some(t=>t.name===call.function.name))throw Error("OpenAI could not select a valid action. Please retry.");
  const name=call.function.name,args=JSON.parse(call.function.arguments);
  const definition=actions.find(a=>a.name===name);
  const valid=(v,s)=>s.type==="integer"?Number.isInteger(v)&&v>=0&&v<=s.maximum:typeof v===s.type&&(!s.enum||s.enum.includes(v));
  if(!args||definition.inputSchema.required.some(k=>!valid(args[k],definition.inputSchema.properties[k])))throw Error("The agent could not resolve the request’s details. Please rephrase it.");
  const usage=[pick.usage],trace=[];let proposal=null,slot=null,roster=null,finding="";
  if(name==="conversation_reply")return {answer:args.answer,model:pick.model,usage,trace,proposal,slot,roster};
  await rpc("initialize",{protocolVersion:"2025-03-26",capabilities:{},clientInfo:{name:"dimatch-summit-agent",version:"2"}},0);
  const catalog=(await rpc("tools/list",{},1)).tools;
  async function tool(name,params){
    if(!catalog.some(t=>t.name===name))throw Error("The required MCP tool is unavailable.");
    const since=performance.now(),result=await rpc("tools/call",{name,arguments:params},trace.length+2);
    const data=JSON.parse(result.content[0].text);
    trace.push({tool:name,args:params,result:data,failed:!!result.isError,ms:Math.round(performance.now()-since)});
    if(result.isError&&data.code!=="DEMO_VENUE_TIMEOUT")throw Error(data.message||"The tool could not complete this check.");
    return data;
  }
  if(name==="inspect_roster"){
    const selected=args.reference==="current_proposal"&&prior?prior.start:args.start;
    roster=await tool("check_players",{start:selected});finding="Roster checked for "+selected+":00.";
  }else if(name==="search_player_matches"){
    const game=await tool(name,args);finding="Player search: "+JSON.stringify(game);
  }else{
    const {date,format,start}=args;
    // In DIMATCH, an unqualified request for an alternative permits a time or venue change.
    // Keep any separately stated limit or fixed constraint authoritative.
    const broad=/\b(?:find|try|suggest|offer|look for) (?:me |us )?(?:an? |another )?(?:alternative|fallback)\b/i.test(turn.question)
      &&!/(?:\b(?:only|fixed|strict|must|same|keep|exactly|before|after|earlier|later|between|until|latest|earliest|except|other venue|other pitch|cannot|can't|stay at|still at)\b|no time change)/i.test(turn.question)
      &&(turn.question.match(/\b\d{1,2}(?::\d{2}|\s?(?:am|pm))\b/gi)||[]).length<=1;
    const earliest=broad?0:args.earliest,latest=broad?23:args.latest;
    const allowTime=broad||args.alternate_time,allowField=broad||args.alternate_field;
    const field=/oasis/i.test(args.field)?"Oasis":/^atlantic$/i.test(args.field)?"Atlantic":args.field;
    const requested={field,start};
    if(date!=="2026-11-19"||format.toLowerCase()!=="5v5")finding="The organizer fixture only covers 5v5 on 19 Nov 2026. This request is outside it.";
    else if(earliest>latest)finding="The alternative kickoff window is invalid.";
    else{
      await tool("get_opportunities",{});
      let first=await tool("check_field",args.simulate_timeout?{...requested,demo_fault:"venue_timeout"}:requested);
      if(first.code==="DEMO_VENUE_TIMEOUT")first=await tool("check_field",requested);
      if(first.available)slot=requested;
      else{
        const candidate=first.alternatives.find(s=>(allowTime||s.start===start)&&(allowField||s.field===field)&&s.start>=earliest&&s.start<=latest);
        if(candidate&&(await tool("check_field",candidate)).available)slot=candidate;
      }
      if(!slot)finding="No verified slot satisfies the requested constraints. The requested pitch is unavailable.";
      else{
        const organizer=await tool("check_organizer",{start:slot.start});
        roster=await tool("check_players",{start:slot.start});
        if(organizer.available&&roster.eligible_player_ids.length>=10){
          proposal=await tool("save_proposal",{...slot,player_ids:roster.eligible_player_ids.slice(0,10)});
          finding="Draft saved in pending_admin state. Use the demo approval button to release simulated invitations.";
        }else finding="The verified pitch lacks a full eligible roster or an available organizer.";
      }
    }
  }
  if(proposal){
    const answer=proposalSummary(args.reply_locale,proposal,roster);
    if(answer)return {answer,model:pick.model,usage,trace,slot,roster,proposal};
  }
  const rosterFacts=roster?{
    fullMatchWindow:roster.start+":00–"+roster.end+":00",eligible:roster.eligible_player_ids,
    excluded:roster.excluded.map(p=>({id:p.id,reason:p.until<roster.end?"Must leave by "+p.until+":00, before this match ends at "+roster.end+":00.":"Cannot arrive until "+p.from+":00, after kickoff."}))
  }:null;
  const evidence={requestedAction:name,parameters:args,finding,slot,roster:rosterFacts,proposal,prior:name==="inspect_roster"?prior:null};
  messages.push({role:"assistant",content:null,tool_calls:[call]},{role:"tool",tool_call_id:call.id,content:JSON.stringify(evidence)},{role:"system",content:"Answer from the tool result in 75 words or fewer. Cite the actual slot, counts and IDs or ranges, and why players are excluded when known. If a proposal exists, tell the user it is drafted and the on-page button approves simulated invitations. Never ask whether to start drafting. A new organizer check supersedes earlier proposals. If organize_match returns no proposal, no approval button is available. Never offer approval for an older slot. Use only the tool result."});
  const end=await infer(messages,actions,true);usage.push(end.usage);
  return {answer:end.message.content?.trim()||finding,model:end.model,usage,trace,slot,roster,proposal};
}
