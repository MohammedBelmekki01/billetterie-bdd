import { createClient } from 'redis';
import { config } from '../config.js';

export const redis = createClient({ url: config.redis.url, password: config.redis.password });
redis.on('error', (err) => console.error('[redis]', err.message));

// -----------------------------------------------------------------------------
// Convention de nommage des clés : <domaine>:<entité>:<id>[:<détail>]
//   cache:event:{id}           STRING  fiche événement en JSON      TTL 60 s
//   cart:user:{id}             HASH    ticket_type_id -> quantité    TTL 15 min
//   ranking:events:sales       ZSET    event_id -> billets vendus    permanent
//   stats:event:views          ZSET    event_id -> nombre de vues    permanent
//   review:{id}:voters         SET     user_id ayant voté "utile"    permanent
// -----------------------------------------------------------------------------
export const keys = {
  eventCache: (id) => `cache:event:${id}`,
  cart: (userId) => `cart:user:${userId}`,
  salesRanking: 'ranking:events:sales',
  views: 'stats:event:views',
  reviewVoters: (reviewId) => `review:${reviewId}:voters`,
};

// Stratégie d'invalidation : toute écriture qui modifie une fiche événement
// (achat, annulation, avis, modification admin) supprime sa clé de cache.
// La lecture suivante la reconstruit à partir de PostgreSQL + MongoDB.
export const invalidateEvent = (id) => redis.del(keys.eventCache(id));
