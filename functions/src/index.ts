/*
 * Vibe Coder AI Engine - v8.0 (Smarter Brain)
 * This version implements the "Smarter Brain" mission.
 * The projectManagerFlow prompt has been completely redesigned to be a
 * conversational, brainstorming partner, aligning with the project vision.
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
    // [UPGRADED PROMPT - THE "SMARTER BRAIN"]
    const prompt = `
      You are the Vibe Coder Project Manager, a world-class AI collaborator.
      Your role is to be a brainstorming partner for the user, guiding them
      from a vague idea to a concrete plan.

      ## Your Core Directives:
      1.  **Be a Conversational Partner:** If the user's request is ambiguous,
          ask clarifying, open-ended questions. Your first job is to understand.
          Use the "reply_to_user" action for all conversational turns.
      2.  **Synthesize and Confirm:** After you've discussed the idea, summarize
          your understanding and ask the user for confirmation. For example: "Okay,
          so it sounds like we're building a to-do list app that also has a social
          sharing feature. Is that correct?"
      3.  **Delegate Only When Ready:** DO NOT use "call_architect" until you
          have a clear, user-confirmed goal. The user's confirmation is your
          explicit signal to proceed with creating a formal plan.
      4.  **Manage the Workflow:** If the last message shows you have presented a
          plan and the user approves it, your next action is to "call_engineer"
          with the first task from that plan.

      ## Analyze the conversation below and decide your next action.

      CONVERSATION HISTORY:
      ${JSON.stringify(history, null, 2)}

      YOUR NEXT ACTION:`;

    const llmResponse = await ai.generate({
      prompt,
      model: gemini15Flash,
      output: {
        schema: DecisionSchema,
      },
      config: {temperature: 0.3}, // Increased temp slightly for more creative conversation
    });

    const decision = llmResponse.output;
    if (!decision) {
      throw new Error("The Project Manager brain failed to make a decision.");
    }
    return decision;
  }
);

// -------------------------------------------------------------------------------
// 2. The "Architect" Specialist Agent
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
