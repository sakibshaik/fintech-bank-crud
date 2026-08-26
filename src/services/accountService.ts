import { prisma } from "../lib/prisma.ts";
import { generateAccountNumber } from "../utils/id.ts";
import type { CreateAccountInput } from "../schemas/accountSchema.ts";
import {ConflictError} from "../middlewares/errorHandler.ts";

export async function createAccountService(userId: string, input: CreateAccountInput) {
    for (let attempt = 0; attempt < 5; attempt++) {
        const accountNumber = generateAccountNumber();
        try {
            return await prisma.account.create({
                data: {
                    accountNumber,
                    name: input.name,
                    accountType: input.accountType,
                    userId,
                },
            });
        } catch (err: any) {
            if (err.code !== "P2002") throw err;
        }
    }
    throw new Error("Failed to generate a unique account number");
}

export async function listAccountsService(userId: string) {
    return prisma.account.findMany({
        where: { userId },
        orderBy: { createdAt: 'asc' },
    });
}

export async function getAccountService(accountNumber: string) {
    return prisma.account.findUnique({ where: { accountNumber } });
}

export async function deleteAccountService(accountNumber: string) {
    const transactionCount = await prisma.transaction.count({ where: { accountNumber } });
    if (transactionCount > 0) {
        throw new ConflictError("Cannot delete a bank account with existing transactions");
    }
    await prisma.account.delete({ where: { accountNumber } });
}