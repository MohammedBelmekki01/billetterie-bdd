import { z } from 'zod';
import { ObjectId } from 'mongodb';
import { HttpError } from './errors.js';

// Identifiant numérique PostgreSQL dans l'URL (/events/:id)
export const idParam = z.coerce.number().int().positive();

export function parseId(value, what = 'Identifiant') {
  const r = idParam.safeParse(value);
  if (!r.success) throw new HttpError(400, `${what} invalide`);
  return r.data;
}

// Identifiant MongoDB (/reviews/:id)
export function parseObjectId(value) {
  if (!ObjectId.isValid(value)) throw new HttpError(400, 'Identifiant d\'avis invalide');
  return new ObjectId(value);
}

// Pagination commune : ?page=1&limit=20
export const pagination = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});
