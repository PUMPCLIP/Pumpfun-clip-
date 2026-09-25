# PUMPCLIP

Development implementation of a streamer campaign marketplace. Streamers publish licensed source footage and fund campaigns; token eligible clippers join, render or upload clips, and submit them for review. PUMPCLIP is used for eligibility and fees. SOL is the separately tracked campaign pool.

**This is a development build, not a mainnet launch.** The code includes devnet token issuance commands, a guarded award/payout ledger, AI transcription with timed suggestions, YouTube, TikTok, Instagram and X posting paths, wallet connection and a private media storage adapter. None is configured or externally verified in this repository. Read [feature status](docs/feature-status.md), [launch readiness](docs/launch-readiness.md) and the [integration runbook](docs/integrations.md).

## Local setup

Requirements: Node 24, Python 3.10+, PostgreSQL 16 (or Docker), FFmpeg with ffprobe and subtitles/libass support, a Solana devnet wallet. The native video worker installs the pinned `yt-dlp` package from `requirements-video.txt` for public social video URL ingestion.

1. Run `docker compose up -d` or provide a PostgreSQL 16 instance.
2. Copy `.env.example` to `.env.local`. Set `DATABASE_URL`, `APP_URL`, Google OAuth keys, a **devnet** PUMPCLIP mint, token treasury wallet, and SOL custody wallet. The Google redirect URI is `http://localhost:3000/api/v1/auth/google/callback`.
3. Run `npm install`, `npm run db:migrate`, then `npm run dev`.
4. Create a Python environment with `python3 -m venv .venv-video && .venv-video/bin/pip install -r requirements-video.txt`. Run `npm run worker` for manual studio exports; run `PUMPCLIP_PYTHON="$PWD/.venv-video/bin/python" npm run worker:native` for prompt-driven native clips. Both workers must share `DATABASE_URL` and the same private `data/private` volume (or private S3-compatible `MEDIA_BUCKET`). Set `OPENAI_API_KEY` and run `npm run worker:ai` only if transcript/highlight analysis is wanted; native clipping does not require an AI-provider key.

### Privy login and embedded Solana wallets

Set `NEXT_PUBLIC_PRIVY_APP_ID` and `PRIVY_VERIFICATION_KEY` from the Privy Dashboard to enable the production login button. Enable email OTP, Google, Twitter and wallet login in the dashboard. The app configures Solana embedded-wallet creation for users without an existing wallet. The client sends a Privy access token and identity token to `/api/v1/auth/privy`; the server verifies the access token with `@privy-io/node`, provisions the user, creates the normal PUMPCLIP session, and syncs a verified embedded Solana wallet when present. If the Privy variables are absent, the existing Google OAuth and localhost development auth paths remain available.

Migration `010_identity_and_payouts.sql` keeps existing Google users compatible, adds Privy identity fields, allows multiple linked wallets, and creates payout destinations for Phantom, Solflare, Backpack, Axiom, Privy embedded wallets and manually entered Solana addresses. Axiom is represented as a Solana payout rail; it is a non-custodial Solana wallet/trading app, not a public PUMPCLIP payout API.

### Discovery feed, profiles, and AI credits

Migration `011_feed_ai_usage.sql` adds the public `/feed` vertical discovery experience, accepted-work view metrics, creator/clipper reputation scores, metered AI accounts, and administrator credit controls. Migration `012_native_video_clips.sql` replaces the provider project adapter with a native processing queue. The feed is available at `/feed`; creator profiles are available at `/profile/:userId`.

The studio prompt bar submits native asynchronous clip requests to `POST /api/v1/ai/clips`, polled at `GET /api/v1/ai/clips/:id`. Jobs accept a rights-declared, authorized source asset or an HTTPS YouTube, TikTok, Instagram, or X video page; exact time ranges may be entered in the prompt (for example `00:45–01:12`) or use the editor's in/out points. Direct URL submissions require an explicit confirmation that the user owns or has permission to use the video. The self-hosted Python engine uses FFmpeg/ffprobe for probing, audio extraction/chunking, timestamp-accurate cuts, caption burn-in, and 9:16, 1:1, or 16:9 MP4 export. URL ingestion is handled with pinned yt-dlp on the native worker; provider credentials are not used. Intermediates are removed after success or failure, while source/output media remain in private storage.

AI usage costs are currently `1` unit for highlight analysis and `5` units for a native clip job. Each user receives 10 free units on first use; administrators can inspect balances with `GET /api/v1/admin/ai/usage` and top up with `POST /api/v1/admin/ai/usage` using `{userId,units,reason}`. Credits are reserved when a render is queued, consumed when it succeeds, and restored when processing fails. Set `users.is_admin=true` only for an explicitly authorized operator.

For local UI evaluation without Google, set `ALLOW_DEV_AUTH=true` with `SOLANA_CLUSTER=devnet` and `APP_URL=http://localhost:3000`, run `npm run db:seed`, and use the demo sign in buttons. The development users still need real linked devnet wallets and eligible token balances for protected actions. Never enable this mode outside localhost.

The media folder `data/private` is local and excluded from git. It must be persisted/shared by the upload and worker processes; configure private S3-compatible `MEDIA_BUCKET` for multi-container staging. The authenticated media API serves authorized video bytes. URL sources are limited to the supported social domains and 512 MiB / four-hour media limits apply. Deploy the native worker with outbound access restricted to the supported sites where the hosting environment permits it. Add malware scanning and a product-level retention policy before production.

## Checks

```sh
npm run typecheck
npm test
npm run build
```

The schema test uses an in-memory PostgreSQL engine. Full browser and chain tests require a configured devnet mint, wallets, funded treasury, PostgreSQL and Google OAuth. Their absence is a release blocker, not a passing test.

For an externally provisioned HTTPS host, managed PostgreSQL and private bucket, use [the managed staging profile](docs/integrations.md#external-managed-postgresql-and-https-staging). A token policy example is in `config/token-policy.example.json`; execute commands require a reviewed filled policy. Campaigns can require a provider-confirmed post for rewards, while manual review remains available and is explicitly unverified.

## Money and custody

Set the token treasury to a wallet with an associated token account for the configured mint. The browser constructs transfers from the linked wallet; the server verifies confirmed transfers, amounts, owner balance deltas and unique signatures before advancing state. Users can register more than one Solana payout destination, but destination ownership and payout execution must still be verified by the operator payout workflow. The SOL custody address is **platform controlled** and shared across campaigns in this development build. A devnet-only operator payout command exists with a 48-hour hold and ledger reconciliation, but there is no on-chain escrow, automated dispute resolution or refund process. Never accept public money against this build.

Mainnet money endpoints are disabled by configuration. Values are integer raw token units and lamports in the database. Do not reuse development addresses for production.

## Structure

- `app/` responsive marketplace, onboarding, campaign wizard, upload, review and dedicated `/studio/:campaignId` editor
- `app/api/v1/` authenticated versioned API routes
- `lib/` DB, auth, chain verification and access gate
- `db/migrations/` PostgreSQL schema
- `scripts/worker.mjs` manual studio FFmpeg render process
- `scripts/native-worker.mjs` async private worker for Python/FFmpeg native clip jobs
- `engine/video.py` native ingest, audio, range, probe, and preset export engine
- `docs/` release gates, security notes and API outline

## API conventions

Mutation calls require the session cookie, same origin, and `x-csrf-token` from the `pc_csrf` cookie. Money and job creation calls require an `idempotency-key`. Errors use `{code,message,details,requestId}`. The public discovery endpoints are `GET /api/v1/campaigns` and `GET /api/v1/campaigns/:id`. See [API overview](docs/api.md).
