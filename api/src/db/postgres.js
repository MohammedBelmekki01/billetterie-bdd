import pg from 'pg';
import { config } from '../config.js';

// Par défaut, pg renvoie BIGINT et NUMERIC sous forme de chaînes (pour ne pas
// perdre de précision). Nos identifiants et nos prix tiennent dans un Number JS.
pg.types.setTypeParser(pg.types.builtins.INT8, (v) => Number(v));
pg.types.setTypeParser(pg.types.builtins.NUMERIC, (v) => Number(v));

export const pool = new pg.Pool({ ...config.postgres, max: 10 });

// Raccourci pour les requêtes simples (paramètres $1, $2... : pas d'injection SQL)
export const query = (text, params) => pool.query(text, params);

// Exécute fn dans une transaction : COMMIT si tout passe, ROLLBACK sinon
export async function transaction(fn) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}
