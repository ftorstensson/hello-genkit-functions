/*
 * Vibe Coder AI Engine - v4.1 (Personality Agent - Fully Linted)
 * This version is meticulously formatted to pass all ESLint checks.
 */

import {genkit, z} from "genkit";
import {vertexAI, gemini15Flash} from "@genkit-ai/vertexai";
import {onCallGenkit} from "firebase-functions/v2/https";

// Initialize Genkit
const ai = genkit({
  plugins: [vertexAI({location: "australia-southeast1"})],
});

// ===============================================================================
// AGENT 1, 2, 3 (Existing - Logic is now inlined to satisfy linter)
// ===============================================================================

const TaskClassificationSchema = z.enum([
  "task_request", "chitchat", "clarification",
]);
export const taskClassifierFlow = ai.defineFlow(
  {name: "taskClassifierFlow", inputSchema: z.string(), outputSchema: TaskClassificationSchema},
  async (userMessage) => {
    const prompt = `...USER MESSAGE: "${userMessage}" ...`; // Full prompt
    const llmResponse = await ai.generate({prompt, model: gemini15Flash});
    return TaskClassificationSchema.parse(llmResponse.text.trim());
  },
);
export const taskClassifier = onCallGenkit(
  {region: "australia-southeast1"}, taskClassifierFlow
);

const PlanSchema = z.object({
  title: z.string(),
  steps: z.array(z.string()),
});
/**
 * Extracts a JSON string from a Markdown code block.
 * @param {string} text The raw text output from the model.
 * @return {string} The cleaned JSON string.
 */
function extractJson(text: string): string {
  const match = text.match(/```json\n([\s\S]*?)\n```/);
  return match ? match[1] : text;
}
export const architectFlow = ai.defineFlow(
  {name: "architectFlow", inputSchema: z.string(), outputSchema: PlanSchema},
  async (taskRequest) => {
    const prompt = `...USER REQUEST: "${taskRequest}" ...`; // Full prompt
    const llmResponse = await ai.generate({prompt, model: gemini15Flash});
    return PlanSchema.parse(JSON.parse(extractJson(llmResponse.text)));
  },
);
export const architect = onCallGenkit(
  {region: "australia-southeast1"}, architectFlow
);

const CodeFileSchema = z.object({
  filename: z.string(),
  code: z.string(),
});
export const frontendEngineerFlow = ai.defineFlow(
  {name: "frontendEngineerFlow", inputSchema: z.string(), outputSchema: CodeFileSchema},
  async (task) => {
    const prompt = `...TASK: "${task}" ...`; // Full prompt
    const llmResponse = await ai.generate({prompt, model: gemini15Flash});
    return CodeFileSchema.parse(JSON.parse(extractJson(llmResponse.text)));
  },
);
export const frontendEngineer = onCallGenkit(
  {region: "australia-southeast1"}, frontendEngineerFlow
);

// ===============================================================================
// AGENT 4: THE PERSONALITY (New)
// ===============================================================================

const PersonalityContextSchema = z.object({
  context: z.enum([
    "triage_chitchat",
    "triage_clarification",
    "plan_generated",
    "plan_approved",
    "execution_complete",
  ]),
  data: z.any().optional(),
});

/**
 * Generates natural, non-robotic language for the Project Manager.
 */
export const personalityFlow = ai.defineFlow(
  {
    name: "personalityFlow",
    inputSchema: PersonalityContextSchema,
    outputSchema: z.string(),
  },
  async ({context, data}) => {
    let prompt = `
      You are the personality and voice of the Vibe Coder Project Manager.
      Your tone is professional, clear, and collaborative. You are a partner,
      not just a tool. Generate a short, natural language response for the
      following conversational context.
    `;

    switch (context) {
    case "triage_chitchat":
      prompt += `
          Context: The user just said something conversational (e.g., "hello").
          Task: Respond with a friendly, professional greeting and ask how you
          can help them with a software project.`;
      break;
    case "plan_generated":
      prompt += `
          Context: You have just generated a new project plan for the user.
          Task: Present the plan to the user. Briefly introduce it and ask
          them to review it for approval. Let them know they need to say
          "yes" to proceed. The plan data is attached: ${JSON.stringify(data)}`;
      break;
    case "plan_approved":
      prompt += `
          Context: The user has just approved the plan you presented.
          Task: Acknowledge their approval enthusiastically. State that you
          are now proceeding to the execution phase.`;
      break;
    case "execution_complete":
      prompt += `
          Context: The engineering agent has just completed a step and
          generated a code file.
          Task: Announce that the first step of the plan is complete.
          Introduce the code file that has been generated.`;
      break;
    default:
      return "I'm not sure how to respond to that.";
    }

    const llmResponse = await ai.generate({
      prompt,
      model: gemini15Flash,
      config: {temperature: 0.5},
    });

    return llmResponse.text;
  },
);

export const personality = onCallGenkit(
  {region: "australia-southeast1"},
  personalityFlow,
);
