import bcrypt from "bcryptjs";
import { prisma } from "../lib/prisma.ts";
import { generateId } from "../utils/id.ts";
import {BadRequestError, ConflictError} from "../middlewares/errorHandler.ts";
import type {CreateUserInput, UpdateUserInput} from "../schemas/userSchema.ts";

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

export async function getUserService(userId: string) {
    return prisma.user.findUnique({ where: { id: userId } });
}

export async function updateUserService(userId: string, input: UpdateUserInput) {
    const data: Record<string, unknown> = {};
    if (input.name !== undefined) data.name = input.name;
    if (input.email !== undefined) data.email = input.email;
    if (input.phoneNumber !== undefined) data.phoneNumber = input.phoneNumber;
    if (input.address !== undefined) {
        data.addressLine1 = input.address.line1;
        data.addressLine2 = input.address.line2 ?? null;
        data.addressLine3 = input.address.line3 ?? null;
        data.town = input.address.town;
        data.county = input.address.county;
        data.postcode = input.address.postcode;
    }
    try {
        return await prisma.user.update({ where: { id: userId }, data });
    } catch (err: any) {
        if (err.code === "P2002") {
            throw new BadRequestError([{ field: "email", message: "Email already in use", type: "unique" }]);
        }
        throw err;
    }
}

export async function deleteUserService(userId: string) {
    const accountCount = await prisma.account.count({ where: { userId } });
    if (accountCount > 0) {
        throw new ConflictError("Cannot delete a user with an associated bank account");
    }
    await prisma.user.delete({ where: { id: userId } });
}