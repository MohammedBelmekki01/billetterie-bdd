import pg from 'pg';
import { MongoClient } from 'mongodb';
import { createClient } from 'redis';
import { createRandom, buildEventPage, buildReview } from './content.js';

const env = process.env;
const REVIEW_RATE = 0.45;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function retry(label, fn, attempts = 30) {
  for (let i = 1; ; i++) {
    try {
      return await fn();
    } catch (err) {
      if (i >= attempts) throw err;
      console.log(`[seed] ${label} pas encore prêt (${err.message}), nouvel essai...`);
      await sleep(2000);
    }
  }
}

async function main() {
  const pgPool = new pg.Pool({
    host: env.PGHOST || 'postgres',
    database: env.POSTGRES_DB || 'billetterie',
    user: env.APP_DB_USER || 'billetterie_app',
    password: env.APP_DB_PASSWORD || 'app_dev_only',
  });
  await retry('PostgreSQL', () => pgPool.query('SELECT 1 FROM tickets LIMIT 1'));

  const mongoUrl = `mongodb://${env.APP_MONGO_USER || 'billetterie_app'}:${env.APP_MONGO_PASSWORD || 'app_dev_only'}`
    + `@${env.MONGO_HOST || 'mongo'}:27017/${env.MONGO_DB || 'billetterie'}`;
  const mongo = new MongoClient(mongoUrl, { serverSelectionTimeoutMS: 3000 });
  await retry('MongoDB', async () => {
    await mongo.connect();
    await mongo.db().command({ ping: 1 });
  });
  const db = mongo.db();

  const redis = createClient({
    url: `redis://${env.REDIS_HOST || 'redis'}:6379`,
    password: env.REDIS_PASSWORD || 'redis_dev_only',
  });
  await retry('Redis', () => redis.connect());

  const existing = await db.collection('event_pages').estimatedDocumentCount();
  if (existing > 0) {
    console.log(`[seed] MongoDB déjà peuplé (${existing} pages), étape ignorée.`);
  } else {
    const rnd = createRandom(42);

    const { rows: events } = await pgPool.query(`
      SELECT e.id, e.title, e.starts_at, c.slug AS category, v.name AS venue, v.city
        FROM events e
        JOIN categories c ON c.id = e.category_id
        JOIN venues v     ON v.id = e.venue_id
       ORDER BY e.id`);
    const pages = events.map((ev) => buildEventPage(ev, rnd));
    await db.collection('event_pages').insertMany(pages);
    console.log(`[seed] event_pages : ${pages.length} documents`);


    const { rows: attendees } = await pgPool.query(`
      SELECT DISTINCT e.id AS event_id, e.ends_at, u.id AS user_id, u.first_name, u.last_name
        FROM tickets t
        JOIN order_items oi  ON oi.id = t.order_item_id
        JOIN orders o        ON o.id = oi.order_id
        JOIN users u         ON u.id = o.user_id
        JOIN ticket_types tt ON tt.id = oi.ticket_type_id
        JOIN events e        ON e.id = tt.event_id
       WHERE t.status = 'used' AND e.status = 'completed'
       ORDER BY e.id, u.id`);

    const quality = new Map();
    const reviews = [];
    for (const att of attendees) {
      if (rnd() > REVIEW_RATE) continue;
      if (!quality.has(att.event_id)) quality.set(att.event_id, 2.5 + rnd() * 2.3);
      reviews.push(buildReview(att, quality.get(att.event_id), rnd));
    }
    for (let i = 0; i < reviews.length; i += 1000) {
      await db.collection('reviews').insertMany(reviews.slice(i, i + 1000), { ordered: false });
    }
    console.log(`[seed] reviews : ${reviews.length} documents (sur ${attendees.length} spectateurs)`);

    await db.collection('reviews').aggregate([
      { $group: { _id: '$event_id', average: { $avg: '$rating' }, count: { $sum: 1 } } },
      { $project: { _id: 0, event_id: '$_id', rating: { average: { $round: ['$average', 2] }, count: '$count' } } },
      { $merge: { into: 'event_pages', on: 'event_id', whenMatched: 'merge', whenNotMatched: 'discard' } },
    ]).toArray();
    console.log('[seed] notes moyennes calculées ($merge vers event_pages)');
  }

  const { rows: sales } = await pgPool.query(`
    SELECT tt.event_id, sum(oi.quantity)::int AS sold
      FROM order_items oi
      JOIN orders o        ON o.id = oi.order_id
      JOIN ticket_types tt ON tt.id = oi.ticket_type_id
      JOIN events e        ON e.id = tt.event_id
     WHERE o.status = 'paid'
       AND o.created_at > now() - interval '30 days'
       AND e.status = 'published' AND e.starts_at > now()
     GROUP BY tt.event_id`);

  const key = 'ranking:events:sales';
  const tx = redis.multi().del(key);
  if (sales.length > 0) {
    tx.zAdd(key, sales.map((s) => ({ score: s.sold, value: String(s.event_id) })));
  }
  await tx.set('meta:seeded_at', new Date().toISOString()).exec();
  console.log(`[seed] Redis ${key} : ${sales.length} événements classés`);

  await Promise.all([pgPool.end(), mongo.close(), redis.quit()]);
  console.log('[seed] Terminé.');
}

main().catch((err) => {
  console.error('[seed] ÉCHEC :', err);
  process.exit(1);
});
