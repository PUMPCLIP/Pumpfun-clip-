# Render closed-pilot staging guide

This guide is for a **small HTTPS staging/closed pilot only**. It does not make PumpClip production-money or mainnet ready.

## Render service layout

Create separate Render services from the repository Dockerfile. Render does **not** deploy `docker-compose.yml`, `compose.deploy.yml`, or `compose.managed.yml` directly.

| Service | Render type | Docker command | Initial resource assumption |
|---|---|---|---|
| `pumpclip-web` | Web Service | `npm run start` | 1 CPU / 512 MB for low traffic; use 2 GB if Next.js requests or API work are memory-heavy |
| `pumpclip-render-worker` | Background Worker | `npm run worker` | 2 GB recommended for FFmpeg studio renders |
| `pumpclip-native-worker` | Background Worker | `npm run worker:native` | 2–4 GB depending on concurrent source/clip sizes |
| `pumpclip-ai-worker` | Background Worker, optional | `npm run worker:ai` | Start only when `OPENAI_API_KEY` is provisioned and AI credits/limits are understood |
| `pumpclip-db` | Render PostgreSQL | managed database | Start with the smallest paid plan that supports backups and the pilot connection count |

Use the same GitHub repository, Dockerfile, region, and environment group for the web service and workers. Set the web service health check to `/api/health`.

## Required environment variables

Copy `.env.example` into a secret-management workflow; do not commit a populated file. At minimum, configure:

- `APP_URL=https://staging.example.com`
- `DATABASE_URL` from Render PostgreSQL; use TLS where supported
- `STAGING_DOMAIN=staging.example.com`
- `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET`
- `SOLANA_CLUSTER=devnet`
- `SOLANA_RPC_URL` for a dedicated or appropriately rate-limited devnet RPC
- `PUMPCLIP_MINT`, `TOKEN_TREASURY`, `SOL_TREASURY` using devnet-only values
- `PUMPCLIP_DECIMALS` and the fee/threshold settings
- `MEDIA_BUCKET`, `MEDIA_REGION`, `MEDIA_ENDPOINT`, `MEDIA_ACCESS_KEY_ID`, `MEDIA_SECRET_ACCESS_KEY`
- `MEDIA_SSE=AES256` where supported by the storage provider
- `VIDEO_WORKDIR=data/private/native-clips`
- `SOCIAL_TOKEN_KEY` as exactly 32 random bytes encoded as base64 if any social connection is enabled
- Provider credentials only for integrations deliberately enabled in the pilot
- `OPENAI_API_KEY` only for the optional AI worker

Keep `ALLOW_DEV_AUTH=false` on HTTPS staging. Never place Solana signer keypairs, OAuth secrets, or an `.env.deploy` file in Git.

## Private R2-compatible media

Use a private Cloudflare R2 bucket or another S3-compatible private bucket. Configure the **same bucket, endpoint, region, and credentials** on the web service and every worker. The application uses signed media access and server-side bucket access; it does not require a public bucket.

Recommended controls:

- Block public bucket access.
- Use a bucket CORS policy only for the exact staging origin if browser uploads require it.
- Set lifecycle rules for abandoned uploads, temporary objects, and old failed-job artifacts.
- Keep source videos and rendered clips in separate prefixes if operational retention differs.
- Test a signed URL expiration and an unauthorized object read before inviting pilot users.
- Monitor storage and request usage; video egress and AI processing can exceed compute costs.

## Migration-before-worker ordering

Render services start independently, so do not rely on a Compose `depends_on` relationship. Run migrations as a one-off job or Render deploy hook before enabling web and workers:

```sh
npm ci
npm run db:migrate
```

The migration runner uses a PostgreSQL advisory lock and dynamically applies every numbered migration in `db/migrations`. After migrations succeed, deploy/restart the web service and workers. Run:

```sh
READINESS_MODE=core npm run readiness
```

Use `READINESS_MODE=full` only when AI and every enabled social provider have valid staging credentials and approvals.

## DNS and HTTPS

1. Choose a staging subdomain such as `staging.example.com`.
2. Point its DNS record to the Render web-service hostname using Render's documented custom-domain flow.
3. Set `APP_URL` to the exact HTTPS origin, with no trailing path.
4. Set `STAGING_DOMAIN` to the exact hostname.
5. Configure the same OAuth callback origin in Google and any social-provider consoles.
6. Verify `/api/health` over HTTPS before opening the pilot.

Render provides TLS for the configured custom domain. The repository Caddy files are for a VPS/Compose staging profile, not a Render deployment.

## Backups and recovery

- Enable managed PostgreSQL backups and verify a restore into a separate staging database.
- Keep bucket versioning/lifecycle policy appropriate to the pilot.
- Export migration status and application logs before schema changes.
- Practice a worker restart during a queued and an actively processing job.
- Confirm stale leases return jobs to the queue without consuming/refunding AI credits twice.

## Pilot boundaries

- Devnet only; no mainnet minting or real-money payouts.
- Closed pilot with consenting accounts and licensed media.
- Provider publishing remains disabled until each provider's approval and live test are complete.
- Readiness output is a preflight, not an end-to-end proof of payment, social publishing, backup restore, or abuse resistance.
- Use edge rate limiting, media scanning, alerting, and a manual incident/recovery procedure before widening access.
