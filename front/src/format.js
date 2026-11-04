const dateTime = new Intl.DateTimeFormat('fr-FR', {
  weekday: 'short', day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit',
});
const dateShort = new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' });
const monthYear = new Intl.DateTimeFormat('fr-FR', { month: 'short', year: '2-digit' });
const euro = new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' });
const euroRound = new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 });
const number = new Intl.NumberFormat('fr-FR');

export const formatDateTime = (d) => dateTime.format(new Date(d));
export const formatDate = (d) => dateShort.format(new Date(d));
export const formatMonth = (d) => monthYear.format(new Date(d));
export const formatPrice = (n) => euro.format(n ?? 0);
export const formatMoney = (n) => euroRound.format(n ?? 0);
export const formatNumber = (n) => number.format(n ?? 0);

export const ORDER_STATUS = {
  paid: ['Payée', 'success'],
  pending: ['En attente', 'warning'],
  cancelled: ['Annulée', 'danger'],
  refunded: ['Remboursée', 'danger'],
};

export const TICKET_STATUS = {
  valid: ['Valide', 'success'],
  used: ['Utilisé', ''],
  cancelled: ['Annulé', 'danger'],
};

export const EVENT_STATUS = {
  published: ['En vente', 'success'],
  draft: ['Brouillon', ''],
  cancelled: ['Annulé', 'danger'],
  completed: ['Terminé', ''],
};

export const coverUrl = (eventId, w = 600, h = 340) => `https://picsum.photos/seed/event-${eventId}/${w}/${h}`;
