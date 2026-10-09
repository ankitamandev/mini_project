CREATE TABLE links (
    id SERIAL PRIMARY KEY,
    short_url TEXT NOT NULL,
    original_url TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);