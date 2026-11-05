import { useState } from 'react';
import { Link, useParams } from 'react-router';
import { api } from '../api.js';
import { useStore, useToast } from '../store.jsx';
import { Empty, ErrorBox, Source, Spinner, StatusBadge, useAsync } from '../components/ui.jsx';
import { ORDER_STATUS, TICKET_STATUS, formatDateTime, formatPrice } from '../format.js';

export default function OrderPage() {
  const { id } = useParams();
  const { refreshCart } = useStore();
  const notify = useToast();
  const [busy, setBusy] = useState(false);
  const order = useAsync(() => api.get(`/orders/${id}`), [id]);

  if (order.loading && !order.data) return <Spinner />;
  if (order.error) {
    return order.error.status === 404
      ? <Empty><h2>Commande introuvable</h2><Link to="/compte">Retour à mon compte</Link></Empty>
      : <ErrorBox error={order.error} />;
  }
  const o = order.data;
  const future = o.items.every((i) => new Date(i.event.starts_at) > new Date());
  const canCancel = ['paid', 'pending'].includes(o.status) && future;

  const cancel = async () => {
    if (!window.confirm('Annuler cette commande ? Les places seront remises en vente.')) return;
    setBusy(true);
    try {
      await api.post(`/orders/${o.id}/cancel`);
      notify('Commande annulée', 'success');
      order.reload();
      refreshCart();
    } catch (err) {
      notify(err.message, 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <Link to="/compte" className="small">← Mes commandes</Link>
      <div className="row" style={{ margin: '12px 0 20px' }}>
        <h1 style={{ margin: 0 }}>Commande n° {o.id}</h1>
        <StatusBadge map={ORDER_STATUS} status={o.status} />
        <span className="spacer" />
        <Source db="pg">orders · order_items · tickets</Source>
      </div>

      <div className="layout-detail">
        <div className="stack">
          {o.items.map((item, idx) => {
            const past = new Date(item.event.starts_at) < new Date();
            return (
              <div className="card" key={idx}>
                <div className="card-head">
                  <div>
                    <Link to={`/evenements/${item.event.id}`}><h3>{item.event.title}</h3></Link>
                    <span className="subtle">{formatDateTime(item.event.starts_at)}</span>
                  </div>
                  <span className="spacer" />
                  {past && o.status === 'paid' && <Link to={`/evenements/${item.event.id}#avis`} className="btn btn-sm">Donner mon avis</Link>}
                </div>
                <div className="card-body">
                  <p className="muted">{item.quantity} × {item.ticket_type} à {formatPrice(item.unit_price)}</p>
                  {item.tickets.length === 0 ? <p className="subtle">Billets émis après paiement.</p> : (
                    <div className="table-wrap">
                      <table className="table">
                        <thead><tr><th>Code billet</th><th>Titulaire</th><th>Statut</th></tr></thead>
                        <tbody>
                          {item.tickets.map((t) => (
                            <tr key={t.code}>
                              <td><span className="ticket-code">{t.code}</span></td>
                              <td>{t.holder_name}</td>
                              <td><StatusBadge map={TICKET_STATUS} status={t.status} /></td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        <div className="card card-body stack sticky">
          <div className="row"><span className="muted">Passée le</span><span className="spacer" />{formatDateTime(o.created_at)}</div>
          <div className="row"><span className="muted">Total</span><span className="spacer" /><span className="price" style={{ fontSize: '1.3rem' }}>{formatPrice(o.total_amount)}</span></div>
          {canCancel && (
            <button className="btn btn-danger btn-block" disabled={busy} onClick={cancel}>Annuler la commande</button>
          )}
          {canCancel && <p className="subtle" style={{ margin: 0 }}>L'annulation déclenche <code>orders_cancel</code> : places remises en vente, billets invalidés.</p>}
        </div>
      </div>
    </>
  );
}
