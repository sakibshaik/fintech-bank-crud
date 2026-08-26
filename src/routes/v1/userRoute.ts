import { Router } from 'express';
import {
    createUser, deleteUser, getUser, updateUser
} from '../../controllers/userController.ts';
import {requireAuth} from "../../middlewares/auth.ts";

const router = Router();

router.post('/', createUser);
router.get('/:userId', requireAuth, getUser);
router.patch('/:userId', requireAuth, updateUser);
router.delete('/:userId', requireAuth, deleteUser);

export default router;