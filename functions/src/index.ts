/*
 * Vibe Coder AI Engine - v7.0 (Architect Agent)
 * This version introduces the specialist "Architect" agent.
 * It defines the architectFlow and exports it as a callable function,
 * resolving the 404 error from the Backend Executor.
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

// [NEW] Define the output schema for our new Architect agent.
const PlanSchema = z.object({
    title: z.string().describe("A short, descriptive title for the overall plan."),
    steps: z.array(z.string()).describe("A list of concrete steps to execute the plan."),
});


// ===============================================================================
// AGENT DEFINITIONS
// ===============================================================================

// -------------------------------------------------------------------------------
// 1. The "Master Brain" Agent
// -------------------------------------------------------------------------------
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

// -------------------------------------------------------------------------------
// 2. [NEW] The "Architect" Specialist Agent
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

            Your job is to create a simple, step-by-step plan to build this.
            The plan should have a title and a list of no more than 5 steps.
            Respond with ONLY a valid JSON object matching the required schema.
        `;

        const llmResponse = await ai.generate({
            prompt,
            model: gemini15Flash,
            output: { schema: PlanSchema },
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

// [NEW] Export the architect flow as a callable cloud function.
export const architect = onCallGenkit(
  {region: "australia-southeast1"},
  architectFlow
);