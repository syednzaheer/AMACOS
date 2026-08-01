const { TaskState } = require('../core/task_state');

/**
 * Routing Agent
 *
 * Assigns responsibility, and per spec: "Applies fallback logic if unavailable."
 * We simulate "unavailable" as a department being overloaded with open High
 * priority tickets already - a crude but real proxy for capacity, given we
 * don't have a real staffing/roster system to check against.
 */

const DEPT_MAP = {
    'IT & Network': 'IT Support Unit',
    'Maintenance': 'Facility Management',
    'Security': 'Campus Chiefs',
    'Academic': 'Academic Cell',
    'General Admin': 'Student Affairs'
};

const FALLBACK_DEPT = 'Dean of Student Welfare (Escalation Desk)';
const OVERLOAD_THRESHOLD = 3; // open High-priority tickets already assigned to a dept

module.exports = (task, existingProblems = []) => {
    if (task.state === TaskState.FAILED) return task;

    const category = task.metadata.category;
    const priority = task.metadata.priority;

    let assignedTo = DEPT_MAP[category] || 'Help Desk';

    // Fallback logic: if the primary department already has several open,
    // unresolved High-priority tickets, route this one to the escalation desk
    // instead of piling onto a department that's demonstrably behind.
    const openHighForDept = existingProblems.filter(p =>
        p?.metadata?.assignedTo?.startsWith(assignedTo) &&
        p?.metadata?.priority === 'High' &&
        p?.state !== TaskState.RESOLVED &&
        p?.state !== TaskState.FAILED
    ).length;

    if (priority === 'High' && openHighForDept >= OVERLOAD_THRESHOLD) {
        task.metadata.routingNote = `${assignedTo} has ${openHighForDept} open High-priority tickets; rerouted to fallback.`;
        assignedTo = FALLBACK_DEPT;
    } else if (priority === 'High') {
        assignedTo += ' (Urgent)';
    }

    task.metadata.assignedTo = assignedTo;

    return task;
};
