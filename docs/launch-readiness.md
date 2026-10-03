# Launch readiness — 2026-09-30

## Current status

**Not production-ready and not mainnet-ready.** The repository is being hardened for a small HTTPS staging/closed pilot only. No deployment, account provisioning, credential use, mainnet transaction, token mint, or push was performed during this review.

## Hardening completed in this review

- Readiness now discovers every numbered migration dynamically, including migration 014, instead of stopping at migration 009.
- Readiness separates core staging checks from optional AI/social provider checks. Use `READINESS_MODE=core` for core staging and `READINESS_MODE=full` only when every enabled integration is provisioned.
- Migration execution is serialized with a PostgreSQL advisory lock to avoid concurrent migration races.
- Studio, native, and optional AI workers now use bounded lease IDs and lease expiry timestamps.
- Stale processing jobs return to the queue only after their lease expires.
- Completion/failure updates require the current lease ID, preventing a stale worker from overwriting a reclaimed job.
- AI credit consumption/refunds are locked and status-guarded so a ledger can move out of `reserved` only once.
- Studio and AI workers wait for active child processes during graceful SIGTERM/SIGINT shutdown; native worker preserves its safe intermediate cleanup and process-group termination behavior.
- Direct URL ingestion validates HTTPS, blocks credentials and non-standard ports, checks DNS results for globally routable addresses, and validates extractor/CDN download URLs before use.
- Private media remains the shared web/worker default. Staging readiness requires `MEDIA_BUCKET`; public bucket access is not required.
- Added migration and regression coverage for fresh schema, native upgrade compatibility, stale leases, stale-worker rejection, and double-settlement prevention.
- Added a Render-specific Dockerfile deployment guide; Compose files are explicitly documented as non-Render staging templates.

## Verification matrix

| Check | Result | Notes |
|---|---|---|
| `npm ci` / locked install | Not rerun in this review | Existing `node_modules` was present; no lockfile change was made |
| `npm run typecheck` | Passed | TypeScript validation passed |
| `npm test` | Passed: 7/7 | Includes FFmpeg, native video, rewards, schema, migration upgrade, worker lease, and token-policy tests |
| `node --test tests/native-video.test.mjs` | Passed | Includes private/link-local and public CDN URL validation tests |
| `node --check` for all three workers | Passed | Studio, native, and AI workers syntax-checked |
| `python3 -m py_compile engine/video.py` | Passed | Python ingestion module compiles |
| `npm run build` | Passed | Next.js production build completed; existing Autoprefixer warnings remain |
| Redacted `READINESS_MODE=core npm run readiness` | Ran and blocked as expected | Reports missing HTTPS origin, OAuth, devnet/RPC setup, database, private bucket, and staging secrets |
| Docker image build | Not run: blocked | `docker` binary is not installed in this sandbox |
| Fresh database migration | Covered by PGlite schema tests | Full numbered migration chain through 014 exercised in tests |
| Upgrade migration | Passed | Legacy provider-job upgrade test passed |
| Live provider/social flows | Not run | Requires founder-owned staging accounts, approvals, and credentials |
| Real private bucket | Not run | No bucket or credentials were provisioned |
| Real Solana flow | Not run | Devnet accounts and signer were not used |

The build emitted existing non-fatal Autoprefixer warnings in the large dashboard/global CSS files. They do not fail the build but should be cleaned up before a polished release.

## Remaining blockers before a closed HTTPS pilot

1. Provision HTTPS/DNS and set `APP_URL` and `STAGING_DOMAIN` consistently.
2. Provision managed PostgreSQL with backups and run `npm run db:migrate` before starting workers.
3. Provision a private R2/S3-compatible bucket and configure identical media settings for web and workers.
4. Configure Google OAuth callback URLs and test login with a consenting staging account.
5. Keep `SOLANA_CLUSTER=devnet`; configure only founder-approved devnet mint/treasury values and a dedicated or rate-limited RPC.
6. Run the Docker build in CI or a host with Docker, then exercise web, render, native, and optional AI worker restarts.
7. Run a real staging journey for upload, render, native clip, signed media read, cleanup, and recovery after termination.
8. If enabling AI, configure OpenAI limits and verify provider errors release credits exactly once.
9. Obtain and test social-provider approvals before enabling any publishing path. Keep TikTok direct posting disabled unless approved and tested.
10. Add edge/IP rate limiting and media malware scanning; database account limits are not a replacement for them.
11. Configure monitoring, alerting, bucket lifecycle rules, database backup restoration, and an incident runbook.
12. Complete legal, licensing, privacy, terms, reward, dispute, and custody review before any public or real-money operation.

## Explicit scope boundary

This review does **not** claim production readiness, mainnet readiness, real-money safety, independent custody, social-provider approval, abuse resistance, or disaster-recovery completion. It stops before deployment and before any GitHub push.
