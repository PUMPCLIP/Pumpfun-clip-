# API overview

All paths are under `/api/v1`. Public: `GET /campaigns` and `GET /campaigns/:id` (live only). Private reads: `GET /me`, `GET /me/campaigns`, `GET /me/joined`, `GET /sessions`, `GET /campaigns/:id/submissions` (owner), `GET /assets/:id` (owner/member/reviewer), `GET /studio/:id`.

Auth: `GET /auth/google/start`, `GET /auth/google/callback`, `POST /auth/logout`, `POST /me/roles`, `POST /wallet/challenge`, `POST /wallet/verify`, `POST /sessions/:id/revoke`. `POST /auth/dev` is restricted to explicit localhost devnet mode.

Campaigns: `POST /campaigns`, `PATCH /campaigns/:id` (draft owner), `POST /campaigns/:id/publish`, `POST /campaigns/:id/join`, `POST /campaigns/:id/submissions`, `POST /submissions/:id/review`.

Payments: `POST /fees/intents` with `{campaignId,purpose}`, `POST /fees/:id/verify` with `{signature}`, `POST /campaigns/:id/funding-intents` with `{lamports}`, and `POST /funding-intents/:id/verify` with `{signature}`. Verification requires a confirmed matching devnet transaction.

Media: `POST /uploads` multipart form with `file`, `kind` (`source` or `clip`), and `rightsDeclared=true` for sources. `POST /studio` takes `{campaignId,start,end,caption}` and queues a render. `GET /studio/:id` polls its result.

Money and studio POSTs require `idempotency-key`. All private mutations require `x-csrf-token` and an exact matching origin. HTTP errors return `{code,message,details,requestId}`. The public list paginates with a `cursor` timestamp. An OpenAPI contract remains to be authored before an external API integration.

## Added integration routes (2026-09-25)

- `GET /api/v1/me/rewards` — clipper's award ledger and payout signatures.
- `POST /api/v1/rewards/:id/dispute` — hold a pending reward for review; body `{reason}`.
- `POST /api/v1/ai` — queue one transcript per campaign source for a joined clipper; body `{campaignId}`.
- `GET /api/v1/ai/:id` — joined clipper's transcript, timestamped suggestions and job status.
- `GET /api/v1/social/youtube` — start separate YouTube upload authorization.
- `GET /api/v1/social/youtube/callback` — Google OAuth callback.
- `POST /api/v1/social/youtube/publish` — upload an owned rendered clip privately; body `{assetId,title,description}`.
- `GET /api/health` — PostgreSQL liveness (no secrets in response).

All mutation routes require same-origin session and CSRF. AI requests require holder access and membership. Award release and payout have **no public API**; devnet operator commands are described in [the integration runbook](integrations.md).
