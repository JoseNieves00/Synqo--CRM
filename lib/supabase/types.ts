export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type UserRole = 'admin' | 'supervisor' | 'agent';
export type PipelineStage = 'nuevo' | 'calificado' | 'cita_agendada' | 'ganado' | 'perdido';
export type MessageSender = 'lead' | 'ai' | 'agent_manual' | 'system';
export type ReminderStatus = 'pending' | 'sent' | 'cancelled';
export type SubscriptionStatus = 'active' | 'past_due' | 'canceled' | 'trialing';
export type PlanType = 'starter' | 'core' | 'pro' | 'enterprise';

export interface Database {
  public: {
    Tables: {
      organizations: {
        Row: {
          id: string;
          name: string;
          whatsapp_phone_number_id: string | null;
          whatsapp_access_token: string | null;
          cal_api_key: string | null;
          cal_event_type_id: string | null;
          system_prompt: string | null;
          stripe_customer_id: string | null;
          subscription_status: SubscriptionStatus;
          plan_type: PlanType;
          max_users: number;
          is_active: boolean;
          ai_tokens_used?: number;
          ai_tokens_limit?: number;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          name: string;
          whatsapp_phone_number_id?: string | null;
          whatsapp_access_token?: string | null;
          cal_api_key?: string | null;
          cal_event_type_id?: string | null;
          system_prompt?: string | null;
          stripe_customer_id?: string | null;
          subscription_status?: SubscriptionStatus;
          plan_type?: PlanType;
          max_users?: number;
          is_active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          name?: string;
          whatsapp_phone_number_id?: string | null;
          whatsapp_access_token?: string | null;
          cal_api_key?: string | null;
          cal_event_type_id?: string | null;
          system_prompt?: string | null;
          stripe_customer_id?: string | null;
          subscription_status?: SubscriptionStatus;
          plan_type?: PlanType;
          max_users?: number;
          is_active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      profiles: {
        Row: {
          id: string;
          organization_id: string;
          email: string;
          full_name: string;
          role: UserRole;
          is_super_admin: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id: string;
          organization_id: string;
          email: string;
          full_name: string;
          role?: UserRole;
          is_super_admin?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          organization_id?: string;
          email?: string;
          full_name?: string;
          role?: UserRole;
          is_super_admin?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      contacts: {
        Row: {
          id: string;
          organization_id: string;
          phone: string;
          name: string | null;
          pipeline_stage: PipelineStage;
          custom_fields: Json;
          is_ai_active: boolean;
          last_interaction_at: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          organization_id: string;
          phone: string;
          name?: string | null;
          pipeline_stage?: PipelineStage;
          custom_fields?: Json;
          is_ai_active?: boolean;
          last_interaction_at?: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          organization_id?: string;
          phone?: string;
          name?: string | null;
          pipeline_stage?: PipelineStage;
          custom_fields?: Json;
          is_ai_active?: boolean;
          last_interaction_at?: string;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      messages: {
        Row: {
          id: string;
          contact_id: string;
          sender_type: MessageSender;
          content: string;
          meta_message_id: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          contact_id: string;
          sender_type: MessageSender;
          content: string;
          meta_message_id?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          contact_id?: string;
          sender_type?: MessageSender;
          content?: string;
          meta_message_id?: string | null;
          created_at?: string;
        };
        Relationships: [];
      };
      scheduled_reminders: {
        Row: {
          id: string;
          contact_id: string;
          scheduled_for: string;
          reminder_type: string;
          status: ReminderStatus;
          created_at: string;
        };
        Insert: {
          id?: string;
          contact_id: string;
          scheduled_for: string;
          reminder_type: string;
          status?: ReminderStatus;
          created_at?: string;
        };
        Update: {
          id?: string;
          contact_id?: string;
          scheduled_for?: string;
          reminder_type?: string;
          status?: ReminderStatus;
          created_at?: string;
        };
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: {
      user_role: UserRole;
      pipeline_stage: PipelineStage;
      message_sender: MessageSender;
      reminder_status: ReminderStatus;
      subscription_status: SubscriptionStatus;
      plan_type: PlanType;
    };
    CompositeTypes: Record<string, never>;
  };
}
