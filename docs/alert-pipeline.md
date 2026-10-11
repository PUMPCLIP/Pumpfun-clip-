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

## Trading flow and safety boundary

Token alerts now expose a Quick Buy modal when `TRADING_ENABLED=true`. The modal requires a linked primary wallet, fetches a quote, shows the selected route and slippage, then requests an unsigned v0 transaction from the server. Un-graduated SOL-quoted curves are priced and built with the official `@pump-fun/pump-sdk`; graduated tokens are routed through Jupiter Swap V2's `/swap/v2/build` endpoint, which can select Raydium and other supported liquidity venues.

The server never receives a private key and never signs a trade. The browser passes the unsigned versioned transaction to Phantom, Solflare, or another injected provider. Providers that expose only `signTransaction` return the signed bytes to `POST /api/v1/trade/submit` for broadcast through the configured RPC. `GET /api/v1/trade/status` reports confirmation status and a Solscan link.

Trading is disabled by default. Production requires `SOLANA_CLUSTER=mainnet-beta`, a mainnet RPC, `TRADING_ENABLED=true`, `JUPITER_API_KEY`, and a conservative `TRADING_MAX_SOL_LAMPORTS` cap. Slippage is bounded to 0.5–5%, buys are capped by the configured SOL limit, and build/submit requests require the authenticated user's linked primary wallet plus CSRF protection. This is user-confirmed trading, not automatic execution from a webhook.
