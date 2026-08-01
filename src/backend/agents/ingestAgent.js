const crypto = require('crypto');
const { TaskState, Task } = require('../core/task_state');
const { stripControlChars, MAX_CONTENT_LENGTH } = require('../core/sanitize');

/**
 * Ingest Agent
 *
 * The Gateway.
 * Takes raw input (already field-validated by server.js's middleware) and turns
 * it into a structured, trustworthy Task object.
 *
 * IMPORTANT: this agent deliberately ignores any `id`, `timestamp`, or `status`
 * fields the client may have sent in the payload. Those must always be
 * server-generated - a client that controls its own task ID or "already resolved"
 * status is a client that can spoof the system's records.
 */
module.exports = (rawData) => {
    const content = stripControlChars((rawData.content || '')).trim().slice(0, MAX_CONTENT_LENGTH);
    const name = stripControlChars((rawData.name || '')).trim().slice(0, 80);
    const roll = stripControlChars((rawData.roll || '')).trim().slice(0, 20);

    const newTask = {
        ...Task, // Defaults
        id: crypto.randomUUID(),                 // Server-generated. Client-supplied `id` is discarded.
        type: 'complaint',
        state: TaskState.CREATED,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        payload: {
            submitterName: name,
            submitterRoll: roll,
            submissionType: rawData.type,          // Already whitelisted to text/image/video by validateComplaint.
            content
        },
        metadata: {
            source: 'web_portal',
            ingestLatency: 0,
            escalationCount: 0
        }
    };

    return newTask;
};
