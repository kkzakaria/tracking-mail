/**
 * Types TypeScript générés pour Supabase
 * À régénérer avec : supabase gen types typescript --local > lib/types/supabase.ts
 */

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  public: {
    Tables: {
      mailboxes: {
        Row: {
          configuration: Json
          created_at: string
          description: string | null
          display_name: string | null
          email_address: string
          id: string
          is_active: boolean
          last_sync_at: string | null
          mailbox_type: string
          sync_enabled: boolean
          sync_error: string | null
          sync_status: string
          updated_at: string
        }
        Insert: {
          configuration?: Json
          created_at?: string
          description?: string | null
          display_name?: string | null
          email_address: string
          id?: string
          is_active?: boolean
          last_sync_at?: string | null
          mailbox_type?: string
          sync_enabled?: boolean
          sync_error?: string | null
          sync_status?: string
          updated_at?: string
        }
        Update: {
          configuration?: Json
          created_at?: string
          description?: string | null
          display_name?: string | null
          email_address?: string
          id?: string
          is_active?: boolean
          last_sync_at?: string | null
          mailbox_type?: string
          sync_enabled?: boolean
          sync_error?: string | null
          sync_status?: string
          updated_at?: string
        }
        Relationships: []
      }
      microsoft_graph_config: {
        Row: {
          client_id: string
          client_secret_encrypted: string
          configuration_status: string
          configured_at: string | null
          configured_by: string | null
          created_at: string
          error_message: string | null
          id: string
          is_active: boolean
          last_token_refresh: string | null
          permissions_granted: Json
          rate_limit_info: Json
          tenant_id: string
          token_expires_at: string | null
          updated_at: string
        }
        Insert: {
          client_id: string
          client_secret_encrypted: string
          configuration_status?: string
          configured_at?: string | null
          configured_by?: string | null
          created_at?: string
          error_message?: string | null
          id?: string
          is_active?: boolean
          last_token_refresh?: string | null
          permissions_granted?: Json
          rate_limit_info?: Json
          tenant_id: string
          token_expires_at?: string | null
          updated_at?: string
        }
        Update: {
          client_id?: string
          client_secret_encrypted?: string
          configuration_status?: string
          configured_at?: string | null
          configured_by?: string | null
          created_at?: string
          error_message?: string | null
          id?: string
          is_active?: boolean
          last_token_refresh?: string | null
          permissions_granted?: Json
          rate_limit_info?: Json
          tenant_id?: string
          token_expires_at?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "microsoft_graph_config_configured_by_fkey"
            columns: ["configured_by"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      user_activity_logs: {
        Row: {
          activity_description: string | null
          activity_type: string
          created_at: string
          id: string
          ip_address: unknown | null
          metadata: Json
          resource_id: string | null
          resource_type: string | null
          session_id: string | null
          user_agent: string | null
          user_id: string | null
        }
        Insert: {
          activity_description?: string | null
          activity_type: string
          created_at?: string
          id?: string
          ip_address?: unknown | null
          metadata?: Json
          resource_id?: string | null
          resource_type?: string | null
          session_id?: string | null
          user_agent?: string | null
          user_id?: string | null
        }
        Update: {
          activity_description?: string | null
          activity_type?: string
          created_at?: string
          id?: string
          ip_address?: unknown | null
          metadata?: Json
          resource_id?: string | null
          resource_type?: string | null
          session_id?: string | null
          user_agent?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "user_activity_logs_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_activity_logs_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "user_stats"
            referencedColumns: ["id"]
          },
        ]
      }
      user_mailbox_assignments: {
        Row: {
          assigned_at: string
          assigned_by: string | null
          created_at: string
          expires_at: string | null
          id: string
          is_active: boolean
          mailbox_id: string
          notes: string | null
          permission_level: string
          updated_at: string
          user_id: string
        }
        Insert: {
          assigned_at?: string
          assigned_by?: string | null
          created_at?: string
          expires_at?: string | null
          id?: string
          is_active?: boolean
          mailbox_id: string
          notes?: string | null
          permission_level?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          assigned_at?: string
          assigned_by?: string | null
          created_at?: string
          expires_at?: string | null
          id?: string
          is_active?: boolean
          mailbox_id?: string
          notes?: string | null
          permission_level?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_mailbox_assignments_assigned_by_fkey"
            columns: ["assigned_by"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_mailbox_assignments_assigned_by_fkey"
            columns: ["assigned_by"]
            isOneToOne: false
            referencedRelation: "user_stats"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_mailbox_assignments_mailbox_id_fkey"
            columns: ["mailbox_id"]
            isOneToOne: false
            referencedRelation: "mailboxes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_mailbox_assignments_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_mailbox_assignments_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "user_stats"
            referencedColumns: ["id"]
          },
        ]
      }
      user_profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          display_name: string | null
          email: string
          full_name: string | null
          id: string
          is_active: boolean
          preferences: Json
          role: string
          updated_at: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          display_name?: string | null
          email: string
          full_name?: string | null
          id: string
          is_active?: boolean
          preferences?: Json
          role?: string
          updated_at?: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          display_name?: string | null
          email?: string
          full_name?: string | null
          id?: string
          is_active?: boolean
          preferences?: Json
          role?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_profiles_id_fkey"
            columns: ["id"]
            isOneToOne: true
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      active_user_assignments: {
        Row: {
          assigned_at: string | null
          expires_at: string | null
          id: string | null
          mailbox_email: string | null
          mailbox_id: string | null
          mailbox_name: string | null
          notes: string | null
          permission_level: string | null
          user_email: string | null
          user_id: string | null
          user_name: string | null
        }
        Relationships: [
          {
            foreignKeyName: "user_mailbox_assignments_assigned_by_fkey"
            columns: ["assigned_by"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_mailbox_assignments_assigned_by_fkey"
            columns: ["assigned_by"]
            isOneToOne: false
            referencedRelation: "user_stats"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_mailbox_assignments_mailbox_id_fkey"
            columns: ["mailbox_id"]
            isOneToOne: false
            referencedRelation: "mailboxes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_mailbox_assignments_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_mailbox_assignments_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "user_stats"
            referencedColumns: ["id"]
          },
        ]
      }
      user_stats: {
        Row: {
          assigned_mailboxes_count: number | null
          created_at: string | null
          email: string | null
          full_name: string | null
          id: string | null
          role: string | null
          user_since: string | null
          write_permissions_count: number | null
        }
        Relationships: [
          {
            foreignKeyName: "user_profiles_id_fkey"
            columns: ["id"]
            isOneToOne: true
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      cleanup_expired_assignments: {
        Args: Record<PropertyKey, never>
        Returns: number
      }
      cleanup_old_activity_logs: {
        Args: {
          days_to_keep?: number
        }
        Returns: number
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

// Types d'utilité pour les tables
export type Tables<T extends keyof Database['public']['Tables']> = Database['public']['Tables'][T]['Row']
export type TablesInsert<T extends keyof Database['public']['Tables']> = Database['public']['Tables'][T]['Insert']
export type TablesUpdate<T extends keyof Database['public']['Tables']> = Database['public']['Tables'][T]['Update']

// Types spécifiques pour les entités principales
export type UserProfile = Tables<'user_profiles'>
export type Mailbox = Tables<'mailboxes'>
export type UserMailboxAssignment = Tables<'user_mailbox_assignments'>
export type MicrosoftGraphConfig = Tables<'microsoft_graph_config'>
export type UserActivityLog = Tables<'user_activity_logs'>

// Types pour les vues
export type ActiveUserAssignment = Database['public']['Views']['active_user_assignments']['Row']
export type UserStats = Database['public']['Views']['user_stats']['Row']

// Types pour les enums (rôles, statuts, etc.)
export type UserRole = 'user' | 'admin' | 'manager'
export type PermissionLevel = 'read' | 'read_write' | 'admin'
export type MailboxType = 'user' | 'shared' | 'group'
export type SyncStatus = 'pending' | 'syncing' | 'completed' | 'error'
export type ConfigurationStatus = 'pending' | 'configured' | 'error' | 'disabled'
export type ActivityType =
  | 'login'
  | 'logout'
  | 'mailbox_access'
  | 'email_read'
  | 'email_send'
  | 'assignment_changed'
  | 'profile_updated'
  | 'admin_action'