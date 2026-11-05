import { useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { api } from '../api.js';
import { useToast } from '../store.jsx';
import { categoryLabel } from '../components/EventCard.jsx';
import { ErrorBox, Source, Spinner, StatusBadge, useAsync } from '../components/ui.jsx';
import { EVENT_STATUS, formatMoney, formatMonth, formatNumber, formatPrice } from '../format.js';

const BLUE = '#1d4ed8';
const axis = { fontSize: 12, fill: '#5b6474' };
const grid = <CartesianGrid stroke="#e3e6eb" vertical={false} />;

export default function Admin() {
  const stats = useAsync(() => Promise.all([
    api.get('/stats/monthly'),
    api.get('/stats/categories'),
    api.get('/stats/sales?limit=8'),
    api.get('/stats/top-customers'),
    api.get('/stats/reviews'),
    api.get('/stats/revenue-vs-rating'),
    api.get('/stats/inactive-users'),
  ]), []);

  if (stats.loading && !stats.data) return <Spinner />;
  if (stats.error) return <ErrorBox error={stats.error} />;
  const [monthly, categories, sales, customers, reviews, vsRating, inactive] = stats.data;

  const revenue = monthly.reduce((s, m) => s + m.revenue, 0);
  const orders = monthly.reduce((s, m) => s + m.orders, 0);
  const lastMonths = monthly.slice(-12);

  return (
    <>
      <div className="row" style={{ marginBottom: 20 }}>
        <h1 style={{ margin: 0 }}>Tableau de bord</h1>
        <span className="spacer" />
        <button className="btn btn-sm" onClick={stats.reload}>Actualiser</button>
      </div>

      <div className="grid grid-4">
        <Kpi label="Chiffre d'affaires" value={formatMoney(revenue)} source="pg" />
        <Kpi label="Commandes payées" value={formatNumber(orders)} source="pg" />
        <Kpi label="Note moyenne" value={`${reviews.totals.average ?? '–'} / 5`} hint={`${formatNumber(reviews.totals.reviews)} avis`} source="mongo" />
        <Kpi label="Clients sans achat" value={formatNumber(inactive.total)} hint="NOT EXISTS" source="pg" />
      </div>

      <div className="grid grid-2 section">
        <Panel title="Chiffre d'affaires mensuel" source={<Source db="pg">CTE + LAG()</Source>}>
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={lastMonths}>
              {grid}
              <XAxis dataKey="month" tickFormatter={formatMonth} tick={axis} />
              <YAxis tickFormatter={(v) => `${Math.round(v / 1000)} k€`} tick={axis} width={56} />
              <Tooltip formatter={(v) => formatMoney(v)} labelFormatter={formatMonth} />
              <Bar dataKey="revenue" name="Chiffre d'affaires" fill={BLUE} radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </Panel>

        <Panel title="Chiffre d'affaires par catégorie" source={<Source db="pg">GROUP BY · HAVING · FILTER</Source>}>
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={categories} layout="vertical" margin={{ left: 20 }}>
              <CartesianGrid stroke="#e3e6eb" horizontal={false} />
              <XAxis type="number" tickFormatter={(v) => `${Math.round(v / 1000)} k€`} tick={axis} />
              <YAxis type="category" dataKey="category" tick={axis} width={90} />
              <Tooltip formatter={(v) => formatMoney(v)} />
              <Bar dataKey="revenue" name="Chiffre d'affaires" fill={BLUE} radius={[0, 4, 4, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </Panel>

        <Panel title="Répartition des notes" source={<Source db="mongo">pipeline $facet</Source>}>
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={reviews.distribution}>
              {grid}
              <XAxis dataKey="rating" tickFormatter={(v) => `${v} ★`} tick={axis} />
              <YAxis tick={axis} width={48} />
              <Tooltip />
              <Bar dataKey="count" name="Avis" fill="#f5a524" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </Panel>

        <Panel title="Satisfaction par catégorie" source={<Source db="mongo">$lookup + $group</Source>}>
          <Table
            head={['Catégorie', 'Avis', 'Note', 'Son', 'Ambiance', 'Orga.']}
            rows={reviews.by_category.map((c) => [categoryLabel(c.category), formatNumber(c.reviews), c.average, c.son, c.ambiance, c.organisation])}
          />
        </Panel>
      </div>

      <div className="section">
        <Panel title="Note des spectateurs et ventes" source={<><Source db="mongo">notes</Source> <Source db="pg">ventes</Source></>}>
          <p className="muted small" style={{ padding: '12px 20px 0', margin: 0 }}>
            Croisement des deux bases : les événements les mieux notés (MongoDB) rapportent-ils davantage (PostgreSQL) ?
          </p>
          <Table
            head={['Note moyenne', 'Événements', 'CA moyen', 'Remplissage moyen']}
            rows={vsRating.map((b) => [b.rating_range, b.events, formatMoney(b.avg_revenue), `${b.avg_fill_rate_pct} %`])}
          />
        </Panel>
      </div>

      <div className="grid grid-2 section">
        <Panel title="Meilleures ventes" source={<Source db="pg">vue v_event_sales</Source>}>
          <Table
            head={['Événement', 'Statut', 'Remplissage', 'CA']}
            rows={sales.map((s) => [
              <Link key={s.event_id} to={`/evenements/${s.event_id}`}>{s.title}</Link>,
              <StatusBadge key="s" map={EVENT_STATUS} status={s.status} />,
              `${s.fill_rate_pct ?? 0} %`,
              formatMoney(s.revenue),
            ])}
          />
        </Panel>
        <Panel title="Meilleurs clients" source={<Source db="pg">CTE + RANK() + sous-requête</Source>}>
          <Table
            head={['#', 'Client', 'Cmd.', 'Total', 'Catégorie préférée']}
            rows={customers.map((c) => [c.rank, c.name, c.orders, formatPrice(c.total_spent), c.favorite_category])}
          />
        </Panel>
      </div>

      <CreateEvent />
    </>
  );
}

function Kpi({ label, value, hint, source }) {
  return (
    <div className="card card-body kpi">
      <div className="row"><span className="label">{label}</span><span className="spacer" /><span className={`dot dot-${source}`} style={{ width: 8, height: 8, borderRadius: '50%' }} /></div>
      <div className="value">{value}</div>
      {hint && <div className="subtle">{hint}</div>}
    </div>
  );
}

function Panel({ title, source, children }) {
  return (
    <div className="card">
      <div className="card-head"><h3>{title}</h3><span className="spacer" />{source}</div>
      {children}
    </div>
  );
}

function Table({ head, rows }) {
  return (
    <div className="table-wrap">
      <table className="table">
        <thead><tr>{head.map((h) => <th key={h}>{h}</th>)}</tr></thead>
        <tbody>{rows.map((r, i) => <tr key={i}>{r.map((c, j) => <td key={j}>{c}</td>)}</tr>)}</tbody>
      </table>
    </div>
  );
}

// -----------------------------------------------------------------------------
// Création d'un événement : écrit dans PostgreSQL (événement + billets)
// et dans MongoDB (page éditoriale) en une seule opération côté API
// -----------------------------------------------------------------------------
function CreateEvent() {
  const notify = useToast();
  const navigate = useNavigate();
  const refs = useAsync(() => Promise.all([api.get('/categories'), api.get('/venues')]), []);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({
    title: '', category_id: '', venue_id: '', starts_at: '', duration: 150,
    description: '', tags: '',
    tickets: [{ name: 'Standard', price: 30, quantity_total: 200 }, { name: 'VIP', price: 90, quantity_total: 20 }],
  });
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });
  const setTicket = (i, k) => (e) => {
    const tickets = form.tickets.map((t, j) => (j === i ? { ...t, [k]: k === 'name' ? e.target.value : Number(e.target.value) } : t));
    setForm({ ...form, tickets });
  };

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      const starts = new Date(form.starts_at);
      const ev = await api.post('/events', {
        title: form.title,
        category_id: Number(form.category_id),
        venue_id: Number(form.venue_id),
        starts_at: starts.toISOString(),
        ends_at: new Date(starts.getTime() + form.duration * 60000).toISOString(),
        ticket_types: form.tickets,
        page: { description: form.description, tags: form.tags.split(',').map((t) => t.trim()).filter(Boolean) },
      });
      notify(`Événement n° ${ev.id} créé (PostgreSQL + MongoDB)`, 'success');
      navigate(`/evenements/${ev.id}`);
    } catch (err) {
      notify(err.message, 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="card section">
      <div className="card-head">
        <h3>Créer un événement</h3>
        <Source db="pg">events · ticket_types</Source>
        <Source db="mongo">event_pages</Source>
        <span className="spacer" />
        <button className="btn btn-sm" onClick={() => setOpen(!open)}>{open ? 'Fermer' : 'Ouvrir le formulaire'}</button>
      </div>
      {open && (refs.loading ? <Spinner /> : refs.error ? <ErrorBox error={refs.error} /> : (
        <form className="card-body stack" onSubmit={submit}>
          <div className="grid grid-2">
            <div className="field"><label htmlFor="c-title">Titre</label><input id="c-title" className="input" required value={form.title} onChange={set('title')} /></div>
            <div className="field">
              <label htmlFor="c-cat">Catégorie</label>
              <select id="c-cat" className="select" required value={form.category_id} onChange={set('category_id')}>
                <option value="">Choisir…</option>
                {refs.data[0].map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
            <div className="field">
              <label htmlFor="c-venue">Salle</label>
              <select id="c-venue" className="select" required value={form.venue_id} onChange={set('venue_id')}>
                <option value="">Choisir…</option>
                {refs.data[1].map((v) => <option key={v.id} value={v.id}>{v.city} — {v.name} ({v.capacity} pl.)</option>)}
              </select>
            </div>
            <div className="grid grid-2">
              <div className="field"><label htmlFor="c-start">Début</label><input id="c-start" type="datetime-local" className="input" required value={form.starts_at} onChange={set('starts_at')} /></div>
              <div className="field"><label htmlFor="c-dur">Durée (min)</label><input id="c-dur" type="number" min={15} className="input" value={form.duration} onChange={set('duration')} /></div>
            </div>
          </div>
          <div className="field"><label htmlFor="c-desc">Description (MongoDB)</label><textarea id="c-desc" className="textarea" required minLength={10} value={form.description} onChange={set('description')} /></div>
          <div className="field"><label htmlFor="c-tags">Tags, séparés par des virgules</label><input id="c-tags" className="input" value={form.tags} onChange={set('tags')} /></div>
          <div>
            <label className="subtle">Types de billets (PostgreSQL)</label>
            {form.tickets.map((t, i) => (
              <div className="grid grid-4" key={i} style={{ marginTop: 8 }}>
                <input className="input" aria-label="Nom" value={t.name} onChange={setTicket(i, 'name')} />
                <input className="input" aria-label="Prix" type="number" min={0} step="0.5" value={t.price} onChange={setTicket(i, 'price')} />
                <input className="input" aria-label="Quantité" type="number" min={1} value={t.quantity_total} onChange={setTicket(i, 'quantity_total')} />
                <button type="button" className="btn btn-ghost" disabled={form.tickets.length === 1}
                  onClick={() => setForm({ ...form, tickets: form.tickets.filter((_, j) => j !== i) })}>Retirer</button>
              </div>
            ))}
            <button type="button" className="btn btn-sm" style={{ marginTop: 8 }}
              onClick={() => setForm({ ...form, tickets: [...form.tickets, { name: '', price: 0, quantity_total: 50 }] })}>Ajouter un type de billet</button>
          </div>
          <div><button className="btn btn-primary" disabled={busy}>{busy ? 'Création…' : 'Créer l\'événement'}</button></div>
        </form>
      ))}
    </div>
  );
}
