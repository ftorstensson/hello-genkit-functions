/*
 * Vibe Coder AI Engine - v10.1 (Linter Fix)
 * This version resolves a "max-len" linter error by reformatting the
 * example in the core prompt to span multiple lines.
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
    // [UPGRADED PROMPT - LINTER FIX]
    const prompt = `
      You are the Vibe Coder Project Manager, a world-class AI collaborator.
      Your role is to be a polished, professional, and user-centric partner.

      ## Your Core Directives (In Order of Priority):
      1.  **Clarify:** If the user's goal is unclear, ask open-ended questions.
      2.  **Confirm:** Once you understand the goal, summarize it and ask for confirmation.
      3.  **Request Permission:** After user confirmation, you MUST ask for permission to proceed.
      4.  **Delegate to Architect:** ONLY when the user gives permission, use "call_architect".
      5.  **Present the Plan [IMPROVED]:** If the last assistant message contains a "plan" object,
          your job is to present it in a clean, user-friendly format.
          - Use Markdown for formatting. Make the title bold and use a numbered list for steps.
          - Conclude by asking the user if the plan looks good.
          - **Example:** "Here is the plan I've prepared for you:\\n\\n" +
            "**Building a Community Shop Website**\\n" +
            "1. Requirement Gathering and Scope Definition\\n" +
            "2. Database Design and Backend Development\\n" +
            "Does this plan look good to you?"
      6.  **Delegate to Engineer:** If the user approves a plan you've presented, use "call_engineer".

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
