import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

// Load .env variables
dotenv.config();

const supabaseUrl = 'https://tfdghduqsaniszkvzyhl.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRmZGdoZHVxc2FuaXN6a3Z6eWhsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTkxMzIwMTcsImV4cCI6MjA3NDcwODAxN30.8ga6eiQymTcO3OZLGDe3WuAHkWcxgRA9ywG3xJ6QzNI';

// Your Admin User ID for the check
const ADMIN_USER_ID = '5f7c1297-267e-4cd8-98ac-ed27110c65c1';

// The public client (for auth functions)
const supabase = createClient(supabaseUrl, supabaseKey);

// The admin client (for bypassing RLS to manage the 'users' table)
const supabaseAdmin = createClient(supabaseUrl, process.env.SUPABASE_SERVICE_KEY!);

if (!process.env.SUPABASE_SERVICE_KEY) {
  console.error("CRITICAL ERROR: SUPABASE_SERVICE_KEY is not set in .env file");
}

export class AuthService {

  // -------------------------
  // SIGN UP (Unchanged)
  // -------------------------
  static async signUp(email: string, password: string, name: string) {
    if (!email || !password || !name) {
      throw new Error('Email, password, and name are required for signup');
    }
    try {
      console.log('Starting signup process:', { email, name });
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: { data: { name } },
      });

      if (error) throw new Error(error.message);
      if (!data.user) throw new Error('No user returned from authentication');

      console.log('Auth user created:', { id: data.user.id, email: data.user.email });
      
      await AuthService.ensureUserProfile(data.user.id, email, name);

      return {
        user: {
          id: data.user.id,
          email: data.user.email,
          name: data.user.user_metadata?.name || name,
          created_at: data.user.created_at,
        },
        session: data.session?.access_token || null,
      };
    } catch (err: any) {
      console.error('Signup failed:', err.message);
      throw err;
    }
  }

  // -------------------------
  // SIGN IN (Unchanged)
  // -------------------------
  static async signIn(email: string, password: string) {
    console.log('Starting signin process:', { email });
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) throw new Error(error.message);
    if (!data.user) throw new Error('No user returned from authentication');

    console.log('User signed in:', { id: data.user.id, email: data.user.email });

    await AuthService.ensureUserProfile(
      data.user.id,
      data.user.email!,
      data.user.user_metadata?.name || 'User'
    );

    return {
      user: {
        id: data.user.id,
        email: data.user.email,
        name: data.user.user_metadata?.name || 'User',
        created_at: data.user.created_at,
      },
      session: data.session?.access_token || null,
    };
  }

  // -------------------------
  // GET USER (--- THIS IS THE MODIFIED FUNCTION ---)
  // -------------------------
  static async getUser(token: string) {
    // 1. Use the PUBLIC client to validate the token
    const { data, error } = await supabase.auth.getUser(token);
    if (error) throw new Error(error.message);
    if (!data.user) throw new Error('No user found');

    const user = data.user;

    // 2. Use the ADMIN client to ensure the profile exists
    await AuthService.ensureUserProfile(
      user.id,
      user.email!,
      user.user_metadata?.name || 'User'
    );

    // 3. --- MODIFIED ---
    // Fetch profile, subscription tier, AND education level
    const { data: combinedData, error: combinedError } = await supabaseAdmin
      .from('users')
      .select(`
        name,
        subscription_tier,
        user_education_level ( level )
      `)
      .eq('id', user.id)
      .single();

    if (combinedError) {
      console.error('Error fetching user profile/education level:', combinedError.message);
      throw new Error(combinedError.message);
    }
    
    // 4. Process the data
    const education = (combinedData as any)?.user_education_level;
    const isAdmin = user.id === ADMIN_USER_ID;

    return {
      id: user.id,
      email: user.email,
      name: combinedData?.name || user.user_metadata?.name || 'User',
      // --- avatar_url line REMOVED ---
      created_at: user.created_at,
      last_sign_in_at: user.last_sign_in_at,
      subscription_tier: combinedData?.subscription_tier || 'free',
      education_level: education?.level || null,
      is_admin: isAdmin
    };
  }

  // -------------------------
  // CREATE PROFILE (Unchanged)
  // -------------------------
  static async createUserProfile(userId: string, email: string, name: string) {
    try {
      const { data: existingUser } = await supabaseAdmin
        .from('users')
        .select('id')
        .eq('id', userId)
        .single();

      if (existingUser) {
        console.log('User profile already exists, skipping creation.');
        return existingUser;
      }

      const { data, error } = await supabaseAdmin
        .from('users')
        .insert([
          {
            id: userId,
            email,
            name,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          },
        ])
        .select()
        .single();

      if (error) {
        throw new Error(error.message);
      }

      console.log('User profile created in public.users:', data?.id);
      return data;
    } catch (err: any) {
      console.error('Failed to create user profile:', err.message);
      throw err;
    }
  }

  // -------------------------
  // ENSURE PROFILE EXISTS (Unchanged)
  // -------------------------
  static async ensureUserProfile(userId: string, email: string, name: string) {
    try {
      const { data: existingUser, error: fetchError } = await supabaseAdmin
        .from('users')
        .select('id')
        .eq('id', userId)
        .single();

      if (existingUser) {
        return;
      }

      if (fetchError && fetchError.code === 'PGRST116') {
        await AuthService.createUserProfile(userId, email, name);
      } else if (fetchError) {
        console.error('Error ensuring profile:', fetchError);
      } else {
        await AuthService.createUserProfile(userId, email, name);
      }
    } catch (err: any) {
      console.error('Critical error in ensureUserProfile:', err.message);
    }
  }

  // -------------------------
  // SIGN OUT (Unchanged)
  // -------------------------
  static async signOut() {
    const { error } = await supabase.auth.signOut();
    if (error) throw new Error(error.message);
  }
}