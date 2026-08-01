/**
 * Dashboard Logic
 *
 * Fetches real-time problem reports from the backend and updates the UI.
 * Also subscribes to socket.io events so the dashboard updates live instead
 * of only reflecting whatever was true at page load.
 *
 * SECURITY NOTE (v2 fix): the previous version built each list item with
 * `li.innerHTML = ...${content}...`, inserting complaint text directly as
 * HTML. Since complaint content is attacker-controlled free text, that was a
 * stored XSS hole - anyone could submit a complaint containing a <script> or
 * <img onerror=...> tag and have it execute in every admin's browser who
 * opened this dashboard. Every render below now builds DOM nodes and sets
 * `textContent`, never `innerHTML`, for anything derived from user input.
 */

const reportList = document.getElementById("report-list");
const totalEl = document.getElementById("total-count");
const pendingEl = document.getElementById("pending-count");
const resolvedEl = document.getElementById("resolved-count");

let stats = { total: 0, pending: 0, resolved: 0 };
let renderedIds = new Set();

const STATE_LABELS = {
    SUCCESS: 'Pending',
    ESCALATED: 'Escalated',
    RESOLVED: 'Resolved',
    FAILED: 'Rejected'
};

function statusClassFor(state) {
    if (state === 'RESOLVED') return 'resolved';
    if (state === 'ESCALATED') return 'escalated';
    if (state === 'FAILED') return 'rejected';
    return 'pending';
}

/**
 * Safely appends a new issue to the list. Every piece of user-derived text
 * goes through textContent, never innerHTML.
 */
function addReportToUI(problem) {
    if (renderedIds.has(problem.id)) return;
    renderedIds.add(problem.id);

    const content = problem.payload?.content || "No details provided";
    const state = problem.state || 'SUCCESS';
    const label = STATE_LABELS[state] || 'Pending';
    const priority = problem.metadata?.priority;
    const category = problem.metadata?.category;
    const assignedTo = problem.metadata?.assignedTo;

    const li = document.createElement("li");
    li.dataset.id = problem.id;

    const left = document.createElement("div");
    left.className = "issue-left";

    const title = document.createElement("div");
    title.className = "issue-title";
    title.textContent = content; // safe: textContent, not innerHTML

    const meta = document.createElement("div");
    meta.className = "issue-meta";
    const metaParts = [category, assignedTo, priority ? `${priority} priority` : null].filter(Boolean);
    meta.textContent = metaParts.join(" · ");

    left.appendChild(title);
    left.appendChild(meta);

    const status = document.createElement("div");
    status.className = `issue-status ${statusClassFor(state)}`;
    status.textContent = label;

    li.appendChild(left);
    li.appendChild(status);

    // Resolve action, only offered for tasks that are actually open.
    if (state === 'SUCCESS' || state === 'ESCALATED') {
        const resolveBtn = document.createElement("button");
        resolveBtn.className = "resolve-btn";
        resolveBtn.textContent = "Mark resolved";
        resolveBtn.addEventListener("click", () => resolveProblem(problem.id, li));
        li.appendChild(resolveBtn);
    }

    reportList.appendChild(li);

    stats.total++;
    if (state === 'RESOLVED') stats.resolved++;
    else if (state !== 'FAILED') stats.pending++;
    updateStatsUI();
}

function updateProblemInUI(problem) {
    const li = reportList.querySelector(`li[data-id="${CSS.escape(problem.id)}"]`);
    if (!li) {
        // Wasn't rendered yet (e.g. was FAILED/filtered before) - just re-render fully.
        return refreshStatsFromScratch();
    }

    const state = problem.state;
    const label = STATE_LABELS[state] || 'Pending';
    const statusEl = li.querySelector('.issue-status');
    if (statusEl) {
        statusEl.textContent = label;
        statusEl.className = `issue-status ${statusClassFor(state)}`;
    }
    const resolveBtn = li.querySelector('.resolve-btn');
    if (state === 'RESOLVED' && resolveBtn) resolveBtn.remove();

    refreshStatsFromScratch();
}

async function resolveProblem(id, li) {
    try {
        const res = await fetch(`/problems/${encodeURIComponent(id)}/resolve`, { method: 'PATCH' });
        if (!res.ok) throw new Error(`Server returned ${res.status}`);
        const updated = await res.json();
        updateProblemInUI(updated);
    } catch (err) {
        console.error('Failed to resolve task:', err);
        alert('Could not mark this as resolved. Please try again.');
    }
}

function updateStatsUI() {
    totalEl.textContent = stats.total;
    pendingEl.textContent = stats.pending;
    resolvedEl.textContent = stats.resolved;
}

function refreshStatsFromScratch() {
    const items = [...reportList.querySelectorAll('li[data-id]')];
    stats = { total: items.length, pending: 0, resolved: 0 };
    items.forEach(li => {
        const cls = li.querySelector('.issue-status')?.classList;
        if (cls?.contains('resolved')) stats.resolved++;
        else if (!cls?.contains('rejected')) stats.pending++;
    });
    updateStatsUI();
}

async function loadData() {
    try {
        const response = await fetch('/problems');
        if (!response.ok) throw new Error(`Server returned ${response.status}`);

        const data = await response.json();

        reportList.innerHTML = ''; // safe: static, no user data involved
        renderedIds = new Set();
        stats = { total: 0, pending: 0, resolved: 0 };

        const visible = data.filter(p => p.state !== 'FAILED'); // rejected submissions aren't operational issues

        if (visible.length === 0) {
            const empty = document.createElement('li');
            empty.className = 'empty-state';
            empty.textContent = 'No issues reported yet. Campus is quiet.';
            reportList.appendChild(empty);
            updateStatsUI();
            return;
        }

        visible.forEach(addReportToUI);
    } catch (error) {
        console.error("Failed to load dashboard data:", error);
        reportList.innerHTML = '';
        const err = document.createElement('li');
        err.className = 'error-state';
        err.textContent = 'Unable to connect to the central system.';
        reportList.appendChild(err);
    }
}

// --- Live updates via socket.io (the server was already emitting these events;
// the dashboard just never listened for them before) ---
if (window.io) {
    const socket = window.io();
    socket.on('new_problem', (problem) => {
        if (problem.state === 'FAILED') return; // rejected submissions don't show on the ops feed
        const emptyState = reportList.querySelector('.empty-state');
        if (emptyState) emptyState.remove();
        addReportToUI(problem);
    });
    socket.on('task_escalated', updateProblemInUI);
    socket.on('task_resolved', updateProblemInUI);
} else {
    console.warn('socket.io client not loaded - dashboard will only show data from page load.');
}

loadData();
