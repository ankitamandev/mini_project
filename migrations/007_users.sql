-- Only a hash of each API key is stored, never the key itself. If this table
-- ever leaks, the hashes can't be used to call the API.
CREATE TABLE users (
    id            serial PRIMARY KEY,
    email         text NOT NULL UNIQUE,
    api_key_hash  text NOT NULL UNIQUE,
    created_at    timestamptz NOT NULL DEFAULT now()
);

-- Nullable on purpose: links created before users existed have no owner.
-- They still redirect, but no API key can list, read or delete them.
ALTER TABLE links
ADD COLUMN user_id integer REFERENCES users(id) ON DELETE CASCADE;

-- "Show me my links, newest first" is the query GET /links runs.
CREATE INDEX links_user_id_id_idx ON links (user_id, id);
