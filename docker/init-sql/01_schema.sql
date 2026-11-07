BEGIN;

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

CREATE TABLE venues (
    id         BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    name       TEXT    NOT NULL,
    city       TEXT    NOT NULL,
    address    TEXT,
    capacity   INTEGER NOT NULL CHECK (capacity > 0),
    UNIQUE (name, city)
);
COMMENT ON TABLE venues IS 'Lieux accueillant les événements';
CREATE TABLE categories (
    id    SMALLINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    name  TEXT NOT NULL UNIQUE,
    slug  TEXT NOT NULL UNIQUE CHECK (slug ~ '^[a-z0-9-]+$')
);

CREATE TABLE events (
    id          BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    title       TEXT        NOT NULL CHECK (length(trim(title)) > 0),
    category_id SMALLINT    NOT NULL REFERENCES categories (id),
    venue_id    BIGINT      NOT NULL REFERENCES venues (id) ON DELETE RESTRICT,
    starts_at   TIMESTAMPTZ NOT NULL,
    ends_at     TIMESTAMPTZ NOT NULL,
    status      TEXT        NOT NULL DEFAULT 'published'
                CHECK (status IN ('draft', 'published', 'cancelled', 'completed')),
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    CHECK (ends_at > starts_at)
);
COMMENT ON TABLE events IS 'Événements (données de référence ; contenu riche dans MongoDB)';

CREATE TABLE ticket_types (
    id             BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    event_id       BIGINT        NOT NULL REFERENCES events (id) ON DELETE CASCADE,
    name           TEXT          NOT NULL,
    price          NUMERIC(10,2) NOT NULL CHECK (price >= 0),
    quantity_total INTEGER       NOT NULL CHECK (quantity_total > 0),
    quantity_sold  INTEGER       NOT NULL DEFAULT 0,
    UNIQUE (event_id, name),
    CHECK (quantity_sold BETWEEN 0 AND quantity_total)
);

CREATE TABLE orders (
    id           BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    user_id      BIGINT        NOT NULL REFERENCES users (id) ON DELETE RESTRICT,
    status       TEXT          NOT NULL DEFAULT 'pending'
                 CHECK (status IN ('pending', 'paid', 'cancelled', 'refunded')),
    total_amount NUMERIC(10,2) NOT NULL DEFAULT 0 CHECK (total_amount >= 0),
    created_at   TIMESTAMPTZ   NOT NULL DEFAULT now(),
    paid_at      TIMESTAMPTZ,

    CHECK (status <> 'paid' OR paid_at IS NOT NULL)
);

CREATE TABLE order_items (
    id             BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    order_id       BIGINT        NOT NULL REFERENCES orders (id) ON DELETE CASCADE,
    ticket_type_id BIGINT        NOT NULL REFERENCES ticket_types (id) ON DELETE RESTRICT,
    quantity       INTEGER       NOT NULL CHECK (quantity BETWEEN 1 AND 10),
    unit_price     NUMERIC(10,2) NOT NULL CHECK (unit_price >= 0),
    UNIQUE (order_id, ticket_type_id)
);

CREATE TABLE tickets (
    id            BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    order_item_id BIGINT      NOT NULL REFERENCES order_items (id) ON DELETE CASCADE,
    code          UUID        NOT NULL UNIQUE DEFAULT gen_random_uuid(),
    holder_name   TEXT        NOT NULL,
    status        TEXT        NOT NULL DEFAULT 'valid'
                  CHECK (status IN ('valid', 'used', 'cancelled')),
    scanned_at    TIMESTAMPTZ,
    CHECK (status <> 'used' OR scanned_at IS NOT NULL)
);

COMMIT;
