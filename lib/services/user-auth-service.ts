/**
 * Service d'authentification utilisateur Supabase
 * Séparé de Microsoft Graph - gère uniquement l'auth des utilisateurs finaux
 * Utilise @supabase/ssr (nouvelle approche recommandée)
 */

import { createBrowserClient, createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import type { Database } from '@/lib/types/supabase';

// Types pour le service d'authentification
export interface UserProfile {
  id: string;
  email: string;
  full_name?: string;
  display_name?: string;
  avatar_url?: string;
  role: 'user' | 'admin' | 'manager';
  is_active: boolean;
  preferences: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface UserSession {
  user: UserProfile;
  session: {
    access_token: string;
    refresh_token: string;
    expires_at: number;
    user_id: string;
  };
}

export interface AuthError {
  code: string;
  message: string;
  details?: Record<string, unknown>;
}

export interface LoginCredentials {
  email: string;
  password: string;
}

export interface SignupCredentials {
  email: string;
  password: string;
  full_name?: string;
  display_name?: string;
}

export interface AuthResult {
  success: boolean;
  user?: UserProfile;
  session?: UserSession['session'];
  error?: AuthError;
}

/**
 * Service d'authentification utilisateur utilisant Supabase Auth
 * Complètement séparé de Microsoft Graph
 */
export class UserAuthService {
  private static instance: UserAuthService;

  private constructor() {}

  static getInstance(): UserAuthService {
    if (!UserAuthService.instance) {
      UserAuthService.instance = new UserAuthService();
    }
    return UserAuthService.instance;
  }

  /**
   * Créer un client Supabase côté client (navigateur)
   */
  createBrowserClient() {
    return createBrowserClient<Database>(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    );
  }

  /**
   * Créer un client Supabase côté serveur
   */
  async createServerClient() {
    const cookieStore = await cookies();

    return createServerClient<Database>(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll() {
            return cookieStore.getAll();
          },
          setAll(cookiesToSet) {
            try {
              cookiesToSet.forEach(({ name, value, options }) =>
                cookieStore.set(name, value, options)
              );
            } catch {
              // The `setAll` method was called from a Server Component.
              // This can be ignored if you have middleware refreshing
              // user sessions.
            }
          },
        },
      }
    );
  }

  /**
   * Connexion avec email/password
   */
  async signIn(credentials: LoginCredentials): Promise<AuthResult> {
    try {
      const supabase = this.createBrowserClient();

      const { data, error } = await supabase.auth.signInWithPassword({
        email: credentials.email,
        password: credentials.password
      });

      if (error) {
        return {
          success: false,
          error: {
            code: error.name || 'SignInError',
            message: error.message,
            details: error
          }
        };
      }

      if (!data.user || !data.session) {
        return {
          success: false,
          error: {
            code: 'NoUserData',
            message: 'No user data returned from authentication'
          }
        };
      }

      // Récupérer le profil utilisateur étendu
      const profile = await this.getUserProfile(data.user.id);

      if (!profile) {
        return {
          success: false,
          error: {
            code: 'NoProfile',
            message: 'User profile not found'
          }
        };
      }

      // Logger l'activité de connexion
      await this.logActivity(profile.id, 'login', 'User signed in successfully');

      return {
        success: true,
        user: profile,
        session: {
          access_token: data.session.access_token,
          refresh_token: data.session.refresh_token,
          expires_at: data.session.expires_at || 0,
          user_id: data.user.id
        }
      };

    } catch (error) {
      console.error('Error during sign in:', error);
      return {
        success: false,
        error: {
          code: 'UnexpectedError',
          message: 'An unexpected error occurred during sign in',
          details: error
        }
      };
    }
  }

  /**
   * Inscription avec email/password
   */
  async signUp(credentials: SignupCredentials): Promise<AuthResult> {
    try {
      const supabase = this.createBrowserClient();

      const { data, error } = await supabase.auth.signUp({
        email: credentials.email,
        password: credentials.password,
        options: {
          data: {
            full_name: credentials.full_name,
            display_name: credentials.display_name || credentials.full_name || credentials.email.split('@')[0]
          }
        }
      });

      if (error) {
        return {
          success: false,
          error: {
            code: error.name || 'SignUpError',
            message: error.message,
            details: error
          }
        };
      }

      if (!data.user) {
        return {
          success: false,
          error: {
            code: 'NoUserData',
            message: 'No user data returned from registration'
          }
        };
      }

      // Le profil sera créé automatiquement par le trigger handle_new_user
      // Attendre un moment pour que le trigger s'exécute
      await new Promise(resolve => setTimeout(resolve, 1000));

      const profile = await this.getUserProfile(data.user.id);

      return {
        success: true,
        user: profile || {
          id: data.user.id,
          email: credentials.email,
          full_name: credentials.full_name,
          display_name: credentials.display_name,
          role: 'user',
          is_active: true,
          preferences: {},
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        },
        session: data.session ? {
          access_token: data.session.access_token,
          refresh_token: data.session.refresh_token,
          expires_at: data.session.expires_at || 0,
          user_id: data.user.id
        } : undefined
      };

    } catch (error) {
      console.error('Error during sign up:', error);
      return {
        success: false,
        error: {
          code: 'UnexpectedError',
          message: 'An unexpected error occurred during sign up',
          details: error
        }
      };
    }
  }

  /**
   * Déconnexion
   */
  async signOut(userId?: string): Promise<AuthResult> {
    try {
      const supabase = this.createBrowserClient();

      // Logger l'activité de déconnexion avant de se déconnecter
      if (userId) {
        await this.logActivity(userId, 'logout', 'User signed out');
      }

      const { error } = await supabase.auth.signOut();

      if (error) {
        return {
          success: false,
          error: {
            code: error.name || 'SignOutError',
            message: error.message,
            details: error
          }
        };
      }

      return {
        success: true
      };

    } catch (error) {
      console.error('Error during sign out:', error);
      return {
        success: false,
        error: {
          code: 'UnexpectedError',
          message: 'An unexpected error occurred during sign out',
          details: error
        }
      };
    }
  }

  /**
   * Obtenir la session utilisateur actuelle
   */
  async getCurrentSession(): Promise<{ session: UserSession | null; error?: AuthError }> {
    try {
      const supabase = this.createBrowserClient();

      const { data, error } = await supabase.auth.getSession();

      if (error) {
        return {
          session: null,
          error: {
            code: error.name || 'SessionError',
            message: error.message,
            details: error
          }
        };
      }

      if (!data.session || !data.session.user) {
        return { session: null };
      }

      const profile = await this.getUserProfile(data.session.user.id);

      if (!profile) {
        return {
          session: null,
          error: {
            code: 'NoProfile',
            message: 'User profile not found'
          }
        };
      }

      return {
        session: {
          user: profile,
          session: {
            access_token: data.session.access_token,
            refresh_token: data.session.refresh_token,
            expires_at: data.session.expires_at || 0,
            user_id: data.session.user.id
          }
        }
      };

    } catch (error) {
      console.error('Error getting current session:', error);
      return {
        session: null,
        error: {
          code: 'UnexpectedError',
          message: 'An unexpected error occurred while getting session',
          details: error
        }
      };
    }
  }

  /**
   * Obtenir le profil utilisateur par ID
   */
  async getUserProfile(userId: string): Promise<UserProfile | null> {
    try {
      const supabase = this.createBrowserClient();

      const { data, error } = await supabase
        .from('user_profiles')
        .select('*')
        .eq('id', userId)
        .eq('is_active', true)
        .single();

      if (error || !data) {
        console.error('Error fetching user profile:', error);
        return null;
      }

      return data as UserProfile;

    } catch (error) {
      console.error('Error getting user profile:', error);
      return null;
    }
  }

  /**
   * Mettre à jour le profil utilisateur
   */
  async updateUserProfile(userId: string, updates: Partial<UserProfile>): Promise<AuthResult> {
    try {
      const supabase = this.createBrowserClient();

      const { data, error } = await supabase
        .from('user_profiles')
        .update({
          ...updates,
          updated_at: new Date().toISOString()
        })
        .eq('id', userId)
        .select()
        .single();

      if (error) {
        return {
          success: false,
          error: {
            code: 'UpdateError',
            message: error.message,
            details: error
          }
        };
      }

      // Logger l'activité de mise à jour
      await this.logActivity(userId, 'profile_updated', 'User profile updated');

      return {
        success: true,
        user: data as UserProfile
      };

    } catch (error) {
      console.error('Error updating user profile:', error);
      return {
        success: false,
        error: {
          code: 'UnexpectedError',
          message: 'An unexpected error occurred while updating profile',
          details: error
        }
      };
    }
  }

  /**
   * Vérifier si l'utilisateur est admin
   */
  async isAdmin(userId: string): Promise<boolean> {
    try {
      const profile = await this.getUserProfile(userId);
      return profile?.role === 'admin' || false;
    } catch {
      return false;
    }
  }

  /**
   * Obtenir les boîtes emails assignées à un utilisateur
   */
  async getUserAssignedMailboxes(userId: string) {
    try {
      const supabase = this.createBrowserClient();

      const { data, error } = await supabase
        .from('user_mailbox_assignments')
        .select(`
          id,
          permission_level,
          assigned_at,
          expires_at,
          notes,
          mailboxes (
            id,
            email_address,
            display_name,
            description,
            mailbox_type,
            is_active,
            sync_enabled,
            last_sync_at,
            sync_status
          )
        `)
        .eq('user_id', userId)
        .eq('is_active', true)
        .order('assigned_at', { ascending: false });

      if (error) {
        throw error;
      }

      return { data: data || [], error: null };

    } catch (error) {
      console.error('Error getting user assigned mailboxes:', error);
      return {
        data: [],
        error: {
          code: 'FetchError',
          message: 'Failed to fetch assigned mailboxes',
          details: error
        }
      };
    }
  }

  /**
   * Logger une activité utilisateur
   */
  async logActivity(
    userId: string,
    activityType: string,
    description: string,
    metadata?: Record<string, unknown>
  ): Promise<void> {
    try {
      const supabase = this.createBrowserClient();

      await supabase
        .from('user_activity_logs')
        .insert({
          user_id: userId,
          activity_type: activityType,
          activity_description: description,
          metadata: metadata || {},
          created_at: new Date().toISOString()
        });

    } catch (error) {
      // Log silently - don't throw errors for logging failures
      console.warn('Failed to log user activity:', error);
    }
  }

  /**
   * Réinitialiser le mot de passe
   */
  async resetPassword(email: string): Promise<AuthResult> {
    try {
      const supabase = this.createBrowserClient();

      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${process.env.NEXT_PUBLIC_APP_URL}/auth/reset-password`
      });

      if (error) {
        return {
          success: false,
          error: {
            code: error.name || 'ResetPasswordError',
            message: error.message,
            details: error
          }
        };
      }

      return { success: true };

    } catch (error) {
      console.error('Error during password reset:', error);
      return {
        success: false,
        error: {
          code: 'UnexpectedError',
          message: 'An unexpected error occurred during password reset',
          details: error
        }
      };
    }
  }

  /**
   * Confirmer la réinitialisation du mot de passe
   */
  async confirmPasswordReset(accessToken: string, refreshToken: string, newPassword: string): Promise<AuthResult> {
    try {
      const supabase = this.createBrowserClient();

      const { data, error } = await supabase.auth.setSession({
        access_token: accessToken,
        refresh_token: refreshToken
      });

      if (error) {
        return {
          success: false,
          error: {
            code: error.name || 'SessionError',
            message: error.message,
            details: error
          }
        };
      }

      const { error: updateError } = await supabase.auth.updateUser({
        password: newPassword
      });

      if (updateError) {
        return {
          success: false,
          error: {
            code: updateError.name || 'UpdatePasswordError',
            message: updateError.message,
            details: updateError
          }
        };
      }

      return { success: true };

    } catch (error) {
      console.error('Error confirming password reset:', error);
      return {
        success: false,
        error: {
          code: 'UnexpectedError',
          message: 'An unexpected error occurred during password confirmation',
          details: error
        }
      };
    }
  }
}