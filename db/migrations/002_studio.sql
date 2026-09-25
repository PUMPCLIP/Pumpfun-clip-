CREATE TABLE studio_projects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), owner_id uuid NOT NULL REFERENCES users(id),
  campaign_id uuid NOT NULL REFERENCES campaigns(id), source_asset_id uuid NOT NULL REFERENCES media_assets(id),
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE studio_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), project_id uuid NOT NULL REFERENCES studio_projects(id),
  owner_id uuid NOT NULL REFERENCES users(id), start_seconds numeric(10,3) NOT NULL CHECK(start_seconds >= 0),
  end_seconds numeric(10,3) NOT NULL CHECK(end_seconds > start_seconds AND end_seconds-start_seconds <= 180),
  caption text NOT NULL DEFAULT '', status text NOT NULL DEFAULT 'queued' CHECK(status IN ('queued','processing','succeeded','failed')),
  attempt integer NOT NULL DEFAULT 1, idempotency_key text NOT NULL, output_asset_id uuid REFERENCES media_assets(id), error_message text,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX studio_jobs_queue ON studio_jobs(status,created_at);
CREATE UNIQUE INDEX studio_jobs_idempotency ON studio_jobs(owner_id,idempotency_key);
