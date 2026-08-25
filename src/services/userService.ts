import bcrypt from "bcryptjs";
import { prisma } from "../lib/prisma.ts";
import { generateId } from "../utils/id.ts";
import {BadRequestError} from "../middlewares/errorHandler.ts";
import type {CreateUserInput} from "../schemas/userSchema.ts";

export async function createUserService(input: CreateUserInput) {
    const passwordHash = await bcrypt.hash(input.password, 10);
    try {
        return await prisma.user.create({
            data: {
                id: generateId("usr"),
                name: input.name,
                email: input.email,
                phoneNumber: input.phoneNumber,
                addressLine1: input.address.line1,
                addressLine2: input.address.line2 ?? null,
                addressLine3: input.address.line3 ?? null,
                town: input.address.town,
                county: input.address.county,
                postcode: input.address.postcode,
                passwordHash,
            },
        });
    } catch (err: any) {
        if (err.code === "P2002") {
            throw new BadRequestError([{ field: "email", message: "Email already in use", type: "unique" }]);
        }
        throw err;
    }
}