-- =============================================================================
-- 04_seed.sql — Peuplement de la base relationnelle (données de démonstration)
--
-- Les données sont générées en SQL (generate_series + random()) : pas de gros
-- fichier CSV à versionner, et setseed() rend le jeu reproductible.
-- Volumes : ~3 000 utilisateurs, 60 salles, 600 événements, 1 800 types de
-- billets, 20 000 commandes, ~25 000 lignes de commande, ~45 000 billets.
-- =============================================================================

BEGIN;

CREATE EXTENSION IF NOT EXISTS pgcrypto;   -- crypt() pour les mots de passe bcrypt

SELECT setseed(0.42);

-- -----------------------------------------------------------------------------
-- Catégories
-- -----------------------------------------------------------------------------
INSERT INTO categories (name, slug) VALUES
    ('Concert',     'concert'),
    ('Théâtre',     'theatre'),
    ('Humour',      'humour'),
    ('Sport',       'sport'),
    ('Festival',    'festival'),
    ('Conférence',  'conference'),
    ('Danse',       'danse'),
    ('Exposition',  'exposition');

-- -----------------------------------------------------------------------------
-- Salles : 12 villes x 5 types de salle = 60 salles
-- -----------------------------------------------------------------------------
INSERT INTO venues (name, city, address, capacity)
SELECT vt.label || ' de ' || c.city,
       c.city,
       (10 + floor(random() * 190))::int || ' ' || vt.street || ', ' || c.city,
       (vt.cap_min + floor(random() * (vt.cap_max - vt.cap_min)))::int
  FROM unnest(ARRAY['Paris','Lyon','Marseille','Toulouse','Bordeaux','Lille',
                    'Nantes','Strasbourg','Nice','Rennes','Montpellier','Grenoble'])
       AS c(city)
 CROSS JOIN (VALUES
       ('Arena',              'avenue des Sports',   8000, 20000),
       ('Palais des congrès', 'boulevard du Centre', 1500,  4000),
       ('Théâtre',            'rue de la Comédie',    300,  1200),
       ('Salle Rive Gauche',  'quai des Arts',        500,  2500),
       ('Club Le Sous-Sol',   'rue de la Nuit',       150,   600)
 ) AS vt(label, street, cap_min, cap_max);

-- -----------------------------------------------------------------------------
-- Utilisateurs : 2 comptes de démonstration + 3 000 clients
-- Tous les comptes ont le mot de passe "demo1234" (haché en bcrypt, une seule
-- fois pour ne pas ralentir le peuplement).
-- -----------------------------------------------------------------------------
CREATE TEMP TABLE seed_pwd AS SELECT crypt('demo1234', gen_salt('bf', 8)) AS hash;

INSERT INTO users (email, first_name, last_name, password_hash, role, created_at)
SELECT email, first_name, last_name, (SELECT hash FROM seed_pwd), role, now() - interval '3 years'
  FROM (VALUES
        ('admin@example.com',  'Alice', 'Admin',  'admin'),
        ('client@example.com', 'Camille', 'Client', 'customer')
       ) AS demo(email, first_name, last_name, role);

WITH names AS (
    SELECT ARRAY['Léa','Hugo','Chloé','Lucas','Emma','Louis','Inès','Gabriel','Jade','Arthur',
                 'Manon','Jules','Sarah','Adam','Camille','Nathan','Zoé','Yanis','Lina','Raphaël',
                 'Mohamed','Amira','Théo','Clara','Noah','Anaïs','Karim','Julie','Maxime','Nora'] AS fn,
           ARRAY['Martin','Bernard','Dubois','Thomas','Robert','Richard','Petit','Durand','Leroy','Moreau',
                 'Simon','Laurent','Lefebvre','Michel','Garcia','David','Bertrand','Roux','Vincent','Fournier',
                 'Benali','Morel','Girard','André','Mercier','Dupont','Lambert','Bonnet','Haddad','Nguyen'] AS ln
),
gen AS (
    SELECT g,
           fn[1 + floor(random() * 30)::int] AS first_name,
           ln[1 + floor(random() * 30)::int] AS last_name
      FROM generate_series(1, 3000) AS g, names
)
INSERT INTO users (email, first_name, last_name, password_hash, created_at)
SELECT translate(lower(first_name || '.' || last_name), 'éèêëàâîïôöûüç', 'eeeeaaiioouuc')
           || g || '@example.com',
       first_name,
       last_name,
       (SELECT hash FROM seed_pwd),
       now() - random() * interval '3 years'
  FROM gen;

-- -----------------------------------------------------------------------------
-- Événements : 600, répartis de -12 mois à +6 mois autour d'aujourd'hui
-- -----------------------------------------------------------------------------
WITH words AS (
    SELECT ARRAY['Nova Lune','Les Ombres Bleues','Kaïa','Orchestre Lumière','Sauvage Club',
                 'Mira & les Vents','Électre','Bastien Roy','Les Pavés','Aurore Boréale',
                 'Fanfare du Nord','Lou Delmas','Noir Désir Tribute','Sora','Les Frères Kassi'] AS artists,
           ARRAY['Le Malade imaginaire','Cyrano','La Nuit des rois','Huis clos','Le Cid',
                 'Les Fourberies','Antigone','L''Avare','En attendant','Phèdre'] AS plays,
           ARRAY['Nuits','Soirée','Festival','Rencontres','Journées','Grand Gala'] AS prefixes,
           ARRAY['électro','du rire','jazz','du futur','urbaines','d''automne','du numérique'] AS suffixes
),
gen AS (
    SELECT g,
           1 + floor(random() * 8)::int  AS category_id,
           1 + floor(random() * 60)::int AS venue_id,
           -- date + heure de début entre 18h et 21h
           date_trunc('day', now() - interval '365 days' + random() * interval '545 days')
               + (18 + floor(random() * 4)::int) * interval '1 hour' AS starts_at,
           random() AS r
      FROM generate_series(1, 600) AS g
)
INSERT INTO events (title, category_id, venue_id, starts_at, ends_at, status, created_at)
SELECT CASE gen.category_id
           WHEN 1 THEN artists[1 + floor(random() * 15)::int] || ' en concert'
           WHEN 2 THEN plays[1 + floor(random() * 10)::int]
           WHEN 3 THEN 'Stand-up : ' || artists[1 + floor(random() * 15)::int]
           WHEN 4 THEN 'Match de gala ' || (2026 + floor(random() * 2)::int)
           WHEN 5 THEN 'Festival ' || suffixes[1 + floor(random() * 7)::int]
           WHEN 6 THEN prefixes[1 + floor(random() * 6)::int] || ' ' || suffixes[1 + floor(random() * 7)::int]
           WHEN 7 THEN 'Ballet ' || artists[1 + floor(random() * 15)::int]
           ELSE        'Exposition ' || suffixes[1 + floor(random() * 7)::int]
       END || ' #' || gen.g,
       gen.category_id,
       gen.venue_id,
       gen.starts_at,
       gen.starts_at + CASE WHEN gen.category_id = 5 THEN interval '8 hours' ELSE interval '150 minutes' END,
       CASE
           WHEN gen.r < 0.04                THEN 'cancelled'
           WHEN gen.starts_at < now()       THEN 'completed'
           WHEN gen.r < 0.07                THEN 'draft'
           ELSE                                  'published'
       END,
       gen.starts_at - interval '120 days'
  FROM gen, words;

-- -----------------------------------------------------------------------------
-- Types de billets : 3 par événement, quotas proportionnels à la capacité
-- -----------------------------------------------------------------------------
INSERT INTO ticket_types (event_id, name, price, quantity_total)
SELECT e.id,
       t.name,
       round((CASE e.category_id WHEN 4 THEN 35 WHEN 5 THEN 55 WHEN 6 THEN 20 ELSE 28 END
              + (e.id % 7) * 3) * t.price_factor, 2),
       greatest(10, floor(v.capacity * t.share)::int)
  FROM events e
  JOIN venues v ON v.id = e.venue_id
 CROSS JOIN (VALUES ('Standard', 1.0, 0.6), ('Catégorie 1', 1.6, 0.3), ('VIP', 3.0, 0.1))
       AS t(name, price_factor, share);

-- -----------------------------------------------------------------------------
-- Commandes : 20 000
-- Les déclencheurs de stock sont désactivés pendant le chargement en masse ;
-- quantity_sold est recalculé en une fois à la fin (plus rapide et cohérent).
-- -----------------------------------------------------------------------------
ALTER TABLE order_items DISABLE TRIGGER order_items_stock;
ALTER TABLE orders      DISABLE TRIGGER orders_cancel;

CREATE TEMP TABLE seed_orders AS
WITH eligible AS (
    SELECT array_agg(id ORDER BY id) AS ids, count(*)::int AS n
      FROM events WHERE status <> 'draft'
),
picked AS (
    SELECT g AS id,
           1 + floor(random() * 3002)::int                      AS user_id,
           -- power(random(), 1.6) : certains événements sont bien plus demandés
           ids[1 + floor(power(random(), 1.6) * n)::int]          AS event_id,
           1 + floor(random() * 3)::int                         AS k1,
           random() < 0.25                                       AS two_items,
           1 + floor(power(random(), 2) * 4)::int               AS q1,
           1 + floor(power(random(), 2) * 3)::int               AS q2,
           random()                                              AS r,
           random()                                              AS r_date
      FROM generate_series(1, 20000) AS g, eligible
)
SELECT p.*,
       e.status AS event_status,
       -- commande passée dans les 90 jours précédant l'événement, jamais dans le futur
       CASE WHEN e.starts_at - p.r_date * interval '90 days' > now()
            THEN now() - p.r_date * interval '30 days'
            ELSE e.starts_at - p.r_date * interval '90 days'
       END AS created_at
  FROM picked p
  JOIN events e ON e.id = p.event_id;

INSERT INTO orders (id, user_id, status, created_at, paid_at)
OVERRIDING SYSTEM VALUE
SELECT id,
       user_id,
       s.status,
       created_at,
       CASE WHEN s.status IN ('paid', 'refunded', 'cancelled')
            THEN created_at + interval '2 minutes' END
  FROM (
    SELECT so.*,
           CASE
               WHEN event_status = 'cancelled'                    THEN 'refunded'
               WHEN r < 0.05                                      THEN 'cancelled'
               WHEN r < 0.08 AND event_status = 'published'       THEN 'pending'
               ELSE                                                    'paid'
           END AS status
      FROM seed_orders so
  ) s;

SELECT setval(pg_get_serial_sequence('orders', 'id'), (SELECT max(id) FROM orders));

-- Lignes de commande : 1 ou 2 types de billets par commande
INSERT INTO order_items (order_id, ticket_type_id, quantity, unit_price)
SELECT so.id, tt.id, x.qty, tt.price
  FROM seed_orders so
 CROSS JOIN LATERAL (VALUES (so.k1, so.q1, true),
                            ((so.k1 % 3) + 1, so.q2, so.two_items)) AS x(k, qty, keep)
  JOIN ticket_types tt
    ON tt.event_id = so.event_id
   AND tt.name = (ARRAY['Standard', 'Catégorie 1', 'VIP'])[x.k]
 WHERE x.keep;

-- Montant total de chaque commande
UPDATE orders o
   SET total_amount = s.total
  FROM (SELECT order_id, sum(quantity * unit_price) AS total
          FROM order_items GROUP BY order_id) s
 WHERE s.order_id = o.id;

-- Stock vendu = commandes payées ou en attente (les annulées libèrent leurs places).
-- Si un événement très demandé dépasse son quota, le quota est relevé.
UPDATE ticket_types tt
   SET quantity_total = greatest(tt.quantity_total, s.sold),
       quantity_sold  = s.sold
  FROM (SELECT oi.ticket_type_id, sum(oi.quantity)::int AS sold
          FROM order_items oi
          JOIN orders o ON o.id = oi.order_id
         WHERE o.status IN ('paid', 'pending')
         GROUP BY oi.ticket_type_id) s
 WHERE s.ticket_type_id = tt.id;

-- Quelques catégories VIP complètes sur les événements à venir les plus demandés
UPDATE ticket_types
   SET quantity_total = quantity_sold
 WHERE name = 'VIP'
   AND quantity_sold > 0
   AND event_id IN (SELECT event_id FROM v_upcoming_events ORDER BY seats_left LIMIT 15);

-- -----------------------------------------------------------------------------
-- Billets : un par place, pour les commandes payées / annulées / remboursées
-- -----------------------------------------------------------------------------
INSERT INTO tickets (order_item_id, holder_name, status, scanned_at)
SELECT oi.id,
       u.first_name || ' ' || u.last_name,
       x.status,
       CASE WHEN x.status = 'used'
            THEN e.starts_at - random() * interval '1 hour' END
  FROM order_items oi
  JOIN orders o        ON o.id = oi.order_id
  JOIN users u         ON u.id = o.user_id
  JOIN ticket_types tt ON tt.id = oi.ticket_type_id
  JOIN events e        ON e.id = tt.event_id
 CROSS JOIN LATERAL generate_series(1, oi.quantity) AS n
 CROSS JOIN LATERAL (SELECT CASE
           WHEN o.status IN ('cancelled', 'refunded')         THEN 'cancelled'
           WHEN e.status = 'completed' AND random() < 0.92     THEN 'used'
           ELSE                                                     'valid'
       END AS status) x
 WHERE o.status <> 'pending';

ALTER TABLE order_items ENABLE TRIGGER order_items_stock;
ALTER TABLE orders      ENABLE TRIGGER orders_cancel;

COMMIT;

-- Statistiques à jour pour que le planificateur choisisse de bons plans
ANALYZE;
