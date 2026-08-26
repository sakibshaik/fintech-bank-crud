import { Router } from 'express';
import {createAccount, deleteAccount, getAccount, listAccounts} from '../../controllers/accountController.ts';
import { requireAuth } from '../../middlewares/auth.ts';

const router = Router();

router.post('/', requireAuth, createAccount);
router.get('/', requireAuth, listAccounts);
router.get('/:accountNumber', requireAuth, getAccount);
router.delete('/:accountNumber', requireAuth, deleteAccount);

export default router;