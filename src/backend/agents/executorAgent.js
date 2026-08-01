const crypto = require('crypto');
const { TaskState } = require('../core/task_state');

/**
 * Executor Agent
 *
 * Per the spec: creates tickets, sends notifications, updates dashboards.
 * (CCTV/SMS/email integrations are simulated per the spec's "What Is Real vs
 * Simulated" section - the ticket + action log are real, the outbound
 * notification is a logged stub rather than an actual SMS/email send.)
 */
module.exports = (task) => {
    if (task.state === TaskState.FAILED) return task;

    const ticketId = `AMC-${new Date().getFullYear()}-${crypto.randomInt(100000, 999999)}`;
    task.metadata.ticketId = ticketId;

    task.metadata.actionLog = task.metadata.actionLog || [];
    task.metadata.actionLog.push({
        step: 'ticket_created',
        at: new Date().toISOString(),
        detail: `Ticket ${ticketId} opened, priority ${task.metadata.priority}.`
    });

    // Simulated notification (spec allows this to be simulated for the MVP).
    task.metadata.notification = {
        sent: true,
        simulated: true,
        channel: task.metadata.priority === 'High' ? 'sms+dashboard' : 'dashboard',
        message: `New ${task.metadata.priority}-priority ${task.metadata.category} ticket ${ticketId} assigned.`
    };
    task.metadata.actionLog.push({
        step: 'notification_dispatched',
        at: new Date().toISOString(),
        detail: `(Simulated) notification queued via ${task.metadata.notification.channel}.`
    });

    return task;
};
