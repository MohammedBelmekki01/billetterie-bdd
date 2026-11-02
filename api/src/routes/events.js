import { Router } from 'express';
import { z } from 'zod';
import { query, transaction } from '../db/postgres.js';
import { eventPages, reviews } from '../db/mongo.js';
import { redis, keys, invalidateEvent } from '../db/redis.js';
import { config } from '../config.js';
import { HttpError, notFound } from '../lib/errors.js';
import { parseId, pagination } from '../lib/validate.js';
import { requireAdmin } from '../lib/auth.js';

const router = Router();

// -----------------------------------------------------------------------------
// GET /api/events — catalogue des événements à venir (vue v_upcoming_events)
// Filtres : ?category=concert&city=Lyon&q=jazz&max_price=50&sort=date|price
// -----------------------------------------------------------------------------
const listSchema = pagination.extend({
  category: z.string().optional(),
  city: z.string().optional(),
  q: z.string().trim().min(2).optional(),
  max_price: z.coerce.number().positive().optional(),
  sort: z.enum(['date', 'price']).default('date'),
});

router.get('/', async (req, res) => {
  const f = listSchema.parse(req.query);
  const params = [];
  const where = [];
  // Les filtres sont ajoutés en paramètres numérotés : jamais de concaténation de valeurs
  const add = (sql, value) => { params.push(value); where.push(sql.replace('?', `$${params.length}`)); };
  if (f.category) add('category = ?', f.category);
  if (f.city) add('city ILIKE ?', f.city);
  if (f.q) add('title ILIKE ?', `%${f.q}%`);
  if (f.max_price) add('min_price <= ?', f.max_price);

  params.push(f.limit, (f.page - 1) * f.limit);
  const { rows } = await query(
    `SELECT *, count(*) OVER () AS total
       FROM v_upcoming_events
      ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
      ORDER BY ${f.sort === 'price' ? 'min_price, starts_at' : 'starts_at, event_id'}
      LIMIT $${params.length - 1} OFFSET $${params.length}`,
    params,
  );
  const total = rows[0]?.total ?? 0;
  res.json({
    page: f.page, limit: f.limit, total,
    items: rows.map(({ total: _, ...r }) => r),
  });
});

// -----------------------------------------------------------------------------
// GET /api/events/trending — classement Redis (ZSET) complété par PostgreSQL
// -----------------------------------------------------------------------------
router.get('/trending', async (req, res) => {
  const limit = Math.min(Number(req.query.limit) || 10, 50);
  // ZREVRANGE : les meilleurs scores d'abord, en O(log n + limit)
  const ranking = await redis.zRangeWithScores(keys.salesRanking, 0, limit - 1, { REV: true });
  if (ranking.length === 0) return res.json([]);

  const ids = ranking.map((r) => Number(r.value));
  const { rows } = await query('SELECT * FROM v_upcoming_events WHERE event_id = ANY($1)', [ids]);
  const byId = new Map(rows.map((r) => [r.event_id, r]));
  // on garde l'ordre du classement ; un événement passé entre-temps est ignoré
  res.json(ranking
    .filter((r) => byId.has(Number(r.value)))
    .map((r, i) => ({ rank: i + 1, tickets_sold_30d: r.score, ...byId.get(Number(r.value)) })));
});

// -----------------------------------------------------------------------------
// GET /api/events/search?q=... — recherche plein texte MongoDB + prix PostgreSQL
// -----------------------------------------------------------------------------
router.get('/search', async (req, res) => {
  const { q, limit } = z.object({
    q: z.string().trim().min(2, 'Au moins 2 caractères'),
    limit: z.coerce.number().int().min(1).max(50).default(10),
  }).parse(req.query);

  const pages = await eventPages
    .find({ $text: { $search: q } }, { projection: { event_id: 1, title: 1, category: 1, tags: 1, rating: 1, 'media.cover_url': 1, score: { $meta: 'textScore' } } })
    .sort({ score: { $meta: 'textScore' } })
    .limit(limit)
    .toArray();
  if (pages.length === 0) return res.json([]);

  const { rows } = await query(
    `SELECT e.id, e.starts_at, e.status, v.city, min(tt.price) AS min_price
       FROM events e JOIN venues v ON v.id = e.venue_id
       LEFT JOIN ticket_types tt ON tt.event_id = e.id
      WHERE e.id = ANY($1)
      GROUP BY e.id, v.city`,
    [pages.map((p) => p.event_id)],
  );
  const byId = new Map(rows.map((r) => [r.id, r]));
  res.json(pages.map(({ _id, ...p }) => ({ ...p, ...byId.get(p.event_id) })));
});

// -----------------------------------------------------------------------------
// GET /api/events/:id — fiche complète, CROISE LES TROIS BASES
//   PostgreSQL : données de référence, salle, types de billets, stock
//   MongoDB    : contenu éditorial (variable selon la catégorie) + note moyenne
//   Redis      : cache "cache-aside" de la fiche (TTL 60 s) + compteur de vues
// -----------------------------------------------------------------------------
async function loadEvent(id) {
  const { rows: [event] } = await query(
    `SELECT e.id, e.title, e.starts_at, e.ends_at, e.status,
            json_build_object('id', c.id, 'name', c.name, 'slug', c.slug) AS category,
            json_build_object('id', v.id, 'name', v.name, 'city', v.city,
                              'address', v.address, 'capacity', v.capacity) AS venue,
            coalesce((SELECT json_agg(json_build_object(
                         'id', tt.id, 'name', tt.name, 'price', tt.price,
                         'remaining', tt.quantity_total - tt.quantity_sold) ORDER BY tt.price)
                        FROM ticket_types tt WHERE tt.event_id = e.id), '[]') AS ticket_types
       FROM events e
       JOIN categories c ON c.id = e.category_id
       JOIN venues v     ON v.id = e.venue_id
      WHERE e.id = $1`,
    [id],
  );
  if (!event) return null;
  const page = await eventPages.findOne({ event_id: id }, { projection: { _id: 0, event_id: 0, title: 0 } });
  return { ...event, page };
}

router.get('/:id', async (req, res) => {
  const id = parseId(req.params.id, 'Identifiant d\'événement');
  const cacheKey = keys.eventCache(id);

  let event;
  const cached = await redis.get(cacheKey);
  if (cached) {
    event = JSON.parse(cached);
    res.set('X-Cache', 'HIT');
  } else {
    event = await loadEvent(id);
    if (!event) throw notFound('Événement');
    await redis.set(cacheKey, JSON.stringify(event), { EX: config.ttl.eventCache });
    res.set('X-Cache', 'MISS');
  }
  // compteur de vues : ZINCRBY sur un ensemble trié (classement des plus vus)
  const views = await redis.zIncrBy(keys.views, 1, String(id));
  res.json({ ...event, views });
});

// -----------------------------------------------------------------------------
// POST /api/events (admin) — création dans PostgreSQL ET MongoDB
// -----------------------------------------------------------------------------
const createSchema = z.object({
  title: z.string().trim().min(1).max(200),
  category_id: z.number().int().positive(),
  venue_id: z.number().int().positive(),
  starts_at: z.coerce.date(),
  ends_at: z.coerce.date(),
  status: z.enum(['draft', 'published']).default('published'),
  ticket_types: z.array(z.object({
    name: z.string().trim().min(1),
    price: z.number().min(0),
    quantity_total: z.number().int().positive(),
  })).min(1),
  // contenu éditorial libre : les champs varient selon la catégorie
  page: z.looseObject({
    description: z.string().min(10),
    tags: z.array(z.string()).default([]),
  }),
}).refine((d) => d.ends_at > d.starts_at, { message: 'ends_at doit être après starts_at', path: ['ends_at'] });

router.post('/', requireAdmin, async (req, res) => {
  const data = createSchema.parse(req.body);

  // La page MongoDB est insérée PENDANT la transaction PostgreSQL :
  // si MongoDB échoue, l'exception provoque le ROLLBACK de PostgreSQL.
  const event = await transaction(async (client) => {
    const { rows: [ev] } = await client.query(
      `INSERT INTO events (title, category_id, venue_id, starts_at, ends_at, status)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id, title, status, (SELECT slug FROM categories WHERE id = $2) AS category`,
      [data.title, data.category_id, data.venue_id, data.starts_at, data.ends_at, data.status],
    );
    for (const tt of data.ticket_types) {
      await client.query(
        'INSERT INTO ticket_types (event_id, name, price, quantity_total) VALUES ($1, $2, $3, $4)',
        [ev.id, tt.name, tt.price, tt.quantity_total],
      );
    }
    await eventPages.insertOne({
      ...data.page,
      event_id: ev.id,
      title: ev.title,
      category: ev.category,
      rating: { average: 0, count: 0 },
      updated_at: new Date(),
    });
    return ev;
  });

  res.status(201).location(`/api/events/${event.id}`).json(await loadEvent(event.id));
});

// -----------------------------------------------------------------------------
// PATCH /api/events/:id (admin) — modification des données de référence
// Annuler un événement rembourse automatiquement ses commandes (le déclencheur
// orders_cancel libère alors les places et annule les billets).
// -----------------------------------------------------------------------------
const patchSchema = z.object({
  title: z.string().trim().min(1).max(200),
  starts_at: z.coerce.date(),
  ends_at: z.coerce.date(),
  status: z.enum(['draft', 'published', 'cancelled', 'completed']),
}).partial().refine((d) => Object.keys(d).length > 0, 'Aucun champ à modifier');

router.patch('/:id', requireAdmin, async (req, res) => {
  const id = parseId(req.params.id);
  const data = patchSchema.parse(req.body);

  const refunded = await transaction(async (client) => {
    const fields = Object.keys(data);
    const set = fields.map((f, i) => `${f} = $${i + 2}`).join(', ');
    const { rowCount } = await client.query(
      `UPDATE events SET ${set} WHERE id = $1`, [id, ...fields.map((f) => data[f])],
    );
    if (rowCount === 0) throw notFound('Événement');

    if (data.status !== 'cancelled') return 0;
    const r = await client.query(
      `UPDATE orders SET status = 'refunded'
        WHERE status IN ('paid', 'pending')
          AND id IN (SELECT oi.order_id FROM order_items oi
                       JOIN ticket_types tt ON tt.id = oi.ticket_type_id
                      WHERE tt.event_id = $1)`,
      [id],
    );
    return r.rowCount;
  });

  // le titre est dupliqué dans MongoDB (affichage / recherche) : on le synchronise
  if (data.title) await eventPages.updateOne({ event_id: id }, { $set: { title: data.title, updated_at: new Date() } });
  if (data.status === 'cancelled') await redis.zRem(keys.salesRanking, String(id));
  await invalidateEvent(id);

  res.json({ ...(await loadEvent(id)), refunded_orders: refunded });
});

// -----------------------------------------------------------------------------
// PUT /api/events/:id/page (admin) — contenu éditorial MongoDB
// -----------------------------------------------------------------------------
const PROTECTED_FIELDS = ['_id', 'event_id', 'title', 'category', 'rating'];

router.put('/:id/page', requireAdmin, async (req, res) => {
  const id = parseId(req.params.id);
  const content = z.looseObject({ description: z.string().min(10) }).parse(req.body);
  for (const f of PROTECTED_FIELDS) delete content[f];

  const page = await eventPages.findOneAndUpdate(
    { event_id: id },
    { $set: { ...content, updated_at: new Date() } },
    { returnDocument: 'after', projection: { _id: 0 } },
  );
  if (!page) throw notFound('Page d\'événement');
  await invalidateEvent(id);
  res.json(page);
});

// -----------------------------------------------------------------------------
// DELETE /api/events/:id (admin) — uniquement si aucun billet n'a été vendu
// (la clé étrangère order_items -> ticket_types en RESTRICT renvoie 409 sinon)
// -----------------------------------------------------------------------------
router.delete('/:id', requireAdmin, async (req, res) => {
  const id = parseId(req.params.id);
  const { rowCount } = await query('DELETE FROM events WHERE id = $1', [id]);
  if (rowCount === 0) throw notFound('Événement');

  await Promise.all([
    eventPages.deleteOne({ event_id: id }),
    reviews.deleteMany({ event_id: id }),
    redis.zRem(keys.salesRanking, String(id)),
    redis.zRem(keys.views, String(id)),
    invalidateEvent(id),
  ]);
  res.status(204).end();
});

export default router;
