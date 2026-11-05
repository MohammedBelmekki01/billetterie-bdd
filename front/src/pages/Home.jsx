import { useState } from 'react';
import { useSearchParams } from 'react-router';
import { api, qs } from '../api.js';
import EventCard, { categoryLabel } from '../components/EventCard.jsx';
import { Empty, ErrorBox, Source, Spinner, Stars, useAsync } from '../components/ui.jsx';

const PAGE_SIZE = 12;

export default function Home() {
  const [params, setParams] = useSearchParams();
  const q = params.get('q') || '';
  const [search, setSearch] = useState(q);

  const filters = {
    category: params.get('category') || '',
    city: params.get('city') || '',
    max_price: params.get('max_price') || '',
    sort: params.get('sort') || 'date',
    page: Number(params.get('page') || 1),
  };
  const setFilter = (key, value) => {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value); else next.delete(key);
    if (key !== 'page') next.delete('page');
    setParams(next);
  };

  const refs = useAsync(() => Promise.all([api.get('/categories'), api.get('/cities')]), []);
  const trending = useAsync(() => api.get('/events/trending?limit=4'), []);
  const results = useAsync(
    () => (q ? api.get(`/events/search${qs({ q, limit: 12 })}`) : Promise.resolve(null)), [q],
  );
  const catalog = useAsync(
    () => api.get(`/events${qs({ ...filters, limit: PAGE_SIZE })}`),
    [filters.category, filters.city, filters.max_price, filters.sort, filters.page],
  );

  const onSearch = (e) => {
    e.preventDefault();
    setFilter('q', search.trim());
  };

  const [categories, cities] = refs.data ?? [[], []];
  const totalPages = catalog.data ? Math.max(1, Math.ceil(catalog.data.total / PAGE_SIZE)) : 1;

  return (
    <>
      <section className="hero">
        <h1>Concerts, spectacles, matchs : réservez vos places</h1>
        <p>Plus de 170 événements à venir dans 12 villes. Recherchez un artiste, une pièce ou un thème.</p>
        <form className="search" onSubmit={onSearch} role="search">
          <input
            className="input"
            placeholder="Ex. : festival jazz, Cyrano, Nova Lune…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            aria-label="Rechercher un événement"
          />
          <button className="btn btn-primary" type="submit">Rechercher</button>
        </form>
      </section>

      {q && (
        <section className="section">
          <div className="section-head">
            <h2>Résultats pour « {q} »</h2>
            <Source db="mongo">recherche plein texte</Source>
            <Source db="pg">prix</Source>
            <span className="spacer" />
            <button className="btn btn-sm btn-ghost" onClick={() => { setSearch(''); setFilter('q', ''); }}>Effacer</button>
          </div>
          {results.loading ? <Spinner /> : results.error ? <ErrorBox error={results.error} /> : results.data.length === 0 ? (
            <Empty>Aucun événement ne correspond à cette recherche.</Empty>
          ) : (
            <div className="grid grid-cards">
              {results.data.map((ev) => (
                <div key={ev.event_id} className="stack" style={{ display: 'flex', flexDirection: 'column' }}>
                  <EventCard event={ev} />
                  {ev.rating?.count > 0 && (
                    <span className="subtle"><Stars value={ev.rating.average} /> {ev.rating.average} ({ev.rating.count} avis)</span>
                  )}
                </div>
              ))}
            </div>
          )}
        </section>
      )}

      <section className="section">
        <div className="section-head">
          <h2>Tendances</h2>
          <span className="muted small">Les plus vendus ces 30 derniers jours</span>
          <Source db="redis">classement ZSET</Source>
        </div>
        {trending.loading ? <Spinner /> : trending.error ? <ErrorBox error={trending.error} /> : (
          <div className="grid grid-cards">
            {trending.data.map((ev) => <EventCard key={ev.event_id} event={ev} rank={ev.rank} />)}
          </div>
        )}
      </section>

      <section className="section">
        <div className="section-head">
          <h2>Tous les événements</h2>
          {catalog.data && <span className="muted small">{catalog.data.total} résultats</span>}
          <Source db="pg">vue v_upcoming_events</Source>
        </div>

        <div className="filters">
          <div className="field">
            <label htmlFor="f-cat">Catégorie</label>
            <select id="f-cat" className="select" value={filters.category} onChange={(e) => setFilter('category', e.target.value)}>
              <option value="">Toutes</option>
              {categories.map((c) => <option key={c.slug} value={c.slug}>{categoryLabel(c.slug)} ({c.upcoming_events})</option>)}
            </select>
          </div>
          <div className="field">
            <label htmlFor="f-city">Ville</label>
            <select id="f-city" className="select" value={filters.city} onChange={(e) => setFilter('city', e.target.value)}>
              <option value="">Toutes</option>
              {cities.map((c) => <option key={c}>{c}</option>)}
            </select>
          </div>
          <div className="field">
            <label htmlFor="f-price">Prix maximum</label>
            <select id="f-price" className="select" value={filters.max_price} onChange={(e) => setFilter('max_price', e.target.value)}>
              <option value="">Indifférent</option>
              {[25, 35, 50, 75].map((p) => <option key={p} value={p}>{p} €</option>)}
            </select>
          </div>
          <div className="field">
            <label htmlFor="f-sort">Trier par</label>
            <select id="f-sort" className="select" value={filters.sort} onChange={(e) => setFilter('sort', e.target.value)}>
              <option value="date">Date</option>
              <option value="price">Prix</option>
            </select>
          </div>
        </div>

        {catalog.loading ? <Spinner /> : catalog.error ? <ErrorBox error={catalog.error} /> : catalog.data.items.length === 0 ? (
          <Empty>Aucun événement ne correspond à ces filtres.</Empty>
        ) : (
          <>
            <div className="grid grid-cards">
              {catalog.data.items.map((ev) => <EventCard key={ev.event_id} event={ev} />)}
            </div>
            <div className="pagination">
              <button className="btn btn-sm" disabled={filters.page <= 1} onClick={() => setFilter('page', filters.page - 1)}>Précédent</button>
              <span className="muted small">Page {filters.page} / {totalPages}</span>
              <button className="btn btn-sm" disabled={filters.page >= totalPages} onClick={() => setFilter('page', filters.page + 1)}>Suivant</button>
            </div>
          </>
        )}
      </section>
    </>
  );
}
