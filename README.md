# DIMATCH Matchmaking Demo

Imagine you and nine friends want to play football. The field is busy at ten. DIMATCH looks for another time, checks who can stay for the whole game, and shows you a team. You decide whether to invite them.

## Try it

Open [the demo](https://dimatch.ma/MCPDEVSUMMIT), choose **Live agent** and send the example, or write a request in your own words.

> Can we organize a 5v5 at Oasis at 22:00? If the pitch is unavailable, find an alternative and show who can stay.

In the fictional Casablanca schedule, Oasis is free from 21:00 to 22:00. Players demo-5 through demo-14 can stay. Players demo-1 through demo-4 must leave by 21:00. Ask “Who has to leave, and why?” to inspect the roster. Change the request to “Keep 22:00 fixed” to see how a hard time constraint affects the result. Approval creates invitations in the current tab's demo inbox. The players are fictional.

The **Guided replay** follows a previously recorded OpenAI decision sequence. **Unit economics** explains the recorded model usage and the assumptions behind the cost estimates. The offline download runs the replay and manual checks on the device. Live conversations require a network connection.

## Run locally

Use Node.js 22 or newer. The application and its tests use built-in Node modules.

```sh
npm run build
npm test
npm run dev
```

Open http://localhost:5173. The local replay and manual checks run immediately. Live local chat requires the authorized host's private signing key in the server environment. The deployed OpenAI key stays in Supabase.

## Inspect the code

| File | What to look for |
| --- | --- |
| [backend/agent.mjs](backend/agent.mjs) | OpenAI action selection, follow-ups and the sequence of MCP checks |
| [sources/dimatch-demo.mjs](sources/dimatch-demo.mjs) | Synthetic schedule, full-hour player eligibility and proposal validation |
| [sources/mcp.mjs](sources/mcp.mjs) | MCP discovery, argument validation and JSON-RPC responses |
| [backend/index.ts](backend/index.ts) | OpenAI requests, authentication, budget reservation and token counts |
| [sources/chat.js](sources/chat.js) | Conversation, evidence display and the human approval button |
| [scripts/summit.test.mjs](scripts/summit.test.mjs) | Runnable examples covering hard constraints, fallback, roster and approval |

See [Architecture and deployment](docs/architecture.md) for the server boundaries, Vercel setup and verification steps.
