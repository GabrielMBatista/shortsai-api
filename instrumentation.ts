/**
 * Next.js Instrumentation
 * This runs once when the server starts
 */

export async function register() {
    if (process.env.NEXT_RUNTIME === 'nodejs') {
        // Initialize BullMQ worker
        await import('@/lib/queues/init');
        console.log('[Instrumentation] BullMQ worker initialized');
    }
}
