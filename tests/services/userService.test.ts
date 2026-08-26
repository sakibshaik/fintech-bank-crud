jest.mock('../../src/lib/prisma.ts', () => ({
    prisma: {
        user: { create: jest.fn(), findUnique: jest.fn(), update: jest.fn(), delete: jest.fn() },
        account: { count: jest.fn() },
    },
}));
jest.mock('bcryptjs', () => ({
    __esModule: true,
    default: { hash: jest.fn() },
}));

import bcrypt from 'bcryptjs';
import { createUserService, getUserService, updateUserService, deleteUserService } from '../../src/services/userService.ts';
import { prisma } from '../../src/lib/prisma.ts';
import { BadRequestError, ConflictError } from '../../src/middlewares/errorHandler.ts';
import type { CreateUserInput, UpdateUserInput } from '../../src/schemas/userSchema.ts';

const create = prisma.user.create as jest.Mock;
const findUnique = prisma.user.findUnique as jest.Mock;
const update = prisma.user.update as jest.Mock;
const del = prisma.user.delete as jest.Mock;
const accountCount = prisma.account.count as jest.Mock;
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

describe('getUserService', () => {
    it('returns the row when found', async () => {
        findUnique.mockResolvedValue({ id: 'usr-abc123' });

        await expect(getUserService('usr-abc123')).resolves.toEqual({ id: 'usr-abc123' });
        expect(findUnique).toHaveBeenCalledWith({ where: { id: 'usr-abc123' } });
    });

    it('returns null when not found', async () => {
        findUnique.mockResolvedValue(null);

        await expect(getUserService('usr-nope')).resolves.toBeNull();
    });
});

describe('updateUserService', () => {
    it('sends only the provided fields to Prisma', async () => {
        update.mockResolvedValue({ id: 'usr-abc123' });

        await updateUserService('usr-abc123', { name: 'Ada K. Lovelace' } as UpdateUserInput);

        expect(update).toHaveBeenCalledWith({ where: { id: 'usr-abc123' }, data: { name: 'Ada K. Lovelace' } });
    });

    it('sends an empty data object for an empty input', async () => {
        update.mockResolvedValue({ id: 'usr-abc123' });

        await updateUserService('usr-abc123', {} as UpdateUserInput);

        expect(update).toHaveBeenCalledWith({ where: { id: 'usr-abc123' }, data: {} });
    });

    it('flattens a fully-supplied address and nulls the omitted lines', async () => {
        update.mockResolvedValue({ id: 'usr-abc123' });

        await updateUserService('usr-abc123', {
            address: { line1: '2 Low Street', town: 'Wells', county: 'Somerset', postcode: 'BA5 1AA' },
        } as UpdateUserInput);

        expect(update.mock.calls[0]?.[0].data).toEqual({
            addressLine1: '2 Low Street',
            addressLine2: null,
            addressLine3: null,
            town: 'Wells',
            county: 'Somerset',
            postcode: 'BA5 1AA',
        });
    });

    it('translates a P2002 unique violation into BadRequestError', async () => {
        update.mockRejectedValue(Object.assign(new Error('Unique constraint failed'), { code: 'P2002' }));

        await expect(
            updateUserService('usr-abc123', { email: 'taken@example.com' } as UpdateUserInput)
        ).rejects.toThrow(BadRequestError);
    });

    it('rethrows other Prisma errors untouched', async () => {
        const err = Object.assign(new Error('Record not found'), { code: 'P2025' });
        update.mockRejectedValue(err);

        await expect(updateUserService('usr-abc123', { name: 'x' } as UpdateUserInput)).rejects.toBe(err);
    });
});

describe('deleteUserService', () => {
    it('deletes the user when they have no accounts', async () => {
        accountCount.mockResolvedValue(0);
        del.mockResolvedValue({ id: 'usr-abc123' });

        await deleteUserService('usr-abc123');

        expect(del).toHaveBeenCalledWith({ where: { id: 'usr-abc123' } });
    });

    it('throws ConflictError and does not delete when the user has an account', async () => {
        accountCount.mockResolvedValue(1);

        await expect(deleteUserService('usr-abc123')).rejects.toThrow(ConflictError);
        expect(del).not.toHaveBeenCalled();
    });

    it('checks the count for the correct userId', async () => {
        accountCount.mockResolvedValue(0);
        del.mockResolvedValue({ id: 'usr-abc123' });

        await deleteUserService('usr-abc123');

        expect(accountCount).toHaveBeenCalledWith({ where: { userId: 'usr-abc123' } });
    });
});
