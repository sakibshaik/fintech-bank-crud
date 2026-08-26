import type {Request, Response, NextFunction} from 'express';
import {authenticateUser} from "../services/authService.ts";
import {toBadRequestResponse, UnauthorizedError} from "../middlewares/errorHandler.ts";
import {loginSchema} from "../schemas/authSchema.ts";

export const login = async (req: Request, res: Response, next: NextFunction) => {
    const result = loginSchema.safeParse(req.body);
    if (!result.success) {
        return res.status(400).json(toBadRequestResponse(result.error));
    }
    try {
        const token = await authenticateUser(result.data.email, result.data.password);
        res.status(200).json({ token });
    } catch (err) {
        if (err instanceof UnauthorizedError) {
            return res.status(401).json({ message: err.message });
        }
        next(err);
    }
};