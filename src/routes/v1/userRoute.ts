import { Router } from 'express';
import {
    createUser, getUser
} from '../../controllers/userController.ts';
import {requireAuth} from "../../middlewares/auth.ts";

const router = Router();

router.post('/', createUser);
router.get('/:userId', requireAuth, getUser);

export default router;