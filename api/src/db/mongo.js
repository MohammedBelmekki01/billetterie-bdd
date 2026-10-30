import { MongoClient } from 'mongodb';
import { config } from '../config.js';

export const mongoClient = new MongoClient(config.mongo.url, { serverSelectionTimeoutMS: 5000 });

// La base est celle de l'URL de connexion ("billetterie")
export const mongo = mongoClient.db();
export const eventPages = mongo.collection('event_pages');
export const reviews = mongo.collection('reviews');

// Recalcule la note moyenne d'un événement et l'écrit dans sa page.
// Appelé après chaque création / modification / suppression d'avis.
export async function refreshRating(eventId) {
  const [stats] = await reviews.aggregate([
    { $match: { event_id: eventId } },
    { $group: { _id: null, average: { $avg: '$rating' }, count: { $sum: 1 } } },
  ]).toArray();
  await eventPages.updateOne(
    { event_id: eventId },
    {
      $set: {
        rating: {
          average: stats ? Math.round(stats.average * 100) / 100 : 0,
          count: stats ? stats.count : 0,
        },
        updated_at: new Date(),
      },
    },
  );
}
