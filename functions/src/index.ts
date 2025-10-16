/*
 * Vibe Coder AI Engine - v6.1 (Structured History - Bugfix)
 * This version corrects a typo in the vertexai import path and ensures
 * the file is correctly formatted to pass linter checks.
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

// [REFACTORED] The content field is now z.any() to allow for structured
// JSON objects from the assistant, in addition to simple strings from the user.
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
    // [ENHANCED PROMPT] The prompt now teaches the AI how to parse the
    // new, richer history, where an assistant's 'content' can be an object.
    const prompt = `
      You are the Vibe Coder Project Manager, a world-class AI collaborator.
      Your job is to analyze the entire conversation history and decide on the
      single best next action to take.

      The user's 'content' will be a simple string.
      The assistant's 'content' may be a JSON object containing a 'reply'
      and/or a 'plan'. You must parse the full history to understand the
      current state of the project.

      Your possible actions are: "reply_to_user", "call_architect",
      "call_engineer".

      - If the user's last message is ambiguous, a greeting, or a simple
        question, choose "reply_to_user" and set 'text' to be your
        natural language response.
      - If the user has given a clear task and you need a plan, choose
        "call_architect" and set 'task' to be the user's request.
      - If you have just presented a plan (visible in the last assistant
        message) and the user has approved it, choose "call_engineer" and
        set 'task' to be the first step of that plan.

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