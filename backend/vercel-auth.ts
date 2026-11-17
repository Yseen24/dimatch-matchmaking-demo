// A separate trust path lets the original host continue using its own signing key.
import {createRemoteJWKSet,jwtVerify} from "npm:jose@6.1.0";

const team="yassinetannane-9766s-projects";
const issuer="https://oidc.vercel.com/"+team;
const keys=createRemoteJWKSet(new URL(issuer+"/.well-known/jwks"));
export async function isVercelDemo(request:Request):Promise<boolean>{
  const auth=request.headers.get("Authorization");
  if(!auth?.startsWith("Bearer "))return false;
  try{
    const {payload}=await jwtVerify(auth.slice(7),keys,{
      algorithms:["RS256"],issuer,audience:"https://vercel.com/"+team,
      subject:"owner:"+team+":project:dimatch-beta:environment:production",
      requiredClaims:["exp","iat"]
    });
    return payload.owner_id==="team_XWq9na8UH9j5EhDZBXNs7vaX" && payload.project_id==="prj_nIgRM6ufSFzqvwYjJ0WXZA6xLdEz";
  }catch{return false;}
}
