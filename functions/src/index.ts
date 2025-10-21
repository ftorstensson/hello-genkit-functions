/*
 * Vibe Coder AI Engine - v13.4 (Linter Polish)
 * This version adds comments to the empty tool functions to satisfy the
 * '@typescript-eslint/no-empty-function' linter rule, ensuring the code
 * is both syntactically and stylistically correct.
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
// DATA SCHEMAS
// ===============================================================================

const HistorySchema = z.array(z.object({
  role: z.enum(["user", "assistant"]),
  content: z.any(),
}));

const PlanSchema = z.object({
  title: z.string(),
  steps: z.array(z.string()),
});

// [FIXED] Add comments to satisfy the 'no-empty-function' linter rule.
const clarifyTool = ai.defineTool(
  {
    name: "clarify",
    description: "Ask open-ended questions to better understand the user's idea.",
    inputSchema: z.object({reply: z.string()}),
  },
  async () => {/* Logic is handled by the Python backend */}
);
const confirmTool = ai.defineTool(
  {
    name: "confirm",
    description: "Summarize your understanding of the user's idea and ask for their confirmation.",
    inputSchema: z.object({summary: z.string()}),
  },
  async () => {/* Logic is handled by the Python backend */}
);
const requestPermissionTool = ai.defineTool(
  {
    name: "requestPermission",
    description: "After the user has confirmed your summary, ask for their permission to create a formal plan.",
    inputSchema: z.object({reply: z.string()}),
  },
  async () => {/* Logic is handled by the Python backend */}
);
const delegateToArchitectTool = ai.defineTool(
  {
    name: "delegateToArchitect",
    description: "ONLY call this after the user has explicitly granted you permission. Use it to delegate the confirmed task to the architect.",
    inputSchema: z.object({taskSummary: z.string()}),
  },
  async () => {/* Logic is handled by the Python backend */}
);

// ===============================================================================
// AGENT FLOWS
// ===============================================================================

export const projectManagerFlow = ai.defineFlow(
  {
    name: "projectManagerFlow",
    inputSchema: HistorySchema,
    outputSchema: z.any(),
  },
  async (history) => {
    const agentConfig = (await db.collection("agents").doc("project-manager").get()).data()!;
    const modelConfig = (await db.collection("models").doc(agentConfig.modelId).get()).data()!;

    const llmResponse = await ai.generate({
      prompt: `${agentConfig.prompt}

      CONVERSATION HISTORY:
      ${JSON.stringify(history, null, 2)}
      `,
      model: gemini15Flash,
      tools: [clarifyTool, confirmTool, requestPermissionTool, delegateToArchitectTool],
      toolChoice: "auto",
      config: {temperature: modelConfig.config.temperature},
    });

    const toolRequests = llmResponse.toolRequests;
    if (!toolRequests || toolRequests.length === 0) {
      return {name: "clarify", input: {reply: "I'm sorry, I'm not sure how to proceed. Could you please rephrase that?"}};
    }

    return toolRequests[0];
  }
);

export const architectFlow = ai.defineFlow(
  {
    name: "architectFlow",
    inputSchema: z.string(),
    outputSchema: PlanSchema,
  },
  async (task) => {
    const agentConfig = (await db.collection("agents").doc("architect").get()).data()!;
    const prompt = agentConfig.prompt.replace("{task}", task);

    const llmResponse = await ai.generate({
      prompt,
      model: gemini15Flash,
      output: {schema: PlanSchema},
    });

    const output = llmResponse.output;
    if (!output) {
      throw new Error("The Architect failed to generate a valid plan.");
    }
    return output;
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
