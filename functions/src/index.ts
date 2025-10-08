/*
 * Vibe Coder AI Engine - v1.6 (Task Classifier - Fully Linted)
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

    // REFINED PROMPT with few-shot examples and stricter instructions.
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
      output: {
        schema: TaskClassificationSchema,
      },
      config: {
        temperature: 0,
      },
    });

    const classification = llmResponse.output;
    if (!classification) {
      throw new Error(
        "Classification failed: LLM response did not contain an output."
      );
    }

    console.log("[taskClassifierFlow] Classification result:", classification);
    return classification;
  }
);

// Expose the 'taskClassifierFlow' as a callable cloud function.
export const taskClassifier = onCallGenkit(
  {region: "australia-southeast1"},
  taskClassifierFlow
);
