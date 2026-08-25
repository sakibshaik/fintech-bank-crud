import { Router } from 'express';
import {
    createUser
} from '../../controllers/userController.ts';

const router = Router();

// router.get('/', getItems);
router.post('/', createUser);
// router.get('/:id', getItemById);
// router.post('/', createItem);
// router.put('/:id', updateItem);
// router.delete('/:id', deleteItem);

export default router;