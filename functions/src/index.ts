/*
 * Vibe Coder AI Engine - v5.0 (Unified Brain)
 * This version implements the "Unified Brain" architecture. The projectManagerFlow
 * is now the single, intelligent entry point for the entire service.
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

// Defines a single message in the conversation history.
const MessageSchema = z.object({
  role: z.enum(["user", "assistant"]),
  content: z.string(),
});

// Defines the full conversation history.
const HistorySchema = z.array(MessageSchema);

// Defines the possible "decisions" our brain can make.
const DecisionSchema = z.union([
  z.object({
    action: z.literal("reply_to_user"),
    text: z.string().describe("The natural language response to the user."),
  }),
  z.object({
    action: z.literal("call_architect"),
    task: z.string().describe("The user's task to be sent to the architect."),
  }),
  z.object({
    action: z.literal("call_engineer"),
    task: z.string().describe("The specific step from the plan to be executed."),
  }),
]);

// ===============================================================================
// THE "MASTER BRAIN" AGENT
// ===============================================================================

/**
 * The Project Manager is the single, unified brain of the application.
 * It analyzes the full conversation history and decides on the next action.
 */
export const projectManagerFlow = ai.defineFlow(
  {
    name: "projectManagerFlow",
    inputSchema: HistorySchema,
    outputSchema: DecisionSchema,
  },
  async (history) => {
    const prompt = `
      You are the Vibe Coder Project Manager, a world-class AI collaborator.
      Your job is to analyze the entire conversation history and decide on the
      single best next action to take.

      These are your possible actions:
      1.  'reply_to_user': Use this to ask clarifying questions, brainstorm,
          greet the user, or present information.
      2.  'call_architect': Use this ONLY when you have a clear, confirmed
          task from the user that needs a technical plan.
      3.  'call_engineer': Use this ONLY when a plan has been presented and the
          user has clearly approved it.

      Analyze the conversation below. If the user's last message is a new,
      ambiguous task, ASK A CLARIFYING QUESTION. Do not create a plan until
      you are sure what the user wants. If the user has approved a plan,
      call the engineer with the first step. If you just received a plan or
      code, present it to the user.

      Respond with ONLY a valid JSON object matching the required action schema.

      CONVERSATION HISTORY:
      ${JSON.stringify(history, null, 2)}

      YOUR NEXT ACTION:`;

    const llmResponse = await ai.generate({
      prompt,
      model: gemini15Flash,
      output: {
        schema: DecisionSchema,
      },
      config: {temperature: 0.2},
    });

    return llmResponse.output;
  }
);

// This is now the ONLY function exposed to the outside world.
export const projectManager = onCallGenkit(
  {region: "australia-southeast1"},
  projectManagerFlow
);