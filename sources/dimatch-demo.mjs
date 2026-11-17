export const tools = [
  {name:"get_opportunities",description:"Read synthetic player demand and full availability windows.",inputSchema:{type:"object",properties:{},required:[],additionalProperties:false}},
  {name:"check_field",description:"Verify the requested field/hour and obtain an alternative.",inputSchema:{type:"object",properties:{field:{type:"string"},start:{type:"integer"}},required:["field","start"],additionalProperties:false}},
  {name:"check_organizer",description:"Check the organizer's availability.",inputSchema:{type:"object",properties:{start:{type:"integer"}},required:["start"],additionalProperties:false}},
  {name:"check_players",description:"Compute eligible and excluded players for the complete one-hour match at the chosen start. Call after every time change, before save_proposal.",inputSchema:{type:"object",properties:{start:{type:"integer"}},required:["start"],additionalProperties:false}},
  {name:"save_proposal",description:"Persist a valid 5v5 proposal pending human admin approval. Does not send real notifications.",inputSchema:{type:"object",properties:{field:{type:"string"},start:{type:"integer"},player_ids:{type:"array",items:{type:"string"}}},required:["field","start","player_ids"],additionalProperties:false}}
];
export function demand() {
  return {synthetic:true,date:"2026-11-19",timezone:"Africa/Casablanca",requested_field:"Atlantic",requested_start:20,
    players:Array.from({length:14},(_,i)=>({id:`demo-${i+1}`,from:20,until:i<4?21:23}))};
}
export function executeTool(name,args,state) {
  if (!args || typeof args!=="object" || Array.isArray(args)) throw Error("Invalid arguments");
  if (name==="get_opportunities") return demand();
  if (name==="check_field") return {available:args.field==="Oasis"&&args.start===21,alternatives:[{field:"Oasis",start:21}],synthetic:true};
  if (name==="check_organizer") return {id:"demo-organizer",available:args.start===21,synthetic:true};
  if (name==="check_players") {
    if(!Number.isInteger(args.start)||args.start<0||args.start>23) throw Error("Invalid match start");
    const players=demand().players;
    const eligible=players.filter(p=>p.from<=args.start&&p.until>=args.start+1);
    return {synthetic:true,start:args.start,end:args.start+1,eligible_player_ids:eligible.map(p=>p.id),
      excluded:players.filter(p=>!eligible.includes(p)).map(p=>({id:p.id,from:p.from,until:p.until,reason:"Unavailable for complete one-hour match"}))};
  }
  if (name!=="save_proposal") throw Error("Unknown tool");
  if (state.proposal) return state.proposal;
  if (args.field!=="Oasis"||args.start!==21) throw Error("Venue and organizer are unavailable");
  const ids=args.player_ids;
  if (!Array.isArray(ids)||ids.length!==10||new Set(ids).size!==10) throw Error("Exactly ten unique players required");
  const players=demand().players;
  const unavailable=ids.filter(id=>!players.some(p=>p.id===id&&p.from<=args.start&&p.until>=args.start+1));
  if (unavailable.length) throw Error("Player unavailable for the whole match: "+unavailable.join(", ")+". Call check_players for this start, then correct player_ids and retry save_proposal.");
  state.proposal={field:args.field,start:21,player_ids:ids,format:"5v5",organizer:"demo-organizer",status:"pending_admin",synthetic:true};
  return state.proposal;
}
export function humanAction(action,state) {
  if(action==="approve") {
    if(state.status!=="pending_admin"||state.proposal?.status!=="pending_admin") throw Error("No pending proposal");
    state.proposal.status="invited";state.status="invited";
    state.events.push({kind:"demo_notification",payload:{delivery:"local demo inbox only",player_ids:state.proposal.player_ids}});
  } else if(action==="accept") {
    if(state.status!=="invited"||!state.proposal?.player_ids.includes("demo-5")) throw Error("No invitation for demo-5");
    state.proposal.status="accepted";state.status="accepted";
    state.events.push({kind:"accepted",payload:{player_id:"demo-5",simulated:true}});
  } else throw Error("Unknown human action");
  return state;
}
export const instructions="You are DIMATCH's synthetic operations agent. Understand French, English and Darija. Use the MCP tools to read demand, check the requested field and an available alternative, and check the organizer. After a time change revalidate every player's full one-hour window. Save exactly one valid 5v5 proposal. Explain excluded players and await human admin approval. Do not invent IDs or availability. No real notifications or payments. Never approve or accept on behalf of a real player.";

// MCP envelopes remain on the wire; model sees their text payload once, not escaped JSON inside JSON.
export function modelToolContent(result) {
 const text=(result?.content??[]).filter(item=>item.type==="text"&&typeof item.text==="string").map(item=>item.text).join("\n");
 return result?.isError?"TOOL_ERROR: "+text:text;
}
