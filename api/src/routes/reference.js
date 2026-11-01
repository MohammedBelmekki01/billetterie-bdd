import { Router } from 'express';
import { query } from '../db/postgres.js';

// Données de référence pour les filtres et formulaires du frontend
const router = Router();

// GET /api/categories — avec le nombre d'événements à venir (LEFT JOIN : 0 inclus)
router.get('/categories', async (req, res) => {
  const { rows } = await query(`
    SELECT c.id, c.name, c.slug, count(e.id) AS upcoming_events
      FROM categories c
      LEFT JOIN events e ON e.category_id = c.id AND e.status = 'published' AND e.starts_at > now()
     GROUP BY c.id
     ORDER BY c.name`);
  res.json(rows);
});

// GET /api/venues?city=Lyon
router.get('/venues', async (req, res) => {
  const { rows } = await query(
    `SELECT id, name, city, capacity FROM venues
      WHERE $1::text IS NULL OR city ILIKE $1
      ORDER BY city, name`,
    [req.query.city || null],
  );
  res.json(rows);
});

// GET /api/cities
router.get('/cities', async (req, res) => {
  const { rows } = await query('SELECT DISTINCT city FROM venues ORDER BY city');
  res.json(rows.map((r) => r.city));
});

export default router;
