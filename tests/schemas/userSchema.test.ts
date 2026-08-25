import { createUserSchema } from '../../src/schemas/userSchema.ts';

const valid = () => ({
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
});

/** Field paths that failed validation, dotted — mirrors toBadRequestResponse. */
const failedFields = (input: unknown): string[] => {
    const result = createUserSchema.safeParse(input);
    if (result.success) return [];
    return result.error.issues.map((i) => i.path.join('.'));
};

describe('createUserSchema', () => {
    it('accepts a fully populated payload', () => {
        expect(createUserSchema.safeParse(valid()).success).toBe(true);
    });

    it('accepts a payload without the optional address lines', () => {
        const result = createUserSchema.safeParse(valid());

        expect(result.success).toBe(true);
        if (result.success) {
            expect(result.data.address.line2).toBeUndefined();
            expect(result.data.address.line3).toBeUndefined();
        }
    });

    it('reports every invalid field at once rather than stopping at the first', () => {
        expect(failedFields({}).sort()).toEqual(['address', 'email', 'name', 'password', 'phoneNumber']);
    });
});

describe('createUserSchema — phoneNumber', () => {
    it.each(['+447700900123', '+12025550123', '+3312345678'])('accepts E.164 %s', (phoneNumber) => {
        expect(failedFields({ ...valid(), phoneNumber })).toEqual([]);
    });

    it.each([
        ['no leading plus', '447700900123'],
        ['UK national format', '07700900123'],
        ['leading zero after plus', '+047700900123'],
        ['contains spaces', '+44 7700 900123'],
        ['contains letters', '+44770090012a'],
        ['empty', ''],
    ])('rejects %s', (_label, phoneNumber) => {
        expect(failedFields({ ...valid(), phoneNumber })).toEqual(['phoneNumber']);
    });
});

describe('createUserSchema — email', () => {
    it.each(['ada@example.com', 'ada.lovelace+tag@sub.example.co.uk'])('accepts %s', (email) => {
        expect(failedFields({ ...valid(), email })).toEqual([]);
    });

    it.each(['not-an-email', 'ada@', '@example.com', 'ada example.com', ''])('rejects %s', (email) => {
        expect(failedFields({ ...valid(), email })).toEqual(['email']);
    });
});

describe('createUserSchema — password', () => {
    it('accepts exactly 8 characters', () => {
        expect(failedFields({ ...valid(), password: '12345678' })).toEqual([]);
    });

    it('rejects 7 characters', () => {
        expect(failedFields({ ...valid(), password: '1234567' })).toEqual(['password']);
    });

    it('does not trim before measuring length', () => {
        // Documents current behaviour: whitespace counts toward the minimum.
        expect(failedFields({ ...valid(), password: '        ' })).toEqual([]);
    });
});

describe('createUserSchema — address', () => {
    it.each(['line1', 'town', 'county', 'postcode'])('requires %s', (field) => {
        const address: Record<string, unknown> = { ...valid().address };
        delete address[field];

        expect(failedFields({ ...valid(), address })).toEqual([`address.${field}`]);
    });

    it.each(['line1', 'town', 'county', 'postcode'])('rejects an empty %s', (field) => {
        const address = { ...valid().address, [field]: '' };

        expect(failedFields({ ...valid(), address })).toEqual([`address.${field}`]);
    });

    it('rejects a missing address object', () => {
        expect(failedFields({ ...valid(), address: undefined })).toEqual(['address']);
    });

    it('rejects a non-object address', () => {
        expect(failedFields({ ...valid(), address: 'anywhere' })).toEqual(['address']);
    });
});

describe('createUserSchema — types', () => {
    it.each([
        ['number name', { name: 42 }],
        ['null email', { email: null }],
        ['array password', { password: ['a', 'b'] }],
    ])('rejects a %s', (_label, override) => {
        expect(createUserSchema.safeParse({ ...valid(), ...override }).success).toBe(false);
    });

    it('strips unknown keys rather than rejecting them', () => {
        const result = createUserSchema.safeParse({ ...valid(), isAdmin: true });

        expect(result.success).toBe(true);
        if (result.success) {
            expect(result.data).not.toHaveProperty('isAdmin');
        }
    });
});
