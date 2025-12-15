// Initialize BullMQ worker when server starts
// This file is imported at server startup to ensure worker is always running

import '@/lib/queues/schedule-queue';

console.log('[Server] BullMQ worker initialized');
