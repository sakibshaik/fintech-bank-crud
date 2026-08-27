import { Router } from 'express';
import {createTransaction, getTransaction, listTransactions} from '../../controllers/transactionController.ts';
import { requireAuth } from '../../middlewares/auth.ts';

const router = Router({ mergeParams: true });

router.post('/', requireAuth, createTransaction);
router.get('/', requireAuth, listTransactions);
router.get('/:transactionId', requireAuth, getTransaction);

export default router;