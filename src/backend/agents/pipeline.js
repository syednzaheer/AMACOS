const ingestAgent = require('./ingestAgent');
const classifyAgent = require('./classifyAgent');
const decisionAgent = require('./decisionAgent');
const executorAgent = require('./executorAgent');
const monitorAgent = require('./monitorAgent');
const routingAgent = require('./routingAgent');

/**
 * The Central Nervous System.
 *
 * Coordinates the flow of a task through various specialized agents.
 * Each agent performs a specific role, transforming the task step-by-step.
 *
 * @param {object} rawData - the raw, already field-validated request body.
 * @param {object[]} existingProblems - current task list, used by the Routing
 *   Agent's fallback/overload logic. Optional; defaults to an empty list.
 */
async function runPipeline(rawData, existingProblems = []) {
    try {
        // 1. Ingest: Turn raw data into a standardized, sanitized Task object.
        let task = ingestAgent(rawData);

        // 2. Classify: Figure out what kind of problem this is (real AI reasoning
        //    when GEMINI_API_KEY is configured, honest heuristic fallback otherwise).
        task = await classifyAgent(task);

        // 3. Decide: Is this a valid problem? What priority? What's the SLA?
        task = decisionAgent(task);

        // 4. Execute: Create the ticket, log the (simulated) notification.
        task = executorAgent(task);

        // 5. Monitor: Start tracking this task against its SLA.
        task = monitorAgent(task);

        // 6. Route: Assign a department, with fallback if that department is overloaded.
        task = routingAgent(task, existingProblems);

        return task;

    } catch (error) {
        console.error('Pipeline execution error:', error);

        // Return a "Failed Task" structure so the frontend handles it gracefully.
        return {
            error: true,
            message: 'Pipeline Failure',
            details: error.message,
            originalData: rawData
        };
    }
}

module.exports = { runPipeline };
