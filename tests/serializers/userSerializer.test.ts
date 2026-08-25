import { toUserResponse } from '../../src/serializers/userSerializer.ts';

const row = (overrides: Record<string, unknown> = {}) => ({
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
    passwordHash: '$2b$10$abcdefghijklmnopqrstuv',
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: new Date('2026-01-02T03:04:05.000Z'),
    ...overrides,
});

describe('toUserResponse', () => {
    it('maps columns to the nested API shape', () => {
        expect(toUserResponse(row())).toEqual({
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
            updatedTimestamp: '2026-01-02T03:04:05.000Z',
        });
    });

    it('omits the password hash', () => {
        const result = toUserResponse(row());

        expect(result).not.toHaveProperty('passwordHash');
        expect(JSON.stringify(result)).not.toContain('$2b$10$');
    });

    it('does not leak unexpected columns that get added to the model', () => {
        // Guards against a future `secretToken` column being returned by default.
        const result = toUserResponse(row({ secretToken: 'nope', accounts: [] }));

        expect(Object.keys(result).sort()).toEqual([
            'address',
            'createdTimestamp',
            'email',
            'id',
            'name',
            'phoneNumber',
            'updatedTimestamp',
        ]);
    });

    it('passes through populated optional address lines', () => {
        const result = toUserResponse(row({ addressLine2: 'Flat 2', addressLine3: 'The Annex' }));

        expect(result.address.line2).toBe('Flat 2');
        expect(result.address.line3).toBe('The Annex');
    });

    it('normalises undefined optional lines to null', () => {
        const result = toUserResponse(row({ addressLine2: undefined, addressLine3: undefined }));

        expect(result.address.line2).toBeNull();
        expect(result.address.line3).toBeNull();
    });

    it('renders timestamps as ISO-8601 strings', () => {
        const result = toUserResponse(row());

        expect(typeof result.createdTimestamp).toBe('string');
        expect(result.createdTimestamp).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
    });
});
