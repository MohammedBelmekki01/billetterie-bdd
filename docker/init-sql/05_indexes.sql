

BEGIN;

CREATE INDEX idx_orders_user_created ON orders (user_id, created_at DESC);


CREATE INDEX idx_events_starts_at ON events (starts_at);

CREATE INDEX idx_events_venue        ON events (venue_id);
CREATE INDEX idx_events_category     ON events (category_id);
CREATE INDEX idx_ticket_types_event  ON ticket_types (event_id);
CREATE INDEX idx_order_items_order   ON order_items (order_id);
CREATE INDEX idx_order_items_ttype   ON order_items (ticket_type_id);
CREATE INDEX idx_tickets_order_item  ON tickets (order_item_id);

COMMIT;

ANALYZE;
