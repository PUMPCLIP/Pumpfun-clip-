# Feature status — 2026-09-25

Status means code exists and passes the indicated local check; it does **not** mean externally verified or production ready.

| Release / capability | Status | Evidence | Remaining dependency or gap |
| --- | --- | --- | --- |
| R0 PostgreSQL schema, migrations, local dev seed | Implemented | `npm test`, `npm run db:migrate` with PostgreSQL | Migration not exercised against a running external PostgreSQL in this workspace |
| R0 Google OIDC and session cookie | Implemented | `npm run typecheck && npm run build` | OAuth callback needs real client and browser test; session rotation, MFA, and auth rate limits remain |
| R0 wallet challenge, signature, unique wallet ownership | Implemented | `npm test` schema constraints; code build | Needs wallet browser test |
| R0 holder checks and RPC unavailable state | Implemented | Code build | Mint not created or configured; devnet RPC test required |
| R1 owned video upload and authorized source access | Implemented for local development | FFmpeg probe path and server permission checks | Storage service, scanning, expiring URLs, video browser test |
| R1 draft, fee verification, SOL funding, publish | Implemented for devnet configuration | Schema uniqueness, typecheck and build | Configured mint and treasuries, confirmed devnet journey, campaign-specific custody |
| R1 entry fee, join, clip upload and review | Implemented for devnet configuration | Schema constraints and build | End-to-end browser test |
| R2 performance observations and fraud review | Planned | — | Platform API authorization or reviewer evidence tooling |
| R2 award ledger, dispute hold, SOL payout and reconciliation | Planned | — | Custody review, signer isolation, approval controls, devnet payout test |
| R3 manual studio trim, 9:16 captioned MP4 and dedicated workspace | Implemented for local worker | FFmpeg test, typecheck and build | Full browser journey with sample VOD; object storage and queue hardening |
| R3 AI transcription and highlight suggestions | Planned | — | Provider and cost controls |
| R4 authorized imports, analytics and publishing | Planned | — | Platform credentials, scopes and rights checks |
| R5 advanced rewards, reputation and subscriptions | Planned | — | R0–R4 release gates |

The original handoff requires R0–R3 to pass production-like staging before launch. This build has **not** passed that gate. No mainnet payout or launch claim is made.

See [launch readiness](launch-readiness.md) for the missing token, custody and infrastructure decisions.
