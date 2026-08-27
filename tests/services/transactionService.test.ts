jest.mock('../../src/lib/prisma.ts', () => {
    const prismaMock: any = {
        account: { findUniqueOrThrow: jest.fn(), update: jest.fn() },
        transaction: { create: jest.fn(), findMany: jest.fn(), findFirst: jest.fn() },
    };
    prismaMock.$transaction = jest.fn((cb: any) => cb(prismaMock));
    return { prisma: prismaMock };
});

import { prisma } from '../../src/lib/prisma.ts';
import {
    createTransactionService,
    listTransactionsService,
    getTransactionService,
} from '../../src/services/transactionService.ts';
import { UnprocessableEntityError } from '../../src/middlewares/errorHandler.ts';
import type { CreateTransactionInput } from '../../src/schemas/transactionSchema.ts';

const findUniqueOrThrow = prisma.account.findUniqueOrThrow as jest.Mock;
const update = prisma.account.update as jest.Mock;
const create = prisma.transaction.create as jest.Mock;
const findMany = prisma.transaction.findMany as jest.Mock;
const findFirst = prisma.transaction.findFirst as jest.Mock;

const input = (overrides: Partial<CreateTransactionInput> = {}): CreateTransactionInput => ({
    amount: 50,
    currency: 'GBP',
    type: 'deposit',
    ...overrides,
});

const accountRow = (overrides: Record<string, unknown> = {}) => ({
    accountNumber: '01234567',
    balancePence: 10000, // £100.00
    ...overrides,
});

beforeEach(() => {
    create.mockResolvedValue({ id: 'tan-abc123' });
});

describe('createTransactionService', () => {
    it('re-reads the account balance inside the transaction, scoped to accountNumber', async () => {
        findUniqueOrThrow.mockResolvedValue(accountRow());

        await createTransactionService('01234567', input({ type: 'deposit', amount: 50 }));

        expect(findUniqueOrThrow).toHaveBeenCalledWith({ where: { accountNumber: '01234567' } });
    });

    it('converts pounds to pence and adds them on a deposit', async () => {
        findUniqueOrThrow.mockResolvedValue(accountRow({ balancePence: 10000 }));

        await createTransactionService('01234567', input({ type: 'deposit', amount: 50 }));

        expect(update).toHaveBeenCalledWith({
            where: { accountNumber: '01234567' },
            data: { balancePence: 15000 },
        });
        expect(create.mock.calls[0]?.[0].data.amountPence).toBe(5000);
    });

    it('subtracts pence on a withdrawal', async () => {
        findUniqueOrThrow.mockResolvedValue(accountRow({ balancePence: 10000 }));

        await createTransactionService('01234567', input({ type: 'withdrawal', amount: 30 }));

        expect(update).toHaveBeenCalledWith({
            where: { accountNumber: '01234567' },
            data: { balancePence: 7000 },
        });
    });

    it('throws UnprocessableEntityError on a withdrawal that would overdraw the account', async () => {
        findUniqueOrThrow.mockResolvedValue(accountRow({ balancePence: 1000 })); // £10.00

        await expect(
            createTransactionService('01234567', input({ type: 'withdrawal', amount: 50 }))
        ).rejects.toThrow(UnprocessableEntityError);
        expect(update).not.toHaveBeenCalled();
        expect(create).not.toHaveBeenCalled();
    });

    it('throws UnprocessableEntityError on a deposit that would exceed the £10,000 cap', async () => {
        findUniqueOrThrow.mockResolvedValue(accountRow({ balancePence: 999_900 })); // £9,999.00

        await expect(
            createTransactionService('01234567', input({ type: 'deposit', amount: 50 }))
        ).rejects.toThrow(UnprocessableEntityError);
        expect(update).not.toHaveBeenCalled();
        expect(create).not.toHaveBeenCalled();
    });

    it('allows a deposit that lands exactly on the £10,000 cap', async () => {
        findUniqueOrThrow.mockResolvedValue(accountRow({ balancePence: 999_000 })); // £9,990.00

        await createTransactionService('01234567', input({ type: 'deposit', amount: 10 }));

        expect(update).toHaveBeenCalledWith({
            where: { accountNumber: '01234567' },
            data: { balancePence: 1_000_000 },
        });
    });

    it('stores a missing reference as null, not undefined', async () => {
        findUniqueOrThrow.mockResolvedValue(accountRow());

        await createTransactionService('01234567', input({ reference: undefined }));

        expect(create.mock.calls[0]?.[0].data.reference).toBeNull();
    });

    it('generates an id matching the tan- prefix', async () => {
        findUniqueOrThrow.mockResolvedValue(accountRow());

        await createTransactionService('01234567', input());

        expect(create.mock.calls[0]?.[0].data.id).toMatch(/^tan-[a-f0-9]+$/);
    });
});

describe('listTransactionsService', () => {
    it('scopes the query to the given accountNumber, ordered oldest first', async () => {
        findMany.mockResolvedValue([]);

        await listTransactionsService('01234567');

        expect(findMany).toHaveBeenCalledWith({
            where: { accountNumber: '01234567' },
            orderBy: { createdAt: 'asc' },
        });
    });

    it('returns an empty array when the account has no transactions', async () => {
        findMany.mockResolvedValue([]);

        await expect(listTransactionsService('01234567')).resolves.toEqual([]);
    });
});

describe('getTransactionService', () => {
    it('scopes the lookup to both id and accountNumber in a single query', async () => {
        findFirst.mockResolvedValue({ id: 'tan-abc123', accountNumber: '01234567' });

        await getTransactionService('01234567', 'tan-abc123');

        expect(findFirst).toHaveBeenCalledWith({
            where: { id: 'tan-abc123', accountNumber: '01234567' },
        });
    });

    it('returns null (not a mismatch flag) when the transaction belongs to a different account', async () => {
        findFirst.mockResolvedValue(null);

        await expect(getTransactionService('01234567', 'tan-belongs-elsewhere')).resolves.toBeNull();
    });
});
