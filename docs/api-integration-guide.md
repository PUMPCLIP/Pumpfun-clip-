# PumpClip API Integration Guide

**Base URL:** `https://pumpfun-clip.onrender.com`  
**Authentication:** browser session created by PumpClip sign-in  
**Content type:** `application/json` unless noted otherwise

> Money-moving calls must be made from the authenticated PumpClip browser/session context. Do not expose the treasury private key or attempt to sign a transaction server-side with a user wallet key.

## Common requirements

### Session and CSRF

For `GET` account reads, the server session cookie is sufficient. For mutations:

- send the `pc_session` cookie automatically (`credentials: same-origin` in browser calls);
- send `Origin: https://pumpfun-clip.onrender.com`;
- read the non-HttpOnly `pc_csrf` cookie and send it as `x-csrf-token`.

Example helper:

```ts
function csrf() {
  return decodeURIComponent(
    document.cookie.split('; ').find(x => x.startsWith('pc_csrf='))?.split('=')[1] ?? ''
  );
}
```

Errors use this shape:

```json
{
  "code": "SIGN_IN_REQUIRED",
  "message": "sign in required",
  "details": null,
  "requestId": "..."
}
```

## Annual 2 SOL subscription and credits

A verified payment activates **60,000 annual credits for one year**. Credits are metered units:

| Operation | Cost |
|---|---:|
| Native clip job | 5 credits |
| Highlight analysis | 1 credit |

Credits decrease when a job is queued/reserved, so the balance reflects work already in progress. If a worker fails, the reservation is returned. Successful work is settled as consumed.

### 1. Read plan status

```http
GET /api/v1/clip-plan
```

Example response for an active plan:

```json
{
  "trial": { "total": 2, "remaining": 0 },
  "wallet": "UserPrimarySolanaAddress",
  "plan": {
    "status": "active",
    "name": "annual_60000",
    "annualCredits": 60000,
    "used": 5,
    "remaining": 59995,
    "balanceUnits": 59995,
    "periodStart": "2026-10-11T15:00:00.000Z",
    "periodEnd": "2027-10-11T15:00:00.000Z"
  },
  "payment": {
    "amountLamports": "2000000000",
    "amountSol": "2",
    "destination": "TreasuryPublicAddress",
    "network": "devnet"
  }
}
```

`remaining` is the annual plan ledger balance. `balanceUnits` is the paid balance account used by reservations.

### 2. Create a payment intent

```http
POST /api/v1/clip-plan
Idempotency-Key: 550e8400-e29b-41d4-a716-446655440000
X-CSRF-Token: <pc_csrf>
Content-Type: application/json

{}
```

The server returns the exact amount, network, recipient, linked wallet, and intent ID. Show these values to the user before wallet approval.

```json
{
  "id": "intent-uuid",
  "state": "pending",
  "amountLamports": "2000000000",
  "amountSol": "2",
  "destination": "TreasuryPublicAddress",
  "network": "devnet",
  "wallet": "UserPrimarySolanaAddress"
}
```

Never substitute a client-controlled recipient or amount.

### 3. Submit and verify the wallet payment

The user signs a normal Solana `SystemProgram.transfer` from the linked primary wallet to `destination` for `amountLamports`.

```http
POST /api/v1/clip-plan/intents/{intentId}/verify
X-CSRF-Token: <pc_csrf>
Content-Type: application/json

{ "signature": "SolanaTransactionSignature" }
```

The verification endpoint may return `CHAIN_VERIFICATION_PENDING` while the transaction confirms. Retry the same intent and signature with bounded backoff. A verified intent is idempotent and can be safely re-read.

## Credit balance endpoint

```http
GET /api/v1/ai/usage
```

Response:

```json
{
  "free_units": 0,
  "balance_units": 59995,
  "consumed_units": 5
}
```

Use `balance_units` for the visible paid-credit balance and `free_units` for the trial balance. Do not calculate balances by counting client-side jobs; the server ledger is authoritative.

## Queue a native clip

```http
POST /api/v1/ai/clips
Idempotency-Key: 550e8400-e29b-41d4-a716-446655440001
X-CSRF-Token: <pc_csrf>
Content-Type: application/json

{
  "sourceUrl": "https://www.youtube.com/watch?v=example",
  "rightsConfirmed": true,
  "instructions": "00:45-01:12",
  "aspectRatio": "9:16",
  "caption": "Optional hook",
  "captionStyle": "classic",
  "start": 45,
  "end": 72
}
```

Alternatively send `sourceAssetId` for a verified upload or `campaignId` for an authorized live campaign source. The server validates ownership/access, rights confirmation, supported HTTPS domains, and a maximum 180-second segment.

Successful queue response: `202 Accepted`.

The server reserves **5 credits atomically** before inserting the job. Reusing the same idempotency key returns the same job; using it for different input returns `IDEMPOTENCY_CONFLICT`.

### Poll clip status

```http
GET /api/v1/ai/clips
```

The response contains the authenticated user’s recent jobs and statuses: `queued`, `processing`, `succeeded`, or `failed`. A failed job’s reserved credits are returned by the worker settlement path.

## Live token trading

These endpoints build and submit **user-wallet-signed** transactions. PumpClip does not receive the user’s private key.

### 1. Get a quote

```http
GET /api/v1/trade/quote?mint=<TOKEN_MINT>&wallet=<LINKED_WALLET>&side=buy&amountRaw=100000000&slippageBps=100
```

For an attributed clip trade, append `clipLinkId=<CLIP_LINK_ID>`. The quote returns route, token output estimate, slippage, price impact, and the disclosed attribution fee.

### 2. Build an unsigned transaction

```http
POST /api/v1/trade/build
X-CSRF-Token: <pc_csrf>
Content-Type: application/json

{
  "mint": "TokenMintAddress",
  "wallet": "LinkedPrimaryWallet",
  "side": "buy",
  "amountRaw": "100000000",
  "slippageBps": 100,
  "clipLinkId": "optional-clip-link-uuid"
}
```

The response includes `serializedTransaction`, `intentId`, `route`, `amountOutRaw`, `messageHash`, and fee allocation fields. Display the route, amount, slippage, fee, and treasury to the user before signing.

### 3. Sign and submit

The wallet signs the returned transaction. Submit either the wallet signature or the fully signed transaction:

```http
POST /api/v1/trade/submit
X-CSRF-Token: <pc_csrf>
Content-Type: application/json

{
  "wallet": "LinkedPrimaryWallet",
  "intentId": "trade-intent-uuid",
  "signedTransaction": "base64-versioned-transaction"
}
```

The server checks the linked wallet and stored trade message hash before broadcasting. For a direct wallet `signAndSendTransaction` flow, submit `{ wallet, intentId, signature }`.

### 4. Poll confirmation

```http
GET /api/v1/trade/status?signature=<SIGNATURE>
```

Attribution credits are recorded only after on-chain reconciliation verifies the signer, PumpClip memo, token movement, and disclosed treasury fee transfer.

## SOL clip-earnings withdrawal

This is separate from the annual clipping-credit balance. It withdraws accrued SOL attribution earnings to the user’s linked primary wallet.

### Read earnings

```http
GET /api/v1/me/clip-earnings
```

The response includes accrued, reserved, and paid totals, withdrawal history, and whether the deployment’s treasury signer is enabled.

### Request withdrawal

```http
POST /api/v1/me/clip-earnings/withdraw
Idempotency-Key: 550e8400-e29b-41d4-a716-446655440002
X-CSRF-Token: <pc_csrf>
Content-Type: application/json

{}
```

The server selects only accrued ledger entries, locks them, creates a signed treasury-to-user transaction, reserves the entries, and broadcasts with retry-safe state. Response status is normally `202`:

```json
{
  "withdrawalId": "withdrawal-uuid",
  "signature": "SolanaTransactionSignature",
  "state": "broadcast"
}
```

Reuse the same idempotency key to safely resume a prepared/broadcast withdrawal. If a transaction fails or expires, the server releases the reserved earnings for a new withdrawal attempt.

## Production safety checklist

- Confirm `SOLANA_CLUSTER`, RPC, `SOL_TREASURY`, and `SOL_TREASURY_PRIVATE_KEY` refer to the same network.
- Apply the annual-credit database migration before accepting new subscriptions.
- Keep the treasury private key server-only.
- Never trust client-provided recipient, amount, credit balance, or plan state.
- Use a fresh UUID idempotency key for each new payment, clip, trade, or withdrawal intent.
- Treat SOL transfers as irreversible and require the user to verify the wallet confirmation screen.
