/*
 * Vibe Coder AI Engine - v5.2 (Unified Brain - z.enum fix)
 * This version implements the expert-validated fix for the structured output
 * bug by refactoring the DecisionSchema to use z.enum instead of z.literal.
 */

import {genkit, z} from "genkit";
import {vertexAI, gemini15Flash} from "@genkit-ai/vertexai";
import {onCallGenkit} from "firebase-functions/v2/https";

// Initialize Genkit
const ai = genkit({
  plugins: [vertexAI({location: "australia-southeast1"})],
});

// ===============================================================================
// DATA SCHEMAS
// ===============================================================================

const MessageSchema = z.object({
  role: z.enum(["user", "assistant"]),
  content: z.string(),
});

const HistorySchema = z.array(MessageSchema);

// REFACTORED SCHEMA using z.enum, as recommended by the expert.
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


// ===============================================================================
// THE "MASTER BRAIN" AGENT
// ===============================================================================

export const projectManagerFlow = ai.defineFlow(
  {
    name: "projectManagerFlow",
    inputSchema: HistorySchema,
    outputSchema: DecisionSchema,
  },
  async (history) => {
    // REFINED PROMPT to work with the new, simpler schema.
    const prompt = `
      You are the Vibe Coder Project Manager, a world-class AI collaborator.
      Your job is to analyze the entire conversation history and decide on the
      single best next action to take.

      Your possible actions are: "reply_to_user", "call_architect",
      "call_engineer".

      - If the user's last message is ambiguous, a greeting, or a simple
        question, choose "reply_to_user" and set 'text' to be your
        natural language response.
      - If the user has given a clear task and you need a plan, choose
        "call_architect" and set 'task' to be the user's request.
      - If the user has approved a plan, choose "call_engineer" and set
        'task' to be the first step of that plan.

      Analyze the conversation below and respond with ONLY a valid JSON
      object matching the required schema.

      CONVERSATION HISTORY:
      ${JSON.stringify(history, null, 2)}

      YOUR NEXT ACTION:`;

    const llmResponse = await ai.generate({
      prompt,
      model: gemini15Flash,
      output: {
        schema: DecisionSchema,
      },
      config: {temperature: 0.1},
    });

    const decision = llmResponse.output;
    if (!decision) {
      throw new Error("The Project Manager brain failed to make a decision.");
    }
    return decision;
  }
);

export const projectManager = onCallGenkit(
  {region: "australia-southeast1"},
  projectManagerFlow
);