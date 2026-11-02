import { Router } from 'express';
import { z } from 'zod';
import { query } from '../db/postgres.js';
import { redis, keys, invalidateEvent } from '../db/redis.js';
import { HttpError, notFound } from '../lib/errors.js';
import { parseId, pagination } from '../lib/validate.js';
import { requireAuth } from '../lib/auth.js';

const router = Router();
router.use(requireAuth);

// Détail d'une commande : lignes, événement et billets imbriqués (json_agg)
async function loadOrder(orderId) {
  const { rows: [order] } = await query(
    `SELECT o.id, o.user_id, o.status, o.total_amount, o.created_at, o.paid_at,
            json_agg(json_build_object(
                'ticket_type', tt.name,
                'quantity', oi.quantity,
                'unit_price', oi.unit_price,
                'event', json_build_object('id', e.id, 'title', e.title, 'starts_at', e.starts_at),
                'tickets', (SELECT coalesce(json_agg(json_build_object(
                                'code', t.code, 'holder_name', t.holder_name, 'status', t.status)
                                ORDER BY t.id), '[]')
                              FROM tickets t WHERE t.order_item_id = oi.id)
            ) ORDER BY oi.id) AS items
       FROM orders o
       JOIN order_items oi  ON oi.order_id = o.id
       JOIN ticket_types tt ON tt.id = oi.ticket_type_id
       JOIN events e        ON e.id = tt.event_id
      WHERE o.id = $1
      GROUP BY o.id`,
    [orderId],
  );
  return order;
}

// Met à jour Redis après un achat (+) ou une annulation (-) :
// classement des ventes et invalidation du cache des fiches concernées
async function syncRedis(items, sign) {
  const tx = redis.multi();
  for (const { event_id: eventId, quantity } of items) {
    tx.zIncrBy(keys.salesRanking, sign * quantity, String(eventId));
    tx.del(keys.eventCache(eventId));
  }
  await tx.exec();
}

// -----------------------------------------------------------------------------
// POST /api/orders — paiement (Redis -> PostgreSQL -> Redis)
// Sans corps : on commande le contenu du panier Redis.
// Avec { items: [...] } : commande directe.
// Toute la logique critique (stock, verrou, billets) est dans la fonction SQL
// place_order : soit tout est enregistré, soit rien.
// -----------------------------------------------------------------------------
const orderSchema = z.object({
  items: z.array(z.object({
    ticket_type_id: z.number().int().positive(),
    quantity: z.number().int().min(1).max(10),
  })).min(1).optional(),
});

router.post('/', async (req, res) => {
  const body = orderSchema.parse(req.body ?? {});
  const fromCart = !body.items;
  let items = body.items;
  if (fromCart) {
    const cart = await redis.hGetAll(keys.cart(req.user.id));
    items = Object.entries(cart).map(([id, q]) => ({ ticket_type_id: Number(id), quantity: Number(q) }));
    if (items.length === 0) throw new HttpError(400, 'Le panier est vide');
  }

  const { rows: [{ order_id: orderId }] } = await query(
    'SELECT place_order($1, $2::jsonb) AS order_id', [req.user.id, JSON.stringify(items)],
  );

  const order = await loadOrder(orderId);
  if (fromCart) await redis.del(keys.cart(req.user.id));
  await syncRedis(order.items.map((i) => ({ event_id: i.event.id, quantity: i.quantity })), +1);

  res.status(201).location(`/api/orders/${orderId}`).json(order);
});

// GET /api/orders — mes commandes, les plus récentes d'abord
// (sert l'index composite orders(user_id, created_at DESC))
router.get('/', async (req, res) => {
  const { page, limit } = pagination.parse(req.query);
  const { rows } = await query(
    `SELECT o.id, o.status, o.total_amount, o.created_at,
            sum(oi.quantity)::int AS tickets,
            string_agg(DISTINCT e.title, ', ') AS events,
            count(*) OVER () AS total
       FROM orders o
       JOIN order_items oi  ON oi.order_id = o.id
       JOIN ticket_types tt ON tt.id = oi.ticket_type_id
       JOIN events e        ON e.id = tt.event_id
      WHERE o.user_id = $1
      GROUP BY o.id
      ORDER BY o.created_at DESC
      LIMIT $2 OFFSET $3`,
    [req.user.id, limit, (page - 1) * limit],
  );
  res.json({ page, limit, total: rows[0]?.total ?? 0, items: rows.map(({ total: _, ...r }) => r) });
});

// GET /api/orders/:id — détail (propriétaire ou admin)
router.get('/:id', async (req, res) => {
  const order = await loadOrder(parseId(req.params.id, 'Identifiant de commande'));
  if (!order || (order.user_id !== req.user.id && req.user.role !== 'admin')) {
    // 404 aussi quand la commande appartient à un autre : on ne révèle pas son existence
    throw notFound('Commande');
  }
  res.json(order);
});

// POST /api/orders/:id/cancel — annulation avant l'événement
// Le déclencheur orders_cancel remet les places en vente et annule les billets.
router.post('/:id/cancel', async (req, res) => {
  const id = parseId(req.params.id, 'Identifiant de commande');
  const order = await loadOrder(id);
  if (!order || (order.user_id !== req.user.id && req.user.role !== 'admin')) throw notFound('Commande');
  if (!['paid', 'pending'].includes(order.status)) {
    throw new HttpError(409, `Commande déjà ${order.status === 'cancelled' ? 'annulée' : 'remboursée'}`);
  }
  if (order.items.some((i) => new Date(i.event.starts_at) <= new Date())) {
    throw new HttpError(409, 'Impossible d\'annuler : l\'événement a déjà eu lieu');
  }

  await query(`UPDATE orders SET status = 'cancelled' WHERE id = $1`, [id]);
  await syncRedis(order.items.map((i) => ({ event_id: i.event.id, quantity: i.quantity })), -1);
  res.json(await loadOrder(id));
});

export default router;
