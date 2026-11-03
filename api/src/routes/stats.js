import { Router } from 'express';
import { query } from '../db/postgres.js';
import { reviews } from '../db/mongo.js';
import { requireAdmin } from '../lib/auth.js';

// Tableau de bord administrateur : requêtes avancées sur les deux bases
const router = Router();
router.use(requireAdmin);

// GET /api/stats/sales — meilleures ventes, via la vue v_event_sales
router.get('/sales', async (req, res) => {
  const limit = Math.min(Number(req.query.limit) || 10, 100);
  const { rows } = await query(
    'SELECT * FROM v_event_sales ORDER BY revenue DESC LIMIT $1', [limit],
  );
  res.json(rows);
});

// GET /api/stats/categories — CTE + GROUP BY + HAVING + FILTER
// Performances par catégorie, en ne gardant que les catégories significatives
router.get('/categories', async (req, res) => {
  const { rows } = await query(`
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
           count(DISTINCT order_id)                                       AS orders,
           sum(quantity) FILTER (WHERE status = 'paid')                   AS tickets_sold,
           round(sum(amount) FILTER (WHERE status = 'paid'), 2)           AS revenue,
           round(avg(amount) FILTER (WHERE status = 'paid'), 2)           AS avg_line_amount,
           round(100.0 * count(*) FILTER (WHERE status IN ('cancelled', 'refunded'))
                 / count(*), 1)                                           AS cancel_rate_pct
      FROM order_lines
     GROUP BY category
    HAVING count(DISTINCT order_id) >= 100
     ORDER BY revenue DESC`);
  res.json(rows);
});

// GET /api/stats/top-customers — CTE + fonction de fenêtre RANK()
// + sous-requête corrélée : catégorie préférée de chaque client
router.get('/top-customers', async (req, res) => {
  const { rows } = await query(`
    WITH spending AS (
        SELECT u.id, u.first_name || ' ' || u.last_name AS name, u.email,
               count(o.id)         AS orders,
               sum(o.total_amount) AS total_spent
          FROM users u
          JOIN orders o ON o.user_id = u.id AND o.status = 'paid'
         GROUP BY u.id
    )
    SELECT RANK() OVER (ORDER BY total_spent DESC) AS rank, s.*,
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
     LIMIT 10`);
  res.json(rows);
});

// GET /api/stats/inactive-users — NOT EXISTS : comptes sans aucun achat payé
// (cible d'une campagne de relance)
router.get('/inactive-users', async (req, res) => {
  const { rows } = await query(`
    SELECT count(*) OVER () AS total, u.id, u.email, u.created_at
      FROM users u
     WHERE u.role = 'customer'
       AND NOT EXISTS (SELECT 1 FROM orders o WHERE o.user_id = u.id AND o.status = 'paid')
     ORDER BY u.created_at
     LIMIT 20`);
  res.json({ total: rows[0]?.total ?? 0, sample: rows.map(({ total: _, ...r }) => r) });
});

// GET /api/stats/monthly — chiffre d'affaires mensuel et évolution (LAG)
router.get('/monthly', async (req, res) => {
  const { rows } = await query(`
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
     ORDER BY month`);
  res.json(rows);
});

// GET /api/stats/reviews — pipeline d'agrégation MongoDB avec $facet :
// plusieurs analyses calculées en une seule passe sur la collection
router.get('/reviews', async (req, res) => {
  const [result] = await reviews.aggregate([
    {
      $facet: {
        // répartition des notes 1 à 5
        distribution: [
          { $group: { _id: '$rating', count: { $sum: 1 } } },
          { $sort: { _id: 1 } },
          { $project: { _id: 0, rating: '$_id', count: 1 } },
        ],
        // note moyenne et détail par aspect, par catégorie (jointure $lookup)
        by_category: [
          { $lookup: { from: 'event_pages', localField: 'event_id', foreignField: 'event_id', as: 'page',
                       pipeline: [{ $project: { _id: 0, category: 1 } }] } },
          { $unwind: '$page' },
          { $group: {
              _id: '$page.category',
              reviews: { $sum: 1 },
              average: { $avg: '$rating' },
              son: { $avg: '$aspects.son' },
              ambiance: { $avg: '$aspects.ambiance' },
              organisation: { $avg: '$aspects.organisation' },
          } },
          { $project: { _id: 0, category: '$_id', reviews: 1,
                        average: { $round: ['$average', 2] }, son: { $round: ['$son', 2] },
                        ambiance: { $round: ['$ambiance', 2] }, organisation: { $round: ['$organisation', 2] } } },
          { $sort: { average: -1 } },
        ],
        // avis les plus utiles
        most_helpful: [
          { $sort: { helpful_votes: -1 } },
          { $limit: 5 },
          { $project: { _id: 0, event_id: 1, rating: 1, title: 1, comment: 1, helpful_votes: 1 } },
        ],
        totals: [{ $group: { _id: null, reviews: { $sum: 1 }, average: { $avg: '$rating' } } },
                 { $project: { _id: 0, reviews: 1, average: { $round: ['$average', 2] } } }],
      },
    },
  ]).toArray();
  res.json({ ...result, totals: result.totals[0] ?? { reviews: 0, average: null } });
});

// GET /api/stats/revenue-vs-rating — CROISE LES DEUX BASES
// Le chiffre d'affaires vient de PostgreSQL, la satisfaction de MongoDB :
// est-ce que les événements les mieux notés sont aussi ceux qui rapportent le plus ?
router.get('/revenue-vs-rating', async (req, res) => {
  const ratings = await reviews.aggregate([
    { $group: { _id: '$event_id', average: { $avg: '$rating' }, count: { $sum: 1 } } },
    { $match: { count: { $gte: 5 } } },
  ]).toArray();

  const { rows } = await query(
    `SELECT event_id, title, category, revenue, fill_rate_pct
       FROM v_event_sales WHERE event_id = ANY($1)`,
    [ratings.map((r) => r._id)],
  );
  const ratingById = new Map(ratings.map((r) => [r._id, r]));

  // regroupement par tranche de note
  const buckets = {};
  for (const ev of rows) {
    const avg = ratingById.get(ev.event_id).average;
    const label = avg < 3 ? '< 3' : avg < 3.5 ? '3 - 3.5' : avg < 4 ? '3.5 - 4' : '>= 4';
    buckets[label] ??= { rating_range: label, events: 0, revenue: 0, fill: 0 };
    buckets[label].events += 1;
    buckets[label].revenue += ev.revenue;
    buckets[label].fill += ev.fill_rate_pct ?? 0;
  }
  res.json(Object.values(buckets)
    .map((b) => ({
      rating_range: b.rating_range,
      events: b.events,
      avg_revenue: Math.round(b.revenue / b.events),
      avg_fill_rate_pct: Math.round((b.fill / b.events) * 10) / 10,
    }))
    .sort((a, b) => a.rating_range.localeCompare(b.rating_range)));
});

export default router;
