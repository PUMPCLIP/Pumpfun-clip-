# Feature status — 2026-09-25

| Capability | Code status | External verification / blocker |
| --- | --- | --- |
| Google sign in and campaign marketplace | Implemented | Real OAuth account and staged domain not tested |
| Phantom, Solflare and compatible injected wallet linking | Implemented | Browser wallet tests needed; “Sofia” compatibility unverified |
| Token issuer and allocation script | Devnet operator commands | No token minted or distributed; no issuer key, tokenomics or mainnet authorization provided |
| Holder access, fees and campaign funding | Devnet API | No configured mint, custody keys or confirmed live journey |
| Reward award ledger, 48-hour hold, dispute and payout | Devnet operator flow | No real payout run; shared custody, manual dispute review and no refund flow |
| Manual studio and FFmpeg export | Implemented | Full browser journey and production media scan pending |
| AI transcription and suggested cuts | Worker and UI implemented | Provider key, sample video and cost verification pending; heuristic ranking |
| YouTube private upload | OAuth and resumable upload implemented | Credentials, YouTube project/channel test and duplicate-upload recovery pending |
| TikTok, Instagram and X publishing/analytics | Not implemented | Developer approvals, OAuth and platform APIs needed |
| Private S3-compatible media and staging containers | Integration/template implemented | No bucket, HTTPS domain, managed DB, monitoring or backups provisioned |
| Live-account end-to-end tests | Not run | Requires separate Google, wallet, provider, custody and social accounts |

Passing local tests and build only verify the implementation at the code level. Do not advertise launch readiness or accept mainnet money.
