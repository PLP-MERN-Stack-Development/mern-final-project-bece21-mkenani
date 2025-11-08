import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

// --- 1. Load .env variables ---
dotenv.config();

const supabaseUrl = 'https://tfdghduqsaniszkvzyhl.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRmZGdoZHVxc2FuaXN6a3Z6eWhsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTkxMzIwMTcsImV4cCI6MjA3NDcwODAxN30.8ga6eiQymTcO3OZLGDe3WuAHkWcxgRA9ywG3xJ6QzNI';

// --- 2. Create the Admin Client ---
const supabaseAdmin = createClient(supabaseUrl, process.env.SUPABASE_SERVICE_KEY!);

if (!process.env.SUPABASE_SERVICE_KEY) {
  console.error("CRITICAL ERROR: SUPABASE_SERVICE_KEY is not set in .env file (needed by GroupService)");
}

export class GroupService {

  // Get all groups (uses user's token)
  static async getAllGroups(accessToken: string) {
    const supabase = createClient(supabaseUrl, supabaseKey, {
      global: { headers: { Authorization: `Bearer ${accessToken}` } },
    });
    const { data, error } = await supabase
      .from('study_groups')
      .select('*')
      .order('is_admin_group', { ascending: false }) 
      .order('created_at', { ascending: true });
      
    if (error) throw error;
    return data;
  }

  // Get a single group's details (uses user's token)
  static async getGroupDetails(groupId: string, accessToken: string) {
    const supabase = createClient(supabaseUrl, supabaseKey, {
      global: { headers: { Authorization: `Bearer ${accessToken}` } },
    });
    const { data, error } = await supabase
      .from('study_groups')
      .select('*')
      .eq('id', groupId)
      .single();
    if (error) throw error;
    return data;
  }

  // Create a new group (unchanged, for user-created groups)
  static async createGroup(userId: string, name: string, description: string, accessToken: string) {
    const supabase = createClient(supabaseUrl, supabaseKey, {
      global: { headers: { Authorization: `Bearer ${accessToken}` } },
    });
    
    const { data: group, error: groupError } = await supabase
      .from('study_groups')
      .insert({ name, description, created_by: userId })
      .select()
      .single();
    if (groupError) throw groupError;

    await this.joinGroup(userId, group.id, accessToken);
    
    return group;
  }

  // Join a group (unchanged)
  static async joinGroup(userId: string, groupId: string, accessToken: string) {
    const supabase = createClient(supabaseUrl, supabaseKey, {
      global: { headers: { Authorization: `Bearer ${accessToken}` } },
    });
    const { data, error } = await supabase
      .from('group_members')
      .insert({ group_id: groupId, user_id: userId })
      .select();
    if (error) throw error;
    return data;
  }

  // --- MODIFIED --- Leave a group (blocks leaving admin group)
  static async leaveGroup(userId: string, groupId: string, accessToken: string) {
    const supabase = createClient(supabaseUrl, supabaseKey, {
      global: { headers: { Authorization: `Bearer ${accessToken}` } },
    });

    const { data: group, error: groupError } = await supabase
      .from('study_groups')
      .select('is_admin_group')
      .eq('id', groupId)
      .single();
    
    if (groupError) throw groupError;
    if (group.is_admin_group) {
      throw new Error('You cannot leave the admin group.');
    }

    const { data, error } = await supabase
      .from('group_members')
      .delete()
      .eq('group_id', groupId)
      .eq('user_id', userId);
    if (error) throw error;
    return data;
  }

  // --- MODIFIED --- Get chat history, now requires a roomName
  static async getGroupMessages(groupId: string, roomName: string, accessToken: string) {
    const supabase = createClient(supabaseUrl, supabaseKey, {
      global: { headers: { Authorization: `Bearer ${accessToken}` } },
    });
    
    const { data, error } = await supabase
      .from('group_messages')
      .select(`
        id,
        content,
        created_at,
        user_id,
        room_name,
        reactions,
        file_url,
        users ( name ) 
      `)
      .eq('group_id', groupId)
      .eq('room_name', roomName)
      .order('created_at', { ascending: true })
      .limit(100);
      
    if (error) throw error;
    return data;
  }

  // --- MODIFIED --- Save a message, now requires roomName and fileUrl
  static async saveMessage(userId: string, groupId: string, roomName: string, content: string, fileUrl: string | null) {
    const { data, error } = await supabaseAdmin 
      .from('group_messages')
      .insert({ 
        group_id: groupId, 
        user_id: userId, 
        content: content,
        room_name: roomName,
        file_url: fileUrl
      })
      .select()
      .single();
    if (error) throw error;
    return data;
  }

  // Get a user's own group memberships (unchanged)
  static async getMyGroupIds(userId: string, accessToken: string) {
    const supabase = createClient(supabaseUrl, supabaseKey, {
      global: { headers: { Authorization: `Bearer ${accessToken}` } },
    });
    const { data, error } = await supabase
      .from('group_members')
      .select('group_id')
      .eq('user_id', userId);
      
    if (error) throw error;
    return data.map(item => item.group_id);
  }

  // Get all user IDs for a given group (unchanged)
  static async getGroupMembers(groupId: string): Promise<string[]> {
    const { data, error } = await supabaseAdmin
      .from('group_members')
      .select('user_id')
      .eq('group_id', groupId);

    if (error) {
      console.error(`GetGroupMembers Error: ${error.message}`);
      return []; 
    }
    return data.map(item => item.user_id);
  }

  // --- NEW --- Gets the list of rooms for a group (e.g., 'general', 'primary')
  static async getGroupRooms(groupId: string, accessToken: string) {
    const supabase = createClient(supabaseUrl, supabaseKey, {
      global: { headers: { Authorization: `Bearer ${accessToken}` } },
    });
    const { data, error } = await supabase
      .from('group_rooms')
      .select('*')
      .eq('group_id', groupId)
      .order('room_name', { ascending: true });
    if (error) throw error;
    return data;
  }

  // --- NEW --- Gets the user's saved education level
  static async getUserEducationLevel(userId: string, accessToken: string) {
    const supabase = createClient(supabaseUrl, supabaseKey, {
      global: { headers: { Authorization: `Bearer ${accessToken}` } },
    });
    const { data, error } = await supabase
      .from('user_education_level')
      .select('level')
      .eq('user_id', userId)
      .single();
    
    if (error) {
      if (error.code === 'PGRST116') return null; // No row found, which is fine
      throw error;
    }
    return data;
  }

  // --- MODIFIED --- Saves the user's education level choice (ONE-TIME ONLY)
  static async saveUserEducationLevel(userId: string, level: string, accessToken: string) {
    const supabase = createClient(supabaseUrl, supabaseKey, {
      global: { headers: { Authorization: `Bearer ${accessToken}` } },
    });

    // 1. Check if a level is already set
    const existingData = await this.getUserEducationLevel(userId, accessToken);
    if (existingData && existingData.level) {
      throw new Error("Education level is already set and cannot be changed.");
    }

    // 2. If not, insert it
    const { data, error } = await supabase
      .from('user_education_level')
      .insert({ user_id: userId, level: level }) // Use insert, not upsert
      .select()
      .single();
    if (error) throw error;
    return data;
  }

  // --- NEW --- Admin-only function to update a user's level
  static async updateUserEducationLevelAdmin(userId: string, level: string) {
  // This function uses the admin client to bypass RLS and checks
  const { data, error } = await supabaseAdmin
    .from('user_education_level')
    .upsert({ user_id: userId, level: level }, { onConflict: 'user_id' }) // Use upsert to create or update
    .select()
    .single();

  if (error) throw error;
  return data;
}

  // --- NEW --- Adds a read receipt for a message
  static async addReadReceipt(messageId: number, userId: string, accessToken: string) {
    const supabase = createClient(supabaseUrl, supabaseKey, {
      global: { headers: { Authorization: `Bearer ${accessToken}` } },
    });
    
    const { error } = await supabase
      .from('group_read_receipts')
      .upsert({ message_id: messageId, user_id: userId });

    if (error) throw error;
    return { success: true };
  }

  // --- NEW --- Adds or removes a reaction from a message
  static async addReaction(messageId: number, userId: string, emoji: string) {
    // 1. Get current reactions
    const { data: msg, error: fetchError } = await supabaseAdmin
      .from('group_messages')
      .select('reactions')
      .eq('id', messageId)
      .single();

    if (fetchError) throw fetchError;

    // 2. Modify the reactions object
    let reactions = (msg.reactions || {}) as { [key: string]: string[] }; 
    
    if (reactions[emoji]) {
      const userHasReacted = reactions[emoji].includes(userId);
      if (userHasReacted) {
        reactions[emoji] = reactions[emoji].filter((uid: string) => uid !== userId);
        if (reactions[emoji].length === 0) {
          delete reactions[emoji];
        }
      } else {
        reactions[emoji].push(userId);
      }
    } else {
      reactions[emoji] = [userId];
    }

    // 3. Update the message with new reactions
    const { data, error: updateError } = await supabaseAdmin
      .from('group_messages')
      .update({ reactions: reactions })
      .eq('id', messageId)
      .select('id, reactions') 
      .single();
    
    if (updateError) throw updateError;
    return data;
  }
}