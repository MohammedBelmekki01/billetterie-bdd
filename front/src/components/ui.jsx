import { useCallback, useEffect, useState } from 'react';

// Pastille indiquant quelle base de données a servi un bloc de la page
const SOURCES = { pg: 'PostgreSQL', mongo: 'MongoDB', redis: 'Redis' };
export function Source({ db, children }) {
  return (
    <span className="source" title={`Données servies par ${SOURCES[db]}`}>
      <span className={`dot dot-${db}`} />
      {SOURCES[db]}{children && <> · {children}</>}
    </span>
  );
}

export function Stars({ value = 0, size }) {
  const full = Math.round(value);
  return (
    <span className="stars" style={size && { fontSize: size }} aria-label={`${value} sur 5`}>
      {[1, 2, 3, 4, 5].map((i) => <span key={i} className={i <= full ? '' : 'off'}>★</span>)}
    </span>
  );
}

export function StatusBadge({ map, status }) {
  const [label, tone] = map[status] ?? [status, ''];
  return <span className={`badge ${tone ? `badge-${tone}` : ''}`}>{label}</span>;
}

export const Spinner = () => <div className="spinner" aria-label="Chargement" />;

export function Empty({ children }) {
  return <div className="empty">{children}</div>;
}

export function ErrorBox({ error }) {
  if (!error) return null;
  return <div className="alert alert-error">{error.message || String(error)}</div>;
}

// Charge une ressource asynchrone ; relance quand les dépendances changent
export function useAsync(fn, deps) {
  const [state, setState] = useState({ data: null, error: null, loading: true });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const run = useCallback(fn, deps);
  const reload = useCallback(() => {
    setState((s) => ({ ...s, loading: true, error: null }));
    return run()
      .then((data) => setState({ data, error: null, loading: false }))
      .catch((error) => setState({ data: null, error, loading: false }));
  }, [run]);
  useEffect(() => { reload(); }, [reload]);
  return { ...state, reload };
}
