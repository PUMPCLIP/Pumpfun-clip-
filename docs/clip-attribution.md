# Clip attribution and earnings

## Clip links

Signed-in users with the clipper role can attach public HTTPS URLs from TikTok video posts, X/Twitter status posts, and YouTube Shorts to a campaign, a live-stream alert, or both. Links are normalized to remove query-string tracking parameters. Campaign links are visible to campaign participants while private and public while the campaign is live. Stream alerts expose only the fields needed for token identification, not the raw provider payload.

Every link has a PumpClip share page at `/clip/<id>`. Use that page as the tracking link from a social post when a viewer should be able to review the original clip and trade its live-stream token. A trade is eligible only when the active clip link is attached to a queued/processed live-stream alert with a valid mint and a known streamer. The mint in the trade must match the alert. Campaign-only and wallet-chain-alert links do not incur the fee.

## Fee and crediting

Eligible buys only pay a 100-basis-point fee on the SOL trade amount. The fee is a separate native-SOL transfer to `SOL_TREASURY` in the same wallet-signed atomic transaction as the buy. The wallet review therefore shows the treasury recipient and the additional debit before approval. Sells and trades without an eligible clip link have no PumpClip attribution fee.

After the RPC reports confirmation, PumpClip verifies the intent memo, buyer wallet, successful token balance increase, and exact fee transfer before recording the ledger credits. The rounded fee is split as 40% clipper, 40% campaign/live-stream owner, and 20% platform. The transfer is on-chain to the treasury; beneficiary balances are database credits, not on-chain deposits to their wallets. Credits are never written for failed, pending, or mismatched transactions.

The database ledger is separate from fixed campaign rewards. It records accrued credits by user, beneficiary role, trade, and wallet snapshot. Current public trading functionality does not require or expose a treasury private key.

## Withdrawals

On-demand withdrawal sends the accrued balance to the user's linked primary wallet from the SOL treasury. It requires the server-only `SOL_TREASURY_PRIVATE_KEY` environment secret containing the treasury's base58 64-byte keypair, matching the public `SOL_TREASURY` address. Do not put this secret in source control or expose it to the browser. Until that secret is configured, the dashboard can show accrued credits but withdrawal remains unavailable. Pending withdrawal transactions are persisted and reconciled by signature to avoid creating duplicate transfers.
