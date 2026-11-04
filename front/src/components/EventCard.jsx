import { Link } from 'react-router';
import { coverUrl, formatDateTime, formatPrice } from '../format.js';

const CATEGORY_LABELS = {
  concert: 'Concert', theatre: 'Théâtre', humour: 'Humour', sport: 'Sport',
  festival: 'Festival', conference: 'Conférence', danse: 'Danse', exposition: 'Exposition',
};
export const categoryLabel = (slug) => CATEGORY_LABELS[slug] ?? slug;

export default function EventCard({ event, rank }) {
  const id = event.event_id ?? event.id;
  const seatsLeft = Number(event.seats_left);
  return (
    <Link to={`/evenements/${id}`} className="card event-card">
      <div className="cover" style={{ backgroundImage: `url(${coverUrl(id)})` }}>
        {rank && <span className="rank">#{rank}</span>}
      </div>
      <div className="body">
        <span className="category">{categoryLabel(event.category)}</span>
        <span className="title">{event.title}</span>
        {event.starts_at && <span className="meta">{formatDateTime(event.starts_at)}</span>}
        <span className="meta">{[event.venue, event.city].filter(Boolean).join(' · ')}</span>
        <div className="foot">
          {event.min_price != null
            ? <span className="small">dès <span className="price">{formatPrice(event.min_price)}</span></span>
            : <span />}
          {Number.isFinite(seatsLeft) && seatsLeft === 0 && <span className="badge badge-danger">Complet</span>}
          {Number.isFinite(seatsLeft) && seatsLeft > 0 && seatsLeft < 100 && (
            <span className="badge badge-warning">{seatsLeft} places</span>
          )}
          {rank && event.tickets_sold_30d != null && (
            <span className="badge badge-primary">{event.tickets_sold_30d} vendus / 30 j</span>
          )}
        </div>
      </div>
    </Link>
  );
}
