import type {Request, Response, NextFunction} from 'express';
import { ZodError } from "zod";

export interface AppError extends Error {
    status?: number;
}

export const errorHandler = (
    err: AppError,
    req: Request,
    res: Response,
    next: NextFunction
) => {
    console.error(err);
    res.status(err.status || 500).json({
        message: err.message || 'Internal Server Error',
    });
};

export function toBadRequestResponse(error: ZodError) {
    return {
        message: "Validation failed",
        details: error.issues.map((issue) => ({
            field: issue.path.join(".") || "(root)",
            message: issue.message,
            type: issue.code,
        })),
    };
}

export interface ValidationDetail {
    field: string;
    message: string;
    type: string;
}

export class BadRequestError extends Error {
    details: ValidationDetail[];

    constructor(details: ValidationDetail[]) {
        super("Validation failed");
        this.name = 'BadRequestError';
        this.details = details;
    }
}

export class UnauthorizedError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'UnauthorizedError';
    }
}

export class ConflictError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'ConflictError';
    }
}

export class UnprocessableEntityError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'UnprocessableEntityError';
    }
}