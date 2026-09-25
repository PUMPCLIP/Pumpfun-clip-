-- Devnet reward ledger. Reserved funds cannot exceed confirmed campaign deposits.
CREATE TABLE reward_awards (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  submission_id uuid NOT NULL UNIQUE REFERENCES submissions(id),
  campaign_id uuid NOT NULL REFERENCES campaigns(id),
  clipper_id uuid NOT NULL REFERENCES users(id),
  recipient text NOT NULL,
  lamports bigint NOT NULL CHECK (lamports > 0),
  state text NOT NULL DEFAULT 'held' CHECK (state IN ('held','ready','broadcast','paid','disputed')),
  available_at timestamptz NOT NULL DEFAULT now()+interval '48 hours',
  signed_transaction text, signature text UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(), paid_at timestamptz
);
CREATE INDEX reward_awards_due ON reward_awards(state,available_at);
