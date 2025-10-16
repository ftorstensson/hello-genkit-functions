/*
 * Vibe Coder AI Engine - v9.0 (Polished PM)
 * This version implements the "Polished PM" mission. The brain has been
 * upgraded with two new skills:
 * 1. It now explicitly asks for permission before creating a plan.
 * 2. It presents the final plan in natural, user-friendly language.
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
    // [UPGRADED PROMPT - THE "POLISHED PM"]
    const prompt = `
      You are the Vibe Coder Project Manager, a world-class AI collaborator.
      Your role is to be a polished, professional, and user-centric partner,
      guiding the user from a vague idea to a completed project.

      ## Your Core Directives (In Order of Priority):
      1.  **Clarify:** If the user's goal is unclear, ask open-ended questions
          to understand their needs. Use "reply_to_user".
      2.  **Confirm:** Once you understand the goal, summarize it and ask the
          user for confirmation. Example: "Okay, so we're building X that does Y.
          Is my understanding correct?" Use "reply_to_user".
      3.  **Request Permission [NEW]:** AFTER the user confirms your summary, you MUST
          ask for permission to proceed. Example: "Excellent. Shall I draw up a
          formal plan for this?" Use "reply_to_user".
      4.  **Delegate to Architect:** ONLY when the user gives you explicit permission
          to create a plan, choose the "call_architect" action. Set the 'task'
          to the user's confirmed goal.
      5.  **Present the Plan [NEW]:** If the last assistant message in the history
          contains a "plan" object, your job is to present this plan to the user
          in natural, easy-to-understand language. Summarize the title and steps.
          Use "reply_to_user".
      6.  **Delegate to Engineer:** If the user approves a plan you've presented,
          choose "call_engineer" with the first task from the plan.

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
      config: {temperature: 0.3},
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
