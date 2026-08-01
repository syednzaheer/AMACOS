/**
 * Task Cycle Management
 *
 * This file acts as the single source of truth for what a "Task" is in our system.
 * We define the valid states a task can be in and the structure it must follow.
 * This prevents different parts of the system from guessing what a task looks like.
 */

// We freeze this object so no one accidentally adds a "SORT_OF_DONE" state later.
const TaskState = Object.freeze({
    CREATED: 'CREATED',       // Just made, sitting in memory.
    QUEUED: 'QUEUED',         // Waiting in line to be processed.
    RUNNING: 'RUNNING',       // Currently being worked on by an Agent.
    WAITING: 'WAITING',       // Paused, likely waiting for a human or external API.
    ESCALATED: 'ESCALATED',   // SLA window blown; bumped for urgent human attention.
    FAILED: 'FAILED',         // Rejected by validation (spam / empty / malformed).
    RESOLVED: 'RESOLVED',     // A human/department marked the underlying issue fixed.
    SUCCESS: 'SUCCESS'        // Finished pipeline processing successfully (still open/pending action).
});

// SLA windows per priority, in minutes.
// NOTE: These are compressed for demo purposes (real deployment would use hours/days).
// Kept in one place so the monitor agent and any UI copy can reference the same numbers.
const SLA_MINUTES = Object.freeze({
    High: 15,
    Medium: 120,
    Low: 1440
});

// The blueprint for every task in the system.
// We use this structure so the frontend and backend always speak the same language.
const Task = {
    id: '',
    type: '',            // e.g., 'complaint', 'maintenance'
    payload: {},          // The actual data (forms, images, text)
    state: TaskState.CREATED,
    createdAt: '',
    updatedAt: '',
    metadata: {}          // Extra info like priority, category, escalation count
};

module.exports = {
    TaskState,
    SLA_MINUTES,
    Task
};
