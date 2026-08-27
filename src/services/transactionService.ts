import { prisma } from "../lib/prisma.ts";
import { generateId } from "../utils/id.ts";
import { UnprocessableEntityError } from "../middlewares/errorHandler.ts";
import type { CreateTransactionInput } from "../schemas/transactionSchema.ts";

const MAX_BALANCE_PENCE = 1_000_000; // £10,000.00

export async function createTransactionService(accountNumber: string, input: CreateTransactionInput) {
    const amountPence = Math.round(input.amount * 100);

    return prisma.$transaction(async (tx) => {
        // Re-read inside the transaction, not reused from the controller's earlier
        // fetch — this read has to be the current balance at the instant of the
        // write, or the atomicity guarantee is worthless.
        const account = await tx.account.findUniqueOrThrow({ where: { accountNumber } });

        const newBalancePence =
            input.type === "deposit" ? account.balancePence + amountPence : account.balancePence - amountPence;

        if (input.type === "withdrawal" && newBalancePence < 0) {
            throw new UnprocessableEntityError("Insufficient funds");
        }
        if (input.type === "deposit" && newBalancePence > MAX_BALANCE_PENCE) {
            throw new UnprocessableEntityError("Deposit would exceed the maximum allowed balance");
        }

        await tx.account.update({ where: { accountNumber }, data: { balancePence: newBalancePence } });

        return tx.transaction.create({
            data: {
                id: generateId("tan"),
                accountNumber,
                type: input.type,
                amountPence,
                currency: input.currency,
                reference: input.reference ?? null,
            },
        });
    });
}

export async function listTransactionsService(accountNumber: string) {
    return prisma.transaction.findMany({
        where: { accountNumber },
        orderBy: { createdAt: 'asc' },
    });
}

export async function getTransactionService(accountNumber: string, transactionId: string) {
    return prisma.transaction.findFirst({
        where: { id: transactionId, accountNumber },
    });
}