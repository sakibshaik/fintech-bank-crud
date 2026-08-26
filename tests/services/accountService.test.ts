jest.mock('../../src/lib/prisma.ts', () => ({
    prisma: {
        account: { create: jest.fn(), findMany: jest.fn(), findUnique: jest.fn(), delete: jest.fn() },
        transaction: { count: jest.fn() },
    },
}));

import { prisma } from '../../src/lib/prisma.ts';
import {
    createAccountService,
    listAccountsService,
    getAccountService,
    deleteAccountService,
} from '../../src/services/accountService.ts';
import { ConflictError } from '../../src/middlewares/errorHandler.ts';
import type { CreateAccountInput } from '../../src/schemas/accountSchema.ts';

const create = prisma.account.create as jest.Mock;
const findMany = prisma.account.findMany as jest.Mock;
const findUnique = prisma.account.findUnique as jest.Mock;
const del = prisma.account.delete as jest.Mock;
const transactionCount = prisma.transaction.count as jest.Mock;

const input = (overrides: Partial<CreateAccountInput> = {}): CreateAccountInput => ({
    name: 'Personal Account',
    accountType: 'personal',
    ...overrides,
});

beforeEach(() => {
    create.mockResolvedValue({ accountNumber: '01234567' });
});

describe('createAccountService', () => {
    it('generates an accountNumber matching the spec pattern', async () => {
        await createAccountService('usr-abc123', input());

        expect(create.mock.calls[0]?.[0].data.accountNumber).toMatch(/^01\d{6}$/);
    });

    it('associates the account with the authenticated caller', async () => {
        await createAccountService('usr-abc123', input());

        expect(create.mock.calls[0]?.[0].data.userId).toBe('usr-abc123');
    });

    it('does not set balance, sortCode, or currency — those are schema defaults', async () => {
        await createAccountService('usr-abc123', input());

        const data = create.mock.calls[0]?.[0].data;
        expect(data).not.toHaveProperty('balancePence');
        expect(data).not.toHaveProperty('sortCode');
        expect(data).not.toHaveProperty('currency');
    });

    it('retries with a new account number on a collision', async () => {
        create
            .mockRejectedValueOnce(Object.assign(new Error('Unique constraint'), { code: 'P2002' }))
            .mockResolvedValueOnce({ accountNumber: '01999999' });

        const result = await createAccountService('usr-abc123', input());

        expect(create).toHaveBeenCalledTimes(2);
        const first = create.mock.calls[0]?.[0].data.accountNumber;
        const second = create.mock.calls[1]?.[0].data.accountNumber;
        expect(first).not.toBe(second);
        expect(result).toEqual({ accountNumber: '01999999' });
    });

    it('rethrows a non-collision error immediately, without retrying', async () => {
        const err = new Error('connection lost');
        create.mockRejectedValue(err);

        await expect(createAccountService('usr-abc123', input())).rejects.toBe(err);
        expect(create).toHaveBeenCalledTimes(1);
    });

    it('gives up after 5 straight collisions with a clean error', async () => {
        create.mockRejectedValue(Object.assign(new Error('Unique constraint'), { code: 'P2002' }));

        await expect(createAccountService('usr-abc123', input())).rejects.toThrow(
            'Failed to generate a unique account number'
        );
        expect(create).toHaveBeenCalledTimes(5);
    });
});

describe('listAccountsService', () => {
    it('scopes the query to the given userId, ordered by creation time', async () => {
        findMany.mockResolvedValue([]);

        await listAccountsService('usr-abc123');

        expect(findMany).toHaveBeenCalledWith({
            where: { userId: 'usr-abc123' },
            orderBy: { createdAt: 'asc' },
        });
    });

    it('returns an empty array rather than null when the user has no accounts', async () => {
        findMany.mockResolvedValue([]);

        await expect(listAccountsService('usr-abc123')).resolves.toEqual([]);
    });

    it('returns whatever rows the data layer returns', async () => {
        const rows = [{ accountNumber: '01111111' }, { accountNumber: '01222222' }];
        findMany.mockResolvedValue(rows);

        await expect(listAccountsService('usr-abc123')).resolves.toEqual(rows);
    });
});

describe('getAccountService', () => {
    it('returns the row when found', async () => {
        findUnique.mockResolvedValue({ accountNumber: '01234567' });

        await expect(getAccountService('01234567')).resolves.toEqual({ accountNumber: '01234567' });
        expect(findUnique).toHaveBeenCalledWith({ where: { accountNumber: '01234567' } });
    });

    it('returns null when not found', async () => {
        findUnique.mockResolvedValue(null);

        await expect(getAccountService('01000000')).resolves.toBeNull();
    });
});

describe('deleteAccountService', () => {
    it('deletes the account when it has no transactions', async () => {
        transactionCount.mockResolvedValue(0);
        del.mockResolvedValue({ accountNumber: '01234567' });

        await deleteAccountService('01234567');

        expect(del).toHaveBeenCalledWith({ where: { accountNumber: '01234567' } });
    });

    it('throws ConflictError and does not delete when transactions exist', async () => {
        transactionCount.mockResolvedValue(3);

        await expect(deleteAccountService('01234567')).rejects.toThrow(ConflictError);
        expect(del).not.toHaveBeenCalled();
    });

    it('checks the count against the correct accountNumber', async () => {
        transactionCount.mockResolvedValue(0);
        del.mockResolvedValue({ accountNumber: '01234567' });

        await deleteAccountService('01234567');

        expect(transactionCount).toHaveBeenCalledWith({ where: { accountNumber: '01234567' } });
    });
});
