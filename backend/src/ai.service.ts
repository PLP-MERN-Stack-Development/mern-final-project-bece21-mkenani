import { createClient } from "@supabase/supabase-js";
import { GoogleGenerativeAI } from "@google/generative-ai";
import dotenv from "dotenv";

dotenv.config();
const supabaseUrl = process.env.SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_ANON_KEY!;
const genAI = new GoogleGenerativeAI(process.env.GOOGLE_AI_API_KEY!);

/*===========AI SERVICE ===========*/
export class AIService {
  static async generateResponse(
    userId: string,
    message: string,
    accessToken: string
  ): Promise<string> {
    try {
      const model = genAI.getGenerativeModel({
        model: "gemini-2.0-flash",
        generationConfig: {
          maxOutputTokens: 500,
          temperature: 0.7,
        },
      });

      const prompt = `You are Goal Mate, a helpful AI tutor for students. Respond to the user's message in an engaging, encouraging way. Keep responses concise (3-4sentences) and educational. User message: "${message}"`;

      const result = await model.generateContent(prompt);
      const response = result.response.text();

      const supabase = createClient(supabaseUrl, supabaseKey, {
        global: { headers: { Authorization: `Bearer ${accessToken}` } },
      });

      const newMessage = {
        content: message,
        created_at: new Date().toISOString(),
        sender: "user" as const,
      };
      const aiResponse = {
        content: response,
        created_at: new Date().toISOString(),
        sender: "ai" as const,
      };

      const { data, error } = await supabase
        .from("chat_sessions")
        .select("id, messages")
        .eq("user_id", userId)
        .single();
      if (error && error.code !== "PGRST116") {
        throw new Error(`Failed to fetch session: ${error.message}`);
      }

      if (!data) {
        const { data: newSession, error: sessionError } = await supabase
          .from("chat_sessions")
          .insert([{ user_id: userId, messages: [newMessage, aiResponse] }])
          .select()
          .single();

        if (sessionError) {
          console.error("Create AI Session Error:", sessionError);
          throw new Error(
            `Failed to create AI chat session: ${sessionError.message}`
          );
        }
        return response;
      }

      const updatedMessages = [
        ...(data.messages || []),
        newMessage,
        aiResponse,
      ];
      const { data: updatedSession, error: updateError } = await supabase
        .from("chat_sessions")
        .update({
          messages: updatedMessages,
          updated_at: new Date().toISOString(),
        })
        .eq("id", data.id)
        .select()
        .single();

      if (updateError) {
        throw new Error(`Failed to store AI response: ${updateError.message}`);
      }

      return response;
    } catch (err: any) {
      if (
        err.message.includes("429") ||
        err.message.includes("quota") ||
        err.message.includes("exceeded")
      ) {
        throw new Error(
          "AI service quota exceeded. Please try again in a few moments or contact support."
        );
      }

      throw new Error(`Failed to generate AI response: ${err.message}`);
    }
  }
}
