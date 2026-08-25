import type { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import {
    errorHandler,
    toBadRequestResponse,
    BadRequestError,
    type AppError,
} from '../../src/middlewares/errorHandler.ts';

const mockRes = () => {
    const res = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn().mockReturnThis(),
    };
    return res as unknown as Response & typeof res;
};

beforeAll(() => {
    // errorHandler logs the error; keep test output readable.
    jest.spyOn(console, 'error').mockImplementation(() => {});
});

afterAll(() => {
    jest.restoreAllMocks();
});

describe('errorHandler', () => {
    it('uses the status and message from the error', () => {
        const err: AppError = Object.assign(new Error('Not Found'), { status: 404 });
        const res = mockRes();

        errorHandler(err, {} as Request, res, (() => {}) as NextFunction);

        expect(res.status).toHaveBeenCalledWith(404);
        expect(res.json).toHaveBeenCalledWith({ message: 'Not Found' });
    });

    it('defaults to 500 when the error has no status', () => {
        const res = mockRes();

        errorHandler(new Error('boom'), {} as Request, res, (() => {}) as NextFunction);

        expect(res.status).toHaveBeenCalledWith(500);
        expect(res.json).toHaveBeenCalledWith({ message: 'boom' });
    });

    it('defaults the message when the error has none', () => {
        const res = mockRes();

        errorHandler(new Error(), {} as Request, res, (() => {}) as NextFunction);

        expect(res.status).toHaveBeenCalledWith(500);
        expect(res.json).toHaveBeenCalledWith({ message: 'Internal Server Error' });
    });

    it('honours a body-parser style status on the error', () => {
        const err: AppError = Object.assign(new SyntaxError('Unexpected end of JSON input'), {
            status: 400,
        });
        const res = mockRes();

        errorHandler(err, {} as Request, res, (() => {}) as NextFunction);

        expect(res.status).toHaveBeenCalledWith(400);
    });

    it('does not call next — it terminates the request', () => {
        const next = jest.fn() as unknown as NextFunction;

        errorHandler(new Error('boom'), {} as Request, mockRes(), next);

        expect(next).not.toHaveBeenCalled();
    });

    it('does not leak the stack trace to the client', () => {
        const res = mockRes();

        errorHandler(new Error('boom'), {} as Request, res, (() => {}) as NextFunction);

        expect(res.json).toHaveBeenCalledWith({ message: 'boom' });
        expect(res.json.mock.calls[0]?.[0]).not.toHaveProperty('stack');
    });
});

describe('BadRequestError', () => {
    const details = [{ field: 'email', message: 'Email already in use', type: 'unique' }];

    it('is an Error and is detectable with instanceof', () => {
        const err = new BadRequestError(details);

        expect(err).toBeInstanceOf(Error);
        expect(err).toBeInstanceOf(BadRequestError);
    });

    it('carries a fixed message and the supplied details', () => {
        const err = new BadRequestError(details);

        expect(err.message).toBe('Validation failed');
        expect(err.details).toEqual(details);
    });

    it('sets name so logs identify it', () => {
        expect(new BadRequestError(details).name).toBe('BadRequestError');
    });

    it('accepts an empty details list', () => {
        expect(new BadRequestError([]).details).toEqual([]);
    });
});

describe('toBadRequestResponse', () => {
    const schema = z.object({
        name: z.string().min(1),
        address: z.object({ postcode: z.string().min(1) }),
    });

    /** Produce a real ZodError rather than hand-rolling the shape. */
    const errorFor = (input: unknown) => {
        const result = schema.safeParse(input);
        if (result.success) throw new Error('expected the parse to fail');
        return result.error;
    };

    it('wraps issues under a Validation failed message', () => {
        const body = toBadRequestResponse(errorFor({}));

        expect(body.message).toBe('Validation failed');
        expect(Array.isArray(body.details)).toBe(true);
    });

    it('flattens nested paths with dots', () => {
        const body = toBadRequestResponse(errorFor({ name: 'Ada', address: { postcode: '' } }));

        expect(body.details).toEqual([
            expect.objectContaining({ field: 'address.postcode', type: 'too_small' }),
        ]);
    });

    it('labels a root-level issue as (root)', () => {
        const bare = z.string();
        const result = bare.safeParse(42);
        if (result.success) throw new Error('expected the parse to fail');

        expect(toBadRequestResponse(result.error).details[0]?.field).toBe('(root)');
    });

    it('includes every issue, not just the first', () => {
        const body = toBadRequestResponse(errorFor({}));

        expect(body.details.length).toBeGreaterThan(1);
    });

    it('exposes field, message and type on each detail', () => {
        const body = toBadRequestResponse(errorFor({ name: '', address: { postcode: 'BA1 1AA' } }));

        expect(body.details[0]).toEqual({
            field: 'name',
            message: expect.any(String),
            type: expect.any(String),
        });
    });
});
