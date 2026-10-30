import { app } from './app.js';
import { config } from './config.js';
import { pool } from './db/postgres.js';
import { mongoClient } from './db/mongo.js';
import { redis } from './db/redis.js';

// Connexion aux trois bases avant d'accepter des requêtes
await Promise.all([pool.query('SELECT 1'), mongoClient.connect(), redis.connect()]);
console.log('[api] connecté à PostgreSQL, MongoDB et Redis');

const server = app.listen(config.port, () => {
  console.log(`[api] à l'écoute sur http://localhost:${config.port}/api`);
});

// Arrêt propre (docker compose stop envoie SIGTERM)
for (const signal of ['SIGTERM', 'SIGINT']) {
  process.on(signal, () => {
    server.close(async () => {
      await Promise.allSettled([pool.end(), mongoClient.close(), redis.quit()]);
      process.exit(0);
    });
  });
}
