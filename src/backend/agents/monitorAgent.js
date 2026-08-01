const { TaskState } = require('../core/task_state');

/**
 * Monitor Agent
 *
 * Per spec: tracks task progress, escalates delays, auto-closes resolved
 * tasks, logs every step.
 *
 * This agent has two entry points:
 *  1. The default export runs once per task at the end of the pipeline -
 *     it finalizes the task's initial state and logs that monitoring began.
 *  2. `sweep(problems, io)` runs periodically (see server.js's setInterval)
 *     over the WHOLE task list, comparing each open task's metadata.slaDeadline
 *     against the current time. Anything overdue gets bumped to ESCALATED and
 *     the connected dashboards are notified in real time over the same
 *     socket.io channel the executor's "notification" step logs against.
 *     This is what actually proves MVP Scenario 2 (delay -> escalation).
 */

module.exports = (task) => {
    if (task.state === TaskState.FAILED) return task;

    task.state = TaskState.SUCCESS; // Pipeline finished; task is live and awaiting resolution.
    task.metadata.actionLog = task.metadata.actionLog || [];
    task.metadata.actionLog.push({
        step: 'monitoring_started',
        at: new Date().toISOString(),
        detail: `SLA deadline set to ${task.metadata.slaDeadline}. Watching for delay.`
    });

    return task;
};

function sweep(problems, io) {
    const now = Date.now();
    let escalatedCount = 0;

    for (const task of problems) {
        const isOpen = task.state === TaskState.SUCCESS || task.state === TaskState.ESCALATED;
        if (!isOpen || !task.metadata?.slaDeadline) continue;

        const overdue = new Date(task.metadata.slaDeadline).getTime() < now;
        if (overdue && task.state !== TaskState.ESCALATED) {
            task.state = TaskState.ESCALATED;
            task.metadata.escalationCount = (task.metadata.escalationCount || 0) + 1;
            task.updatedAt = new Date().toISOString();
            task.metadata.actionLog.push({
                step: 'escalated',
                at: task.updatedAt,
                detail: `SLA window missed (deadline was ${task.metadata.slaDeadline}). Escalated to ${task.metadata.assignedTo}.`
            });
            escalatedCount++;
            if (io) io.emit('task_escalated', task);
        }
    }

    return escalatedCount;
}

module.exports.sweep = sweep;
