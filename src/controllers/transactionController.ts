import type { Request, Response, NextFunction } from 'express';
import { createTransactionSchema } from "../schemas/transactionSchema.ts";
import {toBadRequestResponse, UnprocessableEntityError} from "../middlewares/errorHandler.ts";
import { getAccountService } from "../services/accountService.ts";
import {
    createTransactionService,
    getTransactionService,
    listTransactionsService
} from "../services/transactionService.ts";
import { toTransactionResponse } from "../serializers/transactionSerializer.ts";

export const createTransaction = async (req: Request, res: Response, next: NextFunction) => {
    const { accountNumber } = req.params;
    try {
        const account = await getAccountService(accountNumber as string);
        if (!account) {
            return res.status(404).json({ message: "Bank account not found" });
        }
        if (account.userId !== req.userId) {
            return res.status(403).json({ message: "Forbidden" });
        }
        const result = createTransactionSchema.safeParse(req.body);
        if (!result.success) {
            return res.status(400).json(toBadRequestResponse(result.error));
        }
        const transaction = await createTransactionService(accountNumber as string, result.data);
        res.status(201).json(toTransactionResponse(transaction, account.userId));
    } catch (err) {
        if (err instanceof UnprocessableEntityError) {
            return res.status(422).json({ message: err.message });
        }
        next(err);
    }
};

export const listTransactions = async (req: Request, res: Response, next: NextFunction) => {
    const { accountNumber } = req.params;
    try {
        const account = await getAccountService(accountNumber as string);
        if (!account) {
            return res.status(404).json({ message: "Bank account not found" });
        }
        if (account.userId !== req.userId) {
            return res.status(403).json({ message: "Forbidden" });
        }
        const transactions = await listTransactionsService(accountNumber as string);
        res.status(200).json({
            transactions: transactions.map((t) => toTransactionResponse(t, account.userId)),
        });
    } catch (err) {
        next(err);
    }
};

export async function getTransaction(req: Request, res: Response) {
    const { accountNumber, transactionId } = req.params;

    const account = await getAccountService(accountNumber as string);
    if (!account) {
        return res.status(404).json({ message: "Bank account not found" });
    }
    if (account.userId !== req.userId) {
        return res.status(403).json({ message: "Forbidden" });
    }

    const transaction = await getTransactionService(accountNumber as string, transactionId as string);
    if (!transaction) {
        return res.status(404).json({ message: "Transaction not found" });
    }

    res.status(200).json(toTransactionResponse(transaction, req.userId));
}