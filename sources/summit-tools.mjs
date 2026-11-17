import {tools} from "./dimatch-demo.mjs";
// Read-only player fixtures share the open/forming states used by the DIMATCH player demo.
export const playerSearch = {
  name:"search_player_matches",
  description:"Search fictional Casablanca football for an individual player. The demo clock is 18 November 2026, before evening kickoff. On 18 Nov Oasis has an existing 5v5 at 21:00; on 19 Nov it has a forming game. Other inputs may have no compatible match. A search never joins, registers or sends an invitation.",
  inputSchema:{type:"object",properties:{date:{type:"string"},zone:{type:"string"},start:{type:"integer"},end:{type:"integer"},format:{type:"string",enum:["5v5","7v7","flexible"]}},required:["date","zone","start","end","format"],additionalProperties:false}
};
export function searchPlayer(args){
  const {date,zone,start,end,format}=args;
  if(!/^\d{4}-\d{2}-\d{2}$/.test(date)||!Number.isInteger(start)||!Number.isInteger(end)||start<0||end>24||end<=start||!["5v5","7v7","flexible"].includes(format))throw Error("Supply a valid date, format and full-hour window.");
  const oasis=zone.trim().toLowerCase()==="oasis";
  const fits=oasis&&format!=="7v7"&&start<=21&&end>=22;
  const category=fits&&date==="2026-11-18"?"existing":fits&&date==="2026-11-19"?"forming":"no_match";
  const base={synthetic:true,category,date,request_saved:false,joined:false};
  if(category==="no_match")return {...base,next_action:"Ask the player whether to record availability. This tool only searches."};
  const slot={field:"City Foot 5 Oasis",start:21,end:22,format:"5v5",capacity:10};
  return category==="existing"?{...base,...slot,confirmed:9,open_places:1,next_action:"Offer the open place for the player to request."}:{...base,...slot,interested:6,next_action:"Offer to record interest in the forming match."};
}
export function summitDefinitions(){
  return [...tools.map(t=>{
    if(t.name==="save_proposal")return {...t,description:"Validate a synthetic proposal pending human review. Return its review link to the organizer, who rechecks it and explicitly approves in the browser. No model tool sends invitations."};
    if(t.name!=="check_field")return t;
    return {...t,description:t.description+" To demonstrate a failure when explicitly requested, set demo_fault to venue_timeout once. Retry the same read without demo_fault.",
      inputSchema:{...t.inputSchema,properties:{...t.inputSchema.properties,demo_fault:{type:"string",enum:["venue_timeout"]}}}};
  }),playerSearch].map(t=>{
    const properties={...t.inputSchema.properties};
    for(const [key,last] of [["start",23],["end",24]])if(properties[key]){
      properties[key]={...properties[key],minimum:0,maximum:last,description:"Whole local clock hour. Example: 22:00 is the integer 22."};
    }
    if(properties.field)properties.field={...properties.field,description:"Venue label such as Oasis or Atlantic."};
    return {...t,inputSchema:{...t.inputSchema,properties}};
  });
}
