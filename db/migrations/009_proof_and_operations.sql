ALTER TABLE campaigns ADD COLUMN proof_policy text NOT NULL DEFAULT 'manual' CHECK(proof_policy IN ('manual','provider'));
ALTER TABLE studio_jobs ADD COLUMN caption_style text NOT NULL DEFAULT 'classic' CHECK(caption_style IN ('classic','bold','signal'));
ALTER TABLE submissions ADD COLUMN publication_id uuid REFERENCES social_publications(id);
CREATE INDEX submissions_publication ON submissions(publication_id) WHERE publication_id IS NOT NULL;
CREATE TABLE content_reports (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), reporter_id uuid NOT NULL REFERENCES users(id),
 submission_id uuid NOT NULL REFERENCES submissions(id), reason text NOT NULL CHECK(length(reason) BETWEEN 10 AND 1000),
 state text NOT NULL DEFAULT 'open' CHECK(state IN ('open','reviewed','dismissed')),
 created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(reporter_id,submission_id)
);
CREATE TABLE user_rate_limits (
 user_id uuid NOT NULL REFERENCES users(id), action text NOT NULL, window_start timestamptz NOT NULL DEFAULT now(),
 request_count integer NOT NULL DEFAULT 1 CHECK(request_count > 0), PRIMARY KEY(user_id,action)
);
