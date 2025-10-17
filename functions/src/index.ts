/*
 * Vibe Coder AI Engine - v11.0 (Dynamic Foundation)
 * This version implements the Firestore-driven dynamic agent architecture.
 * The projectManagerFlow now loads its prompt, model, and configuration
 * directly from the database, enabling runtime updates without redeployment.
 */

import {genkit, z} from "genkit";
import {vertexAI, gemini15Flash} from "@genkit-ai/vertexai";
import {onCallGenkit} from "firebase-functions/v2/https";

// [NEW] Import Firebase Admin SDK to connect to Firestore
import * as admin from "firebase-admin";

// Initialize Firebase Admin
admin.initializeApp();
const db = admin.firestore();

// Initialize Genkit
const ai = genkit({
  plugins: [vertexAI({location: "australia-southeast1"})],
  // We will add other model providers (e.g., OpenAI) here in a future mission.
});

// ===============================================================================
// DATA SCHEMAS (Unchanged from previous version)
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
  text: z.string().describe(
    "For 'reply_to_user', the text to say. For other actions, a brief " +
    "summary of the action being taken."
  ),
  task: z.string().optional().describe(
    "For 'call_architect' or 'call_engineer', the specific task to delegate."
  ),
});

const PlanSchema = z.object({
  title: z.string().describe("A short, descriptive title for the overall plan."),
  steps: z.array(z.string()).describe("A list of concrete steps to execute the plan."),
});


// ===============================================================================
// AGENT DEFINITIONS
// ===============================================================================

// -------------------------------------------------------------------------------
// 1. The "Master Brain" Agent - NOW DYNAMIC
// -------------------------------------------------------------------------------
export const projectManagerFlow = ai.defineFlow(
  {
    name: "projectManagerFlow",
    inputSchema: HistorySchema,
    outputSchema: DecisionSchema,
  },
  async (history) => {
    console.log("Fetching dynamic agent configuration...");

    // [REFACTORED] Fetch agent and model config from Firestore
    const agentRef = db.collection("agents").doc("project-manager");
    const agentDoc = await agentRef.get();
    if (!agentDoc.exists) {
      throw new Error("Agent 'project-manager' not found in Firestore.");
    }
    const agentConfig = agentDoc.data()!;

    const modelRef = db.collection("models").doc(agentConfig.modelId);
    const modelDoc = await modelRef.get();
    if (!modelDoc.exists) {
      throw new Error(`Model '${agentConfig.modelId}' not found in Firestore.`);
    }
    const modelConfig = modelDoc.data()!;

    // Currently, we only support Google models. We will add a switch for OpenAI later.
    if (modelConfig.provider !== "google") {
      throw new Error(`Unsupported model provider: ${modelConfig.provider}`);
    }

    console.log(`Using model: ${agentConfig.modelId} with temp: ${modelConfig.config.temperature}`);

    const prompt = `${agentConfig.prompt}

      ## Analyze the conversation below and decide your next action.

      CONVERSATION HISTORY:
      ${JSON.stringify(history, null, 2)}

      YOUR NEXT ACTION:`;

    const llmResponse = await ai.generate({
      prompt,
      model: gemini15Flash, // Note: We will make the model itself dynamic in the next step
      output: {
        schema: DecisionSchema,
      },
      config: {temperature: modelConfig.config.temperature},
    });

    const decision = llmResponse.output;
    if (!decision) {
      throw new Error("The Project Manager brain failed to make a decision.");
    }
    return decision;
  }
);

// (The Architect flow is temporarily unchanged, we will make it dynamic next)
// -------------------------------------------------------------------------------
export const architectFlow = ai.defineFlow(
  {
    name: "architectFlow",
    inputSchema: z.string(),
    outputSchema: PlanSchema,
  },
  async (task) => {
    const prompt = `
            You are The Architect, a master of software design.
            A user wants to build the following: "${task}".
            Your job is to create a simple, step-by-step plan.
            Respond with ONLY a valid JSON object matching the required schema.
        `;

    const llmResponse = await ai.generate({
      prompt,
      model: gemini15Flash,
      output: {schema: PlanSchema},
    });

    const plan = llmResponse.output;
    if (!plan) {
      throw new Error("The Architect failed to generate a plan.");
    }
    return plan;
  }
);


// ===============================================================================
// CLOUD FUNCTION EXPORTS
// ===============================================================================

export const projectManager = onCallGenkit(
  {region: "australia-southeast1"},
  projectManagerFlow
);

export const architect = onCallGenkit(
  {region: "australia-southeast1"},
  architectFlow
);
