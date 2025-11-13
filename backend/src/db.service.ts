import { createClient } from "@supabase/supabase-js";
import { SupabaseClient } from "@supabase/supabase-js";
import dotenv from "dotenv";

dotenv.config();

/*=== ENVIRONMENT VARIABLES CHECK ===*/
if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_KEY) {
  
  throw new Error("Missing SUPABASE_URL or SUPABASE_SERVICE_KEY in .env");
}

const supabaseUrl = process.env.SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_KEY!;

/*=== SUPABASE CLIENT ===*/
export const supabase: SupabaseClient = createClient(supabaseUrl, supabaseKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
    detectSessionInUrl: false,
  },
});

/*=== USER PROFILE INTERFACE & DB FUNCTIONS ===*/
interface UserProfile {
  id: string;
  email: string;
  name?: string;
  points: number;
  streak: number;
  subjects: string[];
  created_at: string;
}

/*=== DB RESPONSE INTERFACE ===*/
interface DbResponse<T> {
  data?: T;
  error?: string;
}

/*=== CREATE USER PROFILE===*/
export async function createUserProfile(
  userId: string,
  email: string,
  name?: string
): Promise<DbResponse<UserProfile>> {

  const { data, error } = await supabase
    .from("users")
    .insert([{ id: userId, email, name, points: 0, streak: 0, subjects: [] }])
    .select()
    .single();

  if (error) {

    return { error: error.message };
  }
  if (!data) {

    return { error: "Failed to create user profile" };
  }
  return { data };
}
