jest.mock('../../src/lib/prisma.ts', () => ({
    prisma: { user: { findUnique: jest.fn() } },
}));
jest.mock('bcryptjs', () => ({
    __esModule: true,
    default: { compare: jest.fn() },
}));
jest.mock('jsonwebtoken', () => ({
    __esModule: true,
    default: { sign: jest.fn() },
}));
jest.mock('../../src/config/config.ts', () => ({
    __esModule: true,
    default: { jwtSecret: 'test-secret', port: 3000, nodeEnv: 'test' },
}));

import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { authenticateUser } from '../../src/services/authService.ts';
import { prisma } from '../../src/lib/prisma.ts';
import { UnauthorizedError } from '../../src/middlewares/errorHandler.ts';

const findUnique = prisma.user.findUnique as jest.Mock;
const compare = bcrypt.compare as jest.Mock;
const sign = jwt.sign as jest.Mock;

const userRow = (overrides: Record<string, unknown> = {}) => ({
    id: 'usr-abc123',
    email: 'ada@example.com',
    passwordHash: '$2b$10$storedhash',
    ...overrides,
});

beforeEach(() => {
    findUnique.mockResolvedValue(userRow());
    compare.mockResolvedValue(true);
    sign.mockReturnValue('signed.jwt.token');
});

describe('authenticateUser — success', () => {
    it('returns the signed token', async () => {
        await expect(authenticateUser('ada@example.com', 'correct-horse')).resolves.toBe(
            'signed.jwt.token'
        );
    });

    it('looks the user up by email', async () => {
        await authenticateUser('ada@example.com', 'correct-horse');

        expect(findUnique).toHaveBeenCalledWith({ where: { email: 'ada@example.com' } });
    });

    it('compares the supplied password against the stored hash', async () => {
        await authenticateUser('ada@example.com', 'correct-horse');

        expect(compare).toHaveBeenCalledWith('correct-horse', '$2b$10$storedhash');
    });

    it('signs the user id as the subject claim', async () => {
        await authenticateUser('ada@example.com', 'correct-horse');

        expect(sign).toHaveBeenCalledWith({ sub: 'usr-abc123' }, 'test-secret', {
            expiresIn: '1h',
        });
    });

    it('puts no personal data in the token payload', async () => {
        await authenticateUser('ada@example.com', 'correct-horse');

        const payload = sign.mock.calls[0]?.[0];
        expect(Object.keys(payload)).toEqual(['sub']);
        expect(JSON.stringify(payload)).not.toContain('ada@example.com');
    });

    it('never puts the password or hash in the token payload', async () => {
        await authenticateUser('ada@example.com', 'correct-horse');

        const serialised = JSON.stringify(sign.mock.calls[0]?.[0]);
        expect(serialised).not.toContain('correct-horse');
        expect(serialised).not.toContain('$2b$10$storedhash');
    });
});

describe('authenticateUser — rejection', () => {
    it('throws UnauthorizedError when no user matches the email', async () => {
        findUnique.mockResolvedValue(null);

        await expect(authenticateUser('nobody@example.com', 'correct-horse')).rejects.toThrow(
            UnauthorizedError
        );
    });

    it('throws UnauthorizedError when the password does not match', async () => {
        compare.mockResolvedValue(false);

        await expect(authenticateUser('ada@example.com', 'wrong')).rejects.toThrow(
            UnauthorizedError
        );
    });

    it('uses an identical message for unknown email and wrong password', async () => {
        findUnique.mockResolvedValue(null);
        const unknownEmail = await authenticateUser('nobody@example.com', 'pw').catch((e) => e);

        findUnique.mockResolvedValue(userRow());
        compare.mockResolvedValue(false);
        const wrongPassword = await authenticateUser('ada@example.com', 'pw').catch((e) => e);

        expect(unknownEmail.message).toBe('Invalid email or password');
        expect(wrongPassword.message).toBe(unknownEmail.message);
    });

    it('issues no token when authentication fails', async () => {
        compare.mockResolvedValue(false);

        await authenticateUser('ada@example.com', 'wrong').catch(() => {});

        expect(sign).not.toHaveBeenCalled();
    });

    it('skips the hash comparison when the user is missing', async () => {
        // Documents current behaviour, which is a user-enumeration timing leak:
        // a miss returns without paying the bcrypt cost that a hit pays.
        findUnique.mockResolvedValue(null);

        await authenticateUser('nobody@example.com', 'pw').catch(() => {});

        expect(compare).not.toHaveBeenCalled();
    });
});

describe('authenticateUser — failure propagation', () => {
    it('propagates an unexpected database error', async () => {
        const err = new Error('connection lost');
        findUnique.mockRejectedValue(err);

        await expect(authenticateUser('ada@example.com', 'pw')).rejects.toBe(err);
    });

    it('propagates a bcrypt failure rather than treating it as a bad password', async () => {
        const err = new Error('bcrypt unavailable');
        compare.mockRejectedValue(err);

        await expect(authenticateUser('ada@example.com', 'pw')).rejects.toBe(err);
        expect(sign).not.toHaveBeenCalled();
    });

    it('propagates a signing failure', async () => {
        sign.mockImplementation(() => {
            throw new Error('secretOrPrivateKey must have a value');
        });

        await expect(authenticateUser('ada@example.com', 'correct-horse')).rejects.toThrow(
            'secretOrPrivateKey must have a value'
        );
    });
});
