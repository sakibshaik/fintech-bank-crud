import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { prisma } from "../lib/prisma.ts";
import { UnauthorizedError } from "../middlewares/errorHandler.ts";
import config from "../config/config.ts";

export async function authenticateUser(email: string, password: string) {
    const user = await prisma.user.findUnique({ where: { email } });
    const passwordMatches = user ? await bcrypt.compare(password, user.passwordHash) : false;

    if (!user || !passwordMatches) {
        throw new UnauthorizedError("Invalid email or password");
    }

    return jwt.sign({ sub: user.id }, config.jwtSecret, { expiresIn: "1h" });
}