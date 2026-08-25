import type {Request, Response, NextFunction} from "express";
import jwt from "jsonwebtoken";

export interface AuthenticatedRequest extends Request {
    userId?: string;
}

export function requireAuth(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    const header = req.headers.authorization;
    if (!header?.startsWith("Bearer ")) {
        return res.status(401).json({ message: "Access token is missing or invalid" });
    }
    try {
        const payload = jwt.verify(header.slice(7), process.env.JWT_SECRET!) as { sub: string };
        req.userId = payload.sub;
        next();
    } catch {
        return res.status(401).json({ message: "Access token is missing or invalid" });
    }
}