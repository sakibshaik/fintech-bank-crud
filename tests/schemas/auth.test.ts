import { loginSchema } from '../../src/schemas/auth.ts';

const valid = () => ({ email: 'ada@example.com', password: 'correct-horse' });

/** Field paths that failed validation, dotted — mirrors toBadRequestResponse. */
const failedFields = (input: unknown): string[] => {
    const result = loginSchema.safeParse(input);
    if (result.success) return [];
    return result.error.issues.map((i) => i.path.join('.'));
};

describe('loginSchema', () => {
    it('accepts a well-formed credential pair', () => {
        expect(loginSchema.safeParse(valid()).success).toBe(true);
    });

    it('reports both fields when the body is empty', () => {
        expect(failedFields({}).sort()).toEqual(['email', 'password']);
    });

    it.each(['not-an-email', 'ada@', '@example.com', ''])('rejects email %p', (email) => {
        expect(failedFields({ ...valid(), email })).toEqual(['email']);
    });

    it('requires a non-empty password', () => {
        expect(failedFields({ ...valid(), password: '' })).toEqual(['password']);
    });

    it('does not impose the registration minimum on login', () => {
        // Deliberate: re-applying the 8-char rule here would tell an attacker
        // that a short password could never be valid for this account.
        expect(failedFields({ ...valid(), password: 'a' })).toEqual([]);
    });

    it.each([
        ['number email', { email: 42 }],
        ['null password', { password: null }],
        ['array password', { password: ['a'] }],
    ])('rejects a %s', (_label, override) => {
        expect(loginSchema.safeParse({ ...valid(), ...override }).success).toBe(false);
    });

    it('strips unknown keys rather than rejecting them', () => {
        const result = loginSchema.safeParse({ ...valid(), isAdmin: true });

        expect(result.success).toBe(true);
        if (result.success) {
            expect(result.data).not.toHaveProperty('isAdmin');
        }
    });
});
