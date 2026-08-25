// dotenv is stubbed so these tests exercise process.env only, never the real
// .env file on the developer's machine.
jest.mock('dotenv', () => ({
    __esModule: true,
    default: { config: jest.fn() },
}));

const ORIGINAL = { ...process.env };

/** Re-evaluate src/config/config.ts against the current process.env. */
const loadConfig = () => {
    jest.resetModules();
    return require('../../src/config/config.ts').default;
};

beforeEach(() => {
    process.env = { ...ORIGINAL };
});

afterAll(() => {
    process.env = ORIGINAL;
});

describe('config — JWT_SECRET guard', () => {
    it('exposes the secret when it is set', () => {
        process.env.JWT_SECRET = 's3cret-value';

        expect(loadConfig().jwtSecret).toBe('s3cret-value');
    });

    it('throws when JWT_SECRET is absent', () => {
        delete process.env.JWT_SECRET;

        expect(loadConfig).toThrow('JWT_SECRET must be set');
    });

    it('throws when JWT_SECRET is an empty string', () => {
        // `JWT_SECRET=` in a .env file yields '', which must not be accepted as
        // a signing key just because the variable technically exists.
        process.env.JWT_SECRET = '';

        expect(loadConfig).toThrow('JWT_SECRET must be set');
    });

    it('never substitutes a fallback secret', () => {
        delete process.env.JWT_SECRET;

        expect(loadConfig).toThrow();
    });
});

describe('config — port', () => {
    beforeEach(() => {
        process.env.JWT_SECRET = 's3cret-value';
    });

    it('parses PORT as a number', () => {
        process.env.PORT = '8080';

        expect(loadConfig().port).toBe(8080);
    });

    it('defaults to 3000 when PORT is unset', () => {
        delete process.env.PORT;

        expect(loadConfig().port).toBe(3000);
    });

    it('falls back to 3000 when PORT is not numeric', () => {
        process.env.PORT = 'not-a-port';

        expect(loadConfig().port).toBe(3000);
    });
});

describe('config — nodeEnv', () => {
    beforeEach(() => {
        process.env.JWT_SECRET = 's3cret-value';
    });

    it('reads NODE_ENV when set', () => {
        process.env.NODE_ENV = 'production';

        expect(loadConfig().nodeEnv).toBe('production');
    });

    it('defaults to development', () => {
        delete process.env.NODE_ENV;

        expect(loadConfig().nodeEnv).toBe('development');
    });
});
