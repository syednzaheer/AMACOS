const crypto = require('crypto');
const { TaskState, SLA_MINUTES } = require('../core/task_state');
const { isValidName, isValidRoll, looksLikeSpam } = require('../core/sanitize');

/**
 * Decision Agent
 *
 * Per the AMACOS spec, this agent:
 *  - Validates the task (rules/reasoning gate before anything downstream runs)
 *  - Sets priority
 *  - Determines escalation need (by attaching the SLA deadline the Monitor
 *    Agent will later check against)
 *
 * It does NOT create tickets or notify anyone - that's the Executor's job.
 */

// Recent-submission fingerprints, used to catch duplicate/replayed submissions
// (e.g. a spoofed retry storm from the same roll number with identical content).
// A simple in-memory sliding window is enough for a prototype; a real deployment
// would back this with Redis/DB so it survives restarts and scales across instances.
const recentSubmissions = new Map(); // fingerprint -> timestamp (ms)
const DEDUPE_WINDOW_MS = 60 * 1000; // 1 minute

function fingerprint(task) {
    const raw = `${task.payload.submitterRoll}::${task.payload.content}`.toLowerCase();
    return crypto.createHash('sha256').update(raw).digest('hex');
}

function isDuplicate(task) {
    const fp = fingerprint(task);
    const now = Date.now();

    // Clean up old entries opportunistically.
    for (const [key, ts] of recentSubmissions) {
        if (now - ts > DEDUPE_WINDOW_MS) recentSubmissions.delete(key);
    }

    if (recentSubmissions.has(fp) && now - recentSubmissions.get(fp) < DEDUPE_WINDOW_MS) {
        return true;
    }
    recentSubmissions.set(fp, now);
    return false;
}

const urgentKeywords = ['fire', 'smoke', 'spark', 'blood', 'injury', 'fight', 'danger',
    'critical', 'emergency', 'breakdown', 'crash', 'dead', 'explode', 'gas', 'smell', 'unsafe', 'assault'];

function derivePriority(task) {
    const content = (task.payload.content || '').toLowerCase();
    const category = task.metadata.category;
    const submissionType = task.payload.submissionType;
    const aiSeverity = task.metadata.aiSeverity; // set by classifyAgent, if reasoning ran

    let priority = 'Low';

    if (aiSeverity === 'High') priority = 'High';
    else if (aiSeverity === 'Medium' && priority === 'Low') priority = 'Medium';

    if (urgentKeywords.some(word => content.includes(word))) priority = 'High';
    else if (category === 'Security' && priority !== 'High') priority = 'High';
    else if ((category === 'Maintenance' || category === 'IT & Network') && priority === 'Low') priority = 'Medium';

    // A video implies visual context the keyword filters can't see - don't let it fall through as Low.
    if (submissionType === 'video' && priority === 'Low') priority = 'Medium';

    return priority;
}

module.exports = (task) => {
    if (task.state === TaskState.FAILED) return task;

    const name = task.payload.submitterName;
    const roll = task.payload.submitterRoll;
    const content = (task.payload.content || '').trim();
    const submissionType = task.payload.submissionType;
    const isMedia = (submissionType === 'image' || submissionType === 'video');

    // 1. Identity sanity check (defense in depth - server.js already validated this,
    // but the Decision Agent shouldn't trust upstream blindly either).
    if (!isValidName(name) || !isValidRoll(roll)) {
        task.state = TaskState.FAILED;
        task.metadata.rejectionReason = 'Invalid name or roll number format';
        return task;
    }

    // 2. Empty content check (text mode only - media submissions carry content in the file itself).
    if (!content && !isMedia) {
        task.state = TaskState.FAILED;
        task.metadata.rejectionReason = 'Content is empty';
        return task;
    }

    // 3. Spam / gibberish check.
    if (!isMedia && looksLikeSpam(content)) {
        task.state = TaskState.FAILED;
        task.metadata.rejectionReason = 'Content flagged as spam or too low-effort to process';
        return task;
    }

    // 4. Duplicate / replay check - stops the same person's identical report from
    // flooding the pipeline (accidental double-click or deliberate spoofed retry).
    if (isDuplicate(task)) {
        task.state = TaskState.FAILED;
        task.metadata.rejectionReason = 'Duplicate submission detected within the last minute';
        return task;
    }

    // If we survived, set priority and the SLA deadline the Monitor Agent will watch.
    const priority = derivePriority(task);
    task.metadata.priority = priority;

    const slaMinutes = SLA_MINUTES[priority] || SLA_MINUTES.Low;
    task.metadata.slaDeadline = new Date(Date.now() + slaMinutes * 60 * 1000).toISOString();

    return task;
};
