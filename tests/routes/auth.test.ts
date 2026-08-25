import request from 'supertest';

// Mocked before importing the app: src/lib/prisma.ts constructs a PrismaClient at
// module load, and these tests must not touch a real database.
jest.mock('../../src/lib/prisma.ts', () => ({
    prisma: { user: { findUnique: jest.fn(), create: jest.fn() } },
}));
jest.mock('bcryptjs', () => ({
    __esModule: true,
    default: { compare: jest.fn(), hash: jest.fn() },
}));
jest.mock('jsonwebtoken', () => ({
    __esModule: true,
    default: { sign: jest.fn() },
}));

import app from '../../src/app.ts';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { prisma } from '../../src/lib/prisma.ts';

const findUnique = prisma.user.findUnique as jest.Mock;
const compare = bcrypt.compare as jest.Mock;
const sign = jwt.sign as jest.Mock;

const credentials = (overrides: Record<string, unknown> = {}) => ({
    email: 'ada@example.com',
    password: 'correct-horse',
    ...overrides,
});

const userRow = (overrides: Record<string, unknown> = {}) => ({
    id: 'usr-abc123',
    email: 'ada@example.com',
    passwordHash: '$2b$10$storedhash',
    ...overrides,
});

beforeEach(() => {
    process.env.JWT_SECRET = 'test-secret';
    findUnique.mockResolvedValue(userRow());
    compare.mockResolvedValue(true);
    sign.mockReturnValue('signed.jwt.token');
    // errorHandler logs every error it handles; keep the suite output readable.
    jest.spyOn(console, 'error').mockImplementation(() => {});
});

afterAll(() => {
    jest.restoreAllMocks();
});

describe('POST /v1/auth/login', () => {
    it('returns 200 with the token', async () => {
        const res = await request(app).post('/v1/auth/login').send(credentials());

        expect(res.status).toBe(200);
        expect(res.body).toEqual({ token: 'signed.jwt.token' });
    });

    it('returns only the token, matching LoginResponse in openapi.yaml', async () => {
        const res = await request(app).post('/v1/auth/login').send(credentials());

        expect(Object.keys(res.body)).toEqual(['token']);
    });

    it('responds with JSON', async () => {
        const res = await request(app).post('/v1/auth/login').send(credentials());

        expect(res.headers['content-type']).toMatch(/application\/json/);
    });

    it('never echoes the submitted password', async () => {
        const res = await request(app).post('/v1/auth/login').send(credentials());

        expect(JSON.stringify(res.body)).not.toContain('correct-horse');
    });

    it('never exposes the stored hash', async () => {
        const res = await request(app).post('/v1/auth/login').send(credentials());

        expect(JSON.stringify(res.body)).not.toContain('$2b$10$');
    });
});

describe('POST /v1/auth/login — validation', () => {
    it('returns 400 with both fields for an empty body', async () => {
        const res = await request(app).post('/v1/auth/login').send({});

        expect(res.status).toBe(400);
        expect(res.body.message).toBe('Validation failed');
        expect(res.body.details.map((d: { field: string }) => d.field).sort()).toEqual([
            'email',
            'password',
        ]);
    });

    it.each([
        ['email', { email: 'not-an-email' }],
        ['password', { password: '' }],
    ])('returns 400 for an invalid %s', async (field, override) => {
        const res = await request(app).post('/v1/auth/login').send(credentials(override));

        expect(res.status).toBe(400);
        expect(res.body.details.map((d: { field: string }) => d.field)).toContain(field);
    });

    it('does not query the database when validation fails', async () => {
        await request(app).post('/v1/auth/login').send({});

        expect(findUnique).not.toHaveBeenCalled();
        expect(compare).not.toHaveBeenCalled();
    });

    it('accepts a short password so login does not leak the length rule', async () => {
        const res = await request(app).post('/v1/auth/login').send(credentials({ password: 'a' }));

        expect(res.status).toBe(200);
    });

    it('returns 400 for a malformed JSON body', async () => {
        const res = await request(app)
            .post('/v1/auth/login')
            .set('Content-Type', 'application/json')
            .send('{"email": ');

        expect(res.status).toBe(400);
        expect(findUnique).not.toHaveBeenCalled();
    });
});

describe('POST /v1/auth/login — bad credentials', () => {
    it('returns 401 when the email is unknown', async () => {
        findUnique.mockResolvedValue(null);

        const res = await request(app).post('/v1/auth/login').send(credentials());

        expect(res.status).toBe(401);
        expect(res.body).toEqual({ message: 'Invalid email or password' });
    });

    it('returns 401 when the password is wrong', async () => {
        compare.mockResolvedValue(false);

        const res = await request(app).post('/v1/auth/login').send(credentials());

        expect(res.status).toBe(401);
        expect(res.body).toEqual({ message: 'Invalid email or password' });
    });

    it('returns byte-identical responses for unknown email and wrong password', async () => {
        // openapi.yaml documents this: the endpoint must not be usable to
        // discover which emails are registered.
        findUnique.mockResolvedValue(null);
        const unknownEmail = await request(app).post('/v1/auth/login').send(credentials());

        findUnique.mockResolvedValue(userRow());
        compare.mockResolvedValue(false);
        const wrongPassword = await request(app).post('/v1/auth/login').send(credentials());

        expect(unknownEmail.status).toBe(wrongPassword.status);
        expect(unknownEmail.text).toBe(wrongPassword.text);
    });

    it('issues no token on a 401', async () => {
        compare.mockResolvedValue(false);

        const res = await request(app).post('/v1/auth/login').send(credentials());

        expect(res.body).not.toHaveProperty('token');
        expect(sign).not.toHaveBeenCalled();
    });

    it('returns no validation details on a 401', async () => {
        findUnique.mockResolvedValue(null);

        const res = await request(app).post('/v1/auth/login').send(credentials());

        expect(res.body).not.toHaveProperty('details');
    });
});

describe('POST /v1/auth/login — unexpected failures', () => {
    it('returns 500 when the lookup fails', async () => {
        findUnique.mockRejectedValue(new Error('connection lost'));

        const res = await request(app).post('/v1/auth/login').send(credentials());

        expect(res.status).toBe(500);
        expect(res.body).toEqual({ message: 'connection lost' });
    });

    it('returns 500 when signing fails because the secret is missing', async () => {
        sign.mockImplementation(() => {
            throw new Error('secretOrPrivateKey must have a value');
        });

        const res = await request(app).post('/v1/auth/login').send(credentials());

        expect(res.status).toBe(500);
    });

    it('does not return a token on a 500', async () => {
        findUnique.mockRejectedValue(new Error('connection lost'));

        const res = await request(app).post('/v1/auth/login').send(credentials());

        expect(res.body).not.toHaveProperty('token');
    });
});

// These assertions describe the surface as currently mounted in src/app.ts.
describe('POST /v1/auth/login — unmounted methods', () => {
    it.each([
        ['get', '/v1/auth/login'],
        ['put', '/v1/auth/login'],
        ['delete', '/v1/auth/login'],
    ])('404s on %s %s', async (method, path) => {
        const res = await (request(app) as any)[method](path);

        expect(res.status).toBe(404);
    });

    it('404s on an unknown auth path', async () => {
        const res = await request(app).post('/v1/auth/logout').send({});

        expect(res.status).toBe(404);
    });
});
