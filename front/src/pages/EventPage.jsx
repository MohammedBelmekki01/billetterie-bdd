import { useState } from 'react';
import { Link, useParams } from 'react-router';
import { api, qs, request } from '../api.js';
import { useStore, useToast } from '../store.jsx';
import CategoryDetails from '../components/CategoryDetails.jsx';
import { categoryLabel } from '../components/EventCard.jsx';
import { Empty, ErrorBox, Source, Spinner, StatusBadge, Stars, useAsync } from '../components/ui.jsx';
import { EVENT_STATUS, coverUrl, formatDate, formatDateTime, formatPrice } from '../format.js';

export default function EventPage() {
  const { id } = useParams();
  // request() pour lire aussi l'en-tête X-Cache (HIT = servi par Redis)
  const event = useAsync(() => request(`/events/${id}`).then((r) => ({ ...r.data, cache: r.headers.get('X-Cache') })), [id]);

  if (event.loading && !event.data) return <Spinner />;
  if (event.error) {
    return event.error.status === 404
      ? <Empty><h2>Événement introuvable</h2><Link to="/">Retour aux événements</Link></Empty>
      : <ErrorBox error={event.error} />;
  }
  const ev = event.data;
  const page = ev.page ?? {};

  return (
    <>
      <div className="event-cover" style={{ backgroundImage: `url(${coverUrl(ev.id, 1400, 530)})` }} />

      <div className="row event-title">
        <span className="badge badge-primary">{ev.category.name}</span>
        <StatusBadge map={EVENT_STATUS} status={ev.status} />
        <span className="spacer" />
        <Source db="pg">référence</Source>
        <Source db="mongo">contenu</Source>
        <Source db="redis">cache {ev.cache} · {ev.views} vues</Source>
      </div>
      <h1 style={{ marginTop: 12 }}>{ev.title}</h1>
      <div className="facts">
        <span><strong>{formatDateTime(ev.starts_at)}</strong></span>
        <span>{ev.venue.name}, {ev.venue.city}</span>
        {page.rating?.count > 0 && <span><Stars value={page.rating.average} /> {page.rating.average} · {page.rating.count} avis</span>}
      </div>

      <div className="layout-detail" style={{ marginTop: 24 }}>
        <div className="stack">
          <div className="card card-body">
            <h2>À propos</h2>
            <p>{page.description}</p>
            {page.tags?.length > 0 && (
              <div className="chips">{page.tags.map((t) => <span key={t} className="badge">#{t}</span>)}</div>
            )}
          </div>

          <div className="card card-body">
            <div className="row" style={{ marginBottom: 12 }}>
              <h2 style={{ margin: 0 }}>{categoryLabel(ev.category.slug)} : le détail</h2>
              <Source db="mongo">champs propres à la catégorie</Source>
            </div>
            <CategoryDetails page={page} />
          </div>

          <div className="card card-body">
            <h2>Infos pratiques</h2>
            <dl className="kv">
              <dt>Adresse</dt><dd>{ev.venue.address}</dd>
              <dt>Capacité</dt><dd>{ev.venue.capacity} places</dd>
              {page.practical?.doors_open && <><dt>Ouverture des portes</dt><dd>{formatDateTime(page.practical.doors_open)}</dd></>}
              {page.practical && <><dt>Âge minimum</dt><dd>{page.practical.age_min ? `${page.practical.age_min} ans` : 'Tout public'}</dd></>}
              {page.practical?.accessibility?.length > 0 && <><dt>Accessibilité</dt><dd>{page.practical.accessibility.join(', ')}</dd></>}
            </dl>
            {page.faq?.length > 0 && (
              <>
                <h3 style={{ marginTop: 20 }}>Questions fréquentes</h3>
                {page.faq.map((f) => <p key={f.q}><strong>{f.q}</strong><br /><span className="muted">{f.a}</span></p>)}
              </>
            )}
          </div>

          <Reviews event={ev} onChange={event.reload} />
        </div>

        <div className="sticky">
          <Tickets event={ev} />
        </div>
      </div>
    </>
  );
}

// -----------------------------------------------------------------------------
// Achat : ajout au panier Redis
// -----------------------------------------------------------------------------
function Tickets({ event }) {
  const { user, setCart } = useStore();
  const notify = useToast();
  const [qty, setQty] = useState({});
  const [busy, setBusy] = useState(null);
  const onSale = event.status === 'published' && new Date(event.starts_at) > new Date();

  const add = async (tt) => {
    setBusy(tt.id);
    try {
      setCart(await api.put('/cart/items', { ticket_type_id: tt.id, quantity: qty[tt.id] ?? 1 }));
      notify(`${tt.name} ajouté au panier`, 'success');
    } catch (err) {
      notify(err.message, 'error');
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="card">
      <div className="card-head">
        <h3>Billets</h3>
        <span className="spacer" />
        <Source db="pg">stock</Source>
      </div>
      <div className="card-body" style={{ paddingTop: 4, paddingBottom: 8 }}>
        {event.ticket_types.map((tt) => (
          <div className="ticket-row" key={tt.id}>
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 600 }}>{tt.name}</div>
              <div className="subtle">
                {tt.remaining === 0 ? 'Complet' : tt.remaining < 50 ? `Plus que ${tt.remaining} places` : `${tt.remaining} places`}
              </div>
            </div>
            <span className="price">{formatPrice(tt.price)}</span>
            {onSale && user && tt.remaining > 0 && (
              <>
                <select
                  className="select"
                  value={qty[tt.id] ?? 1}
                  onChange={(e) => setQty({ ...qty, [tt.id]: Number(e.target.value) })}
                  aria-label={`Quantité ${tt.name}`}
                >
                  {Array.from({ length: Math.min(10, tt.remaining) }, (_, i) => i + 1).map((n) => <option key={n}>{n}</option>)}
                </select>
                <button className="btn btn-sm btn-primary" disabled={busy === tt.id} onClick={() => add(tt)}>Ajouter</button>
              </>
            )}
          </div>
        ))}
      </div>
      <div className="card-body" style={{ borderTop: '1px solid var(--border)' }}>
        {!onSale ? (
          <p className="muted small" style={{ margin: 0 }}>Cet événement n'est plus en vente.</p>
        ) : !user ? (
          <Link to="/connexion" className="btn btn-primary btn-block">Se connecter pour réserver</Link>
        ) : (
          <Link to="/panier" className="btn btn-block">Voir mon panier</Link>
        )}
      </div>
    </div>
  );
}

// -----------------------------------------------------------------------------
// Avis : lecture MongoDB, écriture vérifiée dans PostgreSQL
// -----------------------------------------------------------------------------
function Reviews({ event, onChange }) {
  const { user } = useStore();
  const notify = useToast();
  const [sort, setSort] = useState('recent');
  const [limit, setLimit] = useState(5);
  const list = useAsync(() => api.get(`/events/${event.id}/reviews${qs({ sort, limit })}`), [event.id, sort, limit]);
  const rating = event.page?.rating;
  const isOver = new Date(event.ends_at) < new Date();

  const vote = async (review) => {
    try {
      await api.post(`/reviews/${review._id}/helpful`);
      notify('Merci pour votre vote', 'success');
      list.reload();
    } catch (err) {
      notify(err.message, 'error');
    }
  };

  return (
    <div className="card card-body" id="avis">
      <div className="row" style={{ marginBottom: 12 }}>
        <h2 style={{ margin: 0 }}>Avis des spectateurs</h2>
        <Source db="mongo">collection reviews</Source>
        <span className="spacer" />
        <select className="select" style={{ width: 'auto' }} value={sort} onChange={(e) => setSort(e.target.value)} aria-label="Trier les avis">
          <option value="recent">Plus récents</option>
          <option value="helpful">Plus utiles</option>
          <option value="rating">Mieux notés</option>
        </select>
      </div>

      {rating?.count > 0 && (
        <div className="row" style={{ marginBottom: 8 }}>
          <span className="rating-big">{rating.average.toFixed(1)}</span>
          <div><Stars value={rating.average} size="1.2rem" /><div className="subtle">{rating.count} avis vérifiés</div></div>
        </div>
      )}

      {user && isOver && <ReviewForm eventId={event.id} onDone={() => { list.reload(); onChange(); }} />}

      {list.loading && !list.data ? <Spinner /> : list.error ? <ErrorBox error={list.error} /> : list.data.total === 0 ? (
        <p className="muted">Aucun avis pour le moment{isOver ? '' : ' : les avis ouvrent après l\'événement'}.</p>
      ) : (
        <>
          {list.data.items.map((r) => (
            <div className="review" key={r._id}>
              <div className="row">
                <Stars value={r.rating} />
                <strong>{r.title}</strong>
                <span className="spacer" />
                <span className="subtle">{r.author.display_name} · {formatDate(r.created_at)}</span>
              </div>
              <p style={{ margin: '6px 0' }}>{r.comment}</p>
              <div className="row">
                {r.verified_purchase && <span className="badge badge-success">Achat vérifié</span>}
                {r.aspects && <span className="subtle">Son {r.aspects.son}/5 · Ambiance {r.aspects.ambiance}/5 · Organisation {r.aspects.organisation}/5</span>}
                <span className="spacer" />
                {user && <button className="btn btn-sm btn-ghost" onClick={() => vote(r)}>Utile ({r.helpful_votes ?? 0})</button>}
              </div>
            </div>
          ))}
          {list.data.total > list.data.items.length && (
            <button className="btn btn-sm" onClick={() => setLimit(limit + 10)}>Voir plus d'avis ({list.data.total - list.data.items.length})</button>
          )}
        </>
      )}
    </div>
  );
}

function ReviewForm({ eventId, onDone }) {
  const notify = useToast();
  const [form, setForm] = useState({ rating: 5, title: '', comment: '' });
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      await api.post(`/events/${eventId}/reviews`, { ...form, title: form.title || undefined });
      notify('Avis publié, merci !', 'success');
      setOpen(false);
      onDone();
    } catch (err) {
      notify(err.message, 'error');
    } finally {
      setBusy(false);
    }
  };

  if (!open) return <button className="btn btn-sm" style={{ marginBottom: 12 }} onClick={() => setOpen(true)}>Donner mon avis</button>;
  return (
    <form onSubmit={submit} className="stack" style={{ padding: 16, background: 'var(--bg)', borderRadius: 8, marginBottom: 12 }}>
      <div className="grid grid-2">
        <div className="field">
          <label htmlFor="r-rating">Note</label>
          <select id="r-rating" className="select" value={form.rating} onChange={(e) => setForm({ ...form, rating: Number(e.target.value) })}>
            {[5, 4, 3, 2, 1].map((n) => <option key={n} value={n}>{'★'.repeat(n)} ({n}/5)</option>)}
          </select>
        </div>
        <div className="field">
          <label htmlFor="r-title">Titre (facultatif)</label>
          <input id="r-title" className="input" maxLength={120} value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
        </div>
      </div>
      <div className="field">
        <label htmlFor="r-comment">Commentaire</label>
        <textarea id="r-comment" className="textarea" required minLength={3} maxLength={2000} value={form.comment} onChange={(e) => setForm({ ...form, comment: e.target.value })} />
      </div>
      <div className="row">
        <button className="btn btn-primary" disabled={busy}>Publier</button>
        <button type="button" className="btn btn-ghost" onClick={() => setOpen(false)}>Annuler</button>
        <span className="subtle">Réservé aux spectateurs ayant un billet (vérifié dans PostgreSQL).</span>
      </div>
    </form>
  );
}
