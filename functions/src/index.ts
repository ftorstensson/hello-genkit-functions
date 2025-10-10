/*
 * Vibe Coder AI Engine - v2.4 (Architect Agent - Fully Linted & Robust)
 * This version is fully linted and includes the JSON cleaning logic.
 */

import {genkit, z} from "genkit";
import {vertexAI, gemini15Flash} from "@genkit-ai/vertexai";
import {onCallGenkit} from "firebase-functions/v2/https";

// Initialize Genkit with the Vertex AI plugin in the correct region.
const ai = genkit({
  plugins: [
    vertexAI({location: "australia-southeast1"}),
  ],
});

// ===============================================================================
// AGENT 1: TASK CLASSIFIER (Existing)
// ===============================================================================

const TaskClassificationSchema = z.enum([
  "task_request",
  "chitchat",
  "clarification",
]);

export const taskClassifierFlow = ai.defineFlow(
  {
    name: "taskClassifierFlow",
    inputSchema: z.string().describe(
      "The user's raw message to be classified."
    ),
    outputSchema: TaskClassificationSchema,
  },
  async (userMessage) => {
    const prompt = `
      You are an expert classification agent. Your only job is to classify a
      user's message into one of three categories: "task_request", "chitchat",
      or "clarification". Respond with only the single, exact category name.
      Here are examples:
      USER MESSAGE: "hello there"
      CLASSIFICATION: "chitchat"
      USER MESSAGE: "can you build me a website?"
      CLASSIFICATION: "task_request"
      USER MESSAGE: "what do you mean by 'bedrock'?"
      CLASSIFICATION: "clarification"
      Now, classify the following message.
      USER MESSAGE:
      """
      ${userMessage}
      """
      CLASSIFICATION:`;
    const llmResponse = await ai.generate({
      prompt,
      model: gemini15Flash,
      config: {temperature: 0},
    });
    const rawOutput = llmResponse.text;
    const validatedClassification = TaskClassificationSchema.parse(
      rawOutput.trim()
    );
    return validatedClassification;
  }
);

export const taskClassifier = onCallGenkit(
  {region: "australia-southeast1"},
  taskClassifierFlow
);

// ===============================================================================
// AGENT 2: THE ARCHITECT (New)
// ===============================================================================

const PlanSchema = z.object({
  title: z.string().describe(
    "A short, descriptive title for the overall plan."
  ),
  steps: z.array(z.string()).describe("A list of high-level steps."),
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
  {
    name: "architectFlow",
    inputSchema: z.string().describe("The user's task request."),
    outputSchema: PlanSchema,
  },
  async (taskRequest) => {
    console.log("[architectFlow] Received task for planning:", taskRequest);

    const prompt = `
      You are a world-class technical architect for the Vibe Coder Agency.
      Your sole function is to take a user's request and create a clear,
      high-level, step-by-step plan to accomplish it.
      Adhere to these unbreakable principles:
      1.  **Decomposition:** Break the problem down into the smallest logical
          steps.
      2.  **Clarity:** Each step should be a clear, concise action.
      3.  **JSON Only:** You must respond with ONLY a valid JSON object that
          conforms to the specified schema, and nothing else.
      Here is an example:
      USER REQUEST: "I need an API for a simple to-do list."
      YOUR RESPONSE:
      {
        "title": "Build a To-Do List API",
        "steps": [
          "Define the data model for a 'Todo' item.",
          "Create the main Python Flask application file.",
          "Implement the API endpoint to create a new to-do item.",
          "Implement the API endpoint to retrieve all to-do items.",
          "Implement the API endpoint to update a to-do item.",
          "Implement the API endpoint to delete a to-do item.",
          "Write a Dockerfile to containerize the application."
        ]
      }
      Now, generate a plan for the following user request.
      USER REQUEST:
      """
      ${taskRequest}
      """
      YOUR RESPONSE:`;

    const llmResponse = await ai.generate({
      prompt,
      model: gemini15Flash,
      config: {temperature: 0},
    });

    const rawOutput = llmResponse.text;
    console.log(
      `[architectFlow] Received RAW JSON output from model: ${rawOutput}`
    );

    const cleanJsonString = extractJson(rawOutput);

    try {
      const jsonOutput = JSON.parse(cleanJsonString);
      const validatedPlan = PlanSchema.parse(jsonOutput);
      console.log("[architectFlow] Manual validation successful.");
      return validatedPlan;
    } catch (e) {
      console.error(
        "[architectFlow] Manual JSON parsing or validation FAILED.", e
      );
      throw new Error(
        `Architect failed. Model produced invalid JSON: "${cleanJsonString}"`
      );
    }
  }
);

export const architect = onCallGenkit(
  {region: "australia-southeast1"},
  architectFlow
);
