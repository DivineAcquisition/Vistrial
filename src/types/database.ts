/**
 * Supabase types for the Case File spine.
 * Regenerate after `supabase db push`:
 *   npx supabase gen types typescript --linked --schema public > src/types/database.ts
 */
export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type Database = {
  public: {
    Tables: {
      call_extractions: {
        Row: {
          budget_signal: string | null;
          call_id: string;
          created_at: string;
          decision_process: string | null;
          extracted_at: string;
          id: string;
          model_version: string | null;
          next_step_agreed: string | null;
          org_id: string;
          quotes: Json;
          stated_objection: string | null;
          summary: string | null;
          timeline_signal: string | null;
        };
        Insert: {
          budget_signal?: string | null;
          call_id: string;
          created_at?: string;
          decision_process?: string | null;
          extracted_at?: string;
          id?: string;
          model_version?: string | null;
          next_step_agreed?: string | null;
          org_id: string;
          quotes?: Json;
          stated_objection?: string | null;
          summary?: string | null;
          timeline_signal?: string | null;
        };
        Update: {
          budget_signal?: string | null;
          call_id?: string;
          created_at?: string;
          decision_process?: string | null;
          extracted_at?: string;
          id?: string;
          model_version?: string | null;
          next_step_agreed?: string | null;
          org_id?: string;
          quotes?: Json;
          stated_objection?: string | null;
          summary?: string | null;
          timeline_signal?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "call_extractions_call_org_fkey";
            columns: ["call_id", "org_id"];
            isOneToOne: true;
            referencedRelation: "calls";
            referencedColumns: ["id", "org_id"];
          },
        ];
      };
      calls: {
        Row: {
          created_at: string;
          duration_seconds: number | null;
          id: string;
          lead_id: string;
          occurred_at: string | null;
          org_id: string;
          outcome: Database["public"]["Enums"]["call_outcome"] | null;
          ran_by_member_id: string | null;
          raw_transcript: string | null;
          recording_url: string | null;
          scheduled_at: string | null;
          transcript_arrived_at: string | null;
          transcript_source:
            | Database["public"]["Enums"]["transcript_source"]
            | null;
          type: Database["public"]["Enums"]["call_type"];
          updated_at: string;
        };
        Insert: {
          created_at?: string;
          duration_seconds?: number | null;
          id?: string;
          lead_id: string;
          occurred_at?: string | null;
          org_id: string;
          outcome?: Database["public"]["Enums"]["call_outcome"] | null;
          ran_by_member_id?: string | null;
          raw_transcript?: string | null;
          recording_url?: string | null;
          scheduled_at?: string | null;
          transcript_arrived_at?: string | null;
          transcript_source?:
            | Database["public"]["Enums"]["transcript_source"]
            | null;
          type: Database["public"]["Enums"]["call_type"];
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          duration_seconds?: number | null;
          id?: string;
          lead_id?: string;
          occurred_at?: string | null;
          org_id?: string;
          outcome?: Database["public"]["Enums"]["call_outcome"] | null;
          ran_by_member_id?: string | null;
          raw_transcript?: string | null;
          recording_url?: string | null;
          scheduled_at?: string | null;
          transcript_arrived_at?: string | null;
          transcript_source?:
            | Database["public"]["Enums"]["transcript_source"]
            | null;
          type?: Database["public"]["Enums"]["call_type"];
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "calls_lead_org_fkey";
            columns: ["lead_id", "org_id"];
            isOneToOne: false;
            referencedRelation: "leads";
            referencedColumns: ["id", "org_id"];
          },
        ];
      };
      leads: {
        Row: {
          ad_id: string | null;
          application_answers: Json;
          assigned_closer_id: string | null;
          assigned_setter_id: string | null;
          campaign: string | null;
          created_at: string;
          current_score: number | null;
          email: string | null;
          first_human_touch_at: string | null;
          first_name: string | null;
          ghl_contact_id: string | null;
          ghl_opportunity_id: string | null;
          id: string;
          last_name: string | null;
          last_touch_at: string | null;
          lead_type: Database["public"]["Enums"]["lead_type"] | null;
          offer_name: string | null;
          opted_in_at: string;
          org_id: string;
          phone: string | null;
          pipeline_stage: string | null;
          source: string | null;
          status: Database["public"]["Enums"]["lead_status"];
          updated_at: string;
        };
        Insert: {
          ad_id?: string | null;
          application_answers?: Json;
          assigned_closer_id?: string | null;
          assigned_setter_id?: string | null;
          campaign?: string | null;
          created_at?: string;
          current_score?: number | null;
          email?: string | null;
          first_human_touch_at?: string | null;
          first_name?: string | null;
          ghl_contact_id?: string | null;
          ghl_opportunity_id?: string | null;
          id?: string;
          last_name?: string | null;
          last_touch_at?: string | null;
          lead_type?: Database["public"]["Enums"]["lead_type"] | null;
          offer_name?: string | null;
          opted_in_at?: string;
          org_id: string;
          phone?: string | null;
          pipeline_stage?: string | null;
          source?: string | null;
          status?: Database["public"]["Enums"]["lead_status"];
          updated_at?: string;
        };
        Update: {
          ad_id?: string | null;
          application_answers?: Json;
          assigned_closer_id?: string | null;
          assigned_setter_id?: string | null;
          campaign?: string | null;
          created_at?: string;
          current_score?: number | null;
          email?: string | null;
          first_human_touch_at?: string | null;
          first_name?: string | null;
          ghl_contact_id?: string | null;
          ghl_opportunity_id?: string | null;
          id?: string;
          last_name?: string | null;
          last_touch_at?: string | null;
          lead_type?: Database["public"]["Enums"]["lead_type"] | null;
          offer_name?: string | null;
          opted_in_at?: string;
          org_id?: string;
          phone?: string | null;
          pipeline_stage?: string | null;
          source?: string | null;
          status?: Database["public"]["Enums"]["lead_status"];
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "leads_org_id_fkey";
            columns: ["org_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
        ];
      };
      next_actions: {
        Row: {
          action_text: string;
          completed_at: string | null;
          created_at: string;
          created_by: Database["public"]["Enums"]["action_creator"];
          due_at: string | null;
          id: string;
          lead_id: string;
          org_id: string;
          owner_member_id: string | null;
        };
        Insert: {
          action_text: string;
          completed_at?: string | null;
          created_at?: string;
          created_by: Database["public"]["Enums"]["action_creator"];
          due_at?: string | null;
          id?: string;
          lead_id: string;
          org_id: string;
          owner_member_id?: string | null;
        };
        Update: {
          action_text?: string;
          completed_at?: string | null;
          created_at?: string;
          created_by?: Database["public"]["Enums"]["action_creator"];
          due_at?: string | null;
          id?: string;
          lead_id?: string;
          org_id?: string;
          owner_member_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "next_actions_lead_org_fkey";
            columns: ["lead_id", "org_id"];
            isOneToOne: false;
            referencedRelation: "leads";
            referencedColumns: ["id", "org_id"];
          },
        ];
      };
      objections: {
        Row: {
          call_id: string | null;
          created_at: string;
          id: string;
          lead_id: string;
          org_id: string;
          resolved: boolean;
          resolved_at: string | null;
          resolved_note: string | null;
          type: Database["public"]["Enums"]["objection_type"];
          verbatim: string;
        };
        Insert: {
          call_id?: string | null;
          created_at?: string;
          id?: string;
          lead_id: string;
          org_id: string;
          resolved?: boolean;
          resolved_at?: string | null;
          resolved_note?: string | null;
          type: Database["public"]["Enums"]["objection_type"];
          verbatim: string;
        };
        Update: {
          call_id?: string | null;
          created_at?: string;
          id?: string;
          lead_id?: string;
          org_id?: string;
          resolved?: boolean;
          resolved_at?: string | null;
          resolved_note?: string | null;
          type?: Database["public"]["Enums"]["objection_type"];
          verbatim?: string;
        };
        Relationships: [
          {
            foreignKeyName: "objections_lead_org_fkey";
            columns: ["lead_id", "org_id"];
            isOneToOne: false;
            referencedRelation: "leads";
            referencedColumns: ["id", "org_id"];
          },
        ];
      };
      org_members: {
        Row: {
          active: boolean;
          created_at: string;
          display_name: string;
          email: string;
          id: string;
          org_id: string;
          role: Database["public"]["Enums"]["org_role"];
          user_id: string;
        };
        Insert: {
          active?: boolean;
          created_at?: string;
          display_name: string;
          email: string;
          id?: string;
          org_id: string;
          role: Database["public"]["Enums"]["org_role"];
          user_id: string;
        };
        Update: {
          active?: boolean;
          created_at?: string;
          display_name?: string;
          email?: string;
          id?: string;
          org_id?: string;
          role?: Database["public"]["Enums"]["org_role"];
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "org_members_org_id_fkey";
            columns: ["org_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
        ];
      };
      organizations: {
        Row: {
          created_at: string;
          ghl_location_id: string | null;
          id: string;
          name: string;
          slug: string;
          timezone: string;
          updated_at: string;
        };
        Insert: {
          created_at?: string;
          ghl_location_id?: string | null;
          id?: string;
          name: string;
          slug: string;
          timezone?: string;
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          ghl_location_id?: string | null;
          id?: string;
          name?: string;
          slug?: string;
          timezone?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      readiness_scores: {
        Row: {
          call_id: string | null;
          created_at: string;
          decision_authority_raw: number;
          id: string;
          investment_capacity_raw: number;
          lead_id: string;
          org_id: string;
          pain_severity_raw: number;
          reasoning: string | null;
          scored_by_member_id: string | null;
          timeline_raw: number;
          total: number;
          triggered_by: Database["public"]["Enums"]["score_trigger"];
        };
        Insert: {
          call_id?: string | null;
          created_at?: string;
          decision_authority_raw: number;
          id?: string;
          investment_capacity_raw: number;
          lead_id: string;
          org_id: string;
          pain_severity_raw: number;
          reasoning?: string | null;
          scored_by_member_id?: string | null;
          timeline_raw: number;
          total: number;
          triggered_by: Database["public"]["Enums"]["score_trigger"];
        };
        Update: {
          call_id?: string | null;
          created_at?: string;
          decision_authority_raw?: number;
          id?: string;
          investment_capacity_raw?: number;
          lead_id?: string;
          org_id?: string;
          pain_severity_raw?: number;
          reasoning?: string | null;
          scored_by_member_id?: string | null;
          timeline_raw?: number;
          total?: number;
          triggered_by?: Database["public"]["Enums"]["score_trigger"];
        };
        Relationships: [
          {
            foreignKeyName: "readiness_scores_lead_org_fkey";
            columns: ["lead_id", "org_id"];
            isOneToOne: false;
            referencedRelation: "leads";
            referencedColumns: ["id", "org_id"];
          },
        ];
      };
      revenue_log: {
        Row: {
          amount_cents: number;
          closed_by_member_id: string | null;
          created_at: string;
          currency: string;
          id: string;
          lead_id: string | null;
          occurred_at: string;
          org_id: string;
          payment_type: Database["public"]["Enums"]["payment_type"];
          processor: string | null;
          processor_ref: string | null;
        };
        Insert: {
          amount_cents: number;
          closed_by_member_id?: string | null;
          created_at?: string;
          currency?: string;
          id?: string;
          lead_id?: string | null;
          occurred_at?: string;
          org_id: string;
          payment_type: Database["public"]["Enums"]["payment_type"];
          processor?: string | null;
          processor_ref?: string | null;
        };
        Update: {
          amount_cents?: number;
          closed_by_member_id?: string | null;
          created_at?: string;
          currency?: string;
          id?: string;
          lead_id?: string | null;
          occurred_at?: string;
          org_id?: string;
          payment_type?: Database["public"]["Enums"]["payment_type"];
          processor?: string | null;
          processor_ref?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "revenue_log_org_id_fkey";
            columns: ["org_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
        ];
      };
      score_configs: {
        Row: {
          created_at: string;
          decision_authority_weight: number;
          ghost_days_hard: number;
          ghost_days_soft: number;
          id: string;
          investment_capacity_weight: number;
          org_id: string;
          pain_severity_weight: number;
          ready_threshold: number;
          speed_to_lead_minutes: number;
          timeline_weight: number;
          updated_at: string;
        };
        Insert: {
          created_at?: string;
          decision_authority_weight?: number;
          ghost_days_hard?: number;
          ghost_days_soft?: number;
          id?: string;
          investment_capacity_weight?: number;
          org_id: string;
          pain_severity_weight?: number;
          ready_threshold?: number;
          speed_to_lead_minutes?: number;
          timeline_weight?: number;
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          decision_authority_weight?: number;
          ghost_days_hard?: number;
          ghost_days_soft?: number;
          id?: string;
          investment_capacity_weight?: number;
          org_id?: string;
          pain_severity_weight?: number;
          ready_threshold?: number;
          speed_to_lead_minutes?: number;
          timeline_weight?: number;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "score_configs_org_id_fkey";
            columns: ["org_id"];
            isOneToOne: true;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
        ];
      };
      touches: {
        Row: {
          actor_member_id: string | null;
          channel: Database["public"]["Enums"]["touch_channel"];
          created_at: string;
          direction: Database["public"]["Enums"]["touch_direction"];
          ghl_message_id: string | null;
          id: string;
          lead_id: string;
          occurred_at: string;
          org_id: string;
          summary: string | null;
          type: Database["public"]["Enums"]["touch_type"];
        };
        Insert: {
          actor_member_id?: string | null;
          channel: Database["public"]["Enums"]["touch_channel"];
          created_at?: string;
          direction: Database["public"]["Enums"]["touch_direction"];
          ghl_message_id?: string | null;
          id?: string;
          lead_id: string;
          occurred_at?: string;
          org_id: string;
          summary?: string | null;
          type: Database["public"]["Enums"]["touch_type"];
        };
        Update: {
          actor_member_id?: string | null;
          channel?: Database["public"]["Enums"]["touch_channel"];
          created_at?: string;
          direction?: Database["public"]["Enums"]["touch_direction"];
          ghl_message_id?: string | null;
          id?: string;
          lead_id?: string;
          occurred_at?: string;
          org_id?: string;
          summary?: string | null;
          type?: Database["public"]["Enums"]["touch_type"];
        };
        Relationships: [
          {
            foreignKeyName: "touches_lead_org_fkey";
            columns: ["lead_id", "org_id"];
            isOneToOne: false;
            referencedRelation: "leads";
            referencedColumns: ["id", "org_id"];
          },
        ];
      };
      webhook_events: {
        Row: {
          attempt_count: number;
          error_text: string | null;
          event_type: string;
          id: string;
          org_id: string | null;
          payload: Json;
          processed: boolean;
          processed_at: string | null;
          received_at: string;
          source: Database["public"]["Enums"]["webhook_source"];
        };
        Insert: {
          attempt_count?: number;
          error_text?: string | null;
          event_type: string;
          id?: string;
          org_id?: string | null;
          payload: Json;
          processed?: boolean;
          processed_at?: string | null;
          received_at?: string;
          source: Database["public"]["Enums"]["webhook_source"];
        };
        Update: {
          attempt_count?: number;
          error_text?: string | null;
          event_type?: string;
          id?: string;
          org_id?: string | null;
          payload?: Json;
          processed?: boolean;
          processed_at?: string | null;
          received_at?: string;
          source?: Database["public"]["Enums"]["webhook_source"];
        };
        Relationships: [
          {
            foreignKeyName: "webhook_events_org_id_fkey";
            columns: ["org_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
        ];
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      user_has_org_role: {
        Args: { p_org_id: string; p_roles: Database["public"]["Enums"]["org_role"][] };
        Returns: boolean;
      };
      user_org_ids: {
        Args: Record<PropertyKey, never>;
        Returns: string[];
      };
    };
    Enums: {
      action_creator: "system" | "user";
      call_outcome: "held" | "no_show" | "cancelled" | "rescheduled";
      call_type: "triage" | "discovery" | "close" | "follow_up";
      lead_status:
        | "new"
        | "working"
        | "call_booked"
        | "no_show"
        | "follow_up"
        | "objection_hold"
        | "ghost"
        | "closed_won"
        | "closed_lost";
      lead_type: "nurture_track" | "ready_track";
      objection_type:
        | "price"
        | "timing"
        | "spouse_partner"
        | "trust"
        | "fit"
        | "competitor"
        | "other";
      org_role: "owner" | "admin" | "closer" | "setter";
      payment_type: "pif" | "plan" | "bnpl";
      score_trigger: "intake" | "call" | "manual" | "event";
      touch_channel: "sms" | "email" | "call" | "dm" | "voicemail" | "other";
      touch_direction: "outbound" | "inbound";
      touch_type: "system" | "human";
      transcript_source: "fathom" | "fireflies" | "zoom" | "ghl" | "manual";
      webhook_source: "ghl" | "stripe" | "commas" | "transcript" | "other";
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};

export type Tables<T extends keyof Database["public"]["Tables"]> =
  Database["public"]["Tables"][T]["Row"];

export type TablesInsert<T extends keyof Database["public"]["Tables"]> =
  Database["public"]["Tables"][T]["Insert"];

export type Enums<T extends keyof Database["public"]["Enums"]> =
  Database["public"]["Enums"][T];
