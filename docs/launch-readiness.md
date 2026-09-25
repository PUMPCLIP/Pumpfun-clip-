# Launch readiness

**Decision: do not launch for public funding, fee collection, or promised SOL rewards yet.** This repository is a devnet development build. A polished UI and a passing build do not authorize real-money operation.

## What exists

- Google OIDC code flow, signed wallet linking, role selection and a PUMPCLIP holder balance check against a configured SPL token mint.
- Devnet token fee and SOL funding intents with on-chain transaction verification and signature uniqueness.
- Owned source upload, campaign drafts, entry fee, join, clip upload, manual FFmpeg editing, submission and streamer review.
- Responsive marketplace and dedicated clipping workspace with timeline, caption preview, render status and export submission.

## What does not exist

- **No PUMPCLIP token has been created, minted, distributed, or made available by this code.** The owner must provide the real mint, decimals, treasury, threshold, token distribution plan and network. The app reads those settings and checks balances.
- No verified reward observations, award reservation, payout signer, dispute hold, SOL distribution or reconciliation. A campaign's displayed reward is proposed and cannot be paid by the app.
- No AI transcription or highlight ranking. Manual editing works through a separate FFmpeg worker.
- No campaign-specific production escrow, refund mechanism, production object storage, scanning, queue durability or admin MFA.
- No configured Google client, public domain, RPC provider, token mint, treasury addresses or staging deployment in this repository.
- No complete browser, wallet, OAuth, devnet money or mobile accessibility verification in a production-like environment.

## Release gates

1. Product owner provides approved devnet and mainnet mint, decimals, holder minimums, fee schedule, token and SOL treasury/custody model, plus wallet ownership controls. Verify addresses out of band.
2. Complete R2 ledger, holds, audited payout controls, dispute process and reconciliation; replace shared development treasury with reviewed campaign custody. Run independent security and legal review before mainnet.
3. Complete R3 transcription/candidates or explicitly revise the public product promise to manual studio; add production media storage, queue, retries, malware inspection and retention policy.
4. Provision Google OAuth, managed PostgreSQL, object storage, RPC, worker infrastructure, secrets, monitoring, backups and a domain. Exercise staging rollback and restore.
5. Run every handoff verification scenario with distinct devnet accounts, real confirmed signatures and playable clips. Test keyboard, screen reader and mobile widths with the full flow.
6. Review terms, privacy, content rights and refund policy with qualified counsel, then authorize the mainnet configuration explicitly.

The code intentionally refuses money endpoints unless all devnet mint/treasury settings are present. Mainnet money flows are disabled. Do not remove these safeguards to skip the release gates.
