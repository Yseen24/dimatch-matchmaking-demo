import {handleMcp} from "../sources/mcp.mjs";
export default {
  fetch(request){
    const url=new URL(request.url);
    const route=url.searchParams.get("channel")==="external"?"/mcp":"/stage/mcp";
    return handleMcp(new Request(new URL(route,url),request));
  }
};
