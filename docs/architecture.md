# Architecture and deployment

## How a request becomes a proposal

1. The browser sends the current request, recent conversation and selected slot. On Vercel the request goes to the same-origin function in `api/chat.js`.
2. The function passes its short-lived Vercel identity to the DIMATCH Supabase Edge Function. Supabase verifies the issuer, audience, team and production project. The original host continues to authenticate with a signed, short-lived ticket bound to the request body and origin.
3. OpenAI GPT-4.1 mini interprets the message and selects an action such as organizing a match, checking a roster or searching for a player's game. The agent discovers the MCP tools and runs the checks required for that action. Every candidate pitch must satisfy the requested constraints.
4. If a pitch changes, the agent checks the new slot, organizer and each player's availability for the whole hour. Ten eligible players are required to save the 5v5 proposal. The server gives OpenAI the observed results to explain.
5. The UI shows the actual arguments, results and model-reported token usage. A human click releases simulated invitations in the browser tab. An invitation and a player acceptance are separate events.

## Data and cost boundaries

The synthetic scenarios use the format and aggregate context of a completed Casablanca 5v5. Their dates, player IDs, time windows and pitch availability are fixtures. The organizer fixture is dated 19 November 2026. The player search clock starts on 18 November. A fixed fixture makes the outcomes repeatable even when the model phrases an answer differently.

Only the Supabase function reads `OPENAI_API_KEY`. Before each provider call it uses the existing server-only RPC `reserve_dimatch_paid_test_call` to reserve budget. The input size, approved model, output tokens and timeout are bounded. A failed budget check stops the request. The offline replay makes no new model calls.

## Deploy this source to Vercel

The public entry point is `/MCPDEVSUMMIT` on the existing `dimatch-beta` production project. The production app keeps its existing Vite build and fallback route.

1. Run `node scripts/build-mount.mjs /tmp/dimatch-mount`. It writes static demo files under `public/MCPDEVSUMMIT/`, a single isolated function under `api/`, and the route entries in `routes.json`.
2. Copy those files to the production repository and insert the route entries before the existing SPA fallback in its `vercel.json`. Leave its other routes, build command and output directory in place.
3. The production function forwards its Vercel OIDC identity to Supabase. The function in `backend/vercel-auth.ts` validates the team issuer, production subject, owner ID and exact project ID. Vercel holds no OpenAI key. A deployment in another account needs its own authorized backend.
4. Open `/MCPDEVSUMMIT`, send the example request, expand the trace and ask a follow-up. Confirm that 21:00 has ten eligible players. Then keep 22:00 fixed and check that there is no qualifying proposal. The printable sheet, offline copy, code archive and README are all beneath the same route.

## Backend deployment

The existing hosted Edge Function is `dimatch-summit-chat`. Its entry point is `backend/index.ts`; deploy the backend files and the imported modules under `sources/` with their relative paths intact. Gateway JWT verification is disabled for this function because it verifies the request itself. Preserve the original host's public verification key and its signing secret when updating. The Vercel path validates the server-issued OIDC JWT against the team's published keys. Protect private keys and service credentials in server-side secret storage.

For a separate installation, configure the function URL in `sources/ticket.mjs`, set the OpenAI provider and approved model in Supabase, and provide a service-role-only, atomic budget-reservation RPC for the authorized campaign. The original production database and its operational player records are separate from this demo.

## Local checks

Run `npm run build`, `npm test` and `node scripts/vercel-build.mjs`. The tests exercise MCP discovery, insufficient availability, strict kickoff, retryable timeout, player search, offline operation, and the approval gate. They use a model stub for the action-selection test and make no paid calls.

The printable economics sheet is checked in. To regenerate it after editing the assumptions, run `python3 scripts/make-fact-sheet.py` with ReportLab and Liberation Sans installed, then rebuild the app.
