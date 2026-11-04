// Affiche la partie de la page MongoDB propre à chaque catégorie.
// Le document n'a pas la même forme pour un concert, une pièce ou un match :
// ce composant montre concrètement l'intérêt du schéma flexible.

function List({ items, render }) {
  return <ul style={{ margin: 0, paddingLeft: 18 }}>{items.map((x, i) => <li key={i}>{render(x)}</li>)}</ul>;
}

export default function CategoryDetails({ page }) {
  if (!page) return null;
  const rows = [];

  if (page.lineup) rows.push(['Programmation', <List items={page.lineup} render={(a) => <><strong>{a.name}</strong> — {a.role}{a.genre ? ` (${a.genre})` : ''}</>} />]);
  if (page.set_duration_min) rows.push(['Durée du concert', `${page.set_duration_min} min`]);
  if (page.director) rows.push(['Mise en scène', page.director]);
  if (page.cast) rows.push(['Distribution', <List items={page.cast} render={(c) => <><strong>{c.actor}</strong> — {c.character}</>} />]);
  if (page.performer) rows.push(['Artiste', page.performer]);
  if (page.duration_min) rows.push(['Durée', `${page.duration_min} min${page.intermission ? ' avec entracte' : ''}`]);
  if (page.competition) rows.push(['Compétition', page.competition]);
  if (page.teams) rows.push(['Affiche', <><strong>{page.teams.home}</strong> contre <strong>{page.teams.away}</strong></>]);
  if (page.days) rows.push(['Durée', `${page.days} jour${page.days > 1 ? 's' : ''}${page.camping ? ' · camping sur place' : ''}`]);
  if (page.stages) rows.push(['Scènes', <List items={page.stages} render={(s) => <><strong>{s.name}</strong> : {s.lineup.join(', ')}</>} />]);
  if (page.tracks) rows.push(['Thématiques', page.tracks.join(', ')]);
  if (page.speakers) rows.push(['Intervenants', <List items={page.speakers} render={(s) => <><strong>{s.name}</strong> ({s.company}) — {s.talk_title}</>} />]);
  if (page.company) rows.push(['Compagnie', page.company]);
  if (page.choreographer) rows.push(['Chorégraphie', `${page.choreographer}${page.style ? ` · ${page.style}` : ''}`]);
  if (page.artists) rows.push(['Artistes exposés', page.artists.join(', ')]);
  if (page.artworks_count) rows.push(['Œuvres', `${page.artworks_count}${page.guided_tour ? ' · visite guidée disponible' : ''}`]);

  if (rows.length === 0) return null;
  return (
    <dl className="kv">
      {rows.map(([k, v]) => (
        <div key={k} style={{ display: 'contents' }}>
          <dt>{k}</dt>
          <dd>{v}</dd>
        </div>
      ))}
    </dl>
  );
}
