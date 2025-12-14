/**
 * Next.js Instrumentation Hook
 * This runs once when the server starts
 * Perfect for initializing BullMQ workers
 */

export async function register() {
    if (process.env.NEXT_RUNTIME === 'nodejs') {
        // Import workers - they will auto-initialize
        await import('./lib/workers');
        console.log('[Instrumentation] BullMQ workers registered');
    }
}
