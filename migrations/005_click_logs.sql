CREATE TABLE link_clicks (
    id          bigserial PRIMARY KEY,
    link_id     integer NOT NULL REFERENCES links(id) ON DELETE CASCADE,
    clicked_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX link_clicks_link_id_clicked_at_idx
    ON link_clicks (link_id, clicked_at);