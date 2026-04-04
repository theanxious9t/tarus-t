import { GoogleGenAI, ThinkingLevel } from "@google/genai";

const apiKey = process.env.GEMINI_API_KEY;

export async function getAIResponse(prompt: string, context?: string) {
  if (!apiKey) {
    throw new Error("GEMINI_API_KEY is not set");
  }

  const ai = new GoogleGenAI({ apiKey });
  
  const systemInstruction = `You are Tarsus, a helpful AI assistant integrated into a real-time chat and video calling application. 
  You are a branch of tarsi, providing intelligent support to users.
  Keep your responses concise and friendly. 
  The current context of the conversation is: ${context || "None"}`;

  const response = await ai.models.generateContent({
    model: "gemini-3.1-pro-preview",
    contents: prompt,
    config: {
      systemInstruction,
      thinkingConfig: {
        thinkingLevel: ThinkingLevel.HIGH
      }
    }
  });

  return response.text;
}
