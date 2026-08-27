# AI Business Admin Dashboard

React + Node.js/Express admin control center for a Facebook/Messenger business AI chatbot.

## Included
- Dashboard statistics and system health
- Live conversation inbox via SSE
- Per-customer AI/Human takeover
- Human reply composer
- Unanswered question review and status
- AI feedback list
- Sales leads list
- AI controls (real backend settings)
- Google Sheets knowledge source status
- Customer view
- Basic admin-key authentication
- Ingest API for the existing chatbot/Facebook backend

## Run locally
1. Copy `.env.example` to `.env` and set a strong `ADMIN_KEY`.
2. Run `npm run install:all`.
3. Run `npm run dev`.
4. Open `http://localhost:5173`.

For a production single-server build:
- `npm run install:all`
- `npm run build`
- `npm start`
- Open `http://localhost:4000`

## Connect your existing chatbot
POST normalized events from your existing Node/Facebook webhook to:
`POST /api/ingest`. If `INGEST_KEY` is configured on the server, also send it in the `x-ingest-key` header.

Example body:
```json
{
  "customerId":"facebook-psid-123",
  "customerName":"Rahim",
  "type":"message",
  "role":"user",
  "content":"delivery charge koto?",
  "messageId":"facebook-event-id",
  "time":"2026-08-28T00:00:00+06:00",
  "unanswered":false,
  "confidence":0.93,
  "handoff":false
}
```

For an unanswered message set `unanswered:true`. For human handoff set `handoff:true`.

## Important integration note
This package is a ready admin-control-center foundation, but it cannot automatically control an unknown existing chatbot until its real backend functions/webhook/database are connected. Replace the in-memory store with the existing project's storage and connect the human-reply endpoint to the existing Facebook Messenger send-message function. Do not expose Facebook, Google, or AI secrets in React.
