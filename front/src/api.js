// Client HTTP de l'API. Toutes les requêtes passent par /api (même origine :
// proxy Vite en développement, nginx dans Docker).

const TOKEN_KEY = 'billetterie.token';

export function getToken() {
  try { return localStorage.getItem(TOKEN_KEY); } catch { return null; }
}

export function setToken(token) {
  try {
    if (token) localStorage.setItem(TOKEN_KEY, token);
    else localStorage.removeItem(TOKEN_KEY);
  } catch { /* stockage indisponible : la session ne survivra pas au rechargement */ }
}

export class ApiError extends Error {
  constructor(status, message, details) {
    super(message);
    this.status = status;
    this.details = details;
  }
}

// Renvoie { data, headers } ; lève ApiError avec le message de l'API en cas d'échec
export async function request(path, { method = 'GET', body } = {}) {
  const token = getToken();
  let res;
  try {
    res = await fetch(`/api${path}`, {
      method,
      headers: {
        ...(body !== undefined && { 'Content-Type': 'application/json' }),
        ...(token && { Authorization: `Bearer ${token}` }),
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new ApiError(0, 'Impossible de joindre le serveur');
  }

  const text = await res.text();
  const data = text ? JSON.parse(text) : null;
  if (!res.ok) {
    const detail = data?.details?.map((d) => `${d.field} : ${d.message}`).join(' · ');
    throw new ApiError(res.status, detail ? `${data.error} — ${detail}` : data?.error || `Erreur ${res.status}`, data?.details);
  }
  return { data, headers: res.headers };
}

export const api = {
  get: (path) => request(path).then((r) => r.data),
  post: (path, body) => request(path, { method: 'POST', body }).then((r) => r.data),
  put: (path, body) => request(path, { method: 'PUT', body }).then((r) => r.data),
  patch: (path, body) => request(path, { method: 'PATCH', body }).then((r) => r.data),
  del: (path) => request(path, { method: 'DELETE' }).then((r) => r.data),
};

// Construit une query string en ignorant les valeurs vides
export function qs(params) {
  const s = new URLSearchParams(
    Object.entries(params).filter(([, v]) => v !== undefined && v !== null && v !== ''),
  ).toString();
  return s ? `?${s}` : '';
}
