// Deliberately NOT mocking jsonwebtoken here — this suite exists specifically to
// exercise real jwt.verify behaviour (bad signature, expiry) through requireAuth's
// catch block, which no route-level test ever triggers (they only ever send no
// Authorization header at all).
jest.mock('../../src/config/config.ts', () => ({
    __esModule: true,
    default: { jwtSecret: 'test-secret', port: 3000, nodeEnv: 'test' },
}));

import type { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { requireAuth } from '../../src/middlewares/auth.ts';

const JWT_SECRET = 'test-secret';

const mockReq = (authorization?: string) =>
    ({ headers: authorization !== undefined ? { authorization } : {} }) as unknown as Request & {
        userId?: string;
    };

const mockRes = () => {
    const res = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn().mockReturnThis(),
    };
    return res as unknown as Response & typeof res;
};

const validToken = (overrides: Record<string, unknown> = {}) =>
    jwt.sign({ sub: 'usr-abc123', ...overrides }, JWT_SECRET, { expiresIn: '1h' });

describe('requireAuth — success', () => {
    it('calls next with no arguments when the token is valid', () => {
        const req = mockReq(`Bearer ${validToken()}`);
        const res = mockRes();
        const next = jest.fn() as unknown as NextFunction;

        requireAuth(req, res, next);

        expect(next).toHaveBeenCalledWith();
        expect(res.status).not.toHaveBeenCalled();
    });

    it("sets req.userId to the token's sub claim", () => {
        const req = mockReq(`Bearer ${validToken({ sub: 'usr-xyz789' })}`);
        const next = jest.fn() as unknown as NextFunction;

        requireAuth(req, mockRes(), next);

        expect(req.userId).toBe('usr-xyz789');
    });

    it('ignores extra claims on the payload beyond sub', () => {
        const req = mockReq(`Bearer ${validToken({ role: 'admin', email: 'ada@example.com' })}`);
        const next = jest.fn() as unknown as NextFunction;

        requireAuth(req, mockRes(), next);

        expect(req.userId).toBe('usr-abc123');
    });
});

describe('requireAuth — missing or malformed header', () => {
    it('returns 401 when there is no Authorization header at all', () => {
        const req = mockReq();
        const res = mockRes();
        const next = jest.fn() as unknown as NextFunction;

        requireAuth(req, res, next);

        expect(res.status).toHaveBeenCalledWith(401);
        expect(res.json).toHaveBeenCalledWith({ message: 'Access token is missing or invalid' });
        expect(next).not.toHaveBeenCalled();
    });

    it('returns 401 for a scheme other than Bearer', () => {
        const req = mockReq(`Basic ${Buffer.from('user:pass').toString('base64')}`);
        const res = mockRes();
        const next = jest.fn() as unknown as NextFunction;

        requireAuth(req, res, next);

        expect(res.status).toHaveBeenCalledWith(401);
        expect(next).not.toHaveBeenCalled();
    });

    it('returns 401 for a lowercase "bearer" scheme — the check is case-sensitive', () => {
        const req = mockReq(`bearer ${validToken()}`);
        const res = mockRes();
        const next = jest.fn() as unknown as NextFunction;

        requireAuth(req, res, next);

        expect(res.status).toHaveBeenCalledWith(401);
        expect(next).not.toHaveBeenCalled();
    });

    it('returns 401 for "Bearer" with no token following it', () => {
        const req = mockReq('Bearer');
        const res = mockRes();
        const next = jest.fn() as unknown as NextFunction;

        requireAuth(req, res, next);

        expect(res.status).toHaveBeenCalledWith(401);
        expect(next).not.toHaveBeenCalled();
    });

    it('returns 401 for an empty Authorization header', () => {
        const req = mockReq('');
        const res = mockRes();
        const next = jest.fn() as unknown as NextFunction;

        requireAuth(req, res, next);

        expect(res.status).toHaveBeenCalledWith(401);
        expect(next).not.toHaveBeenCalled();
    });
});

describe('requireAuth — invalid token (the untested catch branch)', () => {
    it('returns 401 for a token signed with the wrong secret', () => {
        const wrongSecretToken = jwt.sign({ sub: 'usr-abc123' }, 'not-the-real-secret', {
            expiresIn: '1h',
        });
        const req = mockReq(`Bearer ${wrongSecretToken}`);
        const res = mockRes();
        const next = jest.fn() as unknown as NextFunction;

        requireAuth(req, res, next);

        expect(res.status).toHaveBeenCalledWith(401);
        expect(res.json).toHaveBeenCalledWith({ message: 'Access token is missing or invalid' });
        expect(next).not.toHaveBeenCalled();
        expect(req.userId).toBeUndefined();
    });

    it('returns 401 for an expired token', () => {
        const expiredToken = jwt.sign({ sub: 'usr-abc123' }, JWT_SECRET, { expiresIn: '-1s' });
        const req = mockReq(`Bearer ${expiredToken}`);
        const res = mockRes();
        const next = jest.fn() as unknown as NextFunction;

        requireAuth(req, res, next);

        expect(res.status).toHaveBeenCalledWith(401);
        expect(next).not.toHaveBeenCalled();
    });

    it('returns 401 for a structurally malformed token', () => {
        const req = mockReq('Bearer not-a-real-jwt-at-all');
        const res = mockRes();
        const next = jest.fn() as unknown as NextFunction;

        requireAuth(req, res, next);

        expect(res.status).toHaveBeenCalledWith(401);
        expect(next).not.toHaveBeenCalled();
    });

    it('returns 401 for a token signed with the "none" algorithm', () => {
        // A classic JWT attack: strip the signature and claim alg: none. jwt.verify
        // must reject this even though there's technically no signature to mismatch.
        const header = Buffer.from(JSON.stringify({ alg: 'none', typ: 'JWT' })).toString(
            'base64url'
        );
        const payload = Buffer.from(JSON.stringify({ sub: 'usr-abc123' })).toString('base64url');
        const req = mockReq(`Bearer ${header}.${payload}.`);
        const res = mockRes();
        const next = jest.fn() as unknown as NextFunction;

        requireAuth(req, res, next);

        expect(res.status).toHaveBeenCalledWith(401);
        expect(next).not.toHaveBeenCalled();
    });

    it('does not leak jwt library internals in the error response', () => {
        const req = mockReq('Bearer garbage');
        const res = mockRes();
        const next = jest.fn() as unknown as NextFunction;

        requireAuth(req, res, next);

        const body = res.json.mock.calls[0]?.[0];
        expect(body).toEqual({ message: 'Access token is missing or invalid' });
        expect(JSON.stringify(body)).not.toMatch(/malformed|invalid signature|jsonwebtoken/i);
    });
});
