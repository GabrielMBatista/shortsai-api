import type { Config } from 'jest';

const config: Config = {
    preset: 'ts-jest',
    testEnvironment: 'node',

    // Setup files
    setupFilesAfterEnv: ['<rootDir>/jest.setup.ts'],

    // Test patterns
    testMatch: [
        '**/__tests__/**/*.test.ts',
        '**/__tests__/**/*.test.tsx',
    ],

    // Coverage configuration
    collectCoverageFrom: [
        'app/**/*.{ts,tsx}',
        'lib/**/*.{ts,tsx}',
        '!**/*.d.ts',
        '!**/node_modules/**',
        '!**/__tests__/**',
        '!**/coverage/**',
        '!**/dist/**',
        '!**/.next/**',
    ],

    coverageThreshold: {
        global: {
            branches: 50,
            functions: 50,
            lines: 50,
            statements: 50,
        },
    },

    // Module paths
    moduleNameMapper: {
        '^@/(.*)$': '<rootDir>/$1',
    },

    // Ignore patterns
    testPathIgnorePatterns: [
        '/node_modules/',
        '/.next/',
    ],

    // Verbose output
    verbose: true,

    // Global setup/teardown
    globals: {
        'ts-jest': {
            tsconfig: {
                jsx: 'react',
            },
        },
    },
};

export default config;
