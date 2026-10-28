# serene-relay

Cloudflare Worker between the site widget and the Zendesk Conversations API. Endpoints: `POST /session`, `POST /message`, `GET /messages` (see handoff section 6).

Local: copy `.dev.vars.example` to `.dev.vars`, fill it, `npx wrangler dev`. Deploy: `npx wrangler deploy`, then `npx wrangler secret bulk .dev.vars`.

## AI agent vs human

Every business message has `author.type: "business"`, and the AI agent's `author.displayName` is also "AI agent", so neither tells them apart. The reliable field is `source.type`: the AI agent's messages carry `source.type: "ultimate"` (plus `botId`); customer messages have `author.type: "user"`. Any other business message is treated as `human`. Only the AI path was observed live; a human reply (expected `source.type` of the agent workspace, not `ultimate`) is not yet verified.

## Chips

Quick replies arrive as `content.actions[]` with `type: "reply"`, `text`, `payload`. The relay returns them as `options:[{label,payload}]`. To answer a chip, `POST /message` with `{label, payload}`: the relay posts a plain text message whose text is the label (what the AI agent reads) and attaches the payload. Zendesk accepted it and the AI agent continued the flow.
