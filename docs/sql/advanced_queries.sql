-- =============================================================================
-- advanced_queries.sql — Requêtes avancées PostgreSQL, commentées
--
-- Lancement (toutes les requêtes à la suite) :
--   docker exec -it billetterie-postgres psql -U postgres -d billetterie -f /docs/sql/advanced_queries.sql
--
-- Les requêtes 1 à 4 sont celles du tableau de bord admin (api/src/routes/stats.js).
-- La requête 6 modifie des données à l'intérieur d'une transaction annulée :
-- la base est identique avant et après l'exécution du fichier.
-- =============================================================================

\pset footer off
\pset null '—'

-- -----------------------------------------------------------------------------
-- 1. Performances par catégorie — CTE + GROUP BY + HAVING + FILTER
-- Intention : comparer les catégories (billets vendus, chiffre d'affaires,
-- taux d'annulation) en ignorant celles qui ont trop peu de commandes pour
-- être significatives.
--   CTE (WITH)  : prépare une ligne par article commandé, avec sa catégorie
--   FILTER      : agrégat conditionnel, sans sous-requête par statut
--   HAVING      : filtre APRÈS le regroupement (WHERE filtre avant)
-- -----------------------------------------------------------------------------
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

-- -----------------------------------------------------------------------------
-- 2. Meilleurs clients — CTE + fonction de fenêtre RANK() + sous-requête corrélée
-- Intention : classer les clients par montant dépensé et afficher leur
-- catégorie préférée (programme de fidélité).
--   RANK() OVER : rang sans regrouper les lignes ; deux clients ex aequo ont le même rang
--   Sous-requête corrélée : exécutée pour chaque client (elle utilise s.id)
-- -----------------------------------------------------------------------------
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

-- -----------------------------------------------------------------------------
-- 3. Clients inactifs — NOT EXISTS
-- Intention : trouver les comptes clients qui n'ont jamais rien payé
-- (cible d'une campagne de relance par e-mail).
--   NOT EXISTS s'arrête dès qu'une commande payée est trouvée, et reste
--   correct même en présence de NULL (contrairement à NOT IN).
-- -----------------------------------------------------------------------------
\echo '\n=== 3. Clients sans aucun achat payé (NOT EXISTS) ==='
SELECT count(*) AS inactive_customers,
       round(100.0 * count(*) / (SELECT count(*) FROM users WHERE role = 'customer'), 1)
           AS pct_of_customers
  FROM users u
 WHERE u.role = 'customer'
   AND NOT EXISTS (SELECT 1 FROM orders o
                    WHERE o.user_id = u.id AND o.status = 'paid');

-- -----------------------------------------------------------------------------
-- 4. Chiffre d'affaires mensuel et évolution — CTE + fonction de fenêtre LAG()
-- Intention : suivre l'activité mois par mois et la variation par rapport
-- au mois précédent.
--   LAG(revenue) : valeur de la ligne précédente dans l'ordre des mois
--   WINDOW w     : fenêtre nommée, réutilisée deux fois
-- -----------------------------------------------------------------------------
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

-- -----------------------------------------------------------------------------
-- 5. Salles sans événement à venir — LEFT JOIN (jointure externe)
-- Intention : repérer les salles partenaires qui n'ont plus rien de
-- programmé, pour que l'équipe commerciale les relance.
--   LEFT JOIN garde toutes les salles, même celles sans événement
--   correspondant (count(e.id) vaut alors 0). Une jointure interne (JOIN)
--   les ferait disparaître du résultat.
--   Les conditions sur e sont dans le ON : placées dans le WHERE, elles
--   élimineraient les lignes NULL et le LEFT JOIN redeviendrait un JOIN.
-- -----------------------------------------------------------------------------
\echo '\n=== 5. Salles sans aucun événement à venir (LEFT JOIN) ==='
SELECT v.name, v.city, v.capacity, count(e.id) AS upcoming_events
  FROM venues v
  LEFT JOIN events e ON e.venue_id = v.id
                    AND e.status = 'published'
                    AND e.starts_at > now()
 GROUP BY v.id
HAVING count(e.id) = 0
 ORDER BY v.capacity DESC;

-- -----------------------------------------------------------------------------
-- 6. Transaction : passage de commande tout-ou-rien
-- Intention : montrer que la fonction place_order() est atomique et que le
-- déclencheur trg_order_items_stock met à jour le stock automatiquement.
-- -----------------------------------------------------------------------------
\echo '\n=== 6. Transaction : commande, déclencheur de stock et annulation ==='

-- un tarif d'un événement à venir qui a encore des places
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

-- fin de la démonstration : on annule tout
ROLLBACK;
\echo '--- ROLLBACK : la base est revenue à son état initial'
