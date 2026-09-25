# Integration runbook (2026-09-25)

## Wallet and token

Wallet linking signs a five-minute account-bound challenge in the browser. Phantom and Solflare injected providers are detected separately; other injected Solana wallets are accepted if they implement `connect`, `signMessage`, and `signAndSendTransaction`. Pump.fun is a token launch/trading site, not a wallet provider. A wallet used there can link if its extension exposes a compatible provider. We have not verified a product called “Sofia”; test its API before advertising support. The UI does not request seed phrases.

Token issuance is deliberately an operator command, never a public API. Set `SOLANA_CLUSTER=devnet`, supply a funded devnet signer in a permission-restricted keypair file (`chmod 600`), then:

```sh
node scripts/token.mjs create --keypair /secure/issuer.json
node scripts/token.mjs create --keypair /secure/issuer.json --policy config/token-policy.json --execute
```

Before either execute command, copy `config/token-policy.example.json` to `config/token-policy.json`, fill the founder-approved maximum supply, authority and treasury addresses, holder thresholds, fees and reviewer, then run `npm run token:policy -- config/token-policy.json`. The example intentionally fails validation. The real mint address is printed only after confirmation. Record it, verify it independently, then configure `PUMPCLIP_MINT` and matching `PUMPCLIP_DECIMALS`. Distribution accepts JSON allocations such as `[{"address":"recipientPublicKey","amount":"100.0"}]`. Preview and review every allocation, then run `node scripts/token.mjs distribute --keypair /secure/issuer.json --mint ADDRESS --allocations /secure/allocations.json --policy config/token-policy.json --execute`. The operator script verifies mint authority, decimals and the approved supply cap, then prints each confirmed signature. An interrupted distribution must be reconciled on chain before retry because replaying the entire list would duplicate mints. Protect issuer authority with offline custody. The script neither creates a Pump.fun token launch nor performs mainnet issuance; vesting, authority policy, metadata, legal terms, ownership and final tokenomics require founder approval. A file policy is not a production issuance audit.

## SOL reward operations

Approving a submission reserves its fixed reward against the campaign’s confirmed funding ledger. The reward stays held for 48 hours; a clipper can dispute during the hold via `POST /api/v1/rewards/:id/dispute`. An operator reviews the campaign, rights, wallet and fraud evidence, and uses a devnet custody signer that matches `SOL_TREASURY`:

```sh
node scripts/payout.mjs inspect --award UUID
node scripts/payout.mjs release --award UUID --execute
node scripts/payout.mjs pay --award UUID --keypair /secure/custody.json
node scripts/payout.mjs pay --award UUID --keypair /secure/custody.json --execute
node scripts/payout.mjs reconcile --award UUID
node scripts/payout.mjs reconcile --award UUID --execute
```

`pay` saves the exact signed transaction before network broadcast. If broadcast or confirmation is uncertain, inspect that signature and reconcile manually. Never create a replacement transaction blindly. Reconciliation checks the confirmed system transfer recipient, source and lamports, then atomically moves reserved to paid. This is a devnet operational path with a shared platform custody address, not production escrow. No automated dispute adjudication, refunds, fraud detection or independent custody audit exists.

## AI clipping

Configure `OPENAI_API_KEY`, run `npm run worker:ai`, and let an eligible campaign member request analysis in the studio. The worker extracts mono audio in ten-minute chunks, sends it to Whisper with segment timestamps, and ranks 15–90 second spoken passages using local narrative signals. Sources above 60 minutes are rejected to bound cost. Suggested captions and cuts must be reviewed by the clipper. The key is server-side. The worker needs FFmpeg and access to the private media bucket.

## Social publishing

The separate **YouTube upload** OAuth flow requests `youtube.upload`, uses PKCE, stores an AES-256-GCM encrypted refresh token, and uploads a rendered clip as **private**. A database reservation prevents repeated uploads of the same asset. Interrupted sessions can be checked without starting a second upload; automatic resume of incomplete bytes is not yet implemented. Configure Google OAuth redirect URI `${APP_URL}/api/v1/social/youtube/callback` in addition to the sign-in callback; set `SOCIAL_TOKEN_KEY` to 32 random bytes in base64. YouTube may restrict uploads from unverified API projects to private visibility.

TikTok draft upload requests `video.upload` via Login Kit at `${APP_URL}/api/v1/social/tiktok/callback`. Configure `TIKTOK_CLIENT_KEY` and `TIKTOK_CLIENT_SECRET`, register the redirect URI, and have TikTok approve `video.upload` in the app console. The creator finishes a draft in their inbox. Direct posting requests `video.publish` in addition, queries creator settings immediately before uploading, requires explicit privacy and disclosure choices, then tracks the publish ID. TikTok's app audit is required to remove unaudited client limits. Obtain both scopes, demonstrate the actual UI and consent flow for the platform review, and run a real consenting account test. Neither approval nor test can be performed with repository code alone. Direct posting stays disabled with `TIKTOK_DIRECT_POST_ENABLED=false` until those steps pass; set it to `true` only after approval and test.

Instagram Reels uses Facebook Login for a linked professional Instagram account and Page. Register `${APP_URL}/api/v1/social/instagram/callback`, configure `META_APP_ID`, `META_APP_SECRET`, `META_GRAPH_VERSION`, and request the Pages and Instagram publishing permissions in Meta App Review for users outside app roles. The app lists Pages with `CREATE_CONTENT`, signs a temporary private-bucket URL for Meta's video fetch, creates a Reel container, waits for `FINISHED`, and only then posts with explicit consent. The bucket endpoint must be reachable from Meta via HTTPS, even though the bucket remains private. Verify the MP4 format and expiration for your largest clips, actual account permissions and Page linkage. A failed or uncertain publish requires manual inspection on Instagram before any retry.

X uses OAuth2 PKCE with `tweet.read`, `tweet.write`, `users.read`, `media.write`, `offline.access`. Register `${APP_URL}/api/v1/social/x/callback`, set `X_CLIENT_ID` and `X_CLIENT_SECRET`, and ensure the X project has media upload and post access. Upload is chunked and processing is checked before an explicit post action. A failed or uncertain post requires manual inspection on X before any retry. Platform quotas and video duration limits depend on the X account and project.

All provider tokens are encrypted with `SOCIAL_TOKEN_KEY`. One publication per rendered asset and provider is reserved in the database to suppress duplicate submissions. Failed reservations before provider initiation may be retried; uncertain provider operations are deliberately not retried automatically. Social post URLs and viewing metrics are not verified for campaign rewards. A submitted post URL is user provided and not proof of identity, ownership or views.

The account settings screen lists connected providers and can delete their locally stored tokens. Disconnecting does not remove posts or revoke the provider's grant; users must revoke PUMPCLIP in the provider's own account settings as well. Campaigns can select manual review or require a provider-confirmed post. Provider proof links the same clip asset, clipper, target platform and recorded published ID; it is still not an independent proof of live views or that the post remains online. Existing and default campaigns use manual review. An open content report blocks reward approval until an operator inspects and resolves it with `npm run reports -- list` and `npm run reports -- resolve REPORT_ID reviewed|dismissed`.

The studio offers classic, bold and signal caption presets and burns the selected style into the MP4. Database-backed per-account limits apply to uploads, renders, social posting and reports. They do not replace IP-based edge limits or a media malware scanner.

## Staging infrastructure

Provision an HTTPS domain, managed PostgreSQL 16 with backups, a private S3-compatible bucket, dedicated Solana RPC, Google OAuth keys, AI provider key and token encryption key. Set `APP_URL` to the exact HTTPS origin and `DATABASE_URL` to the database service. Copy `.env.example` to `.env.deploy` and fill every required value without committing it. Run `docker compose --env-file .env.deploy -f compose.deploy.yml up --build -d`. It runs migrations, the web app, render worker, AI worker and a PostgreSQL container, exposing port 3000 only on loopback. Add a TLS reverse proxy, durable database backups, bucket lifecycle/retention, logs/metrics/alerts, secret rotation, media scanning and a restore test before public traffic. The compose file is a staging template and is not a provisioned production deployment.

Run `npm run readiness` in staging to check configuration, schema, RPC cluster, bucket and FFmpeg. This is a preflight check, not an end-to-end test. Use distinct live Google accounts, separate wallets and real platform approvals for the manual staging journey; those credentials are not present in this repository.

### External managed PostgreSQL and HTTPS staging

`compose.managed.yml` runs migrations, the app, render and AI workers against the managed `DATABASE_URL`, with Caddy terminating HTTPS. It does **not** order a domain, create a database or bucket, configure DNS, or provide backups. Purchase or use a domain you control, set an `A` record for a staging subdomain to the host's public IPv4 (and `AAAA` only if IPv6 reaches the host), and allow inbound ports 80 and 443. Caddy obtains and renews its certificate when DNS reaches the host. Set `STAGING_DOMAIN=staging.your-domain.example`, `APP_URL=https://staging.your-domain.example`, and a managed PostgreSQL URL using `sslmode=require` or stricter. Obtain provider-specific CA configuration when using `verify-full`; create managed backup schedules and test restoration in the provider console. Configure the bucket, provider redirect URIs and secrets, then run:

```sh
docker compose --env-file .env.deploy -f compose.managed.yml up --build -d
docker compose --env-file .env.deploy -f compose.managed.yml exec web npm run readiness
APP_URL=https://staging.your-domain.example npm run smoke
```

The `npm run smoke` check verifies HTTPS health, public campaign shape and a protected route without an account. It does not test wallet, provider posting, payouts or backups. Do those manually with consenting pilot accounts. Do not paste or commit `.env.deploy`, private keys or credentials.
