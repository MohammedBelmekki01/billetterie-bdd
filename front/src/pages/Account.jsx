import { useState } from 'react';
import { Link } from 'react-router';
import { api, qs } from '../api.js';
import { useStore, useToast } from '../store.jsx';
import { Empty, ErrorBox, Source, Spinner, StatusBadge, Stars, useAsync } from '../components/ui.jsx';
import { ORDER_STATUS, formatDate, formatPrice } from '../format.js';

export default function Account() {
  const { user } = useStore();
  const [tab, setTab] = useState('orders');
  return (
    <>
      <h1>Bonjour {user.first_name}</h1>
      <p className="muted">{user.email} · client depuis le {formatDate(user.created_at)}</p>
      <div className="tabs" role="tablist">
        <button className={tab === 'orders' ? 'active' : ''} onClick={() => setTab('orders')}>Mes commandes</button>
        <button className={tab === 'reviews' ? 'active' : ''} onClick={() => setTab('reviews')}>Mes avis</button>
      </div>
      {tab === 'orders' ? <Orders /> : <MyReviews />}
    </>
  );
}

function Orders() {
  const [page, setPage] = useState(1);
  const orders = useAsync(() => api.get(`/orders${qs({ page, limit: 10 })}`), [page]);
  if (orders.loading && !orders.data) return <Spinner />;
  if (orders.error) return <ErrorBox error={orders.error} />;
  const { items, total } = orders.data;
  if (total === 0) return <Empty>Aucune commande pour le moment. <Link to="/">Découvrir les événements</Link></Empty>;

  return (
    <div className="card">
      <div className="card-head"><h3>{total} commande{total > 1 ? 's' : ''}</h3><span className="spacer" /><Source db="pg">index orders(user_id, created_at)</Source></div>
      <div className="table-wrap">
        <table className="table">
          <thead><tr><th>N°</th><th>Date</th><th>Événement(s)</th><th className="right">Billets</th><th className="right">Total</th><th>Statut</th></tr></thead>
          <tbody>
            {items.map((o) => (
              <tr key={o.id}>
                <td><Link to={`/compte/commandes/${o.id}`}>#{o.id}</Link></td>
                <td>{formatDate(o.created_at)}</td>
                <td>{o.events}</td>
                <td className="right">{o.tickets}</td>
                <td className="right">{formatPrice(o.total_amount)}</td>
                <td><StatusBadge map={ORDER_STATUS} status={o.status} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {total > 10 && (
        <div className="pagination" style={{ paddingBottom: 16 }}>
          <button className="btn btn-sm" disabled={page <= 1} onClick={() => setPage(page - 1)}>Précédent</button>
          <span className="subtle">Page {page} / {Math.ceil(total / 10)}</span>
          <button className="btn btn-sm" disabled={page >= Math.ceil(total / 10)} onClick={() => setPage(page + 1)}>Suivant</button>
        </div>
      )}
    </div>
  );
}

function MyReviews() {
  const notify = useToast();
  const reviews = useAsync(() => api.get('/me/reviews'), []);

  const remove = async (id) => {
    if (!window.confirm('Supprimer cet avis ?')) return;
    try {
      await api.del(`/reviews/${id}`);
      notify('Avis supprimé', 'success');
      reviews.reload();
    } catch (err) {
      notify(err.message, 'error');
    }
  };

  if (reviews.loading && !reviews.data) return <Spinner />;
  if (reviews.error) return <ErrorBox error={reviews.error} />;
  if (reviews.data.length === 0) {
    return <Empty>Vous n'avez pas encore laissé d'avis. Vous pourrez noter un événement après y avoir assisté.</Empty>;
  }
  return (
    <div className="card card-body">
      <div className="row" style={{ marginBottom: 8 }}><h3 style={{ margin: 0 }}>{reviews.data.length} avis</h3><Source db="mongo">reviews · index user_id</Source></div>
      {reviews.data.map((r) => (
        <div className="review" key={r._id}>
          <div className="row">
            <Stars value={r.rating} />
            <strong>{r.title}</strong>
            <span className="spacer" />
            <Link to={`/evenements/${r.event_id}`} className="small">Voir l'événement</Link>
            <button className="btn btn-sm btn-danger" onClick={() => remove(r._id)}>Supprimer</button>
          </div>
          <p style={{ margin: '6px 0 0' }}>{r.comment}</p>
          <span className="subtle">{formatDate(r.created_at)}</span>
        </div>
      ))}
    </div>
  );
}
