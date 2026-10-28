export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type UserRole = 'admin' | 'supervisor' | 'agent' | 'receptionist';
export type PipelineStage = 'nuevo' | 'calificado' | 'cita_agendada' | 'ganado' | 'perdido';
export type MessageSender = 'lead' | 'ai' | 'agent_manual' | 'system';
export type ReminderStatus = 'pending' | 'sent' | 'cancelled';
export type SubscriptionStatus = 'active' | 'past_due' | 'canceled' | 'trialing';
export type PlanType = 'starter' | 'core' | 'pro' | 'enterprise';

export type AvailabilityStatus = 'available' | 'busy' | 'offline';
export type TicketCategory = 'whatsapp' | 'ai_assistant' | 'calendar' | 'billing' | 'bug' | 'feature_request';
export type TicketPriority = 'low' | 'medium' | 'high' | 'critical';
export type TicketStatus = 'open' | 'in_progress' | 'resolved' | 'closed';

export type HandoffMode = 'silent' | 'message';
export type IndustryPreset =
  | 'services'
  | 'ecommerce'
  | 'health'
  | 'real_estate'
  | 'gastronomy';
export type KnowledgeGapStatus = 'pending' | 'resolved' | 'dismissed';

export type AppointmentStatus =
  | 'pending'
  | 'confirmed'
  | 'in_progress'
  | 'completed'
  | 'cancelled'
  | 'no_show';
export type BookedVia = 'ai_whatsapp' | 'manual_reception' | 'walk_in' | 'client_portal';
export type AppointmentConfirmationStatus = 'unconfirmed' | 'confirmed' | 'expired';
export type PaymentStatus = 'pending' | 'paid' | 'not_applicable';
export type InternalChatSenderType = 'admin' | 'receptionist' | 'specialist';

export interface EnabledModules {
  native_calendar: boolean;
  physical_rooms: boolean;
  staff_mobile_portal: boolean;
  quick_pay: boolean;
  anti_no_show: boolean;
  ad_attribution?: boolean;
}

export interface AppointmentSettings {
  arrival_tolerance_minutes: number;
  confirmation_window_hours: number;
  max_night_hour: string;
  max_reschedules: number;
  slot_interval_minutes: number;
  buffer_minutes: number;
}

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
          handoff_mode?: HandoffMode;
          after_hours_message?: string | null;
          business_hours?: Json;
          industry_preset?: IndustryPreset;
          structured_prompt_data?: Json;
          company_code?: string | null;
          enabled_modules?: Json;
          appointment_settings?: Json;
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
          handoff_mode?: HandoffMode;
          after_hours_message?: string | null;
          business_hours?: Json;
          industry_preset?: IndustryPreset;
          structured_prompt_data?: Json;
          company_code?: string | null;
          enabled_modules?: Json;
          appointment_settings?: Json;
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
          handoff_mode?: HandoffMode;
          after_hours_message?: string | null;
          business_hours?: Json;
          industry_preset?: IndustryPreset;
          structured_prompt_data?: Json;
          company_code?: string | null;
          enabled_modules?: Json;
          appointment_settings?: Json;
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
      ai_knowledge_gaps: {
        Row: {
          id: string;
          organization_id: string;
          contact_id: string | null;
          question_text: string;
          ai_category: string | null;
          reason: string | null;
          occurrences: number;
          status: KnowledgeGapStatus;
          suggested_answer: string | null;
          resolved_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          organization_id: string;
          contact_id?: string | null;
          question_text: string;
          ai_category?: string | null;
          reason?: string | null;
          occurrences?: number;
          status?: KnowledgeGapStatus;
          suggested_answer?: string | null;
          resolved_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          organization_id?: string;
          contact_id?: string | null;
          question_text?: string;
          ai_category?: string | null;
          reason?: string | null;
          occurrences?: number;
          status?: KnowledgeGapStatus;
          suggested_answer?: string | null;
          resolved_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      services_catalog: {
        Row: {
          id: string;
          organization_id: string;
          name: string;
          description: string | null;
          duration_minutes: number;
          price: number;
          category: string | null;
          is_group: boolean;
          max_group_capacity: number;
          requires_room: boolean;
          is_active: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          organization_id: string;
          name: string;
          description?: string | null;
          duration_minutes?: number;
          price?: number;
          category?: string | null;
          is_group?: boolean;
          max_group_capacity?: number;
          requires_room?: boolean;
          is_active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          organization_id?: string;
          name?: string;
          description?: string | null;
          duration_minutes?: number;
          price?: number;
          category?: string | null;
          is_group?: boolean;
          max_group_capacity?: number;
          requires_room?: boolean;
          is_active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      physical_rooms: {
        Row: {
          id: string;
          organization_id: string;
          name: string;
          capacity: number;
          description: string | null;
          is_active: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          organization_id: string;
          name: string;
          capacity?: number;
          description?: string | null;
          is_active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          organization_id?: string;
          name?: string;
          capacity?: number;
          description?: string | null;
          is_active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      specialists: {
        Row: {
          id: string;
          organization_id: string;
          name: string;
          phone: string | null;
          specialty: string | null;
          services_offered: string[];
          weekly_schedule: Json;
          access_pin: string;
          password_hash?: string | null;
          approval_status: 'pending' | 'approved' | 'rejected';
          is_active: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          organization_id: string;
          name: string;
          phone?: string | null;
          specialty?: string | null;
          services_offered?: string[];
          weekly_schedule?: Json;
          access_pin?: string;
          password_hash?: string | null;
          approval_status?: 'pending' | 'approved' | 'rejected';
          is_active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          organization_id?: string;
          name?: string;
          phone?: string | null;
          specialty?: string | null;
          services_offered?: string[];
          weekly_schedule?: Json;
          access_pin?: string;
          password_hash?: string | null;
          approval_status?: 'pending' | 'approved' | 'rejected';
          is_active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      specialist_unavailability: {
        Row: {
          id: string;
          organization_id: string;
          specialist_id: string;
          start_time: string;
          end_time: string;
          reason: string | null;
          is_all_day: boolean;
          created_at: string;
        };
        Insert: {
          id?: string;
          organization_id: string;
          specialist_id: string;
          start_time: string;
          end_time: string;
          reason?: string | null;
          is_all_day?: boolean;
          created_at?: string;
        };
        Update: {
          id?: string;
          organization_id?: string;
          specialist_id?: string;
          start_time?: string;
          end_time?: string;
          reason?: string | null;
          is_all_day?: boolean;
          created_at?: string;
        };
        Relationships: [];
      };
      appointments: {
        Row: {
          id: string;
          organization_id: string;
          contact_id: string | null;
          specialist_id: string | null;
          room_id: string | null;
          service_id: string | null;
          service_name: string;
          duration_minutes: number;
          start_time: string;
          end_time: string;
          status: AppointmentStatus;
          booked_via: BookedVia;
          reschedule_count: number;
          notes: string | null;
          client_notified_delay_at: string | null;
          reminder_sent_at: string | null;
          confirmation_status: AppointmentConfirmationStatus;
          payment_status: PaymentStatus;
          payment_method: string | null;
          amount_paid: number;
          package_session_info: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          organization_id: string;
          contact_id?: string | null;
          specialist_id?: string | null;
          room_id?: string | null;
          service_id?: string | null;
          service_name: string;
          duration_minutes?: number;
          start_time: string;
          end_time: string;
          status?: AppointmentStatus;
          booked_via?: BookedVia;
          reschedule_count?: number;
          notes?: string | null;
          client_notified_delay_at?: string | null;
          reminder_sent_at?: string | null;
          confirmation_status?: AppointmentConfirmationStatus;
          payment_status?: PaymentStatus;
          payment_method?: string | null;
          amount_paid?: number;
          package_session_info?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          organization_id?: string;
          contact_id?: string | null;
          specialist_id?: string | null;
          room_id?: string | null;
          service_id?: string | null;
          service_name?: string;
          duration_minutes?: number;
          start_time?: string;
          end_time?: string;
          status?: AppointmentStatus;
          booked_via?: BookedVia;
          reschedule_count?: number;
          notes?: string | null;
          client_notified_delay_at?: string | null;
          reminder_sent_at?: string | null;
          confirmation_status?: AppointmentConfirmationStatus;
          payment_status?: PaymentStatus;
          payment_method?: string | null;
          amount_paid?: number;
          package_session_info?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      internal_chat_messages: {
        Row: {
          id: string;
          organization_id: string;
          specialist_id: string;
          sender_type: InternalChatSenderType;
          sender_name: string | null;
          content: string;
          read_at: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          organization_id: string;
          specialist_id: string;
          sender_type: InternalChatSenderType;
          sender_name?: string | null;
          content: string;
          read_at?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          organization_id?: string;
          specialist_id?: string;
          sender_type?: InternalChatSenderType;
          sender_name?: string | null;
          content?: string;
          read_at?: string | null;
          created_at?: string;
        };
        Relationships: [];
      };
      staff_invitations: {
        Row: {
          id: string;
          organization_id: string;
          token_hash: string;
          expires_at: string;
          is_used: boolean;
          used_by_specialist_id: string | null;
          created_by: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          organization_id: string;
          token_hash: string;
          expires_at: string;
          is_used?: boolean;
          used_by_specialist_id?: string | null;
          created_by?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          organization_id?: string;
          token_hash?: string;
          expires_at?: string;
          is_used?: boolean;
          used_by_specialist_id?: string | null;
          created_by?: string | null;
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
