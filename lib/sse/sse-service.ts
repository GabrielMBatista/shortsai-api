
// Global map to track active SSE connections per project
// Key: projectId, Value: Set of Controllers
// Global map to track active SSE connections per project
// Key: projectId, Value: Set of Controllers
const globalForSSE = global as unknown as { sseConnections: Map<string, Set<ReadableStreamDefaultController>> };

const connections = globalForSSE.sseConnections || new Map<string, Set<ReadableStreamDefaultController>>();

if (process.env.NODE_ENV !== 'production') {
    globalForSSE.sseConnections = connections;
}

export function addConnection(projectId: string, controller: ReadableStreamDefaultController) {
    if (!connections.has(projectId)) {
        connections.set(projectId, new Set());
    }
    connections.get(projectId)!.add(controller);
    console.log(`[SSE] Added connection for project ${projectId}. Total: ${connections.get(projectId)?.size}`);
}

export function removeConnection(projectId: string, controller: ReadableStreamDefaultController) {
    const projectConnections = connections.get(projectId);
    if (projectConnections) {
        projectConnections.delete(controller);
        if (projectConnections.size === 0) {
            connections.delete(projectId);
        }
        console.log(`[SSE] Removed connection for project ${projectId}`);
    }
}

export const ADMIN_CHANNEL = 'admin_global_channel';

export function broadcastProjectUpdate(projectId: string, data: any) {
    const controllers = connections.get(projectId);
    if (!controllers || controllers.size === 0) {
        console.log(`[SSE] No active connections for project ${projectId}, skipping broadcast.`);
        return;
    }

    console.log(`[SSE] Broadcasting to ${controllers.size} clients for project ${projectId}`);

    const message = `data: ${JSON.stringify(data)}\n\n`;
    const encoder = new TextEncoder();
    const encoded = encoder.encode(message);

    controllers.forEach(controller => {
        try {
            controller.enqueue(encoded);
        } catch (err) {
            console.error('[SSE] Failed to send to client:', err);
            controllers.delete(controller);
        }
    });
}

export function broadcastAdminUpdate(eventType: string, payload: any) {
    const controllers = connections.get(ADMIN_CHANNEL);
    if (!controllers || controllers.size === 0) {
        return;
    }

    const data = { type: eventType, payload };
    const message = `data: ${JSON.stringify(data)}\n\n`;
    const encoder = new TextEncoder();
    const encoded = encoder.encode(message);

    controllers.forEach(controller => {
        try {
            controller.enqueue(encoded);
        } catch (err) {
            controllers.delete(controller);
        }
    });
}
