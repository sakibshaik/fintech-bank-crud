import { Router } from 'express';
import { createTransaction } from '../../controllers/transactionController.ts';
import { requireAuth } from '../../middlewares/auth.ts';

const router = Router({ mergeParams: true });

router.post('/', requireAuth, createTransaction);

export default router;