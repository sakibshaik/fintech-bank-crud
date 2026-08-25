import express from 'express';
import userRoutes from './routes/v1/userRoute.ts';
import { errorHandler } from './middlewares/errorHandler.ts';
import authRoutes from "./routes/v1/authRoute.ts";

const app = express();

app.use(express.json());

// Routes
app.use('/v1/users', userRoutes);
app.use('/v1/auth/login', authRoutes);

// Global error handler (should be after routes)
app.use(errorHandler);

export default app;