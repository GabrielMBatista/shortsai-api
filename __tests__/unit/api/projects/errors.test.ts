import { describe, it, expect } from '@jest/globals';
import { NotFoundError, ForbiddenError } from '@/lib/errors';

describe('Projects API Error Handling', () => {
    describe('NotFoundError', () => {
        it('should create proper error for missing project', () => {
            const projectId = 'abc-123';
            const error = new NotFoundError('Project', projectId);

            expect(error.message).toBe('Project with ID abc-123 not found');
            expect(error.statusCode).toBe(404);
            expect(error.code).toBe('NOT_FOUND');
        });
    });

    describe('ForbiddenError', () => {
        it('should create proper error for unauthorized access', () => {
            const error = new ForbiddenError('You do not have access to this project');

            expect(error.message).toBe('You do not have access to this project');
            expect(error.statusCode).toBe(403);
            expect(error.code).toBe('FORBIDDEN');
        });
    });
});
