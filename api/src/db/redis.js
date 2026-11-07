import { createClient } from 'redis';
import { config } from '../config.js';

export const redis = createClient({ url: config.redis.url, password: config.redis.password });
redis.on('error', (err) => console.error('[redis]', err.message));

export const keys = {
  eventCache: (id) => `cache:event:${id}`,
  cart: (userId) => `cart:user:${userId}`,
  salesRanking: 'ranking:events:sales',
  views: 'stats:event:views',
  reviewVoters: (reviewId) => `review:${reviewId}:voters`,
};

export const invalidateEvent = (id) => redis.del(keys.eventCache(id));
