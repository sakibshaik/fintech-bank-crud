import type {Request, Response, NextFunction} from 'express';
import {createUserSchema} from "../schemas/userSchema.ts";
import {BadRequestError, toBadRequestResponse} from "../middlewares/errorHandler.ts";
import {createUserService} from "../services/userService.ts";
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