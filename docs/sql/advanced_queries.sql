\pset footer off
\pset null '—'

\echo '\n=== 1. Performances par catégorie (CTE, GROUP BY, HAVING, FILTER) ==='
WITH order_lines AS (
    SELECT c.name AS category, o.id AS order_id, o.status,
           oi.quantity, oi.quantity * oi.unit_price AS amount
      FROM orders o
      JOIN order_items oi  ON oi.order_id = o.id
      JOIN ticket_types tt ON tt.id = oi.ticket_type_id
      JOIN events e        ON e.id = tt.event_id
      JOIN categories c    ON c.id = e.category_id
)
SELECT category,
       count(DISTINCT order_id)                             AS orders,
       sum(quantity) FILTER (WHERE status = 'paid')         AS tickets_sold,
       round(sum(amount) FILTER (WHERE status = 'paid'), 2) AS revenue,
       round(100.0 * count(*) FILTER (WHERE status IN ('cancelled', 'refunded'))
             / count(*), 1)                                 AS cancel_rate_pct
  FROM order_lines
 GROUP BY category
HAVING count(DISTINCT order_id) >= 100
 ORDER BY revenue DESC;

\echo '\n=== 2. Top 10 des clients (RANK, sous-requête corrélée) ==='
WITH spending AS (
    SELECT u.id, u.first_name || ' ' || u.last_name AS name,
           count(o.id)         AS orders,
           sum(o.total_amount) AS total_spent
      FROM users u
      JOIN orders o ON o.user_id = u.id AND o.status = 'paid'
     GROUP BY u.id
)
SELECT RANK() OVER (ORDER BY total_spent DESC) AS rank,
       s.name, s.orders, s.total_spent,
       (SELECT c.name
          FROM orders o
          JOIN order_items oi  ON oi.order_id = o.id
          JOIN ticket_types tt ON tt.id = oi.ticket_type_id
          JOIN events e        ON e.id = tt.event_id
          JOIN categories c    ON c.id = e.category_id
         WHERE o.user_id = s.id AND o.status = 'paid'
         GROUP BY c.name
         ORDER BY sum(oi.quantity) DESC
         LIMIT 1) AS favorite_category
  FROM spending s
 ORDER BY total_spent DESC
 LIMIT 10;

\echo '\n=== 3. Clients sans aucun achat payé (NOT EXISTS) ==='
SELECT count(*) AS inactive_customers,
       round(100.0 * count(*) / (SELECT count(*) FROM users WHERE role = 'customer'), 1)
           AS pct_of_customers
  FROM users u
 WHERE u.role = 'customer'
   AND NOT EXISTS (SELECT 1 FROM orders o
                    WHERE o.user_id = u.id AND o.status = 'paid');


\echo '\n=== 4. Chiffre d''affaires mensuel et évolution (LAG) ==='
WITH monthly AS (
    SELECT date_trunc('month', paid_at)::date AS month,
           count(*) AS orders, sum(total_amount) AS revenue
      FROM orders
     WHERE status = 'paid'
     GROUP BY 1
)
SELECT month, orders, revenue,
       round(100.0 * (revenue - LAG(revenue) OVER w) / LAG(revenue) OVER w, 1) AS growth_pct
  FROM monthly
WINDOW w AS (ORDER BY month)
 ORDER BY month DESC
 LIMIT 12;

\echo '\n=== 5. Salles sans aucun événement à venir (LEFT JOIN) ==='
SELECT v.name, v.city, v.capacity, count(e.id) AS upcoming_events
  FROM venues v
  LEFT JOIN events e ON e.venue_id = v.id
                    AND e.status = 'published'
                    AND e.starts_at > now()
 GROUP BY v.id
HAVING count(e.id) = 0
 ORDER BY v.capacity DESC;

\echo '\n=== 6. Transaction : commande, déclencheur de stock et annulation ==='


SELECT tt.id AS tt_id, tt.quantity_sold AS sold_before,
       (SELECT id FROM users WHERE email = 'client@example.com') AS client_id
  FROM ticket_types tt
  JOIN events e ON e.id = tt.event_id
 WHERE e.status = 'published' AND e.starts_at > now()
   AND tt.quantity_total - tt.quantity_sold >= 10
 ORDER BY tt.id
 LIMIT 1 \gset

BEGIN;

\echo '--- 6a. Commande valide de 2 billets : le stock vendu augmente de 2'
SELECT place_order(:client_id, format('[{"ticket_type_id": %s, "quantity": 2}]', :tt_id)::jsonb)
       AS new_order_id;
SELECT id, :sold_before AS sold_before, quantity_sold AS sold_after
  FROM ticket_types WHERE id = :tt_id;

\echo '--- 6b. Commande avec un 2e article invalide : erreur, RIEN n''est enregistré'
SAVEPOINT before_bad_order;
SELECT count(*) AS orders_before FROM orders \gset
SELECT place_order(:client_id, format(
    '[{"ticket_type_id": %s, "quantity": 2}, {"ticket_type_id": 999999, "quantity": 1}]',
    :tt_id)::jsonb);
ROLLBACK TO SAVEPOINT before_bad_order;
SELECT :orders_before AS orders_before, count(*) AS orders_after,
       (SELECT quantity_sold FROM ticket_types WHERE id = :tt_id) AS sold_unchanged
  FROM orders;

ROLLBACK;
\echo '--- ROLLBACK : la base est revenue à son état initial'
