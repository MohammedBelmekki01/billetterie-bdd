import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { api, getToken, setToken } from './api.js';

// -----------------------------------------------------------------------------
// Notifications (toasts)
// -----------------------------------------------------------------------------
const ToastContext = createContext(null);

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const notify = useCallback((message, type = 'info') => {
    const id = Math.random();
    setToasts((t) => [...t, { id, message, type }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 4500);
  }, []);
  return (
    <ToastContext.Provider value={notify}>
      {children}
      <div className="toasts" role="status" aria-live="polite">
        {toasts.map((t) => <div key={t.id} className={`toast toast-${t.type}`}>{t.message}</div>)}
      </div>
    </ToastContext.Provider>
  );
}
export const useToast = () => useContext(ToastContext);

// -----------------------------------------------------------------------------
// Session utilisateur (jeton JWT) et panier Redis
// -----------------------------------------------------------------------------
const StoreContext = createContext(null);

export function StoreProvider({ children }) {
  const [user, setUser] = useState(null);
  const [ready, setReady] = useState(false);
  const [cart, setCart] = useState({ items: [], total: 0, expires_in: null });

  const refreshCart = useCallback(async () => {
    if (!getToken()) return setCart({ items: [], total: 0, expires_in: null });
    try { setCart(await api.get('/cart')); } catch { /* panier non bloquant */ }
  }, []);

  // Au chargement : on restaure la session si un jeton est présent
  useEffect(() => {
    if (!getToken()) { setReady(true); return; }
    api.get('/auth/me')
      .then((u) => { setUser(u); refreshCart(); })
      .catch(() => setToken(null))
      .finally(() => setReady(true));
  }, [refreshCart]);

  const value = useMemo(() => ({
    user,
    ready,
    cart,
    setCart,
    refreshCart,
    async login(email, password) {
      const r = await api.post('/auth/login', { email, password });
      setToken(r.token);
      setUser(r.user);
      await refreshCart();
      return r.user;
    },
    async register(form) {
      const r = await api.post('/auth/register', form);
      setToken(r.token);
      setUser(r.user);
      return r.user;
    },
    logout() {
      setToken(null);
      setUser(null);
      setCart({ items: [], total: 0, expires_in: null });
    },
  }), [user, ready, cart, refreshCart]);

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}
export const useStore = () => useContext(StoreContext);
