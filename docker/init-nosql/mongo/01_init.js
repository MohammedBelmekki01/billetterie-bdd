const dbName = process.env.MONGO_INITDB_DATABASE || 'billetterie';
const appUser = process.env.APP_MONGO_USER || 'billetterie_app';
const appPassword = process.env.APP_MONGO_PASSWORD || 'app_dev_only';

db = db.getSiblingDB(dbName);
db.createCollection('event_pages', {
  validator: {
    $jsonSchema: {
      bsonType: 'object',
      required: ['event_id', 'title', 'category', 'description', 'updated_at'],
      properties: {
        event_id: { bsonType: ['int', 'long'], minimum: 1, description: 'id de events (PostgreSQL)' },
        title: { bsonType: 'string', minLength: 1 },
        category: {
          enum: ['concert', 'theatre', 'humour', 'sport', 'festival', 'conference', 'danse', 'exposition'],
        },
        description: { bsonType: 'string', minLength: 10 },
        tags: { bsonType: 'array', items: { bsonType: 'string' } },
        practical: {
          bsonType: 'object',
          properties: {
            age_min: { bsonType: 'int', minimum: 0, maximum: 18 },
            accessibility: { bsonType: 'array', items: { bsonType: 'string' } },
          },
        },
        rating: {
          bsonType: 'object',
          required: ['average', 'count'],
          properties: {
            average: { bsonType: ['double', 'int'], minimum: 0, maximum: 5 },
            count: { bsonType: 'int', minimum: 0 },
          },
        },
        updated_at: { bsonType: 'date' },
      },
    },
  },
  validationLevel: 'strict',
  validationAction: 'error',
});

db.event_pages.createIndex({ event_id: 1 }, { unique: true, name: 'uniq_event_id' });
db.event_pages.createIndex({ category: 1, tags: 1 }, { name: 'idx_category_tags' });
db.event_pages.createIndex({ 'lineup.name': 1 }, { name: 'idx_lineup_name', sparse: true });
db.event_pages.createIndex(
  { title: 'text', description: 'text', tags: 'text' },
  { name: 'txt_search', default_language: 'french', weights: { title: 10, tags: 5, description: 1 } },
);

db.createCollection('reviews', {
  validator: {
    $jsonSchema: {
      bsonType: 'object',
      required: ['event_id', 'user_id', 'author', 'rating', 'comment', 'created_at'],
      properties: {
        event_id: { bsonType: ['int', 'long'], minimum: 1 },
        user_id: { bsonType: ['int', 'long'], minimum: 1, description: 'id de users (PostgreSQL)' },
        author: {
          bsonType: 'object',
          required: ['display_name'],
          properties: { display_name: { bsonType: 'string' }, city: { bsonType: 'string' } },
        },
        rating: { bsonType: 'int', minimum: 1, maximum: 5 },
        title: { bsonType: 'string', maxLength: 120 },
        comment: { bsonType: 'string', minLength: 3, maxLength: 2000 },
        aspects: {
          bsonType: 'object',
          description: 'notes détaillées 1-5 (son, ambiance, organisation...)',
        },
        verified_purchase: { bsonType: 'bool' },
        helpful_votes: { bsonType: 'int', minimum: 0 },
        created_at: { bsonType: 'date' },
      },
    },
  },
  validationLevel: 'strict',
  validationAction: 'error',
});

// Liste des avis d'un événement, du plus récent au plus ancien
db.reviews.createIndex({ event_id: 1, created_at: -1 }, { name: 'idx_event_recent' });
// Règle métier un seul avis par spectateur et par événement
db.reviews.createIndex({ event_id: 1, user_id: 1 }, { unique: true, name: 'uniq_event_user' });
// "Mes avis"
db.reviews.createIndex({ user_id: 1 }, { name: 'idx_user' });
db.createRole({
  role: 'billetterieApp',
  privileges: [
    {
      resource: { db: dbName, collection: '' },
      actions: ['find', 'insert', 'update', 'remove', 'listIndexes', 'listCollections'],
    },
  ],
  roles: [],
});

db.createUser({
  user: appUser,
  pwd: appPassword,
  roles: [{ role: 'billetterieApp', db: dbName }],
});

print(`MongoDB initialisé : collections event_pages, reviews ; utilisateur ${appUser}`);
