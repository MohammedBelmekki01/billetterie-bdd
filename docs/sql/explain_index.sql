-- =============================================================================
-- explain_index.sql — Mesure de l'effet d'un index (EXPLAIN ANALYZE avant / après)
--
-- Lancement :
--   docker exec -i billetterie-postgres psql -U postgres -d billetterie < docs/sql/explain_index.sql
--
-- Requête mesurée : l'historique des commandes d'un client ("Mes commandes"),
-- appelée à chaque visite de la page compte.
-- Tout se passe dans une transaction annulée à la fin : la base n'est pas modifiée.
-- =============================================================================

BEGIN;

\echo '=== AVANT : sans index sur orders(user_id) ==='
DROP INDEX idx_orders_user_created;

EXPLAIN (ANALYZE, BUFFERS, COSTS OFF)
SELECT id, status, total_amount, created_at
  FROM orders
 WHERE user_id = 1234
 ORDER BY created_at DESC;

\echo '=== APRÈS : avec index composite orders(user_id, created_at DESC) ==='
CREATE INDEX idx_orders_user_created ON orders (user_id, created_at DESC);
ANALYZE orders;

EXPLAIN (ANALYZE, BUFFERS, COSTS OFF)
SELECT id, status, total_amount, created_at
  FROM orders
 WHERE user_id = 1234
 ORDER BY created_at DESC;

ROLLBACK;
