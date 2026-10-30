import { Router } from 'express';
import { z } from 'zod';
import { query } from '../db/postgres.js';
import { reviews, refreshRating } from '../db/mongo.js';
import { redis, keys, invalidateEvent } from '../db/redis.js';
import { HttpError, notFound } from '../lib/errors.js';
import { parseId, parseObjectId, pagination } from '../lib/validate.js';
import { requireAuth } from '../lib/auth.js';

// Monté sur /api : gère /api/events/:id/reviews et /api/reviews/:id
const router = Router();

const SORTS = {
  recent: { created_at: -1 },
  helpful: { helpful_votes: -1, created_at: -1 },
  rating: { rating: -1, created_at: -1 },
};

// -----------------------------------------------------------------------------
// GET /api/events/:id/reviews?sort=recent|helpful|rating&min_rating=4&page=1
// -----------------------------------------------------------------------------
router.get('/events/:id/reviews', async (req, res) => {
  const eventId = parseId(req.params.id, 'Identifiant d\'événement');
  const f = pagination.extend({
    sort: z.enum(['recent', 'helpful', 'rating']).default('recent'),
    min_rating: z.coerce.number().int().min(1).max(5).optional(),
  }).parse(req.query);

  const filter = { event_id: eventId, ...(f.min_rating && { rating: { $gte: f.min_rating } }) };
  const [items, total] = await Promise.all([
    reviews.find(filter).sort(SORTS[f.sort]).skip((f.page - 1) * f.limit).limit(f.limit).toArray(),
    reviews.countDocuments(filter),
  ]);
  res.json({ page: f.page, limit: f.limit, total, items });
});

// -----------------------------------------------------------------------------
// POST /api/events/:id/reviews — CROISE LES DEUX BASES
// PostgreSQL vérifie que l'utilisateur a bien assisté à l'événement (billet non
// annulé, événement terminé) ; l'avis est ensuite écrit dans MongoDB.
// -----------------------------------------------------------------------------
const aspect = z.number().int().min(1).max(5);
const reviewSchema = z.object({
  rating: z.number().int().min(1).max(5),
  title: z.string().trim().max(120).optional(),
  comment: z.string().trim().min(3).max(2000),
  aspects: z.object({
    son: aspect, ambiance: aspect, organisation: aspect, rapport_qualite_prix: aspect,
  }).partial().optional(),
});

router.post('/events/:id/reviews', requireAuth, async (req, res) => {
  const eventId = parseId(req.params.id, 'Identifiant d\'événement');
  const data = reviewSchema.parse(req.body);

  const { rows: [check] } = await query(
    `SELECT e.status, e.ends_at < now() AS is_over,
            u.first_name || ' ' || left(u.last_name, 1) || '.' AS display_name,
            EXISTS (SELECT 1
                      FROM tickets t
                      JOIN order_items oi  ON oi.id = t.order_item_id
                      JOIN orders o        ON o.id = oi.order_id
                      JOIN ticket_types tt ON tt.id = oi.ticket_type_id
                     WHERE tt.event_id = e.id AND o.user_id = u.id
                       AND t.status <> 'cancelled') AS attended
       FROM events e, users u
      WHERE e.id = $1 AND u.id = $2`,
    [eventId, req.user.id],
  );
  if (!check) throw notFound('Événement');
  if (!check.is_over || check.status === 'cancelled') {
    throw new HttpError(409, 'On ne peut noter un événement qu\'après y avoir assisté');
  }
  if (!check.attended) throw new HttpError(403, 'Seuls les spectateurs ayant un billet peuvent laisser un avis');

  // l'index unique (event_id, user_id) refuse un 2e avis -> 409
  const doc = {
    event_id: eventId,
    user_id: req.user.id,
    author: { display_name: check.display_name },
    ...data,
    verified_purchase: true,
    helpful_votes: 0,
    created_at: new Date(),
  };
  const { insertedId } = await reviews.insertOne(doc);
  await refreshRating(eventId);
  await invalidateEvent(eventId);
  res.status(201).json({ _id: insertedId, ...doc });
});

// Charge un avis et vérifie que l'utilisateur a le droit de le modifier
async function ownReview(req) {
  const review = await reviews.findOne({ _id: parseObjectId(req.params.id) });
  if (!review) throw notFound('Avis');
  if (review.user_id !== req.user.id && req.user.role !== 'admin') {
    throw new HttpError(403, 'Vous ne pouvez modifier que vos propres avis');
  }
  return review;
}

// PATCH /api/reviews/:id — modifier son avis
router.patch('/reviews/:id', requireAuth, async (req, res) => {
  const review = await ownReview(req);
  const data = reviewSchema.partial().refine((d) => Object.keys(d).length > 0, 'Aucun champ à modifier').parse(req.body);

  const updated = await reviews.findOneAndUpdate(
    { _id: review._id },
    { $set: { ...data, updated_at: new Date() } },
    { returnDocument: 'after' },
  );
  if (data.rating) await refreshRating(review.event_id);
  await invalidateEvent(review.event_id);
  res.json(updated);
});

// DELETE /api/reviews/:id — auteur ou admin (modération)
router.delete('/reviews/:id', requireAuth, async (req, res) => {
  const review = await ownReview(req);
  await reviews.deleteOne({ _id: review._id });
  await Promise.all([
    redis.del(keys.reviewVoters(review._id)),
    refreshRating(review.event_id),
    invalidateEvent(review.event_id),
  ]);
  res.status(204).end();
});

// -----------------------------------------------------------------------------
// POST /api/reviews/:id/helpful — vote "avis utile", une seule fois par personne
// Le SET Redis mémorise qui a voté : SADD renvoie 0 si l'utilisateur y est déjà.
// -----------------------------------------------------------------------------
router.post('/reviews/:id/helpful', requireAuth, async (req, res) => {
  const id = parseObjectId(req.params.id);
  const exists = await reviews.countDocuments({ _id: id }, { limit: 1 });
  if (!exists) throw notFound('Avis');

  const added = await redis.sAdd(keys.reviewVoters(id), String(req.user.id));
  if (added === 0) throw new HttpError(409, 'Vous avez déjà voté pour cet avis');

  const review = await reviews.findOneAndUpdate(
    { _id: id }, { $inc: { helpful_votes: 1 } }, { returnDocument: 'after', projection: { helpful_votes: 1 } },
  );
  res.json(review);
});

// GET /api/me/reviews — mes avis
router.get('/me/reviews', requireAuth, async (req, res) => {
  const items = await reviews.find({ user_id: req.user.id }).sort({ created_at: -1 }).toArray();
  res.json(items);
});

export default router;
