
const env = process.env;

export const config = {
  port: Number(env.PORT || 3000),
  jwtSecret: env.JWT_SECRET || 'dev_only_change_me',
  jwtExpiresIn: '8h',
  postgres: {
    host: env.PGHOST || 'localhost',
    port: Number(env.PGPORT || 5432),
    database: env.POSTGRES_DB || 'billetterie',
    user: env.APP_DB_USER || 'billetterie_app',
    password: env.APP_DB_PASSWORD || 'app_dev_only',
  },
  mongo: {
    url: `mongodb://${env.APP_MONGO_USER || 'billetterie_app'}:${env.APP_MONGO_PASSWORD || 'app_dev_only'}`
      + `@${env.MONGO_HOST || 'localhost'}:${env.MONGO_PORT || 27017}/${env.MONGO_DB || 'billetterie'}`,
  },
  redis: {
    url: `redis://${env.REDIS_HOST || 'localhost'}:${env.REDIS_PORT || 6379}`,
    password: env.REDIS_PASSWORD || 'redis_dev_only',
  },
  // Durées de vie Redis (secondes)
  ttl: {
    eventCache: 60,      
    cart: 15 * 60,      
  },
};
