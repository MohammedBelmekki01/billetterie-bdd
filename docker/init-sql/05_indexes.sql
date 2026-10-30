-- =============================================================================
-- 05_indexes.sql — Index créés volontairement
--
-- PostgreSQL indexe automatiquement les clés primaires et les colonnes UNIQUE,
-- mais PAS les clés étrangères. Or l'API filtre et joint sans cesse sur ces
-- colonnes. Mesure avant / après : voir docs/sql/explain_index.sql.
-- =============================================================================

BEGIN;

-- "Mes commandes" : WHERE user_id = ? ORDER BY created_at DESC
-- Index composite : filtre ET tri servis par le même index (pas de tri en mémoire)
CREATE INDEX idx_orders_user_created ON orders (user_id, created_at DESC);

-- Catalogue : événements à venir triés par date
CREATE INDEX idx_events_starts_at ON events (starts_at);

-- Clés étrangères utilisées dans les jointures
CREATE INDEX idx_events_venue        ON events (venue_id);
CREATE INDEX idx_events_category     ON events (category_id);
CREATE INDEX idx_ticket_types_event  ON ticket_types (event_id);
CREATE INDEX idx_order_items_order   ON order_items (order_id);
CREATE INDEX idx_order_items_ttype   ON order_items (ticket_type_id);
CREATE INDEX idx_tickets_order_item  ON tickets (order_item_id);

COMMIT;

ANALYZE;
