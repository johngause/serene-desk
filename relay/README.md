# serene-relay

Cloudflare Worker between the site widget and the Zendesk Conversations API. Endpoints: `POST /session`, `POST /message`, `GET /messages`, `POST /tts` (see handoff section 6).

Local: copy `.dev.vars.example` to `.dev.vars`, fill it, `npx wrangler dev`. Deploy: `npx wrangler deploy`, then `npx wrangler secret bulk .dev.vars`.

## AI agent vs human

Every business message has `author.type: "business"`, and the AI agent's `author.displayName` is also "AI agent", so neither tells them apart. The reliable field is `source.type`: the AI agent's messages carry `source.type: "ultimate"` (plus `botId`); customer messages have `author.type: "user"`. Any other business message is treated as `human`. Only the AI path was observed live; a human reply (expected `source.type` of the agent workspace, not `ultimate`) is not yet verified.

## Chips

Quick replies arrive as `content.actions[]` with `type: "reply"`, `text`, `payload`. The relay returns them as `options:[{label,payload}]`. To answer a chip, `POST /message` with `{label, payload}`: the relay posts a plain text message whose text is the label (what the AI agent reads) and attaches the payload. Zendesk accepted it and the AI agent continued the flow.

## TTS

`POST /tts` with `{conversationId, userId, token, messageId}` or `{..., filler: true}`. Returns `audio/mpeg` (streamed, `Cache-Control: no-store`). The relay fetches the message from the caller's own conversation (404 if missing or customer-authored), drops the Sources block, URLs and markdown markers, caps at 1500 chars, and sends it to ElevenLabs. `filler` speaks the fixed FILLER line (keep equal to `voiceFiller` in `site/data/config.json`); arbitrary text is never accepted. ElevenLabs errors return 502 `{error, step:"tts"}`. Limits: shared per-IP limit plus 20/min per conversation. Config: vars `ELEVENLABS_VOICE_ID`, `ELEVENLABS_MODEL` in `wrangler.toml`; secret `ELEVENLABS_API_KEY`.
