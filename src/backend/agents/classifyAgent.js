/**
 * Classify Agent
 *
 * Reads the content of a complaint and assigns it a category + severity.
 * This is the agent the AMACOS problem statement calls out by name as
 * requiring REAL AI reasoning (not simulated) - see "What Is Real vs
 * Simulated" in the spec.
 *
 * Behavior:
 *  - If GEMINI_API_KEY is set in the environment, this agent calls the
 *    Gemini API with a structured-JSON prompt to classify category + severity
 *    + a short rationale. That output is real model reasoning over the
 *    actual complaint text, not a lookup table.
 *  - If no key is set, or the API call fails/times out, it falls back to a
 *    weighted keyword heuristic so the pipeline never breaks a demo. This
 *    fallback is clearly labeled in task.metadata.classificationMethod so the
 *    dashboard/README can be honest about which path ran for a given task.
 *
 * To enable real reasoning: set GEMINI_API_KEY before starting the server.
 *   export GEMINI_API_KEY="your-key-here"
 * Get a key at https://aistudio.google.com/apikey (free tier available).
 */

const CATEGORIES = ['IT & Network', 'Maintenance', 'Security', 'Academic', 'General Admin'];
const SEVERITIES = ['Low', 'Medium', 'High'];

const GEMINI_MODEL = 'gemini-2.5-flash';
const GEMINI_TIMEOUT_MS = 6000;

async function classifyWithGemini(content, submissionType) {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) return null;

    const prompt = `You are the classification module of a campus operations system.
A student submitted this complaint (submission type: ${submissionType}):
"""${content}"""

Classify it. Respond with ONLY a JSON object, no markdown, no extra text, in this exact shape:
{"category": one of ${JSON.stringify(CATEGORIES)}, "severity": one of ${JSON.stringify(SEVERITIES)}, "reasoning": "one short sentence"}`;

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), GEMINI_TIMEOUT_MS);

    try {
        const res = await fetch(
            `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${apiKey}`,
            {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                signal: controller.signal,
                body: JSON.stringify({
                    contents: [{ parts: [{ text: prompt }] }],
                    generationConfig: { responseMimeType: 'application/json', temperature: 0.1 }
                })
            }
        );

        if (!res.ok) {
            console.warn(`[classifyAgent] Gemini API returned ${res.status}, falling back to heuristic.`);
            return null;
        }

        const data = await res.json();
        const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
        if (!text) return null;

        const parsed = JSON.parse(text);
        if (!CATEGORIES.includes(parsed.category) || !SEVERITIES.includes(parsed.severity)) return null;

        return parsed;
    } catch (err) {
        console.warn('[classifyAgent] Gemini call failed, falling back to heuristic:', err.message);
        return null;
    } finally {
        clearTimeout(timeout);
    }
}

// --- Heuristic fallback (used when no API key is configured, or the API call fails) ---

const KEYWORDS = {
    'IT & Network': ['wifi', 'internet', 'network', 'computer', 'printer', 'login', 'password', 'server', 'software'],
    'Maintenance': ['leak', 'broken', 'repair', 'clean', 'light', 'dark', 'bulb', 'ac', 'fan', 'door', 'window', 'water', 'toilet'],
    'Security': ['theft', 'stolen', 'lost', 'fight', 'harassment', 'noise', 'guard', 'gate', 'wallet', 'phone', 'unsafe', 'stalking'],
    'Academic': ['exam', 'class', 'lecture', 'teacher', 'professor', 'attendance', 'lab', 'timetable']
};

const SEVERITY_KEYWORDS = {
    High: ['fire', 'smoke', 'injury', 'blood', 'danger', 'emergency', 'assault', 'gas', 'explode'],
    Medium: ['broken', 'leak', 'stolen', 'harassment', 'not working', 'down']
};

function classifyWithHeuristic(content, submissionType) {
    const lower = content.toLowerCase();

    let bestCategory = 'General Admin';
    let maxMatches = 0;
    for (const [category, words] of Object.entries(KEYWORDS)) {
        const matches = words.filter(w => lower.includes(w)).length;
        if (matches > maxMatches) {
            maxMatches = matches;
            bestCategory = category;
        }
    }

    if (maxMatches === 0 && (submissionType === 'image' || submissionType === 'video')) {
        bestCategory = 'Maintenance';
    }

    let severity = 'Low';
    if (SEVERITY_KEYWORDS.High.some(w => lower.includes(w))) severity = 'High';
    else if (SEVERITY_KEYWORDS.Medium.some(w => lower.includes(w))) severity = 'Medium';

    return { category: bestCategory, severity, reasoning: 'Keyword-based fallback classification.' };
}

module.exports = async (task) => {
    const content = task.payload.content || '';
    const submissionType = task.payload.submissionType;

    let result = null;
    let method = 'heuristic';

    if (content) {
        result = await classifyWithGemini(content, submissionType);
        if (result) method = 'gemini';
    }

    if (!result) {
        result = classifyWithHeuristic(content, submissionType);
    }

    task.metadata = task.metadata || {};
    task.metadata.category = result.category;
    task.metadata.aiSeverity = result.severity;
    task.metadata.classificationReasoning = result.reasoning;
    task.metadata.classificationMethod = method; // 'gemini' or 'heuristic' - be honest about which ran

    return task;
};
