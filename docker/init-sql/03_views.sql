

BEGIN;


CREATE VIEW v_event_sales AS
WITH capacity AS (
    SELECT event_id,
           sum(quantity_total) AS seats_total,
           sum(quantity_sold)  AS seats_sold
      FROM ticket_types
     GROUP BY event_id
),
revenue AS (
    SELECT tt.event_id,
           count(DISTINCT o.id) FILTER (WHERE o.status = 'paid')            AS paid_orders,
           coalesce(sum(oi.quantity * oi.unit_price)
                    FILTER (WHERE o.status = 'paid'), 0)                     AS revenue
      FROM ticket_types tt
      JOIN order_items oi ON oi.ticket_type_id = tt.id
      JOIN orders o       ON o.id = oi.order_id
     GROUP BY tt.event_id
)
SELECT e.id                                   AS event_id,
       e.title,
       e.starts_at,
       e.status,
       c.name                                 AS category,
       v.name                                 AS venue,
       v.city,
       coalesce(cap.seats_total, 0)           AS seats_total,
       coalesce(cap.seats_sold, 0)            AS seats_sold,
       round(100.0 * coalesce(cap.seats_sold, 0)
             / nullif(cap.seats_total, 0), 1) AS fill_rate_pct,
       coalesce(r.paid_orders, 0)             AS paid_orders,
       coalesce(r.revenue, 0)                 AS revenue
  FROM events e
  JOIN categories c     ON c.id = e.category_id
  JOIN venues v         ON v.id = e.venue_id
  LEFT JOIN capacity cap ON cap.event_id = e.id
  LEFT JOIN revenue r    ON r.event_id = e.id;

COMMENT ON VIEW v_event_sales IS 'Ventes, remplissage et chiffre d''affaires par événement';

CREATE VIEW v_upcoming_events AS
SELECT e.id                                         AS event_id,
       e.title,
       e.starts_at,
       c.slug                                       AS category,
       v.name                                       AS venue,
       v.city,
       min(tt.price)                                AS min_price,
       sum(tt.quantity_total - tt.quantity_sold)    AS seats_left
  FROM events e
  JOIN categories c   ON c.id = e.category_id
  JOIN venues v       ON v.id = e.venue_id
  JOIN ticket_types tt ON tt.event_id = e.id
 WHERE e.status = 'published'
   AND e.starts_at > now()
 GROUP BY e.id, c.slug, v.name, v.city;

COMMENT ON VIEW v_upcoming_events IS 'Catalogue des événements à venir, prix minimum et places restantes';

COMMIT;
