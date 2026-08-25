import type {Request, Response, NextFunction} from "express";
import jwt from "jsonwebtoken";
import config from "../config/config.ts";


export function requireAuth(req: Request, res: Response, next: NextFunction) {
    const header = req.headers.authorization;
    if (!header?.startsWith("Bearer ")) {
        return res.status(401).json({ message: "Access token is missing or invalid" });
    }
    try {
        const payload = jwt.verify(header.slice(7), config.jwtSecret) as { sub: string };
        req.userId = payload.sub;
        next();
    } catch {
        return res.status(401).json({ message: "Access token is missing or invalid" });
    }
}