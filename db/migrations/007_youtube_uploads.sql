CREATE TABLE youtube_uploads (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL REFERENCES users(id), asset_id uuid NOT NULL REFERENCES media_assets(id),
 status text NOT NULL DEFAULT 'reserved' CHECK(status IN ('reserved','uploading','private','uncertain')),
 session_cipher text, video_id text, byte_size bigint NOT NULL CHECK(byte_size>0),
 created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(user_id,asset_id)
);
