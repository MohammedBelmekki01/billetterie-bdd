import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { api } from '../api.js';
import { useStore, useToast } from '../store.jsx';
import { Empty, Source } from '../components/ui.jsx';
import { formatDateTime, formatPrice } from '../format.js';

// Compte à rebours de l'expiration du panier (TTL de la clé Redis)
function useCountdown(seconds) {
  const [left, setLeft] = useState(seconds);
  useEffect(() => {
    setLeft(seconds);
    if (seconds == null || seconds < 0) return undefined;
    const t = setInterval(() => setLeft((s) => (s > 0 ? s - 1 : 0)), 1000);
    return () => clearInterval(t);
  }, [seconds]);
  return left;
}

export default function Cart() {
  const { cart, setCart, refreshCart } = useStore();
  const notify = useToast();
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);
  const left = useCountdown(cart.expires_in);

  useEffect(() => { refreshCart(); }, [refreshCart]);
  useEffect(() => { if (left === 0 && cart.items.length) refreshCart(); }, [left, cart.items.length, refreshCart]);

  const remove = async (id) => {
    try { setCart(await api.del(`/cart/items/${id}`)); } catch (err) { notify(err.message, 'error'); }
  };

  const checkout = async () => {
    setBusy(true);
    try {
      const order = await api.post('/orders');
      await refreshCart();
      notify(`Commande n° ${order.id} confirmée`, 'success');
      navigate(`/compte/commandes/${order.id}`);
    } catch (err) {
      notify(err.message, 'error');
    } finally {
      setBusy(false);
    }
  };

  if (cart.items.length === 0) {
    return (
      <Empty>
        <h2>Votre panier est vide</h2>
        <p>Un panier sans activité est automatiquement vidé au bout de 15 minutes.</p>
        <Link to="/" className="btn btn-primary">Voir les événements</Link>
      </Empty>
    );
  }

  const mm = String(Math.floor((left ?? 0) / 60)).padStart(2, '0');
  const ss = String((left ?? 0) % 60).padStart(2, '0');

  return (
    <>
      <div className="row" style={{ marginBottom: 20 }}>
        <h1 style={{ margin: 0 }}>Mon panier</h1>
        <Source db="redis">HASH cart:user · TTL</Source>
      </div>
      <div className="layout-detail">
        <div className="card">
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr><th>Événement</th><th>Billet</th><th className="right">Prix</th><th className="right">Qté</th><th className="right">Sous-total</th><th /></tr>
              </thead>
              <tbody>
                {cart.items.map((i) => (
                  <tr key={i.ticket_type_id}>
                    <td>
                      <Link to={`/evenements/${i.event_id}`}><strong>{i.event_title}</strong></Link>
                      <div className="subtle">{formatDateTime(i.starts_at)}</div>
                    </td>
                    <td>{i.name}</td>
                    <td className="right">{formatPrice(i.price)}</td>
                    <td className="right">{i.quantity}</td>
                    <td className="right"><strong>{formatPrice(i.subtotal)}</strong></td>
                    <td className="right"><button className="btn btn-sm btn-ghost" onClick={() => remove(i.ticket_type_id)}>Retirer</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="card card-body sticky stack">
          <div className="row"><span className="muted">Total</span><span className="spacer" /><span className="price" style={{ fontSize: '1.4rem' }}>{formatPrice(cart.total)}</span></div>
          <div className="alert alert-info small">
            Panier conservé encore <strong className="mono">{mm}:{ss}</strong>. Les places sont garanties au paiement.
          </div>
          <button className="btn btn-primary btn-block" disabled={busy} onClick={checkout}>
            {busy ? 'Paiement…' : 'Payer (simulation)'}
          </button>
          <p className="subtle" style={{ margin: 0 }}>Le paiement appelle la fonction PostgreSQL <code>place_order</code> : stock vérifié et billets générés dans une seule transaction.</p>
        </div>
      </div>
    </>
  );
}
