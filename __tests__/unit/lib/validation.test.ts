import { describe, it, expect } from '@jest/globals';
import { z } from 'zod';
import { safeParse, commonSchemas } from '@/lib/validation';

describe('Validation Utilities', () => {
    describe('safeParse', () => {
        const testSchema = z.object({
            name: z.string(),
            age: z.number(),
        });

        it('should return success for valid data', () => {
            const result = safeParse({ name: 'John', age: 30 }, testSchema);

            expect(result.success).toBe(true);
            if (result.success) {
                expect(result.data).toEqual({ name: 'John', age: 30 });
            }
        });

        it('should return error for invalid data', () => {
            const result = safeParse({ name: 'John', age: 'invalid' }, testSchema);

            expect(result.success).toBe(false);
            if (!result.success) {
                expect(result.error).toBeDefined();
                expect(result.error.issues.length).toBeGreaterThan(0);
            }
        });
    });

    describe('commonSchemas', () => {
        describe('uuid', () => {
            it('should validate correct UUID', () => {
                const validUUID = '123e4567-e89b-12d3-a456-426614174000';
                const result = commonSchemas.uuid.safeParse(validUUID);

                expect(result.success).toBe(true);
            });

            it('should reject invalid UUID', () => {
                const invalidUUID = 'not-a-uuid';
                const result = commonSchemas.uuid.safeParse(invalidUUID);

                expect(result.success).toBe(false);
            });
        });

        describe('email', () => {
            it('should validate correct email', () => {
                const result = commonSchemas.email.safeParse('test@example.com');
                expect(result.success).toBe(true);
            });

            it('should reject invalid email', () => {
                const result = commonSchemas.email.safeParse('invalid-email');
                expect(result.success).toBe(false);
            });
        });

        describe('pagination', () => {
            it('should use default values', () => {
                const result = commonSchemas.pagination.parse({});

                expect(result.page).toBe(1);
                expect(result.pageSize).toBe(20);
            });

            it('should parse string values to numbers', () => {
                const result = commonSchemas.pagination.parse({
                    page: '2',
                    pageSize: '50',
                });

                expect(result.page).toBe(2);
                expect(result.pageSize).toBe(50);
            });

            it('should enforce max pageSize', () => {
                const result = commonSchemas.pagination.safeParse({
                    pageSize: 200,
                });

                expect(result.success).toBe(false);
            });
        });
    });
});
