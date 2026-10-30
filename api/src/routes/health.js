import { Router } from 'express';
import { query } from '../db/postgres.js';
import { mongo } from '../db/mongo.js';
import { redis } from '../db/redis.js';

const router = Router();

// GET /api/health — vérifie la connexion effective aux trois bases
router.get('/', async (req, res) => {
  const check = async (fn) => {
    const start = performance.now();
    try {
      await fn();
      return { status: 'ok', ms: Math.round(performance.now() - start) };
    } catch (err) {
      return { status: 'error', error: err.message };
    }
  };
  const [postgres, mongodb, redisStatus] = await Promise.all([
    check(() => query('SELECT 1')),
    check(() => mongo.command({ ping: 1 })),
    check(() => redis.ping()),
  ]);
  const databases = { postgres, mongodb, redis: redisStatus };
  const healthy = Object.values(databases).every((d) => d.status === 'ok');
  res.status(healthy ? 200 : 503).json({ status: healthy ? 'ok' : 'degraded', databases });
});

export default router;
