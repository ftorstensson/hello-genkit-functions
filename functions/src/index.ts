/*
 * Vibe Coder AI Engine - v1.9 (Task Classifier - Super Linted Diagnostic)
 * This version is meticulously formatted to pass all ESLint checks.
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

// Define the strict set of possible user intents.
const TaskClassificationSchema = z.enum([
  "task_request",
  "chitchat",
  "clarification",
]);

// Define the 'taskClassifierFlow' agent.
export const taskClassifierFlow = ai.defineFlow(
  {
    name: "taskClassifierFlow",
    inputSchema: z.string().describe(
      "The user's raw message to be classified."
    ),
    outputSchema: TaskClassificationSchema,
  },
  async (userMessage) => {
    console.log(
      "[taskClassifierFlow] Received message for classification:",
      userMessage
    );

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

    // DIAGNOSTIC STEP 1: Generate raw text output, without schema validation.
    const llmResponse = await ai.generate({
      prompt,
      model: gemini15Flash,
      config: {
        temperature: 0,
      },
    });

    // CORRECTED: Access 'text' as a property, not a function.
    const rawOutput = llmResponse.text;
    console.log(
      `[taskClassifierFlow] Received RAW output from model: "${rawOutput}"`
    );

    // DIAGNOSTIC STEP 2: Manually validate the raw output.
    try {
      // We use .trim() to remove any accidental leading/trailing whitespace.
      const validatedClassification = TaskClassificationSchema.parse(
        rawOutput.trim()
      );
      console.log("[taskClassifierFlow] Manual validation successful.");
      return validatedClassification;
    } catch (e) {
      console.error("[taskClassifierFlow] Manual validation FAILED.", e);
      throw new Error(
        `Classification failed. Model produced invalid output: "${rawOutput}"`
      );
    }
  }
);

// Expose the 'taskClassifierFlow' as a callable cloud function.
export const taskClassifier = onCallGenkit(
  {region: "australia-southeast1"},
  taskClassifierFlow
);
