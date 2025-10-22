/*
 * Vibe Coder AI Engine - v13.8 (Definitive Ground Truth!)
 *
 * This is the definitive diagnostic version. It removes all non-compiling code.
 * Its ONLY purpose is to log the full structure of the 'llmResponse' object
 * to the Google Cloud logs, which will give us the ground truth we need to
 * write the final, correct code.
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

// Schemas (unchanged)
const HistorySchema = z.array(z.object({
  role: z.enum(["user", "assistant"]),
  content: z.any(),
}));
const PlanSchema = z.object({
  title: z.string(),
  steps: z.array(z.string()),
});

// Tools (unchanged)
const pmTools = [{functionDeclarations: [{name: "clarify", description: "Ask open-ended questions to better understand the user's idea.", parameters: {type: "object", properties: {reply: {type: "string"}}}}, {name: "confirm", description: "Summarize your understanding of the user's idea and ask for their confirmation.", parameters: {type: "object", properties: {summary: {type: "string"}}}}, {name: "requestPermission", description: "After the user has confirmed your summary, ask for their permission to create a formal plan.", parameters: {type: "object", properties: {reply: {type: "string"}}}}, {name: "delegateToArchitect", description: "ONLY call this after the user has explicitly granted you permission. Use it to delegate the confirmed task to the architect.", parameters: {type: "object", properties: {taskSummary: {type: "string"}}}}]}];

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
      prompt: `${agentConfig.prompt}\n\nCONVERSATION HISTORY:\n${JSON.stringify(history, null, 2)}`,
      model: gemini15Flash,
      config: {
        temperature: modelConfig.config.temperature,
        tools: pmTools,
        toolChoice: "auto",
      },
    });

    // [DIAGNOSTIC STEP] Log the entire response object to get the ground truth.
    console.log("GROUND TRUTH LLM_RESPONSE:", JSON.stringify(llmResponse, null, 2));

    // [DEFINITIVE FIX] Return a simple, valid object to allow compilation.
    // This will cause the test to fail, but it will allow us to get the log.
    return {name: "diagnostic_step", input: {}};
  }
);

// Architect flow is unchanged
export const architectFlow = ai.defineFlow(
  {name: "architectFlow", inputSchema: z.string(), outputSchema: PlanSchema},
  async (task) => {
    const agentConfig = (await db.collection("agents").doc("architect").get()).data()!;
    const prompt = agentConfig.prompt.replace("{task}", task);
    const llmResponse = await ai.generate({prompt, model: gemini15Flash, output: {schema: PlanSchema}});
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

export const projectManager = onCallGenkit( {region: "australia-southeast1"}, projectManagerFlow );
export const architect = onCallGenkit( {region: "australia-southeast1"}, architectFlow );
