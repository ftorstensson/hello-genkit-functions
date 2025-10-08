/*
 * Vibe Coder AI Engine - v1.2 (Task Classifier - Minimally Corrected)
 * This version makes the smallest possible change to fix the TypeScript
 * errors related to the 'output' property.
 */

import { genkit, z } from "genkit";
import { vertexAI, gemini20Flash } from "@genkit-ai/vertexai";
import { onCallGenkit } from "firebase-functions/v2/https";

// Initialize Genkit with the Vertex AI plugin in the correct region.
const ai = genkit({
  plugins: [
    vertexAI({ location: "australia-southeast1" }),
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
    inputSchema: z.string().describe("The user's raw message to be classified."),
    outputSchema: TaskClassificationSchema,
  },
  async (userMessage) => {
    console.log("[taskClassifierFlow] Received message for classification:", userMessage);

    const prompt = `
      You are the expert classification agent for a multi-agent AI system. Your sole function is to analyze a user's message and classify its intent into one of the following exact categories:

      - "task_request": The user is asking to start a new project, build something, perform a task, or giving a direct command.
        Examples: "build me a new app", "can you create a login page?", "I need a service that does X".

      - "chitchat": The user is making small talk, giving a greeting, expressing gratitude, or having a general, non-task-oriented conversation.
        Examples: "hello", "thank you", "how are you?", "that's cool".

      - "clarification": The user is asking a question about a previously provided plan, seeking more details about a process, or asking about your capabilities.
        Examples: "what do you mean by that?", "can you explain step 2?", "why did you choose that option?".

      Analyze the following user message. Respond with ONLY one of the classification categories and nothing else.

      USER MESSAGE:
      """
      ${userMessage}
      """

      CLASSIFICATION:`;

    const llmResponse = await ai.generate({
      prompt: prompt,
      model: gemini20Flash,
      output: {
        schema: TaskClassificationSchema,
      },
      config: {
        temperature: 0,
      },
    });

    // MINIMAL CORRECTION:
    // 1. Access 'output' as a property, not a function.
    // 2. Check for null/undefined before returning.
    const classification = llmResponse.output;
    if (!classification) {
      throw new Error("Classification failed: LLM response did not contain an output.");
    }
    
    console.log("[taskClassifierFlow] Classification result:", classification);
    return classification;
  }
);

// Expose the 'taskClassifierFlow' as a callable cloud function named 'taskClassifier'.
export const taskClassifier = onCallGenkit(
  { region: "australia-southeast1" },
  taskClassifierFlow
);