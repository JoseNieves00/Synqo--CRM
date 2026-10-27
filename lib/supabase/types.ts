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

export type AvailabilityStatus = 'available' | 'busy' | 'offline';
export type TicketCategory = 'whatsapp' | 'ai_assistant' | 'calendar' | 'billing' | 'bug' | 'feature_request';
export type TicketPriority = 'low' | 'medium' | 'high' | 'critical';
export type TicketStatus = 'open' | 'in_progress' | 'resolved' | 'closed';

export interface Database {
  public: {
    Tables: {
      organizations: {
        Row: {
          id: string;
          name: string;
          whatsapp_phone_number_id: string | null;
          whatsapp_access_token: string | null;
          whatsapp_app_secret?: string | null;
          cal_api_key: string | null;
          cal_event_type_id: string | null;
          system_prompt: string | null;
          stripe_customer_id: string | null;
          subscription_status: SubscriptionStatus;
          plan_type: PlanType;
          max_users: number;
          is_active: boolean;
          cal_com_enabled?: boolean;
          paid_until_month?: string | null;
          billing_due_day?: number;
          past_due_since?: string | null;
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
          whatsapp_app_secret?: string | null;
          cal_api_key?: string | null;
          cal_event_type_id?: string | null;
          system_prompt?: string | null;
          stripe_customer_id?: string | null;
          subscription_status?: SubscriptionStatus;
          plan_type?: PlanType;
          max_users?: number;
          is_active?: boolean;
          cal_com_enabled?: boolean;
          paid_until_month?: string | null;
          billing_due_day?: number;
          past_due_since?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          name?: string;
          whatsapp_phone_number_id?: string | null;
          whatsapp_access_token?: string | null;
          whatsapp_app_secret?: string | null;
          cal_api_key?: string | null;
          cal_event_type_id?: string | null;
          system_prompt?: string | null;
          stripe_customer_id?: string | null;
          subscription_status?: SubscriptionStatus;
          plan_type?: PlanType;
          max_users?: number;
          is_active?: boolean;
          cal_com_enabled?: boolean;
          paid_until_month?: string | null;
          billing_due_day?: number;
          past_due_since?: string | null;
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
          last_seen_at?: string;
          availability_status?: AvailabilityStatus;
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
          last_seen_at?: string;
          availability_status?: AvailabilityStatus;
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
          last_seen_at?: string;
          availability_status?: AvailabilityStatus;
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
          assigned_to?: string | null;
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
          assigned_to?: string | null;
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
          assigned_to?: string | null;
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
      organization_payments: {
        Row: {
          id: string;
          organization_id: string;
          amount: number;
          currency: string;
          period_month: string;
          payment_method: string;
          notes: string | null;
          registered_by: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          organization_id: string;
          amount?: number;
          currency?: string;
          period_month: string;
          payment_method?: string;
          notes?: string | null;
          registered_by?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          organization_id?: string;
          amount?: number;
          currency?: string;
          period_month?: string;
          payment_method?: string;
          notes?: string | null;
          registered_by?: string | null;
          created_at?: string;
        };
        Relationships: [];
      };
      support_tickets: {
        Row: {
          id: string;
          organization_id: string;
          created_by: string | null;
          category: TicketCategory;
          priority: TicketPriority;
          status: TicketStatus;
          title: string;
          description: string;
          screenshot_url: string | null;
          github_issue_number: number | null;
          github_issue_url: string | null;
          system_metadata: Json;
          created_at: string;
          updated_at: string;
          resolved_at: string | null;
        };
        Insert: {
          id?: string;
          organization_id: string;
          created_by?: string | null;
          category: TicketCategory;
          priority?: TicketPriority;
          status?: TicketStatus;
          title: string;
          description: string;
          screenshot_url?: string | null;
          github_issue_number?: number | null;
          github_issue_url?: string | null;
          system_metadata?: Json;
          created_at?: string;
          updated_at?: string;
          resolved_at?: string | null;
        };
        Update: {
          id?: string;
          organization_id?: string;
          created_by?: string | null;
          category?: TicketCategory;
          priority?: TicketPriority;
          status?: TicketStatus;
          title?: string;
          description?: string;
          screenshot_url?: string | null;
          github_issue_number?: number | null;
          github_issue_url?: string | null;
          system_metadata?: Json;
          created_at?: string;
          updated_at?: string;
          resolved_at?: string | null;
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
