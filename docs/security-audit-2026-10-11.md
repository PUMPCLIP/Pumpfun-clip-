# PumpClip Security and Vulnerability Audit

**Audit date:** 2026-10-11  
**Scope:** current `main` codebase, authentication/session controls, Solana payment/trading/withdrawal flows, AI credit accounting, API routes, deployment configuration, and npm dependency advisories.

## Executive summary

The application passed its compile, type, and unit-test checks after the annual-plan change:

- `npm run typecheck` — passed
- `npm test` — **14/14 passed**
- `npm run build:render` — passed
- `git diff --check` — passed

The audit identified **44 npm audit findings** in the installed dependency graph: **23 high, 21 moderate, 0 critical**. These are primarily transitive Solana/wallet/mobile SDK findings plus `bigint-buffer`, `braces`, `toml`, `uuid`, and related packages. Automatic remediation requires semver-major upgrades to core Solana, Pump.fun, Privy, and wallet SDK packages; those upgrades were not applied blindly because they can change transaction-building and wallet behavior.

The application-level controls reviewed for money-moving paths are materially stronger than the dependency result suggests: protected mutations use the server session, strict Origin validation, and CSRF tokens; treasury withdrawal validates that the private key matches the public treasury; deposits are checked against the configured Solana RPC and exact wallet/treasury transfer; and idempotency/advisory locking prevents duplicate credit withdrawals.

## Findings

### High — dependency advisories require planned upgrades

`npm audit --omit=dev` reports 44 findings. Important paths include:

- `@pump-fun/pump-sdk`, `@pump-fun/pump-swap-sdk`, `@coral-xyz/anchor`, and Solana token packages.
- `bigint-buffer` buffer-overflow advisory (`GHSA-3gc7-fjrx-p6mg`).
- `toml` uncontrolled recursion and prototype-pollution advisories (`GHSA-82x6-q7mm-w9cf`, `GHSA-v5mp-jgw5-2x6j`).
- `braces` stack-exhaustion advisory (`GHSA-vfj7-8cjw-p6xm`).
- `uuid` bounds-check advisory (`GHSA-w5hq-g745-h8pq`).
- Privy/wallet/mobile SDK transitive advisories.

**Current mitigation:** dependency audit output remains visible in the Render build, but only critical advisories block deployment. The application validates untrusted inputs with Zod, uses bounded transaction/media inputs, and does not expose arbitrary package parsing endpoints.

**Recommended next action:** create a dependency-upgrade branch and test the recommended major upgrades one family at a time, beginning with the direct Solana/Pump SDKs. Do not use `npm audit fix --force` in production without transaction, wallet, and devnet regression tests.

### Medium — baseline HTTP hardening added

The Next.js configuration now emits:

- `X-Content-Type-Options: nosniff`
- `X-Frame-Options: DENY`
- `Referrer-Policy: strict-origin-when-cross-origin`
- `Permissions-Policy` disabling camera, microphone, and geolocation
- HSTS for HTTPS deployments

A restrictive CSP was intentionally not added automatically because wallet adapters and external authentication providers need an explicit allowlist; CSP should be introduced separately with report-only testing first.

### Passed — session, CSRF, and Origin controls

`mutation(request)` requires:

1. an unrevoked, unexpired HttpOnly `pc_session` cookie;
2. an exact Origin match with the configured application URL; and
3. a matching `x-csrf-token` against the server-side session hash.

Session and CSRF cookies use `secure` on HTTPS, `SameSite` (`lax`/`strict`), and a seven-day expiry.

### Passed — Solana plan-payment verification

The 2 SOL plan flow:

- binds payment intent creation to the authenticated user and linked primary wallet;
- requires a unique idempotency key;
- verifies the submitted transaction on the configured Solana RPC;
- requires the exact sender, treasury recipient, signer, and minimum lamport amount;
- activates the plan only after the on-chain check succeeds; and
- uses a unique signature plus a verified intent state to prevent replay activation.

Users are shown the amount, network, recipient, and wallet before approval. The transfer is irreversible, so the UI correctly asks the user to verify those details in their wallet.

### Passed — withdrawal controls

The withdrawal endpoint:

- requires authentication, Origin, CSRF, and a UUID idempotency key;
- uses only the linked primary wallet as destination;
- checks the configured treasury private key derives the configured `SOL_TREASURY` address;
- locks the user’s accrued earnings with a PostgreSQL advisory lock;
- reserves ledger rows before broadcast;
- persists the signed transaction for safe retry; and
- releases reserved earnings if the transaction fails or expires.

### Passed — trade controls

Trade build and submit require the linked primary wallet. Signed transactions are checked against the stored trade intent message hash, and later reconciliation verifies signer, memo, token movement, and attributed treasury fee before writing earnings.

### Passed — media and URL validation

Upload and clipping paths enforce file-size/type limits, rights confirmation for remote sources, HTTPS-only allowlisted source domains, bounded clip ranges, and safe media-path resolution. The FFmpeg worker uses bounded temporary files and removes temporary output on failure.

## Credit-plan implementation verified

The annual plan is now:

- **Price:** 2 SOL
- **Allowance:** 60,000 annual credits
- **Native clip cost:** 5 credits per queued clip
- **Highlight analysis cost:** 1 credit
- **Period:** one year from verified activation
- **Balance behavior:** credits are deducted atomically when work is queued; failed jobs refund the reservation; successful jobs settle the ledger as consumed
- **UI behavior:** the clip dashboard refreshes plan and job state every four seconds and displays the remaining annual balance

The old independent 20-clip counter is no longer used for new reservations. A migration adds `credit_limit_units` and `credits_used_units`, updates active legacy plans to the new plan shape, and grants active paid plans the 60,000-credit balance.

## Residual operational recommendations

1. Upgrade direct Solana/Pump/Privy dependencies in a tested branch.
2. Add a dependency allowlist/SBOM and fail CI on critical plus reachable high vulnerabilities.
3. Add CSP in report-only mode, then enforce after wallet/auth provider testing.
4. Monitor failed payment verification, withdrawal retries, credit refunds, and unusual trade volume.
5. Keep `SOL_TREASURY_PRIVATE_KEY` only in Render secret storage; never place it in client-exposed `NEXT_PUBLIC_*` variables or logs.
6. Run the database migration before enabling the new plan in production.

## Evidence commands

```bash
npm audit --omit=dev
npm run typecheck
npm test
npm run build:render
git diff --check
```
