import type { Request, Response, NextFunction } from 'express';
import { createTransactionSchema } from "../schemas/transactionSchema.ts";
import { toBadRequestResponse, UnprocessableEntityError } from "../middlewares/errorHandler.ts";
import { getAccountService } from "../services/accountService.ts";
import { createTransactionService } from "../services/transactionService.ts";
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