# Alert pipeline and wallet indexer

## Current implementation

PumpClip now exposes two signed, server-to-server webhook endpoints:

- `POST /api/v1/webhooks/stream/{kick|twitch|youtube|custom}`
- `POST /api/v1/webhooks/solana`

The stream endpoint stores normalized source events and marks events as `queued` only when a configured term from `STREAM_ALERT_TERMS` is found. The Solana endpoint accepts Helius, QuickNode, or custom normalized payloads, matches transfers against enabled `wallet_watch_targets`, and stores matched chain events. Authenticated users can read their events from `GET /api/v1/alerts` with the normal PumpClip session and CSRF headers.

Linking a wallet automatically creates a matching watch target through migration backfill plus the wallet-link flow. Watch targets are disabled by default only when an operator explicitly disables them in the database; this does not broadcast transactions.

## Production configuration

Set these Render environment variables before connecting a provider:

```text
STREAM_WEBHOOK_SECRET=<long random secret>
STREAM_ALERT_TERMS=@pumpclips,token mention
SOLANA_INDEXER_PROVIDER=helius
SOLANA_INDEXER_NETWORK=mainnet-beta
SOLANA_INDEXER_WEBHOOK_SECRET=<long random secret>
```

Register provider callbacks to:

```text
https://pumpclip.app/api/v1/webhooks/stream/twitch
https://pumpclip.app/api/v1/webhooks/stream/kick
https://pumpclip.app/api/v1/webhooks/stream/youtube
https://pumpclip.app/api/v1/webhooks/solana
```

Provider-specific signatures should be adapted at the edge to send the configured secret header:

- stream providers: `x-pumpclip-webhook-secret`
- Solana indexers: `x-solana-webhook-secret`

Do not put provider API keys or webhook secrets in the repository. Helius/QuickNode webhook creation still requires an owner-authorized provider account and a target wallet list.

## Trading safety boundary

This pipeline is **alert-only**. It does not call Jupiter, pump.fun SDKs, or `signAndSendTransaction`. Mainnet swaps require a separate reviewed transaction flow with an explicit user confirmation, quote/slippage limits, wallet signature, replay protection, and an operator kill switch. Never enable automatic trading by setting an environment variable alone.
