-- =============================================================================
-- 01_schema.sql — Modèle physique (MPD) de la base relationnelle "billetterie"
-- Exécuté automatiquement par l'image postgres au premier démarrage.
--
-- Pourquoi en relationnel : ces données sont transactionnelles (argent, stock de
-- places) et fortement liées entre elles. On a besoin de clés étrangères, de
-- contraintes et de transactions ACID pour garantir qu'on ne vend jamais plus de
-- billets qu'il n'y a de places, et qu'une commande payée a toujours ses billets.
-- =============================================================================

BEGIN;

-- -----------------------------------------------------------------------------
-- Utilisateurs (clients et administrateurs)
-- -----------------------------------------------------------------------------
CREATE TABLE users (
    id            BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    email         TEXT        NOT NULL UNIQUE
                  -- email stocké en minuscules et au format minimal x@y.z
                  CHECK (email = lower(email) AND email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
    first_name    TEXT        NOT NULL CHECK (length(trim(first_name)) > 0),
    last_name     TEXT        NOT NULL CHECK (length(trim(last_name)) > 0),
    password_hash TEXT        NOT NULL,
    role          TEXT        NOT NULL DEFAULT 'customer'
                  CHECK (role IN ('customer', 'admin')),
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
COMMENT ON TABLE users IS 'Comptes clients et administrateurs';

-- -----------------------------------------------------------------------------
-- Salles
-- -----------------------------------------------------------------------------
CREATE TABLE venues (
    id         BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    name       TEXT    NOT NULL,
    city       TEXT    NOT NULL,
    address    TEXT,
    capacity   INTEGER NOT NULL CHECK (capacity > 0),
    -- deux salles peuvent avoir le même nom dans des villes différentes
    UNIQUE (name, city)
);
COMMENT ON TABLE venues IS 'Lieux accueillant les événements';

-- -----------------------------------------------------------------------------
-- Catégories d'événements (concert, théâtre, sport...)
-- -----------------------------------------------------------------------------
CREATE TABLE categories (
    id    SMALLINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    name  TEXT NOT NULL UNIQUE,
    slug  TEXT NOT NULL UNIQUE CHECK (slug ~ '^[a-z0-9-]+$')
);

-- -----------------------------------------------------------------------------
-- Événements
-- Les informations "éditoriales" (description longue, artistes, programme,
-- médias) sont dans MongoDB, collection event_pages, reliée par events.id.
-- -----------------------------------------------------------------------------
CREATE TABLE events (
    id          BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    title       TEXT        NOT NULL CHECK (length(trim(title)) > 0),
    category_id SMALLINT    NOT NULL REFERENCES categories (id),
    -- RESTRICT : impossible de supprimer une salle qui a des événements
    venue_id    BIGINT      NOT NULL REFERENCES venues (id) ON DELETE RESTRICT,
    starts_at   TIMESTAMPTZ NOT NULL,
    ends_at     TIMESTAMPTZ NOT NULL,
    status      TEXT        NOT NULL DEFAULT 'published'
                CHECK (status IN ('draft', 'published', 'cancelled', 'completed')),
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    CHECK (ends_at > starts_at)
);
COMMENT ON TABLE events IS 'Événements (données de référence ; contenu riche dans MongoDB)';

-- -----------------------------------------------------------------------------
-- Types de billets d'un événement (Standard, Catégorie 1, VIP...)
-- quantity_sold est maintenu par déclencheur (voir 02_functions.sql)
-- -----------------------------------------------------------------------------
CREATE TABLE ticket_types (
    id             BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    -- CASCADE : supprimer un événement supprime ses types de billets
    event_id       BIGINT        NOT NULL REFERENCES events (id) ON DELETE CASCADE,
    name           TEXT          NOT NULL,
    price          NUMERIC(10,2) NOT NULL CHECK (price >= 0),
    quantity_total INTEGER       NOT NULL CHECK (quantity_total > 0),
    quantity_sold  INTEGER       NOT NULL DEFAULT 0,
    UNIQUE (event_id, name),
    -- garde-fou ultime contre la survente, même si le code applicatif se trompe
    CHECK (quantity_sold BETWEEN 0 AND quantity_total)
);

-- -----------------------------------------------------------------------------
-- Commandes
-- -----------------------------------------------------------------------------
CREATE TABLE orders (
    id           BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    user_id      BIGINT        NOT NULL REFERENCES users (id) ON DELETE RESTRICT,
    status       TEXT          NOT NULL DEFAULT 'pending'
                 CHECK (status IN ('pending', 'paid', 'cancelled', 'refunded')),
    total_amount NUMERIC(10,2) NOT NULL DEFAULT 0 CHECK (total_amount >= 0),
    created_at   TIMESTAMPTZ   NOT NULL DEFAULT now(),
    paid_at      TIMESTAMPTZ,
    -- une commande payée a forcément une date de paiement
    CHECK (status <> 'paid' OR paid_at IS NOT NULL)
);

-- -----------------------------------------------------------------------------
-- Lignes de commande : quel type de billet, combien, à quel prix
-- unit_price est copié au moment de l'achat (le prix peut changer ensuite)
-- -----------------------------------------------------------------------------
CREATE TABLE order_items (
    id             BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    order_id       BIGINT        NOT NULL REFERENCES orders (id) ON DELETE CASCADE,
    ticket_type_id BIGINT        NOT NULL REFERENCES ticket_types (id) ON DELETE RESTRICT,
    quantity       INTEGER       NOT NULL CHECK (quantity BETWEEN 1 AND 10),
    unit_price     NUMERIC(10,2) NOT NULL CHECK (unit_price >= 0),
    UNIQUE (order_id, ticket_type_id)
);

-- -----------------------------------------------------------------------------
-- Billets individuels (un par place), avec code unique pour le QR code
-- -----------------------------------------------------------------------------
CREATE TABLE tickets (
    id            BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    order_item_id BIGINT      NOT NULL REFERENCES order_items (id) ON DELETE CASCADE,
    code          UUID        NOT NULL UNIQUE DEFAULT gen_random_uuid(),
    holder_name   TEXT        NOT NULL,
    status        TEXT        NOT NULL DEFAULT 'valid'
                  CHECK (status IN ('valid', 'used', 'cancelled')),
    scanned_at    TIMESTAMPTZ,
    -- un billet utilisé a forcément été scanné
    CHECK (status <> 'used' OR scanned_at IS NOT NULL)
);

COMMIT;
