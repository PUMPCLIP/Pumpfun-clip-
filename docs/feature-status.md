# Feature status — 2026-09-25

| Capability | Code status | External verification / blocker |
| --- | --- | --- |
| Google sign in and campaign marketplace | Implemented | Real OAuth account and staged domain not tested |
| Phantom, Solflare and compatible injected wallet linking | Implemented | Browser wallet tests needed; “Sofia” compatibility unverified |
| Token issuer and allocation script | Devnet operator commands | No token minted or distributed; no issuer key, tokenomics or mainnet authorization provided |
| Holder access, fees and campaign funding | Devnet API | No configured mint, custody keys or confirmed live journey |
| Reward award ledger, 48-hour hold, dispute and payout | Devnet operator flow | No real payout run; shared custody, manual dispute review and no refund flow |
| Manual studio, caption presets and FFmpeg export | Implemented | Full browser journey and production media scan pending |
| AI transcription and suggested cuts | Worker and UI implemented | Provider key, sample video and cost verification pending; heuristic ranking |
| Native prompt-driven video clipping | Python/FFmpeg engine, queue, URL/asset ingestion, three aspect presets and metered credits implemented | Install pinned yt-dlp dependency; worker, supported social URLs, storage and credits need staging end-to-end testing |
| YouTube private upload | OAuth, upload reservation and interrupted session status implemented | Credentials, channel test and resumable transfer testing pending |
| TikTok draft upload | OAuth, chunk upload, inbox/status flow implemented | Developer app `video.upload` approval, real account and provider test pending; user publishes in TikTok |
| TikTok direct post | OAuth, creator settings, consent, upload and status implemented | `video.publish` audit, `video.upload` approval and real account test pending |
| Instagram Reels | Facebook OAuth, Page selection, container status and publish implemented | Meta permissions review, external media fetch and professional account test pending |
| X video posts | PKCE OAuth, chunk upload, processing status and post implemented | X project access, quotas and real account test pending |
| Platform metrics and post ownership proof | Not implemented | Do not use user supplied URLs as reward proof |
| Provider publication evidence | Optional campaign policy implemented | Same asset, account and platform checked against stored publish result; post continued existence and metrics not verified |
| Social disconnect and content reports | Account settings, API and operator report triage implemented | Provider-side grant revocation and staffed moderation still required |
| Token policy validation | Devnet issuance cap and authority checks implemented | Founder values, vesting, mainnet tokenomics and actual mint pending |
| Private S3-compatible media and staging containers | Integration/template implemented | No bucket, HTTPS domain, managed DB, monitoring or backups provisioned |
| Managed database and HTTPS staging profile | Compose and Caddy configuration implemented | No domain purchase, DNS, managed instance or running containers |
| Live-account end-to-end tests | Not run | Requires separate Google, wallet, provider, custody and social accounts |

Passing local tests and build only verify the implementation at the code level. Do not advertise launch readiness or accept mainnet money.
