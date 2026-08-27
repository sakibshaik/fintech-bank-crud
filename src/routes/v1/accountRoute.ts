import { Router } from 'express';
import {createAccount, deleteAccount, getAccount, listAccounts} from '../../controllers/accountController.ts';
import transactionRoutes from './transactionRoute.ts';
import { requireAuth } from '../../middlewares/auth.ts';

const router = Router();

router.post('/', requireAuth, createAccount);
router.get('/', requireAuth, listAccounts);
router.get('/:accountNumber', requireAuth, getAccount);
router.delete('/:accountNumber', requireAuth, deleteAccount);

router.use('/:accountNumber/transactions', transactionRoutes);

export default router;