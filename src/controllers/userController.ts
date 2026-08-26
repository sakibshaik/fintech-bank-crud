import type {Request, Response, NextFunction} from 'express';
import {createUserSchema, updateUserSchema} from "../schemas/userSchema.ts";
import {BadRequestError, ConflictError, toBadRequestResponse} from "../middlewares/errorHandler.ts";
import {createUserService, deleteUserService, getUserService, updateUserService} from "../services/userService.ts";
import {toUserResponse} from "../serializers/userSerializer.ts";

export const createUser = async (req: Request, res: Response, next: NextFunction) => {
    const result = createUserSchema.safeParse(req.body);
    if (!result.success) {
        return res.status(400).json(toBadRequestResponse(result.error));
    }
    try {
        const user = await createUserService(result.data);
        res.status(201).json(toUserResponse(user));
    } catch (err) {
        if (err instanceof BadRequestError) {
            return res.status(400).json({ message: err.message, details: err.details });
        }
        next(err);
    }
};

export const getUser = async (req: Request, res: Response, next: NextFunction) => {
    const { userId } = req.params;
    try {
        const user = await getUserService(userId as string);
        if (!user) {
            return res.status(404).json({ message: "User not found" });
        }
        if (user.id !== req.userId) {
            return res.status(403).json({ message: "Forbidden" });
        }
        res.status(200).json(toUserResponse(user));
    } catch (err) {
        next(err);
    }
};

export const updateUser = async (req: Request, res: Response, next: NextFunction) => {
    const { userId } = req.params;
    try {
        const existing = await getUserService(userId as string);
        if (!existing) {
            return res.status(404).json({ message: "User not found" });
        }
        if (existing.id !== req.userId) {
            return res.status(403).json({ message: "Forbidden" });
        }
        const result = updateUserSchema.safeParse(req.body);
        if (!result.success) {
            return res.status(400).json(toBadRequestResponse(result.error));
        }
        const updated = await updateUserService(userId as string, result.data);
        res.status(200).json(toUserResponse(updated));
    } catch (err) {
        if (err instanceof BadRequestError) {
            return res.status(400).json({ message: err.message, details: err.details });
        }
        next(err);
    }
};

export const deleteUser = async (req: Request, res: Response, next: NextFunction) => {
    const { userId } = req.params;
    try {
        const existing = await getUserService(userId as string);
        if (!existing) {
            return res.status(404).json({ message: "User not found" });
        }
        if (existing.id !== req.userId) {
            return res.status(403).json({ message: "Forbidden" });
        }
        await deleteUserService(userId as string);
        res.status(204).send();
    } catch (err) {
        if (err instanceof ConflictError) {
            return res.status(409).json({ message: err.message });
        }
        next(err);
    }
};