import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { z } from 'zod';
import healthRoutes from './routes/health.js';
import authRoutes from './routes/auth.js';
import referenceRoutes from './routes/reference.js';
import eventRoutes from './routes/events.js';
import cartRoutes from './routes/cart.js';
import orderRoutes from './routes/orders.js';
import reviewRoutes from './routes/reviews.js';
import statsRoutes from './routes/stats.js';
import { errorHandler, notFoundHandler } from './lib/errors.js';

// Messages de validation en français
z.config(z.locales.fr());

export const app = express();

app.use(helmet());
app.use(cors());
app.use(express.json({ limit: '100kb' }));

app.use('/api/health', healthRoutes);
app.use('/api/auth', authRoutes);
app.use('/api', referenceRoutes);
app.use('/api/events', eventRoutes);
app.use('/api/cart', cartRoutes);
app.use('/api/orders', orderRoutes);
app.use('/api', reviewRoutes);
app.use('/api/stats', statsRoutes);

app.use(notFoundHandler);
app.use(errorHandler);
