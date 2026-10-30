// =============================================================================
// content.js — Génération du contenu éditorial (pages d'événements et avis)
// Tout est fictif. Le générateur aléatoire est "seedé" pour que deux
// peuplements successifs produisent exactement les mêmes documents.
// =============================================================================

// Générateur pseudo-aléatoire déterministe (mulberry32)
export function createRandom(seed) {
  let a = seed >>> 0;
  const rnd = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  rnd.int = (min, max) => min + Math.floor(rnd() * (max - min + 1));
  rnd.pick = (arr) => arr[Math.floor(rnd() * arr.length)];
  rnd.sample = (arr, n) => [...arr].sort(() => rnd() - 0.5).slice(0, n);
  return rnd;
}

const ARTISTS = ['Nova Lune', 'Les Ombres Bleues', 'Kaïa', 'Orchestre Lumière', 'Sauvage Club',
  'Mira & les Vents', 'Électre', 'Bastien Roy', 'Les Pavés', 'Aurore Boréale', 'Fanfare du Nord',
  'Lou Delmas', 'Sora', 'Les Frères Kassi', 'Jade Moreau', 'DJ Pulsar', 'Trio Azur', 'Malik Sy'];
const GENRES = ['pop', 'rock', 'électro', 'jazz', 'rap', 'chanson française', 'soul', 'classique'];
const ACTORS = ['Claire Vasseur', 'Paul Okafor', 'Inès Lebrun', 'Hugo Marchal', 'Sofia Rinaldi',
  'Yann Le Goff', 'Nadia Belkacem', 'Thomas Weber', 'Emma Rousseau', 'Karim Saïdi'];
const TEAMS = ['Olympique Lyonnais', 'Stade Toulousain', 'Paris Volley', 'HBC Nantes', 'Lille Métropole Basket',
  'Montpellier Handball', 'Racing 92', 'ASVEL', 'Girondins Rugby', 'Rennes Esport'];
const COMPANIES = ['Datalis', 'CloudNest', 'Inria', 'OVHcloud', 'Qonto', 'Doctolib', 'Mistral', 'BlaBlaCar'];
const TOPICS = ['IA', 'bases de données', 'cloud', 'sécurité', 'data', 'web', 'green IT', 'DevOps'];
const ACCESS = ['fauteuil roulant', 'boucle magnétique', 'audiodescription', 'langue des signes'];

const TAGS = {
  concert: ['live', 'musique', 'soirée', 'pop', 'rock', 'électro', 'jazz'],
  theatre: ['classique', 'comédie', 'drame', 'mise en scène', 'famille'],
  humour: ['stand-up', 'rire', 'one-man-show', 'soirée'],
  sport: ['match', 'compétition', 'famille', 'derby'],
  festival: ['plein air', 'multi-scènes', 'été', 'musique', 'food-trucks'],
  conference: ['tech', 'networking', 'talks', 'IA', 'data'],
  danse: ['ballet', 'contemporain', 'hip-hop', 'chorégraphie'],
  exposition: ['art', 'photo', 'immersif', 'famille', 'visite guidée'],
};

const INTROS = [
  'Un rendez-vous incontournable de la saison',
  'Une soirée pensée pour vibrer du premier au dernier instant',
  'Après une tournée à guichets fermés, retour très attendu',
  'Une création originale saluée par la critique',
  'Le spectacle dont tout le monde parle cette année',
];
const OUTROS = [
  'Les places partent vite : réservez tôt.',
  'Ouverture des portes une heure avant le début.',
  'Une expérience à partager entre amis ou en famille.',
  'Bar et restauration légère sur place.',
];

// -----------------------------------------------------------------------------
// Partie spécifique à chaque catégorie : c'est ici que le schéma varie
// -----------------------------------------------------------------------------
// L'artiste principal est repris du titre PostgreSQL pour rester cohérent
// ("Nova Lune en concert #12" -> "Nova Lune")
const artistFromTitle = (title) =>
  title.replace(/^(Stand-up : |Ballet )/, '').replace(/ en concert/, '').replace(/ #\d+$/, '');

function categoryFields(category, title, rnd) {
  switch (category) {
    case 'concert': {
      const headliner = artistFromTitle(title);
      return {
        lineup: [
          { name: headliner, role: 'tête d\'affiche', genre: rnd.pick(GENRES) },
          ...rnd.sample(ARTISTS.filter((a) => a !== headliner), rnd.int(0, 2))
            .map((name) => ({ name, role: 'première partie', genre: rnd.pick(GENRES) })),
        ],
        set_duration_min: rnd.int(75, 140),
      };
    }
    case 'theatre':
      return {
        director: rnd.pick(ACTORS),
        cast: rnd.sample(ACTORS, rnd.int(3, 6)).map((actor, i) => ({ actor, character: `Personnage ${i + 1}` })),
        duration_min: rnd.int(80, 150),
        intermission: rnd() < 0.5,
      };
    case 'humour':
      return { performer: artistFromTitle(title), duration_min: rnd.int(60, 100), language: 'fr' };
    case 'sport': {
      const [home, away] = rnd.sample(TEAMS, 2);
      return { competition: rnd.pick(['Championnat', 'Coupe de France', 'Match amical']), teams: { home, away } };
    }
    case 'festival':
      return {
        days: rnd.int(1, 3),
        stages: ['Grande scène', 'Scène Club', 'Chapiteau'].slice(0, rnd.int(2, 3)).map((name) => ({
          name,
          lineup: rnd.sample(ARTISTS, rnd.int(2, 4)),
        })),
        camping: rnd() < 0.4,
      };
    case 'conference':
      return {
        tracks: rnd.sample(TOPICS, rnd.int(2, 3)),
        speakers: Array.from({ length: rnd.int(3, 6) }, () => ({
          name: rnd.pick(ACTORS),
          company: rnd.pick(COMPANIES),
          talk_title: `Retour d'expérience : ${rnd.pick(TOPICS)} en production`,
        })),
      };
    case 'danse':
      return { company: `Compagnie ${artistFromTitle(title)}`, choreographer: rnd.pick(ACTORS), style: rnd.pick(['ballet', 'contemporain', 'hip-hop']) };
    default: // exposition
      return { artists: rnd.sample(ACTORS, rnd.int(1, 4)), artworks_count: rnd.int(20, 180), guided_tour: rnd() < 0.6 };
  }
}

export function buildEventPage(ev, rnd) {
  const doors = new Date(new Date(ev.starts_at).getTime() - 60 * 60 * 1000);
  return {
    event_id: Number(ev.id),
    title: ev.title,
    category: ev.category,
    description: `${rnd.pick(INTROS)} : « ${ev.title} » à ${ev.venue} (${ev.city}). ${rnd.pick(OUTROS)}`,
    tags: rnd.sample(TAGS[ev.category], rnd.int(2, 4)),
    ...categoryFields(ev.category, ev.title, rnd),
    media: {
      cover_url: `https://picsum.photos/seed/event-${ev.id}/1200/600`,
      gallery: Array.from({ length: rnd.int(1, 4) }, (_, i) => `https://picsum.photos/seed/event-${ev.id}-${i}/800/600`),
    },
    practical: {
      age_min: rnd.pick([0, 0, 6, 12, 16, 18]),
      doors_open: doors,
      accessibility: rnd.sample(ACCESS, rnd.int(1, 3)),
    },
    faq: [
      { q: 'Les billets sont-ils remboursables ?', a: 'Uniquement en cas d\'annulation de l\'événement.' },
      { q: 'Puis-je revendre mon billet ?', a: 'Oui, via votre espace client, jusqu\'à 48 h avant.' },
    ],
    rating: { average: 0, count: 0 }, // recalculé par agrégation après l'insertion des avis
    updated_at: new Date(),
  };
}

// -----------------------------------------------------------------------------
// Avis
// -----------------------------------------------------------------------------
const COMMENTS = {
  1: ['Très déçu, le son était mauvais et l\'attente interminable.', 'Organisation catastrophique, je ne reviendrai pas.'],
  2: ['Bof. Quelques bons moments mais beaucoup trop cher pour ce que c\'est.', 'Placement mal indiqué et visibilité médiocre.'],
  3: ['Correct sans plus, l\'ambiance est montée sur la fin.', 'Bonne prestation mais une salle un peu trop pleine.'],
  4: ['Très bonne soirée, artistes généreux et public au rendez-vous.', 'Super ambiance, juste un peu d\'attente au bar.'],
  5: ['Inoubliable ! Un des meilleurs spectacles que j\'ai vus.', 'Parfait du début à la fin, je recommande à 100 %.', 'Magique, on en redemande. Bravo à toute l\'équipe !'],
};
const TITLES = { 1: 'À éviter', 2: 'Décevant', 3: 'Moyen', 4: 'Très bien', 5: 'Exceptionnel' };

const clamp = (n) => Math.max(1, Math.min(5, n));

// quality : note "réelle" de l'événement (2.5 à 4.8), chaque avis varie autour
export function buildReview(att, quality, rnd) {
  const rating = clamp(Math.round(quality + (rnd() - 0.5) * 2.2));
  const end = new Date(att.ends_at).getTime();
  const createdAt = new Date(Math.min(Date.now(), end + rnd() * 14 * 24 * 3600 * 1000));
  return {
    event_id: Number(att.event_id),
    user_id: Number(att.user_id),
    author: { display_name: `${att.first_name} ${att.last_name[0]}.` },
    rating,
    title: TITLES[rating],
    comment: rnd.pick(COMMENTS[rating]),
    aspects: {
      son: clamp(rating + rnd.int(-1, 1)),
      ambiance: clamp(rating + rnd.int(-1, 1)),
      organisation: clamp(rating + rnd.int(-1, 1)),
      rapport_qualite_prix: clamp(rating + rnd.int(-1, 1)),
    },
    verified_purchase: true,
    helpful_votes: Math.floor(rnd() ** 3 * 40),
    created_at: createdAt,
  };
}
