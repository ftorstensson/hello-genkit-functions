/*
 * Vibe Coder AI Engine - v12.1 (Linter Fix)
 * This version resolves a 'require-jsdoc' linter error by adding the
 * mandatory documentation block to the new dynamic flow runner.
 */

import {genkit, z} from "genkit";
import {vertexAI, gemini15Flash} from "@genkit-ai/vertexai";
import {onCallGenkit} from "firebase-functions/v2/https";
import * as admin from "firebase-admin";

// Initialize Firebase & Genkit
admin.initializeApp();
const db = admin.firestore();
const ai = genkit({
  plugins: [vertexAI({location: "australia-southeast1"})],
});

// ===============================================================================
// DATA SCHEMAS (Unchanged)
// ===============================================================================

const MessageSchema = z.object({
  role: z.enum(["user", "assistant"]),
  content: z.any(),
});

const HistorySchema = z.array(MessageSchema);

const DecisionSchema = z.object({
  action: z.enum([
    "reply_to_user",
    "call_architect",
    "call_engineer",
  ]),
  text: z.string(),
  task: z.string().optional(),
});

const PlanSchema = z.object({
  title: z.string(),
  steps: z.array(z.string()),
});


// ===============================================================================
// The Dynamic Flow Runner
// ===============================================================================

/**
 * A reusable helper function to run a Genkit flow based on a dynamic
 * agent configuration fetched from Firestore.
 * @param {string} agentId The document ID of the agent in the 'agents' collection.
 * @param {any} input The input data for the flow (e.g., history array or task string).
 * @param {any} outputSchema The Zod schema for the flow's output.
 * @return {Promise<any>} A promise that resolves with the validated output from the LLM.
 */
async function runDynamicFlow(agentId: string, input: any, outputSchema: any) {
  console.log(`[${agentId}] Starting dynamic flow...`);

  const agentRef = db.collection("agents").doc(agentId);
  const agentDoc = await agentRef.get();
  if (!agentDoc.exists) {
    throw new Error(`Agent '${agentId}' not found in Firestore.`);
  }
  const agentConfig = agentDoc.data()!;

  const modelRef = db.collection("models").doc(agentConfig.modelId);
  const modelDoc = await modelRef.get();
  if (!modelDoc.exists) {
    throw new Error(`Model '${agentConfig.modelId}' not found in Firestore.`);
  }
  const modelConfig = modelDoc.data()!;

  if (modelConfig.provider !== "google") {
    throw new Error(`Unsupported provider: ${modelConfig.provider}`);
  }

  // Replace a placeholder in the prompt with the actual input
  const prompt = agentConfig.prompt.replace("{task}", JSON.stringify(input, null, 2));

  const llmResponse = await ai.generate({
    prompt: `${prompt}

      CONVERSATION HISTORY (if applicable):
      ${JSON.stringify(input, null, 2)}
      `,
    model: gemini15Flash, // This will be made dynamic in a future step
    output: {schema: outputSchema},
    config: {temperature: modelConfig.config.temperature},
  });

  const output = llmResponse.output;
  if (!output) {
    throw new Error(`[${agentId}] The agent failed to generate a valid output.`);
  }
  console.log(`[${agentId}] Flow completed successfully.`);
  return output;
}


// ===============================================================================
// AGENT FLOWS (Now simple wrappers around the dynamic runner)
// ===============================================================================

export const projectManagerFlow = ai.defineFlow(
  {
    name: "projectManagerFlow",
    inputSchema: HistorySchema,
    outputSchema: DecisionSchema,
  },
  async (history) => {
    return runDynamicFlow("project-manager", history, DecisionSchema);
  }
);

export const architectFlow = ai.defineFlow(
  {
    name: "architectFlow",
    inputSchema: z.string(),
    outputSchema: PlanSchema,
  },
  async (task) => {
    return runDynamicFlow("architect", task, PlanSchema);
  }
);


// ===============================================================================
// CLOUD FUNCTION EXPORTS (Unchanged)
// ===============================================================================

export const projectManager = onCallGenkit(
  {region: "australia-southeast1"},
  projectManagerFlow
);

export const architect = onCallGenkit(
  {region: "australia-southeast1"},
  architectFlow
);
