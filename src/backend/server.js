/**
 * ═══════════════════════════════════════════════════════════════════════════
 *                       AMACOS BACKEND SERVER (v2.1)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * v2.1 changes (security + reliability hardening pass):
 * - Restricted CORS to an explicit allow-list (env-configurable) instead of "*"
 * - Added helmet for baseline security headers
 * - Added rate limiting on the submission endpoint
 * - Server now generates task IDs and ignores client-supplied id/status/timestamp
 * - Input validation moved to shared core/sanitize.js and applied strictly
 *   (name/roll patterns, content length caps, control-character stripping)
 * - Data now persists to disk (data/problems.json) instead of vanishing on restart
 * - Added a periodic SLA-escalation sweep (proves MVP Scenario 2 from the spec)
 * - Added PATCH /problems/:id/resolve so the resolution loop can actually close
 * - Removed the "fake resolved tickets" seed seam - the app now demos honestly
 *   from an empty state (see /seed for an opt-in demo-data endpoint instead)
 *
 * API Endpoints:
 * - POST  /process_complaint      : Ingests new complaints and triggers agent pipeline
 * - GET   /problems                : Returns all processed complaints for dashboard display
 * - PATCH /problems/:id/resolve    : Marks a task resolved (closes the loop)
 * - POST  /seed                    : Opt-in - loads 3 sample tickets for demo purposes
 * ═══════════════════════════════════════════════════════════════════════════
 */

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const bodyParser = require('body-parser');
const path = require('path');
const fs = require('fs');
const http = require('http');
const { Server } = require('socket.io');
const { runPipeline } = require('./agents/pipeline');
const { sweep } = require('./agents/monitorAgent');
const { TaskState } = require('./core/task_state');
const { isValidName, isValidRoll, MAX_CONTENT_LENGTH } = require('./core/sanitize');

const app = express();
const server = http.createServer(app);

const PORT = process.env.PORT || 5000;

// --- CORS: explicit allow-list instead of "*" ---
// Set ALLOWED_ORIGINS as a comma-separated env var in production, e.g.
//   ALLOWED_ORIGINS="https://amacos.example.edu"
// Defaults to same-origin-friendly localhost values for local dev/demo.
const allowedOrigins = (process.env.ALLOWED_ORIGINS || 'http://localhost:5000,http://127.0.0.1:5000')
    .split(',')
    .map(o => o.trim());

const corsOptions = {
    origin(origin, callback) {
        // Allow requests with no origin (curl, same-origin static file serving, health checks).
        if (!origin || allowedOrigins.includes(origin)) return callback(null, true);
        return callback(new Error(`Origin ${origin} not permitted by CORS policy`));
    },
    methods: ['GET', 'POST', 'PATCH']
};

const io = new Server(server, { cors: corsOptions });

// --- Middleware ---
app.use(helmet({
    contentSecurityPolicy: false // Left off for the demo's inline canvas scripts; tighten before real deployment.
}));
app.use(cors(corsOptions));
app.use(bodyParser.json({ limit: '256kb' })); // Caps request body size (basic DoS guard).
app.use(express.static(path.join(__dirname, '../frontend')));

const submitLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 10, // 10 submissions per minute per IP - generous for real users, blunt for spam scripts.
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Too many submissions from this address. Please wait a moment and try again.' }
});

// --- Persistence (flat JSON file - enough for a prototype, keeps data across restarts) ---
const DATA_DIR = path.join(__dirname, '../../data');
const DATA_FILE = path.join(DATA_DIR, 'problems.json');

let problems = [];

function loadProblems() {
    try {
        if (fs.existsSync(DATA_FILE)) {
            const raw = fs.readFileSync(DATA_FILE, 'utf-8');
            problems = JSON.parse(raw);
            console.log(`[System] Loaded ${problems.length} persisted task(s) from disk.`);
        }
    } catch (err) {
        console.warn('[System] Could not load persisted data, starting empty:', err.message);
        problems = [];
    }
}

function persistProblems() {
    // Synchronous, immediate write. At prototype scale (dozens to low hundreds
    // of tasks) this is fast enough, and it avoids the alternative failure mode
    // we hit during testing: a debounced/delayed write gets skipped entirely if
    // the process receives SIGTERM (e.g. `kill`, container stop, crash) before
    // the timer fires, silently losing the most recent submissions.
    try {
        if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
        fs.writeFileSync(DATA_FILE, JSON.stringify(problems, null, 2));
    } catch (err) {
        console.error('[System] Failed to persist data:', err.message);
    }
}

loadProblems();

// Socket.io Connection Handler
io.on('connection', (socket) => {
    console.log('Client connected to Real-time Hub:', socket.id);
    socket.on('disconnect', () => {
        console.log('Client disconnected:', socket.id);
    });
});

// --- Input Validation Middleware ---
// Strict on purpose: this is the front door. Everything downstream (ingest/decision
// agents) also re-checks, but rejecting obviously-bad input here keeps garbage out
// of logs, the pipeline, and the persisted store.
const validateComplaint = (req, res, next) => {
    const { name, roll, type, content } = req.body || {};

    if (!name || !roll || !type || (!content && type === 'text')) {
        return res.status(400).json({
            error: 'Missing required fields',
            details: 'Name, Roll Number, Type, and Content are required.'
        });
    }

    if (!['text', 'image', 'video'].includes(type)) {
        return res.status(400).json({ error: 'Invalid complaint type' });
    }

    if (!isValidName(name)) {
        return res.status(400).json({ error: 'Invalid name', details: 'Use letters and spaces only (2-80 characters).' });
    }

    if (!isValidRoll(roll)) {
        return res.status(400).json({ error: 'Invalid roll number', details: 'Use 3-20 alphanumeric characters.' });
    }

    if (typeof content === 'string' && content.length > MAX_CONTENT_LENGTH) {
        return res.status(400).json({ error: 'Content too long', details: `Max ${MAX_CONTENT_LENGTH} characters.` });
    }

    next();
};

// --- API Endpoints ---
app.post('/process_complaint', submitLimiter, validateComplaint, async (req, res) => {
    try {
        // Ignore any client-supplied id/status/timestamp - only these 4 fields are trusted input.
        const trustedInput = {
            name: req.body.name,
            roll: req.body.roll,
            type: req.body.type,
            content: req.body.content
        };

        const processedData = await runPipeline(trustedInput, problems);

        if (processedData.error) {
            return res.status(500).json({ error: 'Processing failed', details: processedData.details });
        }

        problems.push(processedData);
        persistProblems();

        io.emit('new_problem', processedData);

        res.json(processedData);
    } catch (error) {
        console.error('Pipeline Error:', error);
        res.status(500).json({ error: 'Processing failed', details: error.message });
    }
});

app.get('/problems', (req, res) => {
    res.json(problems);
});

// Closes the loop the spec calls "track resolution" - lets a demo actually show
// a ticket going from open -> resolved instead of only ever appending new ones.
app.patch('/problems/:id/resolve', (req, res) => {
    const task = problems.find(p => p.id === req.params.id);
    if (!task) return res.status(404).json({ error: 'Task not found' });

    task.state = TaskState.RESOLVED;
    task.updatedAt = new Date().toISOString();
    task.metadata.actionLog = task.metadata.actionLog || [];
    task.metadata.actionLog.push({ step: 'resolved', at: task.updatedAt, detail: 'Marked resolved.' });

    persistProblems();
    io.emit('task_resolved', task);
    res.json(task);
});

// Opt-in demo seed data, so the dashboard doesn't have to lie by shipping fake
// "resolved" tickets baked into every fresh start. Call this explicitly for a demo.
app.post('/seed', (req, res) => {
    if (problems.length > 0) {
        return res.status(400).json({ error: 'Seed only allowed when the task list is empty.' });
    }
    const seedTime = new Date().toISOString();
    problems.push(
        {
            id: 'seed-1', type: 'complaint', state: TaskState.RESOLVED, createdAt: seedTime, updatedAt: seedTime,
            payload: { content: 'Water leakage in Library overflow tank', submissionType: 'text', submitterName: 'Demo User', submitterRoll: 'DEMO001' },
            metadata: { category: 'Maintenance', priority: 'High', assignedTo: 'Facility Management (Urgent)', classificationMethod: 'heuristic', actionLog: [] }
        },
        {
            id: 'seed-2', type: 'complaint', state: TaskState.SUCCESS, createdAt: seedTime, updatedAt: seedTime,
            payload: { content: 'Wi-Fi access point down in Block B', submissionType: 'text', submitterName: 'Demo User', submitterRoll: 'DEMO002' },
            metadata: { category: 'IT & Network', priority: 'Medium', assignedTo: 'IT Support Unit', slaDeadline: new Date(Date.now() + 2 * 3600 * 1000).toISOString(), classificationMethod: 'heuristic', actionLog: [] }
        }
    );
    persistProblems();
    io.emit('new_problem', problems[0]);
    io.emit('new_problem', problems[1]);
    res.json({ seeded: problems.length });
});

// --- SLA escalation sweep (proves MVP Scenario 2: delay detection -> escalation) ---
const SWEEP_INTERVAL_MS = 30 * 1000;
setInterval(() => {
    const escalated = sweep(problems, io);
    if (escalated > 0) {
        persistProblems();
        console.log(`[Monitor] Escalated ${escalated} overdue task(s).`);
    }
}, SWEEP_INTERVAL_MS);

// Start Server
server.listen(PORT, () => {
    console.log(`AMACOS Real-time Server running at http://localhost:${PORT}`);
    console.log(`Landing Page: http://localhost:${PORT}/landing/ld_index.html`);
    console.log(`Dashboard: http://localhost:${PORT}/dashboard/db_index.html`);
    console.log(`Gemini classification: ${process.env.GEMINI_API_KEY ? 'ENABLED' : 'disabled (heuristic fallback active - set GEMINI_API_KEY to enable)'}`);
});

// Graceful shutdown - handle both Ctrl+C (SIGINT) and process-manager/container
// stop signals (SIGTERM), since writes are now synchronous this just needs to
// run before exit either way.
function gracefulShutdown(signal) {
    console.log(`\n[System] Received ${signal}, shutting down gracefully...`);
    persistProblems();
    console.log(`[System] Processed ${problems.length} complaints`);
    process.exit(0);
}
process.on('SIGINT', () => gracefulShutdown('SIGINT'));
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
