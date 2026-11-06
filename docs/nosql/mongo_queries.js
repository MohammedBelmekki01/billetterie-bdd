// =============================================================================
// mongo_queries.js — Requêtes MongoDB commentées
//
// Lancement :
//   docker exec -it billetterie-mongo mongosh -u root -p mongo_dev_only --authenticationDatabase admin billetterie --quiet --file /docs/nosql/mongo_queries.js
//
// Collections : event_pages (contenu éditorial, schéma variable selon la catégorie)
//               reviews     (avis, une collection séparée référencée par event_id)
// Le fichier ne modifie pas les données.
// =============================================================================

const title = (t) => print(`\n=== ${t} ===`);

// -----------------------------------------------------------------------------
// 1. Schéma flexible : deux documents de la même collection, deux structures
// Intention : montrer pourquoi ces données sont dans MongoDB. Un concert a un
// "lineup", un match a des "teams" : en relationnel il faudrait une table par
// catégorie ou beaucoup de colonnes NULL.
// -----------------------------------------------------------------------------
title('1. Schéma variable selon la catégorie');
const fields = { _id: 0, event_id: 1, title: 1, category: 1,
                 lineup: 1, set_duration_min: 1, competition: 1, teams: 1 };
printjson(db.event_pages.findOne({ category: 'concert' }, fields));
printjson(db.event_pages.findOne({ category: 'sport' }, fields));
print('Nombre de documents par champ spécifique :');
printjson({
  avec_lineup: db.event_pages.countDocuments({ lineup: { $exists: true } }),
  avec_teams: db.event_pages.countDocuments({ teams: { $exists: true } }),
  avec_speakers: db.event_pages.countDocuments({ speakers: { $exists: true } }),
});

// -----------------------------------------------------------------------------
// 2. Recherche plein texte — index texte "txt_search" (langue française)
// Intention : la barre de recherche du site. Poids : titre 10, tags 5,
// description 1 ; "concerts" trouve aussi "concert" (racinisation française).
// -----------------------------------------------------------------------------
title('2. Recherche plein texte : "concerts jazz"');
db.event_pages
  .find({ $text: { $search: 'concerts jazz' } },
        { _id: 0, event_id: 1, title: 1, tags: 1, score: { $meta: 'textScore' } })
  .sort({ score: { $meta: 'textScore' } })
  .limit(5)
  .forEach(printjson);

// -----------------------------------------------------------------------------
// 3. Requête dans un tableau de sous-documents + plan d'exécution
// Intention : "tous les événements où joue tel artiste", y compris en
// première partie. L'index sparse idx_lineup_name ne contient que les
// documents qui ont un lineup (les concerts).
// -----------------------------------------------------------------------------
const artist = db.event_pages.findOne({ category: 'concert' }).lineup[0].name;
title(`3. Événements avec l'artiste "${artist}" (index sur lineup.name)`);
const byArtist = { 'lineup.name': artist };
db.event_pages.find(byArtist, { _id: 0, event_id: 1, title: 1, 'lineup.name': 1, 'lineup.role': 1 })
  .limit(5).forEach(printjson);

const stats = db.event_pages.find(byArtist).explain('executionStats');
const plan = JSON.stringify(stats.queryPlanner.winningPlan);
printjson({
  plan: plan.includes('IXSCAN') ? 'IXSCAN (parcours d\'index)' : 'COLLSCAN (parcours complet)',
  index: (plan.match(/"indexName":"([^"]+)"/) || [])[1],
  documents_examines: stats.executionStats.totalDocsExamined,
  documents_renvoyes: stats.executionStats.nReturned,
  documents_dans_la_collection: db.event_pages.estimatedDocumentCount(),
});

// -----------------------------------------------------------------------------
// 4. Pipeline d'agrégation avec $facet et $lookup (tableau de bord admin)
// Intention : plusieurs analyses des avis en une seule passe :
// répartition des notes, et moyenne par catégorie (la catégorie vient de
// event_pages : $lookup est l'équivalent d'une jointure).
// -----------------------------------------------------------------------------
title('4. Analyse des avis ($facet, $lookup, $group)');
db.reviews.aggregate([
  { $facet: {
      distribution: [
        { $group: { _id: '$rating', count: { $sum: 1 } } },
        { $sort: { _id: 1 } },
        { $project: { _id: 0, note: '$_id', count: 1 } },
      ],
      par_categorie: [
        { $lookup: { from: 'event_pages', localField: 'event_id', foreignField: 'event_id', as: 'page',
                     pipeline: [{ $project: { _id: 0, category: 1 } }] } },
        { $unwind: '$page' },
        { $group: { _id: '$page.category', avis: { $sum: 1 },
                    moyenne: { $avg: '$rating' }, son: { $avg: '$aspects.son' } } },
        { $project: { _id: 0, categorie: '$_id', avis: 1,
                      moyenne: { $round: ['$moyenne', 2] }, son: { $round: ['$son', 2] } } },
        { $sort: { moyenne: -1 } },
      ],
  } },
]).forEach(printjson);

// -----------------------------------------------------------------------------
// 5. $unwind sur un tableau : quels tags sont associés aux meilleurs événements ?
// Intention : aider l'équipe marketing à choisir les mots-clés mis en avant.
// $unwind crée un document par tag, puis $group calcule la note moyenne des
// événements portant ce tag (rating.average a été écrit par le $merge du seed).
// -----------------------------------------------------------------------------
title('5. Tags les mieux notés ($unwind, $group, $match)');
db.event_pages.aggregate([
  { $match: { 'rating.count': { $gte: 5 } } },
  { $unwind: '$tags' },
  { $group: { _id: '$tags', evenements: { $sum: 1 }, note_moyenne: { $avg: '$rating.average' } } },
  { $match: { evenements: { $gte: 3 } } },
  { $project: { _id: 0, tag: '$_id', evenements: 1, note_moyenne: { $round: ['$note_moyenne', 2] } } },
  { $sort: { note_moyenne: -1 } },
  { $limit: 8 },
]).forEach(printjson);

// -----------------------------------------------------------------------------
// 6. Validation de schéma ($jsonSchema) : un document invalide est refusé
// Intention : montrer que la souplesse de MongoDB n'empêche pas de garantir
// la qualité des données. Une note de 7 viole la règle "rating entre 1 et 5".
// -----------------------------------------------------------------------------
title('6. Validateur $jsonSchema : insertion d\'un avis invalide');
try {
  db.reviews.insertOne({
    event_id: 1, user_id: 1, rating: 7, comment: 'Note impossible',
    author: { display_name: 'Test' }, created_at: new Date(),
  });
  print('Inséré (inattendu)');
} catch (e) {
  printjson({ refuse: true, code: e.code, message: e.errmsg ?? e.message });
}
