# Launch readiness — 2026-09-25

**Public launch remains blocked.** The code now has devnet token issuance and distribution commands, reward award reservations and operator payout, AI transcription, private YouTube and TikTok draft upload flows and a staging deployment template. None has been exercised against founder-owned live accounts, funded custody or provisioned infrastructure.

## Required before public operation

1. Founder defines token supply, decimals, allocations, vesting, mint/freeze authorities, treasury owners, fee schedule and Pump.fun launch route. Obtain security and legal review, then separately approve any irreversible mainnet mint and distribution. No token has been created here.
2. Replace shared custody with independently reviewed campaign escrow and refund/dispute design. Audit signer isolation, transaction recovery, deposits and withdrawals. Verify a full devnet payout with distinct funded accounts and reconcile the ledger.
3. Provision HTTPS, managed PostgreSQL, private object storage, dedicated RPC, OAuth and AI credentials, monitoring, backups and disaster recovery. Validate media scanning, rate limits, abuse controls, session hardening and social upload retry behavior.
4. Test Google login, real wallet signing and token gate, campaign lifecycle, AI analysis, clip export, YouTube private upload and payout in a production-like staging environment. Test keyboard, mobile and recovery scenarios.
5. Verify TikTok draft upload with approved developer permissions; integrate TikTok direct post, Instagram and X only after their platform reviews. Verify social metrics before tying rewards to performance. Publish clear terms, licensing, privacy and payout policies.

Mainnet money endpoints and operator scripts remain disabled by code. See [integration runbook](integrations.md).
