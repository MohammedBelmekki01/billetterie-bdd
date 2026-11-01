import { ZodError } from 'zod';

export class HttpError extends Error {
  constructor(status, message, details) {
    super(message);
    this.status = status;
    this.details = details;
  }
}

export const notFound = (what = 'Ressource') => new HttpError(404, `${what} introuvable`);

// Route inconnue
export function notFoundHandler(req, res) {
  res.status(404).json({ error: `Route ${req.method} ${req.path} introuvable` });
}

// Codes d'erreur PostgreSQL -> statut HTTP
// https://www.postgresql.org/docs/current/errcodes-appendix.html
const PG_ERRORS = {
  '23505': [409, 'Cette valeur existe déjà'],                      // unique_violation
  '23503': [409, 'Ressource liée : opération impossible'],         // foreign_key_violation
  '23001': [409, 'Des billets ont déjà été vendus : suppression impossible'], // restrict_violation
  '23514': [409, null],                                            // check_violation (ex. stock)
  '23502': [400, 'Champ obligatoire manquant'],                    // not_null_violation
  '22P02': [400, 'Format de donnée invalide'],                     // invalid_text_representation
  '22023': [400, null],                                            // invalid_parameter_value
  'P0002': [404, null],                                            // no_data_found
};

// Gestionnaire d'erreurs central : toutes les routes y aboutissent (Express 5
// transmet automatiquement les erreurs des fonctions async).
// eslint-disable-next-line no-unused-vars
export function errorHandler(err, req, res, next) {
  if (err instanceof HttpError) {
    return res.status(err.status).json({ error: err.message, details: err.details });
  }
  if (err instanceof ZodError) {
    return res.status(400).json({
      error: 'Données invalides',
      details: err.issues.map((i) => ({ field: i.path.join('.'), message: i.message })),
    });
  }
  if (err.type === 'entity.parse.failed') {
    return res.status(400).json({ error: 'Corps JSON mal formé' });
  }
  // PostgreSQL : le message des RAISE EXCEPTION de nos fonctions est destiné au client
  if (err.code && PG_ERRORS[err.code]) {
    const [status, message] = PG_ERRORS[err.code];
    return res.status(status).json({ error: message || err.message });
  }
  // MongoDB : doublon (index unique) ou document refusé par le validateur
  if (err.code === 11000) {
    return res.status(409).json({ error: 'Doublon : cette ressource existe déjà' });
  }
  if (err.code === 121) {
    return res.status(400).json({ error: 'Document refusé par le validateur MongoDB' });
  }

  console.error(err);
  return res.status(500).json({ error: 'Erreur interne du serveur' });
}
