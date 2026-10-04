# Railway migration guide

## Recommendation

Railway is the recommended Render replacement for PumpClip because the repository already has a Dockerfile and needs more than a static Next.js host:

- Next.js 15 standalone web runtime
- PostgreSQL and numbered migrations
- FFmpeg/Python video processing inside the image
- Separate long-running render, native-video, and optional AI workers
- Private networking and a custom domain

The latest tested source commit is `e053721` (`Serve standalone Next assets in Docker`).

Railway pricing is usage-based. Its official pricing page currently lists a free trial with $5 credits, then a Hobby plan with a $5 monthly minimum plus usage; compute, storage, and egress can increase the bill. Do not treat the trial as production capacity.

## Create the Railway project

1. Create an account at [railway.com](https://railway.com/).
2. Create a new project from GitHub.
3. Select `PUMPCLIP/Pumpfun-clip-` and branch `main`.
4. Railway will detect `railway.json` and build with the repository `Dockerfile`.
5. Use a region close to the majority of users.
6. Generate a Railway public domain for the first smoke test.

The root `railway.json` configures the web service:

- Dockerfile build
- `npm run db:migrate` as the pre-deploy migration
- `npm run start` for the standalone Next.js server
- `/api/health` as the health check
- restart on failure

## Add PostgreSQL

Inside the same Railway project:

1. Add a PostgreSQL service from Railway's database template.
2. Link/reference its `DATABASE_URL` in the web and worker services.
3. Run the first deployment only after the database variable is available.
4. Confirm migrations complete before enabling workers.

The application is not fully functional without this database. The migration command is intentionally run before each web deployment, and the migration runner uses a PostgreSQL advisory lock.

## Web-service variables

Set these in the web service. Use Railway's reference-variable syntax for the Postgres service where appropriate.

```text
APP_URL=https://pumpclip.app
DATABASE_URL=${{Postgres.DATABASE_URL}}
SOLANA_CLUSTER=devnet
SOLANA_RPC_URL=https://api.devnet.solana.com
ALLOW_DEV_AUTH=false
READINESS_MODE=core
VIDEO_WORKDIR=data/private/native-clips

NEXT_PUBLIC_PRIVY_APP_ID=<Privy app id>
PRIVY_VERIFICATION_KEY=<Privy verification key>
GOOGLE_CLIENT_ID=<Google OAuth client id>
GOOGLE_CLIENT_SECRET=<Google OAuth client secret>

MEDIA_BUCKET=<private R2 bucket name>
MEDIA_REGION=auto
MEDIA_ENDPOINT=https://<account-id>.r2.cloudflarestorage.com
MEDIA_ACCESS_KEY_ID=<R2 access key id>
MEDIA_SECRET_ACCESS_KEY=<R2 secret access key>
MEDIA_SSE=AES256
SOCIAL_TOKEN_KEY=<32 random bytes encoded as base64>
```

Add the Solana treasury and token values only after creating the intended devnet configuration:

```text
PUMPCLIP_MINT=<devnet mint>
PUMPCLIP_DECIMALS=6
STREAMER_MIN_RAW=1
CLIPPER_MIN_RAW=1
STREAMER_FEE_RAW=1000000
CLIPPER_FEE_MIN_RAW=0
CLIPPER_FEE_MAX_RAW=1000000000
TOKEN_TREASURY=<devnet token treasury>
SOL_TREASURY=<devnet SOL treasury>
MIN_FUNDING_LAMPORTS=10000000
```

Keep these disabled until each provider is approved and tested:

```text
TIKTOK_DIRECT_POST_ENABLED=false
```

Do not commit populated secrets, signer keypairs, OAuth secrets, or `.env.deploy`.

## Add workers

Create additional Railway services from the same GitHub repository and Dockerfile. Override only the start command for each service:

| Service | Start command | Notes |
|---|---|---|
| Web | `npm run start` | Public service; attach custom domain |
| Render worker | `npm run worker` | Video render queue; same `DATABASE_URL` and media variables |
| Native worker | `npm run worker:native` | Native FFmpeg/video queue; use more memory for larger videos |
| AI worker | `npm run worker:ai` | Optional; requires `OPENAI_API_KEY` and usage controls |

Each worker must receive the same database, media, and relevant application variables. Do not expose worker services publicly.

Railway's free trial has a small service limit, so start with **web + PostgreSQL** for the first smoke test, then add the native/render workers as budget and resource limits are confirmed. The AI worker should be added last.

## Domain setup

After the Railway web service is healthy:

1. Open the web service's **Settings → Networking → Custom Domains**.
2. Add `pumpclip.app` and, optionally, `www.pumpclip.app`.
3. Copy the CNAME target Railway provides.
4. In Cloudflare DNS, set:

```text
Type: CNAME
Name: @
Target: <Railway-provided-domain>
Proxy: DNS only during initial verification
```

For `www`, use the Railway target or a CNAME to `pumpclip.app` according to Railway's displayed instructions. After HTTPS is issued and verified, Cloudflare proxying can be enabled if desired.

Keep `APP_URL` exactly equal to `https://pumpclip.app`, with no trailing slash. Update Google/Privy/social callback URLs to the same domain.

## Verification checklist

Run these after the web service deploys:

```sh
curl -I https://pumpclip.app/
curl -i https://pumpclip.app/api/health
curl -I https://pumpclip.app/_next/static/<asset-from-homepage>.css
```

Expected results:

- Homepage: HTTP 200
- CSS/JS assets: HTTP 200
- `/api/health`: HTTP 200 only after PostgreSQL and required core variables are configured
- `READINESS_MODE=core npm run readiness`: no core blockers

A successful homepage alone does not prove account creation, AI clipping, Solana rewards, private media, or worker processing are configured.
