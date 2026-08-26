import request from 'supertest';

jest.mock('../../src/lib/prisma.ts', () => ({
    prisma: {
        account: { create: jest.fn(), findMany: jest.fn(), findUnique: jest.fn(), delete: jest.fn() },
        transaction: { count: jest.fn() },
    },
}));

import app from '../../src/app.ts';
import { prisma } from '../../src/lib/prisma.ts';
import jwt from 'jsonwebtoken';
import config from '../../src/config/config.ts';

const create = prisma.account.create as jest.Mock;
const findMany = prisma.account.findMany as jest.Mock;
const findUnique = prisma.account.findUnique as jest.Mock;
const del = prisma.account.delete as jest.Mock;
const transactionCount = prisma.transaction.count as jest.Mock;
const tokenFor = (userId: string) => jwt.sign({ sub: userId }, config.jwtSecret, { expiresIn: '1h' });

const accountRow = (overrides: Record<string, unknown> = {}) => ({
    accountNumber: '01234567',
    sortCode: '10-10-10',
    name: 'Personal Account',
    accountType: 'personal',
    balancePence: 0,
    currency: 'GBP',
    userId: 'usr-abc123',
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: new Date('2026-01-02T00:00:00.000Z'),
    ...overrides,
});

beforeEach(() => {
    jest.spyOn(console, 'error').mockImplementation(() => {});
});

afterAll(() => {
    jest.restoreAllMocks();
});

describe('POST /v1/accounts', () => {
    it('creates an account and returns 201 with balance in pounds', async () => {
        create.mockResolvedValue(accountRow());

        const res = await request(app)
            .post('/v1/accounts')
            .set('Authorization', `Bearer ${tokenFor('usr-abc123')}`)
            .send({ name: 'Personal Account', accountType: 'personal' });

        expect(res.status).toBe(201);
        expect(res.body).toEqual({
            accountNumber: '01234567',
            sortCode: '10-10-10',
            name: 'Personal Account',
            accountType: 'personal',
            balance: 0,
            currency: 'GBP',
            createdTimestamp: '2026-01-01T00:00:00.000Z',
            updatedTimestamp: '2026-01-02T00:00:00.000Z',
        });
    });

    it("ignores a client-supplied userId and uses the token's subject instead", async () => {
        create.mockResolvedValue(accountRow());

        await request(app)
            .post('/v1/accounts')
            .set('Authorization', `Bearer ${tokenFor('usr-abc123')}`)
            .send({ name: 'Personal Account', accountType: 'personal', userId: 'usr-someone-else' });

        expect(create.mock.calls[0]?.[0].data.userId).toBe('usr-abc123');
    });

    it('returns 400 when name is missing', async () => {
        const res = await request(app)
            .post('/v1/accounts')
            .set('Authorization', `Bearer ${tokenFor('usr-abc123')}`)
            .send({ accountType: 'personal' });

        expect(res.status).toBe(400);
        expect(create).not.toHaveBeenCalled();
    });

    it('returns 400 for an accountType other than personal', async () => {
        const res = await request(app)
            .post('/v1/accounts')
            .set('Authorization', `Bearer ${tokenFor('usr-abc123')}`)
            .send({ name: 'Personal Account', accountType: 'business' });

        expect(res.status).toBe(400);
    });

    it('returns 401 with no Authorization header', async () => {
        const res = await request(app)
            .post('/v1/accounts')
            .send({ name: 'Personal Account', accountType: 'personal' });

        expect(res.status).toBe(401);
        expect(create).not.toHaveBeenCalled();
    });
});

describe('GET /v1/accounts', () => {
    it("returns 200 with the caller's accounts", async () => {
        findMany.mockResolvedValue([accountRow()]);

        const res = await request(app)
            .get('/v1/accounts')
            .set('Authorization', `Bearer ${tokenFor('usr-abc123')}`);

        expect(res.status).toBe(200);
        expect(res.body.accounts).toHaveLength(1);
        expect(res.body.accounts[0].accountNumber).toBe('01234567');
        expect(findMany.mock.calls[0]?.[0].where).toEqual({ userId: 'usr-abc123' });
    });

    it('returns 200 with an empty array when the caller has no accounts', async () => {
        findMany.mockResolvedValue([]);

        const res = await request(app)
            .get('/v1/accounts')
            .set('Authorization', `Bearer ${tokenFor('usr-abc123')}`);

        expect(res.status).toBe(200);
        expect(res.body).toEqual({ accounts: [] });
    });

    it('returns 401 with no Authorization header', async () => {
        const res = await request(app).get('/v1/accounts');

        expect(res.status).toBe(401);
        expect(findMany).not.toHaveBeenCalled();
    });
});

describe('GET /v1/accounts/:accountNumber', () => {
    it("returns 200 with the caller's own account", async () => {
        findUnique.mockResolvedValue(accountRow());

        const res = await request(app)
            .get('/v1/accounts/01234567')
            .set('Authorization', `Bearer ${tokenFor('usr-abc123')}`);

        expect(res.status).toBe(200);
        expect(res.body.accountNumber).toBe('01234567');
    });

    it('returns 403 when the account belongs to another user', async () => {
        findUnique.mockResolvedValue(accountRow()); // userId: usr-abc123

        const res = await request(app)
            .get('/v1/accounts/01234567')
            .set('Authorization', `Bearer ${tokenFor('usr-someone-else')}`);

        expect(res.status).toBe(403);
    });

    it('returns 404 for a nonexistent accountNumber, checked before ownership', async () => {
        findUnique.mockResolvedValue(null);

        const res = await request(app)
            .get('/v1/accounts/01999999')
            .set('Authorization', `Bearer ${tokenFor('usr-abc123')}`);

        expect(res.status).toBe(404);
    });

    it('returns 401 with no Authorization header', async () => {
        const res = await request(app).get('/v1/accounts/01234567');

        expect(res.status).toBe(401);
        expect(findUnique).not.toHaveBeenCalled();
    });
});

describe('DELETE /v1/accounts/:accountNumber', () => {
    it('deletes the account and returns 204 with no body when there are no transactions', async () => {
        findUnique.mockResolvedValue(accountRow());
        transactionCount.mockResolvedValue(0);
        del.mockResolvedValue(accountRow());

        const res = await request(app)
            .delete('/v1/accounts/01234567')
            .set('Authorization', `Bearer ${tokenFor('usr-abc123')}`);

        expect(res.status).toBe(204);
        expect(res.body).toEqual({});
        expect(del).toHaveBeenCalledWith({ where: { accountNumber: '01234567' } });
    });

    it('returns 409 and does not delete when the account has transactions', async () => {
        findUnique.mockResolvedValue(accountRow());
        transactionCount.mockResolvedValue(2);

        const res = await request(app)
            .delete('/v1/accounts/01234567')
            .set('Authorization', `Bearer ${tokenFor('usr-abc123')}`);

        expect(res.status).toBe(409);
        expect(del).not.toHaveBeenCalled();
    });

    it('returns 403 when the account belongs to another user', async () => {
        findUnique.mockResolvedValue(accountRow());

        const res = await request(app)
            .delete('/v1/accounts/01234567')
            .set('Authorization', `Bearer ${tokenFor('usr-someone-else')}`);

        expect(res.status).toBe(403);
        expect(transactionCount).not.toHaveBeenCalled();
        expect(del).not.toHaveBeenCalled();
    });

    it('returns 404 for a nonexistent accountNumber', async () => {
        findUnique.mockResolvedValue(null);

        const res = await request(app)
            .delete('/v1/accounts/01999999')
            .set('Authorization', `Bearer ${tokenFor('usr-abc123')}`);

        expect(res.status).toBe(404);
        expect(del).not.toHaveBeenCalled();
    });

    it('returns 401 with no Authorization header', async () => {
        const res = await request(app).delete('/v1/accounts/01234567');

        expect(res.status).toBe(401);
        expect(findUnique).not.toHaveBeenCalled();
    });
});
