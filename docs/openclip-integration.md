# OpenClip / OpusClip integration note

## Verified source

- Official overview: https://help.opus.pro/api-reference/overview
- API reference landing page: https://help.opus.pro/api-reference

The official overview states that the OpusClip API transforms long-form videos into short-form clips, manages each submitted video as a project, and requires an organization API key from an eligible account. The public documentation fetched during the audit did not expose the detailed project request/response schema in static HTML.

## Adapter behavior

PumpClip therefore keeps the provider adapter explicit and server-side:

- `POST {OPENCLIP_API_BASE}/projects`
- JSON body: `source_url`, `instructions`, `aspect_ratio`, optional `webhook_url`
- `GET {OPENCLIP_API_BASE}/projects/:id` for status polling
- `OPENCLIP_API_KEY` or `OPUSCLIP_API_KEY` is never sent to the browser

Before production activation, compare the exact endpoint paths and field names supplied in the customer's provider dashboard/API access package with `lib/openclip.ts`. The adapter fails closed with `OPENCLIP_NOT_CONFIGURED` when no provider credentials are set; local highlight analysis remains available through the existing OpenAI/Whisper worker.
