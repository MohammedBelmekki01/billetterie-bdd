

const title = (t) => print(`\n=== ${t} ===`);


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


title('2. Recherche plein texte : "concerts jazz"');
db.event_pages
  .find({ $text: { $search: 'concerts jazz' } },
        { _id: 0, event_id: 1, title: 1, tags: 1, score: { $meta: 'textScore' } })
  .sort({ score: { $meta: 'textScore' } })
  .limit(5)
  .forEach(printjson);

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
