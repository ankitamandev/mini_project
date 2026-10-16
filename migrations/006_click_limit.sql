-- NULL = no limit. The CHECK means the database itself refuses 0 or negatives,
-- even if a bug in the API let one through.
ALTER TABLE links
ADD COLUMN max_clicks integer CHECK (max_clicks > 0);
