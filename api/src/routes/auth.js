import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { query } from '../db/postgres.js';
import { HttpError, notFound } from '../lib/errors.js';
import { requireAuth, signToken } from '../lib/auth.js';

const router = Router();

const USER_COLUMNS = 'id, email, first_name, last_name, role, created_at';

const registerSchema = z.object({
  email: z.email().transform((e) => e.toLowerCase()),
  password: z.string().min(8, 'Au moins 8 caractères'),
  first_name: z.string().trim().min(1).max(60),
  last_name: z.string().trim().min(1).max(60),
});

// POST /api/auth/register — création de compte (PostgreSQL)
router.post('/register', async (req, res) => {
  const data = registerSchema.parse(req.body);
  const hash = await bcrypt.hash(data.password, 10);
  // email UNIQUE : un doublon déclenche l'erreur 23505 -> 409
  const { rows: [user] } = await query(
    `INSERT INTO users (email, first_name, last_name, password_hash)
     VALUES ($1, $2, $3, $4) RETURNING ${USER_COLUMNS}`,
    [data.email, data.first_name, data.last_name, hash],
  );
  res.status(201).json({ user, token: signToken(user) });
});

const loginSchema = z.object({ email: z.string().trim().toLowerCase(), password: z.string() });

// POST /api/auth/login — renvoie un jeton JWT
router.post('/login', async (req, res) => {
  const { email, password } = loginSchema.parse(req.body);
  const { rows: [row] } = await query(
    `SELECT ${USER_COLUMNS}, password_hash FROM users WHERE email = $1`, [email],
  );
  // même message que l'email existe ou non (pas d'énumération des comptes)
  if (!row || !(await bcrypt.compare(password, row.password_hash))) {
    throw new HttpError(401, 'Email ou mot de passe incorrect');
  }
  const { password_hash: _, ...user } = row;
  res.json({ user, token: signToken(user) });
});

// GET /api/auth/me — profil + petit résumé d'activité
router.get('/me', requireAuth, async (req, res) => {
  const { rows: [user] } = await query(
    `SELECT ${USER_COLUMNS},
            (SELECT count(*) FROM orders o WHERE o.user_id = u.id AND o.status = 'paid') AS paid_orders
       FROM users u WHERE id = $1`,
    [req.user.id],
  );
  if (!user) throw notFound('Utilisateur');
  res.json(user);
});

export default router;
