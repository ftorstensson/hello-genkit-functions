/*
 * Vibe Coder AI Engine - v1.4 (Task Classifier - Super Linted)
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
      You are the expert classification agent for a multi-agent AI system.
      Your sole function is to analyze a user's message and classify its
      intent into one of the following exact categories:

      - "task_request": The user is asking to start a new project, build
        something, perform a task, or giving a direct command.
        Examples: "build me a new app", "can you create a login page?".

      - "chitchat": The user is making small talk, giving a greeting,
        expressing gratitude, or having a general, non-task-oriented
        conversation. Examples: "hello", "thank you", "how are you?".

      - "clarification": The user is asking a question about a previously
        provided plan, seeking more details about a process, or asking
        about your capabilities. Examples: "what do you mean by that?".

      Analyze the following user message. Respond with ONLY one of the
      classification categories and nothing else.

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
