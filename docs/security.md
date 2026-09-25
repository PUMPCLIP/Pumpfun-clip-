# Development security notes

- Devnet transfer signatures are unique in the database. Confirmed chain balance deltas must match the wallet, configured mint and destination. Wallet linking requires a one-use challenge tied to account, domain, network and expiry.
- Admin and moderator roles have no browser assignment path. No administrative payout capability exists.
- CSRF tokens are checked against a session-bound hash, with same origin enforcement. Google ID tokens are checked against Google's JWKs for issuer, audience, nonce, email verification and OAuth state.
- Uploads are private local files with access checks and ffprobe inspection. This is not malware scanning, distributed storage, or production media delivery.
- The development SOL treasury is an operationally controlled address. Campaign-specific custody, signer isolation, dual approval, daily limits, refunds, payout reconciliation and a legal review are required before any real-money launch.
- Protect the database, media directory, OAuth client secret, wallet signers and RPC credentials. Never commit `.env.local`, keys or the media directory.
- Per-user database limits bound uploads, renders, reports and social posting attempts. IP and distributed edge protection, session rotation, MFA for future admin actions, worker retries, upload duration inspection beyond ffprobe, full audit coverage and production monitoring remain outstanding.
