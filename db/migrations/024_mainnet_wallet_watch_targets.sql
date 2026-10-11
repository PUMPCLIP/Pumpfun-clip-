-- Existing linked wallets should be observable on the production indexer network.
-- This remains read-only and does not change wallet ownership or token-gating state.
INSERT INTO wallet_watch_targets(user_id,wallet_id,address,network,label)
  SELECT user_id,id,address,'mainnet-beta','Linked wallet' FROM wallets
  ON CONFLICT(user_id,address,network) DO UPDATE SET wallet_id=EXCLUDED.wallet_id,enabled=true,updated_at=now();
