import request from 'supertest';

// Mocked before importing the app: src/lib/prisma.ts constructs a PrismaClient at
// module load, and these tests must not touch a real database.
jest.mock('../../src/lib/prisma.ts', () => ({
    prisma: { user: { create: jest.fn() } },
}));
jest.mock('bcryptjs', () => ({
    __esModule: true,
    default: { hash: jest.fn(async () => 'hashed-password') },
}));

import app from '../../src/app.ts';
import { prisma } from '../../src/lib/prisma.ts';
import bcrypt from 'bcryptjs';

const create = prisma.user.create as jest.Mock;
const hash = bcrypt.hash as jest.Mock;

const validPayload = (overrides: Record<string, unknown> = {}) => ({
    name: 'Ada Lovelace',
    email: 'ada@example.com',
    phoneNumber: '+447700900123',
    password: 'correct-horse',
    address: {
        line1: '1 High Street',
        town: 'Bath',
        county: 'Somerset',
        postcode: 'BA1 1AA',
    },
    ...overrides,
});

// Shape returned by prisma.user.create — snake-cased columns, Date objects.
const dbRow = (overrides: Record<string, unknown> = {}) => ({
    id: 'usr-abc123',
    name: 'Ada Lovelace',
    email: 'ada@example.com',
    phoneNumber: '+447700900123',
    addressLine1: '1 High Street',
    addressLine2: null,
    addressLine3: null,
    town: 'Bath',
    county: 'Somerset',
    postcode: 'BA1 1AA',
    passwordHash: 'hashed-password',
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: new Date('2026-01-02T00:00:00.000Z'),
    ...overrides,
});

beforeEach(() => {
    hash.mockResolvedValue('hashed-password');
    // errorHandler logs every error it handles; keep the suite output readable.
    jest.spyOn(console, 'error').mockImplementation(() => {});
});

afterAll(() => {
    jest.restoreAllMocks();
});

describe('POST /v1/users', () => {
    it('creates a user and returns 201 with the serialized body', async () => {
        create.mockResolvedValue(dbRow());

        const res = await request(app).post('/v1/users').send(validPayload());

        expect(res.status).toBe(201);
        expect(res.body).toEqual({
            id: 'usr-abc123',
            name: 'Ada Lovelace',
            address: {
                line1: '1 High Street',
                line2: null,
                line3: null,
                town: 'Bath',
                county: 'Somerset',
                postcode: 'BA1 1AA',
            },
            phoneNumber: '+447700900123',
            email: 'ada@example.com',
            createdTimestamp: '2026-01-01T00:00:00.000Z',
            updatedTimestamp: '2026-01-02T00:00:00.000Z',
        });
    });

    it('never exposes the password or its hash in the response', async () => {
        create.mockResolvedValue(dbRow());

        const res = await request(app).post('/v1/users').send(validPayload());

        expect(res.body).not.toHaveProperty('passwordHash');
        expect(res.body).not.toHaveProperty('password');
        expect(JSON.stringify(res.body)).not.toContain('correct-horse');
        expect(JSON.stringify(res.body)).not.toContain('hashed-password');
    });

    it('persists the bcrypt hash rather than the plaintext password', async () => {
        create.mockResolvedValue(dbRow());

        await request(app).post('/v1/users').send(validPayload());

        expect(hash).toHaveBeenCalledWith('correct-horse', 10);

        const data = create.mock.calls[0]?.[0].data;
        expect(data.passwordHash).toBe('hashed-password');
        expect(data).not.toHaveProperty('password');
        expect(JSON.stringify(data)).not.toContain('correct-horse');
    });

    it('generates a prefixed id', async () => {
        create.mockResolvedValue(dbRow());

        await request(app).post('/v1/users').send(validPayload());

        expect(create.mock.calls[0]?.[0].data.id).toMatch(/^usr-[0-9a-f]{12}$/);
    });

    it('maps optional address lines to null when omitted', async () => {
        create.mockResolvedValue(dbRow());

        await request(app).post('/v1/users').send(validPayload());

        const data = create.mock.calls[0]?.[0].data;
        expect(data.addressLine2).toBeNull();
        expect(data.addressLine3).toBeNull();
    });

    it('persists optional address lines when supplied', async () => {
        create.mockResolvedValue(dbRow({ addressLine2: 'Flat 2', addressLine3: 'The Annex' }));

        const res = await request(app)
            .post('/v1/users')
            .send(
                validPayload({
                    address: {
                        line1: '1 High Street',
                        line2: 'Flat 2',
                        line3: 'The Annex',
                        town: 'Bath',
                        county: 'Somerset',
                        postcode: 'BA1 1AA',
                    },
                })
            );

        expect(res.status).toBe(201);
        const data = create.mock.calls[0]?.[0].data;
        expect(data.addressLine2).toBe('Flat 2');
        expect(data.addressLine3).toBe('The Annex');
        expect(res.body.address.line2).toBe('Flat 2');
    });
});

describe('POST /v1/users — validation', () => {
    it('returns 400 with per-field details for an empty body', async () => {
        const res = await request(app).post('/v1/users').send({});

        expect(res.status).toBe(400);
        expect(res.body.message).toBe('Validation failed');
        expect(res.body.details.map((d: { field: string }) => d.field).sort()).toEqual([
            'address',
            'email',
            'name',
            'password',
            'phoneNumber',
        ]);
    });

    it('does not reach the database when validation fails', async () => {
        await request(app).post('/v1/users').send({});

        expect(create).not.toHaveBeenCalled();
        expect(hash).not.toHaveBeenCalled();
    });

    it.each([
        ['name', { name: '' }],
        ['email', { email: 'not-an-email' }],
        ['phoneNumber', { phoneNumber: '07700900123' }],
        ['password', { password: 'short' }],
    ])('rejects an invalid %s', async (field, override) => {
        const res = await request(app).post('/v1/users').send(validPayload(override));

        expect(res.status).toBe(400);
        expect(res.body.details.map((d: { field: string }) => d.field)).toContain(field);
    });

    it('reports nested address fields with a dotted path', async () => {
        const res = await request(app)
            .post('/v1/users')
            .send(validPayload({ address: { line1: '', town: '', county: 'Somerset', postcode: 'BA1 1AA' } }));

        expect(res.status).toBe(400);
        const fields = res.body.details.map((d: { field: string }) => d.field);
        expect(fields).toContain('address.line1');
        expect(fields).toContain('address.town');
    });

    it('returns 400 for a malformed JSON body', async () => {
        const res = await request(app)
            .post('/v1/users')
            .set('Content-Type', 'application/json')
            .send('{"name": ');

        expect(res.status).toBe(400);
        expect(create).not.toHaveBeenCalled();
    });
});

describe('POST /v1/users — failures from the data layer', () => {
    it('returns 400 when the email is already taken', async () => {
        create.mockRejectedValue(Object.assign(new Error('Unique constraint'), { code: 'P2002' }));

        const res = await request(app).post('/v1/users').send(validPayload());

        expect(res.status).toBe(400);
        expect(res.body).toEqual({
            message: 'Validation failed',
            details: [{ field: 'email', message: 'Email already in use', type: 'unique' }],
        });
    });

    it('surfaces an unexpected database error as a 500 via the error handler', async () => {
        create.mockRejectedValue(new Error('connection lost'));

        const res = await request(app).post('/v1/users').send(validPayload());

        expect(res.status).toBe(500);
        expect(res.body).toEqual({ message: 'connection lost' });
    });
});

// These assertions describe the surface as currently mounted in src/app.ts.
// Uncommenting a route in src/routes/v1/userRoute.ts should turn the matching
// case here red — that is the signal to write real coverage for it.
describe('unmounted routes', () => {
    it.each([
        ['get', '/v1/users'],
        ['put', '/v1/users/usr-abc123'],
        ['delete', '/v1/users/usr-abc123'],
    ])('404s on %s %s', async (method, path) => {
        const res = await (request(app) as any)[method](path);

        expect(res.status).toBe(404);
    });

    it('404s on an unknown path', async () => {
        const res = await request(app).get('/v1/nope');

        expect(res.status).toBe(404);
    });
});
