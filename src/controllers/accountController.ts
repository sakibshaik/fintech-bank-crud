import type { Request, Response, NextFunction } from 'express';
import { createAccountSchema } from "../schemas/accountSchema.ts";
import {ConflictError, toBadRequestResponse} from "../middlewares/errorHandler.ts";
import {
    createAccountService,
    deleteAccountService,
    getAccountService,
    listAccountsService
} from "../services/accountService.ts";
import { toAccountResponse } from "../serializers/accountSerializer.ts";

export const createAccount = async (req: Request, res: Response, next: NextFunction) => {
    const result = createAccountSchema.safeParse(req.body);
    if (!result.success) {
        return res.status(400).json(toBadRequestResponse(result.error));
    }
    try {
        const account = await createAccountService(req.userId as string, result.data);
        res.status(201).json(toAccountResponse(account));
    } catch (err) {
        next(err);
    }
};

export const listAccounts = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const accounts = await listAccountsService(req.userId as string);
        res.status(200).json({ accounts: accounts.map(toAccountResponse) });
    } catch (err) {
        next(err);
    }
};

export const getAccount = async (req: Request, res: Response, next: NextFunction) => {
    const { accountNumber } = req.params;
    try {
        const account = await getAccountService(accountNumber as string);
        if (!account) {
            return res.status(404).json({ message: "Bank account not found" });
        }
        if (account.userId !== req.userId) {
            return res.status(403).json({ message: "Forbidden" });
        }
        res.status(200).json(toAccountResponse(account));
    } catch (err) {
        next(err);
    }
};

export const deleteAccount = async (req: Request, res: Response, next: NextFunction) => {
    const { accountNumber } = req.params;
    try {
        const existing = await getAccountService(accountNumber as string);
        if (!existing) {
            return res.status(404).json({ message: "Bank account not found" });
        }
        if (existing.userId !== req.userId) {
            return res.status(403).json({ message: "Forbidden" });
        }
        await deleteAccountService(accountNumber as string);
        res.status(204).send();
    } catch (err) {
        if (err instanceof ConflictError) {
            return res.status(409).json({ message: err.message });
        }
        next(err);
    }
};