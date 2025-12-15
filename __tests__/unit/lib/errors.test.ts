import { describe, it, expect } from '@jest/globals';
import { AppError, NotFoundError, UnauthorizedError, ValidationError } from '@/lib/errors';

describe('Error Classes', () => {
    describe('AppError', () => {
        it('should create an error with default status 500', () => {
            const error = new AppError('Test error');

            expect(error.message).toBe('Test error');
            expect(error.statusCode).toBe(500);
            expect(error.name).toBe('AppError');
        });

        it('should create an error with custom status code', () => {
            const error = new AppError('Custom error', 400, 'CUSTOM_CODE');

            expect(error.statusCode).toBe(400);
            expect(error.code).toBe('CUSTOM_CODE');
        });

        it('should serialize to JSON correctly', () => {
            const error = new AppError('Test', 404, 'NOT_FOUND', { resource: 'User' });
            const json = error.toJSON();

            expect(json).toEqual({
                error: 'Test',
                code: 'NOT_FOUND',
                statusCode: 404,
                details: { resource: 'User' },
            });
        });
    });

    describe('NotFoundError', () => {
        it('should create 404 error without ID', () => {
            const error = new NotFoundError('User');

            expect(error.message).toBe('User not found');
            expect(error.statusCode).toBe(404);
            expect(error.code).toBe('NOT_FOUND');
        });

        it('should create 404 error with ID', () => {
            const error = new NotFoundError('User', 'abc-123');

            expect(error.message).toBe('User with ID abc-123 not found');
            expect(error.statusCode).toBe(404);
        });
    });

    describe('UnauthorizedError', () => {
        it('should create 401 error', () => {
            const error = new UnauthorizedError();

            expect(error.message).toBe('Unauthorized');
            expect(error.statusCode).toBe(401);
            expect(error.code).toBe('UNAUTHORIZED');
        });

        it('should accept custom message', () => {
            const error = new UnauthorizedError('Invalid token');

            expect(error.message).toBe('Invalid token');
        });
    });

    describe('ValidationError', () => {
        it('should create 422 error with details', () => {
            const details = [{ field: 'email', message: 'Invalid email' }];
            const error = new ValidationError(details);

            expect(error.message).toBe('Validation failed');
            expect(error.statusCode).toBe(422);
            expect(error.code).toBe('VALIDATION_ERROR');
            expect(error.details).toEqual(details);
        });
    });
});
