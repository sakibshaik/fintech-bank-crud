import request from 'supertest';

jest.mock('../../src/lib/prisma.ts', () => {
    const prismaMock: any = {
        account: { findUnique: jest.fn(), findUniqueOrThrow: jest.fn(), update: jest.fn() },
        transaction: { create: jest.fn(), findMany: jest.fn(), findFirst: jest.fn() },
    };
    prismaMock.$transaction = jest.fn((cb: any) => cb(prismaMock));
    return { prisma: prismaMock };
});

import app from '../../src/app.ts';
import { prisma } from '../../src/lib/prisma.ts';
import jwt from 'jsonwebtoken';
import config from '../../src/config/config.ts';

const findUnique = prisma.account.findUnique as jest.Mock;
const findUniqueOrThrow = prisma.account.findUniqueOrThrow as jest.Mock;
const create = prisma.transaction.create as jest.Mock;
const findMany = prisma.transaction.findMany as jest.Mock;
const findFirst = prisma.transaction.findFirst as jest.Mock;

const tokenFor = (userId: string) => jwt.sign({ sub: userId }, config.jwtSecret, { expiresIn: '1h' });

const accountRow = (overrides: Record<string, unknown> = {}) => ({
    accountNumber: '01234567',
    userId: 'usr-abc123',
    balancePence: 10000,
    ...overrides,
});

const transactionRow = (overrides: Record<string, unknown> = {}) => ({
    id: 'tan-abc123',
    accountNumber: '01234567',
    type: 'deposit',
    amountPence: 5000,
    currency: 'GBP',
    reference: null,
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    ...overrides,
});

beforeEach(() => {
    jest.spyOn(console, 'error').mockImplementation(() => {});
});

afterAll(() => {
    jest.restoreAllMocks();
});

describe('POST /v1/accounts/:accountNumber/transactions', () => {
    it('creates a deposit and returns 201 with amount in pounds', async () => {
        findUnique.mockResolvedValue(accountRow());
        findUniqueOrThrow.mockResolvedValue(accountRow());
        create.mockResolvedValue(transactionRow());

        const res = await request(app)
            .post('/v1/accounts/01234567/transactions')
            .set('Authorization', `Bearer ${tokenFor('usr-abc123')}`)
            .send({ amount: 50, currency: 'GBP', type: 'deposit' });

        expect(res.status).toBe(201);
        expect(res.body.amount).toBe(50);
        expect(res.body.userId).toBe('usr-abc123');
    });

    it('returns 422 on a withdrawal that would overdraw the account', async () => {
        findUnique.mockResolvedValue(accountRow({ balancePence: 1000 }));
        findUniqueOrThrow.mockResolvedValue(accountRow({ balancePence: 1000 }));

        const res = await request(app)
            .post('/v1/accounts/01234567/transactions')
            .set('Authorization', `Bearer ${tokenFor('usr-abc123')}`)
            .send({ amount: 50, currency: 'GBP', type: 'withdrawal' });

        expect(res.status).toBe(422);
        expect(create).not.toHaveBeenCalled();
    });

    it('returns 400 for a negative amount', async () => {
        findUnique.mockResolvedValue(accountRow());

        const res = await request(app)
            .post('/v1/accounts/01234567/transactions')
            .set('Authorization', `Bearer ${tokenFor('usr-abc123')}`)
            .send({ amount: -10, currency: 'GBP', type: 'deposit' });

        expect(res.status).toBe(400);
        expect(create).not.toHaveBeenCalled();
    });

    it('returns 403 when the account belongs to another user, checked before validation', async () => {
        findUnique.mockResolvedValue(accountRow()); // userId: usr-abc123

        const res = await request(app)
            .post('/v1/accounts/01234567/transactions')
            .set('Authorization', `Bearer ${tokenFor('usr-someone-else')}`)
            .send({ amount: 'not-a-number', currency: 'GBP', type: 'deposit' }); // would also fail validation

        expect(res.status).toBe(403);
    });

    it('returns 404 for a nonexistent accountNumber', async () => {
        findUnique.mockResolvedValue(null);

        const res = await request(app)
            .post('/v1/accounts/01999999/transactions')
            .set('Authorization', `Bearer ${tokenFor('usr-abc123')}`)
            .send({ amount: 50, currency: 'GBP', type: 'deposit' });

        expect(res.status).toBe(404);
        expect(create).not.toHaveBeenCalled();
    });

    it('returns 401 with no Authorization header', async () => {
        const res = await request(app)
            .post('/v1/accounts/01234567/transactions')
            .send({ amount: 50, currency: 'GBP', type: 'deposit' });

        expect(res.status).toBe(401);
        expect(findUnique).not.toHaveBeenCalled();
    });
});

describe('GET /v1/accounts/:accountNumber/transactions', () => {
    it("returns 200 with the account's transactions", async () => {
        findUnique.mockResolvedValue(accountRow());
        findMany.mockResolvedValue([transactionRow()]);

        const res = await request(app)
            .get('/v1/accounts/01234567/transactions')
            .set('Authorization', `Bearer ${tokenFor('usr-abc123')}`);

        expect(res.status).toBe(200);
        expect(res.body.transactions).toHaveLength(1);
        expect(res.body.transactions[0].userId).toBe('usr-abc123');
    });

    it('returns 403 when the account belongs to another user', async () => {
        findUnique.mockResolvedValue(accountRow());

        const res = await request(app)
            .get('/v1/accounts/01234567/transactions')
            .set('Authorization', `Bearer ${tokenFor('usr-someone-else')}`);

        expect(res.status).toBe(403);
        expect(findMany).not.toHaveBeenCalled();
    });

    it('returns 404 for a nonexistent accountNumber', async () => {
        findUnique.mockResolvedValue(null);

        const res = await request(app)
            .get('/v1/accounts/01999999/transactions')
            .set('Authorization', `Bearer ${tokenFor('usr-abc123')}`);

        expect(res.status).toBe(404);
    });

    it('returns 401 with no Authorization header', async () => {
        const res = await request(app).get('/v1/accounts/01234567/transactions');

        expect(res.status).toBe(401);
        expect(findMany).not.toHaveBeenCalled();
    });
});

describe('GET /v1/accounts/:accountNumber/transactions/:transactionId', () => {
    it('returns 200 with the transaction', async () => {
        findUnique.mockResolvedValue(accountRow());
        findFirst.mockResolvedValue(transactionRow());

        const res = await request(app)
            .get('/v1/accounts/01234567/transactions/tan-abc123')
            .set('Authorization', `Bearer ${tokenFor('usr-abc123')}`);

        expect(res.status).toBe(200);
        expect(res.body.id).toBe('tan-abc123');
        expect(findFirst).toHaveBeenCalledWith({
            where: { id: 'tan-abc123', accountNumber: '01234567' },
        });
    });

    it('returns 404 — not 403 — when the transactionId exists under a different account', async () => {
        findUnique.mockResolvedValue(accountRow());
        // findFirst is scoped by accountNumber too, so a real-but-wrong-account id never matches here.
        findFirst.mockResolvedValue(null);

        const res = await request(app)
            .get('/v1/accounts/01234567/transactions/tan-belongs-elsewhere')
            .set('Authorization', `Bearer ${tokenFor('usr-abc123')}`);

        expect(res.status).toBe(404);
    });

    it('returns 404 for a nonexistent transactionId', async () => {
        findUnique.mockResolvedValue(accountRow());
        findFirst.mockResolvedValue(null);

        const res = await request(app)
            .get('/v1/accounts/01234567/transactions/tan-nonexistent')
            .set('Authorization', `Bearer ${tokenFor('usr-abc123')}`);

        expect(res.status).toBe(404);
    });

    it('returns 403 when the account belongs to another user, checked before the transaction lookup', async () => {
        findUnique.mockResolvedValue(accountRow());

        const res = await request(app)
            .get('/v1/accounts/01234567/transactions/tan-abc123')
            .set('Authorization', `Bearer ${tokenFor('usr-someone-else')}`);

        expect(res.status).toBe(403);
        expect(findFirst).not.toHaveBeenCalled();
    });

    it('returns 404 for a nonexistent accountNumber', async () => {
        findUnique.mockResolvedValue(null);

        const res = await request(app)
            .get('/v1/accounts/01999999/transactions/tan-abc123')
            .set('Authorization', `Bearer ${tokenFor('usr-abc123')}`);

        expect(res.status).toBe(404);
        expect(findFirst).not.toHaveBeenCalled();
    });

    it('returns 401 with no Authorization header', async () => {
        const res = await request(app).get('/v1/accounts/01234567/transactions/tan-abc123');

        expect(res.status).toBe(401);
        expect(findFirst).not.toHaveBeenCalled();
    });
});
