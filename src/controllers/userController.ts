import type {Request, Response, NextFunction} from 'express';
import {createUserSchema} from "../schemas/userSchema.ts";
import {BadRequestError, toBadRequestResponse} from "../middlewares/errorHandler.ts";
import {createUserService, getUserService} from "../services/userService.ts";
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