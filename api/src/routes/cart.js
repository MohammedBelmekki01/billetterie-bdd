import { Router } from 'express';
import { z } from 'zod';
import { query } from '../db/postgres.js';
import { redis, keys } from '../db/redis.js';
import { config } from '../config.js';
import { HttpError } from '../lib/errors.js';
import { parseId } from '../lib/validate.js';
import { requireAuth } from '../lib/auth.js';

// -----------------------------------------------------------------------------
// Panier : donnée temporaire, propre à un utilisateur, lue et écrite très souvent
// et sans valeur une fois abandonnée -> Redis (HASH + expiration), pas PostgreSQL.
//   cart:user:{id}  HASH  { "<ticket_type_id>": "<quantité>" }  TTL 15 min
// Chaque modification repousse l'expiration ; un panier oublié disparaît seul.
// -----------------------------------------------------------------------------
const router = Router();
router.use(requireAuth);

// Lit le panier Redis et le complète avec les prix et le stock PostgreSQL
export async function readCart(userId) {
  const key = keys.cart(userId);
  const [raw, ttl] = await Promise.all([redis.hGetAll(key), redis.ttl(key)]);
  const ids = Object.keys(raw).map(Number);
  if (ids.length === 0) return { items: [], total: 0, expires_in: null };

  const { rows } = await query(
    `SELECT tt.id AS ticket_type_id, tt.name, tt.price, tt.quantity_total - tt.quantity_sold AS remaining,
            e.id AS event_id, e.title AS event_title, e.starts_at
       FROM ticket_types tt JOIN events e ON e.id = tt.event_id
      WHERE tt.id = ANY($1)`,
    [ids],
  );
  const items = rows.map((r) => {
    const quantity = Number(raw[r.ticket_type_id]);
    return { ...r, quantity, subtotal: Math.round(r.price * quantity * 100) / 100 };
  });
  const total = Math.round(items.reduce((s, i) => s + i.subtotal, 0) * 100) / 100;
  return { items, total, expires_in: ttl };
}

// GET /api/cart
router.get('/', async (req, res) => {
  res.json(await readCart(req.user.id));
});

// PUT /api/cart/items — ajoute ou remplace la quantité d'un type de billet
const itemSchema = z.object({
  ticket_type_id: z.number().int().positive(),
  quantity: z.number().int().min(1).max(10),
});

router.put('/items', async (req, res) => {
  const { ticket_type_id: ttId, quantity } = itemSchema.parse(req.body);

  const { rows: [tt] } = await query(
    `SELECT tt.quantity_total - tt.quantity_sold AS remaining, e.status, e.starts_at
       FROM ticket_types tt JOIN events e ON e.id = tt.event_id WHERE tt.id = $1`,
    [ttId],
  );
  if (!tt) throw new HttpError(404, 'Type de billet introuvable');
  if (tt.status !== 'published' || new Date(tt.starts_at) <= new Date()) {
    throw new HttpError(409, 'Cet événement n\'est pas en vente');
  }
  // vérification indicative : le stock est revérifié (et verrouillé) au paiement
  if (tt.remaining < quantity) throw new HttpError(409, `Plus que ${tt.remaining} place(s) disponible(s)`);

  const key = keys.cart(req.user.id);
  await redis.multi()
    .hSet(key, String(ttId), String(quantity))
    .expire(key, config.ttl.cart)
    .exec();
  res.json(await readCart(req.user.id));
});

// DELETE /api/cart/items/:ticketTypeId
router.delete('/items/:ticketTypeId', async (req, res) => {
  const ttId = parseId(req.params.ticketTypeId, 'Type de billet');
  await redis.hDel(keys.cart(req.user.id), String(ttId));
  res.json(await readCart(req.user.id));
});

// DELETE /api/cart — vide le panier
router.delete('/', async (req, res) => {
  await redis.del(keys.cart(req.user.id));
  res.status(204).end();
});

export default router;
