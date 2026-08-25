jest.mock('../../src/lib/prisma.ts', () => ({
    prisma: { user: { create: jest.fn() } },
}));
jest.mock('bcryptjs', () => ({
    __esModule: true,
    default: { hash: jest.fn() },
}));

import bcrypt from 'bcryptjs';
import { createUserService } from '../../src/services/userService.ts';
import { prisma } from '../../src/lib/prisma.ts';
import { BadRequestError } from '../../src/middlewares/errorHandler.ts';
import type { CreateUserInput } from '../../src/schemas/userSchema.ts';

const create = prisma.user.create as jest.Mock;
const hash = bcrypt.hash as jest.Mock;

const input = (overrides: Partial<CreateUserInput> = {}): CreateUserInput => ({
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

beforeEach(() => {
    hash.mockResolvedValue('hashed-password');
    create.mockResolvedValue({ id: 'usr-abc123' });
});

describe('createUserService — password handling', () => {
    it('hashes the password with a cost of 10', async () => {
        await createUserService(input());

        expect(hash).toHaveBeenCalledWith('correct-horse', 10);
    });

    it('stores the hash and never the plaintext', async () => {
        await createUserService(input());

        const data = create.mock.calls[0]?.[0].data;
        expect(data.passwordHash).toBe('hashed-password');
        expect(JSON.stringify(data)).not.toContain('correct-horse');
    });

    it('does not write anything if hashing fails', async () => {
        hash.mockRejectedValue(new Error('bcrypt unavailable'));

        await expect(createUserService(input())).rejects.toThrow('bcrypt unavailable');
        expect(create).not.toHaveBeenCalled();
    });
});

describe('createUserService — column mapping', () => {
    it('flattens the nested address onto columns', async () => {
        await createUserService(
            input({
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

        expect(create.mock.calls[0]?.[0].data).toMatchObject({
            addressLine1: '1 High Street',
            addressLine2: 'Flat 2',
            addressLine3: 'The Annex',
            town: 'Bath',
            county: 'Somerset',
            postcode: 'BA1 1AA',
        });
    });

    it('coerces omitted optional lines to null, not undefined', async () => {
        await createUserService(input());

        const data = create.mock.calls[0]?.[0].data;
        // A nullable column should receive an explicit null so the write is
        // unambiguous; `undefined` would be dropped from the Prisma payload.
        expect(data.addressLine2).toBeNull();
        expect(data.addressLine3).toBeNull();
    });

    it('generates a usr-prefixed id', async () => {
        await createUserService(input());

        expect(create.mock.calls[0]?.[0].data.id).toMatch(/^usr-[0-9a-f]{12}$/);
    });

    it('generates a distinct id per call', async () => {
        await createUserService(input());
        await createUserService(input({ email: 'grace@example.com' }));

        const first = create.mock.calls[0]?.[0].data.id;
        const second = create.mock.calls[1]?.[0].data.id;
        expect(first).not.toBe(second);
    });

    it('returns whatever the data layer returns', async () => {
        create.mockResolvedValue({ id: 'usr-xyz', name: 'Ada Lovelace' });

        await expect(createUserService(input())).resolves.toEqual({
            id: 'usr-xyz',
            name: 'Ada Lovelace',
        });
    });
});

describe('createUserService — error translation', () => {
    it('translates a P2002 unique violation into BadRequestError', async () => {
        create.mockRejectedValue(Object.assign(new Error('Unique constraint failed'), { code: 'P2002' }));

        await expect(createUserService(input())).rejects.toThrow(BadRequestError);
    });

    it('attaches email field details to the translated error', async () => {
        create.mockRejectedValue(Object.assign(new Error('Unique constraint failed'), { code: 'P2002' }));

        await expect(createUserService(input())).rejects.toMatchObject({
            message: 'Validation failed',
            details: [{ field: 'email', message: 'Email already in use', type: 'unique' }],
        });
    });

    it('rethrows other Prisma errors untouched', async () => {
        const err = Object.assign(new Error('Record not found'), { code: 'P2025' });
        create.mockRejectedValue(err);

        await expect(createUserService(input())).rejects.toBe(err);
    });

    it('rethrows errors that carry no code', async () => {
        const err = new Error('connection lost');
        create.mockRejectedValue(err);

        await expect(createUserService(input())).rejects.toBe(err);
    });
});
