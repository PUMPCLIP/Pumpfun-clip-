# PUMPCLIP

Development implementation of a streamer campaign marketplace. Streamers publish licensed source footage and fund campaigns; token eligible clippers join, render or upload clips, and submit them for review. PUMPCLIP is used for eligibility and fees. SOL is the separately tracked campaign pool.

**This is a development build, not a mainnet launch or a payout service.** R2 reward settlement and payouts, AI transcription, production object storage, and platform imports are not implemented. See [feature status](docs/feature-status.md).

The [launch readiness document](docs/launch-readiness.md) separates the working devnet code from the external configuration and release gates. This app checks a configured PUMPCLIP token balance; it does not create or distribute the token.

## Local setup

Requirements: Node 24, PostgreSQL 16 (or Docker), FFmpeg with ffprobe and subtitles/libass support, a Solana devnet wallet.

1. Run `docker compose up -d` or provide a PostgreSQL 16 instance.
2. Copy `.env.example` to `.env.local`. Set `DATABASE_URL`, `APP_URL`, Google OAuth keys, a **devnet** PUMPCLIP mint, token treasury wallet, and SOL custody wallet. The Google redirect URI is `http://localhost:3000/api/v1/auth/google/callback`.
3. Run `npm install`, `npm run db:migrate`, then `npm run dev`.
4. In another terminal run `npm run worker` for manual clip exports.

For local UI evaluation without Google, set `ALLOW_DEV_AUTH=true` with `SOLANA_CLUSTER=devnet` and `APP_URL=http://localhost:3000`, run `npm run db:seed`, and use the demo sign in buttons. The development users still need real linked devnet wallets and eligible token balances for protected actions. Never enable this mode outside localhost.

The media folder `data/private` is local and excluded from git. It must be persisted for the upload and worker processes. Do not deploy it to a stateless host. Use private object storage and signed URLs before production.

## Checks

```sh
npm run typecheck
npm test
npm run build
```

The schema test uses an in-memory PostgreSQL engine. Full browser and chain tests require a configured devnet mint, wallets, funded treasury, PostgreSQL and Google OAuth. Their absence is a release blocker, not a passing test.

## Money and custody

Set the token treasury to a wallet with an associated token account for the configured mint. The browser constructs transfers from the linked wallet; the server verifies confirmed transfers, amounts, owner balance deltas and unique signatures before advancing state. The SOL custody address is **platform controlled** and shared across campaigns in this development build. There is no deployed on-chain escrow program and no implemented payout or refund process. Never accept public money against this build.

Mainnet money endpoints are disabled by configuration. Values are integer raw token units and lamports in the database. Do not reuse development addresses for production.

## Structure

- `app/` responsive marketplace, onboarding, campaign wizard, upload, review and dedicated `/studio/:campaignId` editor
- `app/api/v1/` authenticated versioned API routes
- `lib/` DB, auth, chain verification and access gate
- `db/migrations/` PostgreSQL schema
- `scripts/worker.mjs` independent FFmpeg job process
- `docs/` release gates, security notes and API outline

## API conventions

Mutation calls require the session cookie, same origin, and `x-csrf-token` from the `pc_csrf` cookie. Money and job creation calls require an `idempotency-key`. Errors use `{code,message,details,requestId}`. The public discovery endpoints are `GET /api/v1/campaigns` and `GET /api/v1/campaigns/:id`. See [API overview](docs/api.md).
