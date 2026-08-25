import dotenv from 'dotenv';

dotenv.config();

interface Config {
    port: number;
    nodeEnv: string;
    jwtSecret: string;
}

/**
 * Read a required env var, throwing if it is missing or empty.
 *
 * Secrets must never fall back to a default: signing tokens with `undefined` or
 * a hardcoded string produces tokens that verify against a known key. Failing
 * here means a misconfigured deploy cannot start rather than starting insecure.
 */
const requireEnv = (name: string): string => {
    const value = process.env[name];
    if (!value) {
        throw new Error(`${name} must be set`);
    }
    return value;
};

const config: Config = {
    port: Number(process.env.PORT) || 3000,
    nodeEnv: process.env.NODE_ENV || 'development',
    jwtSecret: requireEnv('JWT_SECRET'),
};

export default config;