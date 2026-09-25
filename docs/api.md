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

- `GET /api/v1/social/tiktok` — start TikTok Login Kit consent for `video.upload`.
- `GET /api/v1/social/tiktok/callback` — authorization callback.
- `POST /api/v1/social/tiktok/drafts` — upload an owned MP4 to the TikTok inbox; body `{assetId}`. This does not publish a post.
- `GET /api/v1/social/tiktok/drafts/:id` — fetch provider status and creator inbox/publish state.
- `GET /api/v1/social/youtube/uploads/:id` — check an interrupted resumable session before retrying; never starts a duplicate upload.

## Publishing and proof

- `GET /api/v1/social/connections` — list connected providers without tokens.
- `DELETE /api/v1/social/connections/:provider` — remove locally stored OAuth token and metadata (requires session, origin and CSRF). Revoke the provider grant separately in its account settings.
- `GET /api/v1/social/tiktok/availability` — whether direct publishing has been enabled after approval and testing.
- `GET /api/v1/social/tiktok/creator`, `POST /api/v1/social/tiktok/publish`, `GET /api/v1/social/tiktok/publish/:id` — creator settings, direct publishing and status.
- `GET /api/v1/social/instagram/accounts`, `POST /api/v1/social/instagram/reels`, `GET|POST /api/v1/social/instagram/reels/:id` — Page selection, Reel preparation/status and explicit publish.
- `POST /api/v1/social/x/videos`, `GET|POST /api/v1/social/x/videos/:id` — video upload/status and explicit X post.
- `PATCH /api/v1/campaigns/:id` accepts `proofPolicy: "manual"|"provider"` while draft. `POST /api/v1/campaigns/:id/submissions` accepts optional `publicationId`. When proof is required, publication must belong to the same user and clip, target the campaign's platform and be provider-confirmed as published. Reward approval checks it again.
- `POST /api/v1/submissions/:id/report` accepts `{reason}` and blocks reward approval while a report is open. The operator resolves reports with `npm run reports`.

Provider evidence does not verify views, current post visibility or ongoing ownership. All mutations require session and CSRF protection.
