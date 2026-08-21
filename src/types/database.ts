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
          budget_signal_state: Database["public"]["Enums"]["extraction_signal_state"];
          call_id: string;
          created_at: string;
          decision_process: string | null;
          decision_process_state: Database["public"]["Enums"]["extraction_signal_state"];
          extracted_at: string;
          id: string;
          input_tokens: number | null;
          model_version: string | null;
          next_step_agreed: string | null;
          next_step_state: Database["public"]["Enums"]["extraction_signal_state"];
          org_id: string;
          output_tokens: number | null;
          quotes: Json;
          stated_objection: string | null;
          stated_objection_state: Database["public"]["Enums"]["extraction_signal_state"];
          summary: string | null;
          timeline_signal: string | null;
          timeline_signal_state: Database["public"]["Enums"]["extraction_signal_state"];
        };
        Insert: {
          budget_signal?: string | null;
          budget_signal_state?: Database["public"]["Enums"]["extraction_signal_state"];
          call_id: string;
          created_at?: string;
          decision_process?: string | null;
          decision_process_state?: Database["public"]["Enums"]["extraction_signal_state"];
          extracted_at?: string;
          id?: string;
          input_tokens?: number | null;
          model_version?: string | null;
          next_step_agreed?: string | null;
          next_step_state?: Database["public"]["Enums"]["extraction_signal_state"];
          org_id: string;
          output_tokens?: number | null;
          quotes?: Json;
          stated_objection?: string | null;
          stated_objection_state?: Database["public"]["Enums"]["extraction_signal_state"];
          summary?: string | null;
          timeline_signal?: string | null;
          timeline_signal_state?: Database["public"]["Enums"]["extraction_signal_state"];
        };
        Update: {
          budget_signal?: string | null;
          budget_signal_state?: Database["public"]["Enums"]["extraction_signal_state"];
          call_id?: string;
          created_at?: string;
          decision_process?: string | null;
          decision_process_state?: Database["public"]["Enums"]["extraction_signal_state"];
          extracted_at?: string;
          id?: string;
          input_tokens?: number | null;
          model_version?: string | null;
          next_step_agreed?: string | null;
          next_step_state?: Database["public"]["Enums"]["extraction_signal_state"];
          org_id?: string;
          output_tokens?: number | null;
          quotes?: Json;
          stated_objection?: string | null;
          stated_objection_state?: Database["public"]["Enums"]["extraction_signal_state"];
          summary?: string | null;
          timeline_signal?: string | null;
          timeline_signal_state?: Database["public"]["Enums"]["extraction_signal_state"];
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
          transcript_provider_id: string | null;
          transcript_source:
            | Database["public"]["Enums"]["transcript_source"]
            | null;
          type: Database["public"]["Enums"]["call_type"];
          updated_at: string;
          ghl_appointment_id: string | null;
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
          transcript_provider_id?: string | null;
          transcript_source?:
            | Database["public"]["Enums"]["transcript_source"]
            | null;
          type: Database["public"]["Enums"]["call_type"];
          updated_at?: string;
          ghl_appointment_id?: string | null;
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
          transcript_provider_id?: string | null;
          transcript_source?:
            | Database["public"]["Enums"]["transcript_source"]
            | null;
          type?: Database["public"]["Enums"]["call_type"];
          updated_at?: string;
          ghl_appointment_id?: string | null;
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
      brief_openings: {
        Row: {
          cache_key: string;
          created_at: string;
          id: string;
          lead_id: string;
          model_version: string | null;
          opening_text: string;
          org_id: string;
        };
        Insert: {
          cache_key: string;
          created_at?: string;
          id?: string;
          lead_id: string;
          model_version?: string | null;
          opening_text: string;
          org_id: string;
        };
        Update: {
          cache_key?: string;
          created_at?: string;
          id?: string;
          lead_id?: string;
          model_version?: string | null;
          opening_text?: string;
          org_id?: string;
        };
        Relationships: [];
      };
      extraction_corrections: {
        Row: {
          actor_member_id: string;
          call_id: string;
          created_at: string;
          extraction_id: string;
          field_name: string;
          id: string;
          new_value: string | null;
          org_id: string;
          previous_value: string | null;
        };
        Insert: {
          actor_member_id: string;
          call_id: string;
          created_at?: string;
          extraction_id: string;
          field_name: string;
          id?: string;
          new_value?: string | null;
          org_id: string;
          previous_value?: string | null;
        };
        Update: {
          actor_member_id?: string;
          call_id?: string;
          created_at?: string;
          extraction_id?: string;
          field_name?: string;
          id?: string;
          new_value?: string | null;
          org_id?: string;
          previous_value?: string | null;
        };
        Relationships: [];
      };
      extraction_jobs: {
        Row: {
          attempt_count: number;
          call_id: string;
          created_at: string;
          id: string;
          last_error: string | null;
          next_attempt_at: string;
          org_id: string;
          processed_at: string | null;
          requested_by_member_id: string | null;
          status: Database["public"]["Enums"]["extraction_job_status"];
        };
        Insert: {
          attempt_count?: number;
          call_id: string;
          created_at?: string;
          id?: string;
          last_error?: string | null;
          next_attempt_at?: string;
          org_id: string;
          processed_at?: string | null;
          requested_by_member_id?: string | null;
          status?: Database["public"]["Enums"]["extraction_job_status"];
        };
        Update: {
          attempt_count?: number;
          call_id?: string;
          created_at?: string;
          id?: string;
          last_error?: string | null;
          next_attempt_at?: string;
          org_id?: string;
          processed_at?: string | null;
          requested_by_member_id?: string | null;
          status?: Database["public"]["Enums"]["extraction_job_status"];
        };
        Relationships: [];
      };
      extraction_usage: {
        Row: {
          call_id: string;
          created_at: string;
          extraction_id: string | null;
          id: string;
          input_tokens: number;
          model_version: string;
          org_id: string;
          output_tokens: number;
        };
        Insert: {
          call_id: string;
          created_at?: string;
          extraction_id?: string | null;
          id?: string;
          input_tokens: number;
          model_version: string;
          org_id: string;
          output_tokens: number;
        };
        Update: {
          call_id?: string;
          created_at?: string;
          extraction_id?: string | null;
          id?: string;
          input_tokens?: number;
          model_version?: string;
          org_id?: string;
          output_tokens?: number;
        };
        Relationships: [];
      };
      follow_up_settings: {
        Row: {
          created_at: string;
          default_channel: Database["public"]["Enums"]["touch_channel"];
          draft_stale_days: number;
          max_sequence_duration_days: number;
          max_sequence_length: number;
          org_id: string;
          quiet_hours_enabled: boolean;
          quiet_hours_end: string;
          quiet_hours_start: string;
          sequences_halted: boolean;
          sequences_halted_at: string | null;
          sequences_halted_by: string | null;
          updated_at: string;
        };
        Insert: {
          created_at?: string;
          default_channel?: Database["public"]["Enums"]["touch_channel"];
          draft_stale_days?: number;
          max_sequence_duration_days?: number;
          max_sequence_length?: number;
          org_id: string;
          quiet_hours_enabled?: boolean;
          quiet_hours_end?: string;
          quiet_hours_start?: string;
          sequences_halted?: boolean;
          sequences_halted_at?: string | null;
          sequences_halted_by?: string | null;
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          default_channel?: Database["public"]["Enums"]["touch_channel"];
          draft_stale_days?: number;
          max_sequence_duration_days?: number;
          max_sequence_length?: number;
          org_id?: string;
          quiet_hours_enabled?: boolean;
          quiet_hours_end?: string;
          quiet_hours_start?: string;
          sequences_halted?: boolean;
          sequences_halted_at?: string | null;
          sequences_halted_by?: string | null;
          updated_at?: string;
        };
        Relationships: [];
      };
      org_voice_profiles: {
        Row: {
          banned_words: string[];
          created_at: string;
          email_max_chars: number;
          emoji_usage: Database["public"]["Enums"]["voice_emoji"];
          examples: Json;
          formality: Database["public"]["Enums"]["voice_formality"];
          greeting_text: string | null;
          org_id: string;
          signoff_text: string | null;
          sms_max_chars: number;
          updated_at: string;
          use_contractions: boolean;
          use_greeting: boolean;
          use_signoff: boolean;
        };
        Insert: {
          banned_words?: string[];
          created_at?: string;
          email_max_chars?: number;
          emoji_usage?: Database["public"]["Enums"]["voice_emoji"];
          examples?: Json;
          formality?: Database["public"]["Enums"]["voice_formality"];
          greeting_text?: string | null;
          org_id: string;
          signoff_text?: string | null;
          sms_max_chars?: number;
          updated_at?: string;
          use_contractions?: boolean;
          use_greeting?: boolean;
          use_signoff?: boolean;
        };
        Update: {
          banned_words?: string[];
          created_at?: string;
          email_max_chars?: number;
          emoji_usage?: Database["public"]["Enums"]["voice_emoji"];
          examples?: Json;
          formality?: Database["public"]["Enums"]["voice_formality"];
          greeting_text?: string | null;
          org_id?: string;
          signoff_text?: string | null;
          sms_max_chars?: number;
          updated_at?: string;
          use_contractions?: boolean;
          use_greeting?: boolean;
          use_signoff?: boolean;
        };
        Relationships: [];
      };
      follow_up_routing_rules: {
        Row: {
          branch: Database["public"]["Enums"]["follow_up_branch"];
          channel: Database["public"]["Enums"]["touch_channel"];
          created_at: string;
          enabled: boolean;
          id: string;
          match: Json;
          org_id: string;
          priority: number;
          sequence_steps: Json;
          updated_at: string;
        };
        Insert: {
          branch: Database["public"]["Enums"]["follow_up_branch"];
          channel?: Database["public"]["Enums"]["touch_channel"];
          created_at?: string;
          enabled?: boolean;
          id?: string;
          match: Json;
          org_id: string;
          priority: number;
          sequence_steps?: Json;
          updated_at?: string;
        };
        Update: {
          branch?: Database["public"]["Enums"]["follow_up_branch"];
          channel?: Database["public"]["Enums"]["touch_channel"];
          created_at?: string;
          enabled?: boolean;
          id?: string;
          match?: Json;
          org_id?: string;
          priority?: number;
          sequence_steps?: Json;
          updated_at?: string;
        };
        Relationships: [];
      };
      follow_up_sequence_runs: {
        Row: {
          branch: Database["public"]["Enums"]["follow_up_branch"];
          call_id: string;
          completed_at: string | null;
          created_at: string;
          halt_reason: Database["public"]["Enums"]["follow_up_halt_reason"] | null;
          halted_at: string | null;
          halted_by_member_id: string | null;
          id: string;
          last_sent_at: string | null;
          last_sent_draft_id: string | null;
          lead_id: string;
          max_steps: number;
          max_until: string;
          next_position: number;
          org_id: string;
          started_at: string;
          status: Database["public"]["Enums"]["follow_up_sequence_status"];
        };
        Insert: {
          branch: Database["public"]["Enums"]["follow_up_branch"];
          call_id: string;
          completed_at?: string | null;
          created_at?: string;
          halt_reason?: Database["public"]["Enums"]["follow_up_halt_reason"] | null;
          halted_at?: string | null;
          halted_by_member_id?: string | null;
          id?: string;
          last_sent_at?: string | null;
          last_sent_draft_id?: string | null;
          lead_id: string;
          max_steps: number;
          max_until: string;
          next_position?: number;
          org_id: string;
          started_at?: string;
          status?: Database["public"]["Enums"]["follow_up_sequence_status"];
        };
        Update: {
          branch?: Database["public"]["Enums"]["follow_up_branch"];
          call_id?: string;
          completed_at?: string | null;
          created_at?: string;
          halt_reason?: Database["public"]["Enums"]["follow_up_halt_reason"] | null;
          halted_at?: string | null;
          halted_by_member_id?: string | null;
          id?: string;
          last_sent_at?: string | null;
          last_sent_draft_id?: string | null;
          lead_id?: string;
          max_steps?: number;
          max_until?: string;
          next_position?: number;
          org_id?: string;
          started_at?: string;
          status?: Database["public"]["Enums"]["follow_up_sequence_status"];
        };
        Relationships: [];
      };
      follow_up_jobs: {
        Row: {
          attempt_count: number;
          branch: Database["public"]["Enums"]["follow_up_branch"];
          call_id: string;
          channel: Database["public"]["Enums"]["touch_channel"];
          created_at: string;
          draft_id: string | null;
          extraction_id: string | null;
          id: string;
          last_error: string | null;
          lead_id: string;
          next_attempt_at: string;
          operator_instruction: string | null;
          org_id: string;
          processed_at: string | null;
          requested_by_member_id: string | null;
          sequence_position: number;
          sequence_run_id: string | null;
          status: Database["public"]["Enums"]["follow_up_job_status"];
        };
        Insert: {
          attempt_count?: number;
          branch: Database["public"]["Enums"]["follow_up_branch"];
          call_id: string;
          channel: Database["public"]["Enums"]["touch_channel"];
          created_at?: string;
          draft_id?: string | null;
          extraction_id?: string | null;
          id?: string;
          last_error?: string | null;
          lead_id: string;
          next_attempt_at?: string;
          operator_instruction?: string | null;
          org_id: string;
          processed_at?: string | null;
          requested_by_member_id?: string | null;
          sequence_position?: number;
          sequence_run_id?: string | null;
          status?: Database["public"]["Enums"]["follow_up_job_status"];
        };
        Update: {
          attempt_count?: number;
          branch?: Database["public"]["Enums"]["follow_up_branch"];
          call_id?: string;
          channel?: Database["public"]["Enums"]["touch_channel"];
          created_at?: string;
          draft_id?: string | null;
          extraction_id?: string | null;
          id?: string;
          last_error?: string | null;
          lead_id?: string;
          next_attempt_at?: string;
          operator_instruction?: string | null;
          org_id?: string;
          processed_at?: string | null;
          requested_by_member_id?: string | null;
          sequence_position?: number;
          sequence_run_id?: string | null;
          status?: Database["public"]["Enums"]["follow_up_job_status"];
        };
        Relationships: [];
      };
      follow_up_drafts: {
        Row: {
          approved_at: string | null;
          approved_by_member_id: string | null;
          branch: Database["public"]["Enums"]["follow_up_branch"];
          call_end_to_sent_ms: number | null;
          call_id: string;
          channel: Database["public"]["Enums"]["touch_channel"];
          created_at: string;
          discarded_reason: string | null;
          dispatch_id: string | null;
          edit_distance: number | null;
          edited_body: string;
          edited_subject: string | null;
          expires_at: string;
          extraction_id: string | null;
          failure_reason: string | null;
          generated_body: string;
          generated_subject: string | null;
          generation_attempt: number;
          id: string;
          lead_id: string;
          low_confidence: boolean;
          low_confidence_reason: string | null;
          model_version: string;
          operator_instruction: string | null;
          org_id: string;
          quality_failures: Json;
          quotes_used: Json;
          rejected_at: string | null;
          rejected_by_member_id: string | null;
          rejected_reason: string | null;
          sent_at: string | null;
          sent_body: string | null;
          sent_subject: string | null;
          sequence_position: number;
          sequence_run_id: string | null;
          status: Database["public"]["Enums"]["follow_up_draft_status"];
          touch_id: string | null;
          updated_at: string;
        };
        Insert: {
          approved_at?: string | null;
          approved_by_member_id?: string | null;
          branch: Database["public"]["Enums"]["follow_up_branch"];
          call_end_to_sent_ms?: number | null;
          call_id: string;
          channel: Database["public"]["Enums"]["touch_channel"];
          created_at?: string;
          discarded_reason?: string | null;
          dispatch_id?: string | null;
          edit_distance?: number | null;
          edited_body: string;
          edited_subject?: string | null;
          expires_at: string;
          extraction_id?: string | null;
          failure_reason?: string | null;
          generated_body: string;
          generated_subject?: string | null;
          generation_attempt?: number;
          id?: string;
          lead_id: string;
          low_confidence?: boolean;
          low_confidence_reason?: string | null;
          model_version: string;
          operator_instruction?: string | null;
          org_id: string;
          quality_failures?: Json;
          quotes_used?: Json;
          rejected_at?: string | null;
          rejected_by_member_id?: string | null;
          rejected_reason?: string | null;
          sent_at?: string | null;
          sent_body?: string | null;
          sent_subject?: string | null;
          sequence_position?: number;
          sequence_run_id?: string | null;
          status?: Database["public"]["Enums"]["follow_up_draft_status"];
          touch_id?: string | null;
          updated_at?: string;
        };
        Update: {
          approved_at?: string | null;
          approved_by_member_id?: string | null;
          branch?: Database["public"]["Enums"]["follow_up_branch"];
          call_end_to_sent_ms?: number | null;
          call_id?: string;
          channel?: Database["public"]["Enums"]["touch_channel"];
          created_at?: string;
          discarded_reason?: string | null;
          dispatch_id?: string | null;
          edit_distance?: number | null;
          edited_body?: string;
          edited_subject?: string | null;
          expires_at?: string;
          extraction_id?: string | null;
          failure_reason?: string | null;
          generated_body?: string;
          generated_subject?: string | null;
          generation_attempt?: number;
          id?: string;
          lead_id?: string;
          low_confidence?: boolean;
          low_confidence_reason?: string | null;
          model_version?: string;
          operator_instruction?: string | null;
          org_id?: string;
          quality_failures?: Json;
          quotes_used?: Json;
          rejected_at?: string | null;
          rejected_by_member_id?: string | null;
          rejected_reason?: string | null;
          sent_at?: string | null;
          sent_body?: string | null;
          sent_subject?: string | null;
          sequence_position?: number;
          sequence_run_id?: string | null;
          status?: Database["public"]["Enums"]["follow_up_draft_status"];
          touch_id?: string | null;
          updated_at?: string;
        };
        Relationships: [];
      };
      follow_up_quality_check_failures: {
        Row: {
          attempt: number;
          branch: Database["public"]["Enums"]["follow_up_branch"];
          created_at: string;
          detail: string | null;
          draft_id: string | null;
          failure_type: Database["public"]["Enums"]["follow_up_quality_failure"];
          id: string;
          job_id: string | null;
          org_id: string;
        };
        Insert: {
          attempt: number;
          branch: Database["public"]["Enums"]["follow_up_branch"];
          created_at?: string;
          detail?: string | null;
          draft_id?: string | null;
          failure_type: Database["public"]["Enums"]["follow_up_quality_failure"];
          id?: string;
          job_id?: string | null;
          org_id: string;
        };
        Update: {
          attempt?: number;
          branch?: Database["public"]["Enums"]["follow_up_branch"];
          created_at?: string;
          detail?: string | null;
          draft_id?: string | null;
          failure_type?: Database["public"]["Enums"]["follow_up_quality_failure"];
          id?: string;
          job_id?: string | null;
          org_id?: string;
        };
        Relationships: [];
      };
      follow_up_events: {
        Row: {
          actor_member_id: string | null;
          created_at: string;
          draft_id: string | null;
          id: string;
          kind: Database["public"]["Enums"]["follow_up_event_kind"];
          org_id: string;
          payload: Json;
          sequence_run_id: string | null;
        };
        Insert: {
          actor_member_id?: string | null;
          created_at?: string;
          draft_id?: string | null;
          id?: string;
          kind: Database["public"]["Enums"]["follow_up_event_kind"];
          org_id: string;
          payload?: Json;
          sequence_run_id?: string | null;
        };
        Update: {
          actor_member_id?: string | null;
          created_at?: string;
          draft_id?: string | null;
          id?: string;
          kind?: Database["public"]["Enums"]["follow_up_event_kind"];
          org_id?: string;
          payload?: Json;
          sequence_run_id?: string | null;
        };
        Relationships: [];
      };
      follow_up_reply_signals: {
        Row: {
          branch: Database["public"]["Enums"]["follow_up_branch"] | null;
          draft_id: string | null;
          id: string;
          inbound_touch_id: string | null;
          lead_id: string;
          org_id: string;
          replied_at: string;
          sequence_position: number | null;
          sequence_run_id: string | null;
        };
        Insert: {
          branch?: Database["public"]["Enums"]["follow_up_branch"] | null;
          draft_id?: string | null;
          id?: string;
          inbound_touch_id?: string | null;
          lead_id: string;
          org_id: string;
          replied_at?: string;
          sequence_position?: number | null;
          sequence_run_id?: string | null;
        };
        Update: {
          branch?: Database["public"]["Enums"]["follow_up_branch"] | null;
          draft_id?: string | null;
          id?: string;
          inbound_touch_id?: string | null;
          lead_id?: string;
          org_id?: string;
          replied_at?: string;
          sequence_position?: number | null;
          sequence_run_id?: string | null;
        };
        Relationships: [];
      };
      voice_profile_suggestions: {
        Row: {
          created_at: string;
          evidence: Json;
          id: string;
          kind: Database["public"]["Enums"]["voice_suggestion_kind"];
          org_id: string;
          phrase: string | null;
          resolved_at: string | null;
          resolved_by_member_id: string | null;
          status: Database["public"]["Enums"]["voice_suggestion_status"];
        };
        Insert: {
          created_at?: string;
          evidence?: Json;
          id?: string;
          kind: Database["public"]["Enums"]["voice_suggestion_kind"];
          org_id: string;
          phrase?: string | null;
          resolved_at?: string | null;
          resolved_by_member_id?: string | null;
          status?: Database["public"]["Enums"]["voice_suggestion_status"];
        };
        Update: {
          created_at?: string;
          evidence?: Json;
          id?: string;
          kind?: Database["public"]["Enums"]["voice_suggestion_kind"];
          org_id?: string;
          phrase?: string | null;
          resolved_at?: string | null;
          resolved_by_member_id?: string | null;
          status?: Database["public"]["Enums"]["voice_suggestion_status"];
        };
        Relationships: [];
      };
      transcript_connections: {
        Row: {
          api_key_encrypted: string | null;
          created_at: string;
          id: string;
          last_pull_at: string | null;
          last_pull_error: string | null;
          org_id: string;
          public_token: string;
          source: Database["public"]["Enums"]["transcript_source"];
          updated_at: string;
          webhook_secret_encrypted: string | null;
        };
        Insert: {
          api_key_encrypted?: string | null;
          created_at?: string;
          id?: string;
          last_pull_at?: string | null;
          last_pull_error?: string | null;
          org_id: string;
          public_token: string;
          source: Database["public"]["Enums"]["transcript_source"];
          updated_at?: string;
          webhook_secret_encrypted?: string | null;
        };
        Update: {
          api_key_encrypted?: string | null;
          created_at?: string;
          id?: string;
          last_pull_at?: string | null;
          last_pull_error?: string | null;
          org_id?: string;
          public_token?: string;
          source?: Database["public"]["Enums"]["transcript_source"];
          updated_at?: string;
          webhook_secret_encrypted?: string | null;
        };
        Relationships: [];
      };
      unmatched_transcripts: {
        Row: {
          assigned_at: string | null;
          assigned_by_member_id: string | null;
          assigned_call_id: string | null;
          created_at: string;
          discarded_at: string | null;
          discarded_by_member_id: string | null;
          duration_seconds: number | null;
          id: string;
          occurred_at: string | null;
          org_id: string;
          participant_emails: string[];
          provider_call_id: string | null;
          provider_event_id: string | null;
          raw_transcript: string;
          received_at: string;
          scheduled_at: string | null;
          source: Database["public"]["Enums"]["transcript_source"];
          status: Database["public"]["Enums"]["unmatched_transcript_status"];
          title: string | null;
          webhook_event_id: string | null;
        };
        Insert: {
          assigned_at?: string | null;
          assigned_by_member_id?: string | null;
          assigned_call_id?: string | null;
          created_at?: string;
          discarded_at?: string | null;
          discarded_by_member_id?: string | null;
          duration_seconds?: number | null;
          id?: string;
          occurred_at?: string | null;
          org_id: string;
          participant_emails?: string[];
          provider_call_id?: string | null;
          provider_event_id?: string | null;
          raw_transcript: string;
          received_at?: string;
          scheduled_at?: string | null;
          source: Database["public"]["Enums"]["transcript_source"];
          status?: Database["public"]["Enums"]["unmatched_transcript_status"];
          title?: string | null;
          webhook_event_id?: string | null;
        };
        Update: {
          assigned_at?: string | null;
          assigned_by_member_id?: string | null;
          assigned_call_id?: string | null;
          created_at?: string;
          discarded_at?: string | null;
          discarded_by_member_id?: string | null;
          duration_seconds?: number | null;
          id?: string;
          occurred_at?: string | null;
          org_id?: string;
          participant_emails?: string[];
          provider_call_id?: string | null;
          provider_event_id?: string | null;
          raw_transcript?: string;
          received_at?: string;
          scheduled_at?: string | null;
          source?: Database["public"]["Enums"]["transcript_source"];
          status?: Database["public"]["Enums"]["unmatched_transcript_status"];
          title?: string | null;
          webhook_event_id?: string | null;
        };
        Relationships: [];
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
          ghost_approaching_at: string | null;
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
          timezone: string | null;
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
          ghost_approaching_at?: string | null;
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
          timezone?: string | null;
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
          ghost_approaching_at?: string | null;
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
          timezone?: string | null;
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
          kind: string | null;
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
          kind?: string | null;
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
          kind?: string | null;
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
      lead_status_changes: {
        Row: {
          actor_member_id: string | null;
          created_at: string;
          from_status: Database["public"]["Enums"]["lead_status"];
          id: string;
          lead_id: string;
          note: string | null;
          org_id: string;
          source: Database["public"]["Enums"]["status_change_source"];
          to_status: Database["public"]["Enums"]["lead_status"];
        };
        Insert: {
          actor_member_id?: string | null;
          created_at?: string;
          from_status: Database["public"]["Enums"]["lead_status"];
          id?: string;
          lead_id: string;
          note?: string | null;
          org_id: string;
          source: Database["public"]["Enums"]["status_change_source"];
          to_status: Database["public"]["Enums"]["lead_status"];
        };
        Update: {
          actor_member_id?: string | null;
          created_at?: string;
          from_status?: Database["public"]["Enums"]["lead_status"];
          id?: string;
          lead_id?: string;
          note?: string | null;
          org_id?: string;
          source?: Database["public"]["Enums"]["status_change_source"];
          to_status?: Database["public"]["Enums"]["lead_status"];
        };
        Relationships: [
          {
            foreignKeyName: "lead_status_changes_lead_org_fkey";
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
          ghl_user_id: string | null;
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
          ghl_user_id?: string | null;
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
          ghl_user_id?: string | null;
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
      platform_admins: {
        Row: {
          created_at: string;
          user_id: string;
        };
        Insert: {
          created_at?: string;
          user_id: string;
        };
        Update: {
          created_at?: string;
          user_id?: string;
        };
        Relationships: [];
      };
      org_invites: {
        Row: {
          accepted_at: string | null;
          created_at: string;
          email: string;
          expires_at: string;
          id: string;
          invited_by: string;
          org_id: string;
          role: Database["public"]["Enums"]["org_role"];
          token: string;
        };
        Insert: {
          accepted_at?: string | null;
          created_at?: string;
          email: string;
          expires_at: string;
          id?: string;
          invited_by: string;
          org_id: string;
          role: Database["public"]["Enums"]["org_role"];
          token: string;
        };
        Update: {
          accepted_at?: string | null;
          created_at?: string;
          email?: string;
          expires_at?: string;
          id?: string;
          invited_by?: string;
          org_id?: string;
          role?: Database["public"]["Enums"]["org_role"];
          token?: string;
        };
        Relationships: [
          {
            foreignKeyName: "org_invites_org_id_fkey";
            columns: ["org_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "org_invites_invited_by_fkey";
            columns: ["invited_by"];
            isOneToOne: false;
            referencedRelation: "org_members";
            referencedColumns: ["id"];
          },
        ];
      };
      organizations: {
        Row: {
          activated_at: string | null;
          created_at: string;
          ghl_location_id: string | null;
          id: string;
          name: string;
          slug: string;
          timezone: string;
          updated_at: string;
        };
        Insert: {
          activated_at?: string | null;
          created_at?: string;
          ghl_location_id?: string | null;
          id?: string;
          name: string;
          slug: string;
          timezone?: string;
          updated_at?: string;
        };
        Update: {
          activated_at?: string | null;
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
          decision_authority_raw: number | null;
          id: string;
          idempotency_key: string | null;
          investment_capacity_raw: number | null;
          lead_id: string;
          org_id: string;
          pain_severity_raw: number | null;
          reasoning: string;
          scored_by_member_id: string | null;
          timeline_raw: number | null;
          total: number;
          triggered_by: Database["public"]["Enums"]["score_trigger"];
        };
        Insert: {
          call_id?: string | null;
          created_at?: string;
          decision_authority_raw?: number | null;
          id?: string;
          idempotency_key?: string | null;
          investment_capacity_raw?: number | null;
          lead_id: string;
          org_id: string;
          pain_severity_raw?: number | null;
          reasoning: string;
          scored_by_member_id?: string | null;
          timeline_raw?: number | null;
          total: number;
          triggered_by: Database["public"]["Enums"]["score_trigger"];
        };
        Update: {
          call_id?: string | null;
          created_at?: string;
          decision_authority_raw?: number | null;
          id?: string;
          idempotency_key?: string | null;
          investment_capacity_raw?: number | null;
          lead_id?: string;
          org_id?: string;
          pain_severity_raw?: number | null;
          reasoning?: string;
          scored_by_member_id?: string | null;
          timeline_raw?: number | null;
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
      score_field_maps: {
        Row: {
          created_at: string;
          factor: Database["public"]["Enums"]["score_factor"];
          field_name: string;
          id: string;
          org_id: string;
          updated_at: string;
        };
        Insert: {
          created_at?: string;
          factor: Database["public"]["Enums"]["score_factor"];
          field_name: string;
          id?: string;
          org_id: string;
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          factor?: Database["public"]["Enums"]["score_factor"];
          field_name?: string;
          id?: string;
          org_id?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "score_field_maps_org_id_fkey";
            columns: ["org_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
        ];
      };
      score_field_rules: {
        Row: {
          answer_value: string | null;
          created_at: string;
          field_map_id: string;
          id: string;
          kind: Database["public"]["Enums"]["score_mapping_kind"];
          org_id: string;
          range_max: number | null;
          range_min: number | null;
          score: number;
        };
        Insert: {
          answer_value?: string | null;
          created_at?: string;
          field_map_id: string;
          id?: string;
          kind: Database["public"]["Enums"]["score_mapping_kind"];
          org_id: string;
          range_max?: number | null;
          range_min?: number | null;
          score: number;
        };
        Update: {
          answer_value?: string | null;
          created_at?: string;
          field_map_id?: string;
          id?: string;
          kind?: Database["public"]["Enums"]["score_mapping_kind"];
          org_id?: string;
          range_max?: number | null;
          range_min?: number | null;
          score?: number;
        };
        Relationships: [
          {
            foreignKeyName: "score_field_rules_field_map_id_fkey";
            columns: ["field_map_id"];
            isOneToOne: false;
            referencedRelation: "score_field_maps";
            referencedColumns: ["id"];
          },
        ];
      };
      ghost_detector_runs: {
        Row: {
          changed_count: number;
          evaluated_count: number;
          id: string;
          org_id: string;
          ran_at: string;
        };
        Insert: {
          changed_count: number;
          evaluated_count: number;
          id?: string;
          org_id: string;
          ran_at?: string;
        };
        Update: {
          changed_count?: number;
          evaluated_count?: number;
          id?: string;
          org_id?: string;
          ran_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "ghost_detector_runs_org_id_fkey";
            columns: ["org_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
        ];
      };
      ghl_connections: {
        Row: {
          access_token_encrypted: string | null;
          company_id: string | null;
          created_at: string;
          id: string;
          last_refresh_error: string | null;
          last_setup_error: string | null;
          last_verified_at: string | null;
          location_id: string | null;
          location_name: string | null;
          org_id: string;
          refresh_token_encrypted: string | null;
          status: Database["public"]["Enums"]["ghl_connection_status"];
          token_expires_at: string | null;
          updated_at: string;
          webhook_id: string | null;
        };
        Insert: {
          access_token_encrypted?: string | null;
          company_id?: string | null;
          created_at?: string;
          id?: string;
          last_refresh_error?: string | null;
          last_setup_error?: string | null;
          last_verified_at?: string | null;
          location_id?: string | null;
          location_name?: string | null;
          org_id: string;
          refresh_token_encrypted?: string | null;
          status?: Database["public"]["Enums"]["ghl_connection_status"];
          token_expires_at?: string | null;
          updated_at?: string;
          webhook_id?: string | null;
        };
        Update: {
          access_token_encrypted?: string | null;
          company_id?: string | null;
          created_at?: string;
          id?: string;
          last_refresh_error?: string | null;
          last_setup_error?: string | null;
          last_verified_at?: string | null;
          location_id?: string | null;
          location_name?: string | null;
          org_id?: string;
          refresh_token_encrypted?: string | null;
          status?: Database["public"]["Enums"]["ghl_connection_status"];
          token_expires_at?: string | null;
          updated_at?: string;
          webhook_id?: string | null;
        };
        Relationships: [];
      };
      ghl_oauth_sessions: {
        Row: {
          access_token_encrypted: string;
          company_id: string | null;
          created_at: string;
          expires_at: string;
          id: string;
          member_id: string;
          org_id: string;
          refresh_token_encrypted: string;
          token_expires_at: string | null;
        };
        Insert: {
          access_token_encrypted: string;
          company_id?: string | null;
          created_at?: string;
          expires_at: string;
          id?: string;
          member_id: string;
          org_id: string;
          refresh_token_encrypted: string;
          token_expires_at?: string | null;
        };
        Update: {
          access_token_encrypted?: string;
          company_id?: string | null;
          created_at?: string;
          expires_at?: string;
          id?: string;
          member_id?: string;
          org_id?: string;
          refresh_token_encrypted?: string;
          token_expires_at?: string | null;
        };
        Relationships: [];
      };
      ghl_field_maps: {
        Row: {
          answer_key: string;
          created_at: string;
          ghl_field_id: string | null;
          ghl_field_key: string | null;
          id: string;
          org_id: string;
          updated_at: string;
        };
        Insert: {
          answer_key: string;
          created_at?: string;
          ghl_field_id?: string | null;
          ghl_field_key?: string | null;
          id?: string;
          org_id: string;
          updated_at?: string;
        };
        Update: {
          answer_key?: string;
          created_at?: string;
          ghl_field_id?: string | null;
          ghl_field_key?: string | null;
          id?: string;
          org_id?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      ghl_dispatches: {
        Row: {
          actor_member_id: string | null;
          attempt_count: number;
          available_at: string;
          body_text: string | null;
          channel: Database["public"]["Enums"]["touch_channel"];
          claimed_at: string | null;
          created_at: string;
          email_subject: string | null;
          failure_reason: string | null;
          ghl_message_id: string | null;
          id: string;
          idempotency_key: string | null;
          lead_id: string;
          org_id: string;
          sent_at: string | null;
          status: Database["public"]["Enums"]["ghl_dispatch_status"];
        };
        Insert: {
          actor_member_id?: string | null;
          attempt_count?: number;
          available_at?: string;
          body_text?: string | null;
          channel: Database["public"]["Enums"]["touch_channel"];
          claimed_at?: string | null;
          created_at?: string;
          email_subject?: string | null;
          failure_reason?: string | null;
          ghl_message_id?: string | null;
          id?: string;
          idempotency_key?: string | null;
          lead_id: string;
          org_id: string;
          sent_at?: string | null;
          status?: Database["public"]["Enums"]["ghl_dispatch_status"];
        };
        Update: {
          actor_member_id?: string | null;
          attempt_count?: number;
          available_at?: string;
          body_text?: string | null;
          channel?: Database["public"]["Enums"]["touch_channel"];
          claimed_at?: string | null;
          created_at?: string;
          email_subject?: string | null;
          failure_reason?: string | null;
          ghl_message_id?: string | null;
          id?: string;
          idempotency_key?: string | null;
          lead_id?: string;
          org_id?: string;
          sent_at?: string | null;
          status?: Database["public"]["Enums"]["ghl_dispatch_status"];
        };
        Relationships: [];
      };
      ghl_rate_windows: {
        Row: {
          org_id: string;
          paused_until: string | null;
          request_count: number;
          window_started_at: string;
        };
        Insert: {
          org_id: string;
          paused_until?: string | null;
          request_count?: number;
          window_started_at?: string;
        };
        Update: {
          org_id?: string;
          paused_until?: string | null;
          request_count?: number;
          window_started_at?: string;
        };
        Relationships: [];
      };
      ghl_contact_locks: {
        Row: {
          claimed_at: string;
          contact_key: string;
        };
        Insert: {
          claimed_at?: string;
          contact_key: string;
        };
        Update: {
          claimed_at?: string;
          contact_key?: string;
        };
        Relationships: [];
      };
      ingestion_alerts: {
        Row: {
          created_at: string;
          detail: string;
          id: string;
          kind: string;
          last_sent_at: string;
          org_id: string;
        };
        Insert: {
          created_at?: string;
          detail: string;
          id?: string;
          kind: string;
          last_sent_at?: string;
          org_id: string;
        };
        Update: {
          created_at?: string;
          detail?: string;
          id?: string;
          kind?: string;
          last_sent_at?: string;
          org_id?: string;
        };
        Relationships: [];
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
          outcome: Database["public"]["Enums"]["touch_outcome"] | null;
          outbound_body: string | null;
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
          outcome?: Database["public"]["Enums"]["touch_outcome"] | null;
          outbound_body?: string | null;
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
          outcome?: Database["public"]["Enums"]["touch_outcome"] | null;
          outbound_body?: string | null;
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
          provider_event_id: string | null;
          contact_key: string | null;
          status: Database["public"]["Enums"]["webhook_event_status"];
          next_attempt_at: string;
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
          provider_event_id?: string | null;
          contact_key?: string | null;
          status?: Database["public"]["Enums"]["webhook_event_status"];
          next_attempt_at?: string;
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
          provider_event_id?: string | null;
          contact_key?: string | null;
          status?: Database["public"]["Enums"]["webhook_event_status"];
          next_attempt_at?: string;
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
      queue_rows: {
        Row: {
          id: string;
          org_id: string;
          name: string;
          email: string | null;
          source: string | null;
          status: Database["public"]["Enums"]["lead_status"];
          lead_type: Database["public"]["Enums"]["lead_type"] | null;
          score: number | null;
          score_confidence: string | null;
          known_factor_count: number | null;
          score_reasoning: string | null;
          opted_in_at: string;
          last_touch_at: string | null;
          first_human_touch_at: string | null;
          assigned_setter_id: string | null;
          assigned_closer_id: string | null;
          assigned_setter_name: string | null;
          assigned_closer_name: string | null;
          ghl_contact_id: string | null;
          crm_url: string | null;
          next_action_id: string | null;
          next_action_text: string | null;
          next_action_due_at: string | null;
          next_action_overdue: boolean | null;
          in_alarm: boolean | null;
          breach_seconds: number | null;
          urgency_rank: number | null;
          sort_score: number | null;
        };
        Relationships: [];
      };
      case_file_rows: {
        Row: {
          id: string;
          org_id: string;
          name: string;
          first_name: string | null;
          last_name: string | null;
          email: string | null;
          phone: string | null;
          source: string | null;
          status: Database["public"]["Enums"]["lead_status"];
          lead_type: Database["public"]["Enums"]["lead_type"] | null;
          score: number | null;
          opted_in_at: string;
          last_touch_at: string | null;
          assigned_setter_id: string | null;
          assigned_closer_id: string | null;
          assigned_setter_name: string | null;
          assigned_closer_name: string | null;
        };
        Relationships: [];
      };
    };
    Functions: {
      redeem_org_invite: {
        Args: { p_token: string; p_user_id: string };
        Returns: Json;
      };
      seed_default_score_maps: {
        Args: { p_org_id: string };
        Returns: undefined;
      };
      replace_org_score_maps: {
        Args: { p_maps: Json; p_org_id: string };
        Returns: undefined;
      };
      link_ghl_location: {
        Args: { p_org_id: string; p_location_id: string };
        Returns: Json;
      };
      unlink_ghl_location: {
        Args: { p_org_id: string };
        Returns: undefined;
      };
      claim_ghl_contact_key: {
        Args: Record<PropertyKey, never>;
        Returns: string | null;
      };
      release_ghl_contact_key: {
        Args: { p_key: string };
        Returns: undefined;
      };
      try_consume_ghl_rate: {
        Args: { p_org_id: string };
        Returns: boolean;
      };
      user_member_id: {
        Args: { p_org_id: string };
        Returns: string | null;
      };
      ghl_event_counts_24h: {
        Args: { p_org_id: string };
        Returns: { event_type: string; n: number }[];
      };
      user_has_org_role: {
        Args: { p_org_id: string; p_roles: Database["public"]["Enums"]["org_role"][] };
        Returns: boolean;
      };
      user_org_ids: {
        Args: Record<PropertyKey, never>;
        Returns: string[];
      };
      is_platform_admin: {
        Args: Record<PropertyKey, never>;
        Returns: boolean;
      };
      is_platform_admin_user: {
        Args: { p_user_id: string };
        Returns: boolean;
      };
      assign_org_lead: {
        Args: {
          p_org_id: string;
          p_lead_id: string;
          p_setter_id: string | null;
          p_closer_id: string | null;
        };
        Returns: undefined;
      };
      queue_row_to_json: {
        Args: { r: Database["public"]["Views"]["queue_rows"]["Row"] };
        Returns: Json;
      };
      alarm_band_leads: {
        Args: { p_org_id: string };
        Returns: { id: string; opted_in_at: string }[];
      };
      load_org_queue: {
        Args: {
          p_org_id: string;
          p_assigned?: string | null;
          p_track?: string | null;
          p_status?: string | null;
          p_source?: string | null;
          p_score_min?: number | null;
          p_score_max?: number | null;
          p_cursor?: Json | null;
          p_limit?: number | null;
        };
        Returns: Json;
      };
      case_file_row_to_json: {
        Args: { r: Database["public"]["Views"]["case_file_rows"]["Row"] };
        Returns: Json;
      };
      load_org_case_list: {
        Args: {
          p_org_id: string;
          p_q?: string | null;
          p_status?: string | null;
          p_track?: string | null;
          p_source?: string | null;
          p_setter_id?: string | null;
          p_closer_id?: string | null;
          p_score_min?: number | null;
          p_score_max?: number | null;
          p_opted_from?: string | null;
          p_opted_to?: string | null;
          p_sort?: string | null;
          p_dir?: string | null;
          p_cursor?: Json | null;
          p_limit?: number | null;
        };
        Returns: Json;
      };
      load_org_case_file: {
        Args: { p_org_id: string; p_lead_id: string; p_timeline_limit?: number | null };
        Returns: Json;
      };
      load_org_case_timeline: {
        Args: {
          p_org_id: string;
          p_lead_id: string;
          p_cursor?: Json | null;
          p_limit?: number | null;
        };
        Returns: Json;
      };
      change_org_lead_status: {
        Args: {
          p_org_id: string;
          p_lead_id: string;
          p_status: Database["public"]["Enums"]["lead_status"];
          p_note?: string | null;
        };
        Returns: undefined;
      };
      load_org_precall_brief: {
        Args: { p_org_id: string; p_lead_id: string };
        Returns: Json;
      };
      load_org_call_list: {
        Args: { p_org_id: string; p_cursor?: Json | null; p_limit?: number | null };
        Returns: Json;
      };
      load_org_call_detail: {
        Args: { p_org_id: string; p_call_id: string };
        Returns: Json;
      };
      claim_transcript_webhook: {
        Args: Record<PropertyKey, never>;
        Returns: string | null;
      };
      claim_extraction_job: {
        Args: Record<PropertyKey, never>;
        Returns: string | null;
      };
      halt_follow_up_sequences_for_lead: {
        Args: {
          p_org_id: string;
          p_lead_id: string;
          p_reason: Database["public"]["Enums"]["follow_up_halt_reason"];
          p_actor?: string | null;
        };
        Returns: number;
      };
      halt_org_follow_up_sequences: {
        Args: { p_org_id: string; p_actor?: string | null };
        Returns: number;
      };
      claim_follow_up_job: {
        Args: Record<PropertyKey, never>;
        Returns: string | null;
      };
      expire_stale_follow_up_drafts: {
        Args: Record<PropertyKey, never>;
        Returns: number;
      };
      pending_follow_up_items: {
        Args: { p_org_id: string; p_lead_id?: string | null };
        Returns: Json;
      };
      seed_default_follow_up_rules: {
        Args: { p_org_id: string };
        Returns: undefined;
      };
      mark_org_activated: {
        Args: { p_org_id: string };
        Returns: string;
      };
      claim_ghl_dispatch: {
        Args: { p_id: string };
        Returns: Database["public"]["Tables"]["ghl_dispatches"]["Row"];
      };
      extraction_quotes_not_in_transcript: {
        Args: Record<PropertyKey, never>;
        Returns: {
          extraction_id: string;
          call_id: string;
          org_id: string;
          quote_text: string;
        }[];
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
      score_factor:
        | "timeline"
        | "investment_capacity"
        | "decision_authority"
        | "pain_severity";
      score_mapping_kind: "choice" | "range";
      score_trigger: "intake" | "call" | "manual" | "event";
      touch_channel: "sms" | "email" | "call" | "dm" | "voicemail" | "other";
      touch_direction: "outbound" | "inbound";
      touch_type: "system" | "human";
      touch_outcome:
        | "connected"
        | "no_answer"
        | "left_voicemail"
        | "replied"
        | "booked"
        | "not_interested";
      transcript_source: "fathom" | "fireflies" | "zoom" | "ghl" | "manual";
      webhook_source: "ghl" | "stripe" | "commas" | "transcript" | "other";
      ghl_connection_status: "active" | "broken" | "inactive";
      ghl_dispatch_status: "queued" | "sent" | "failed" | "suppressed";
      webhook_event_status: "pending" | "processed" | "dead" | "rejected";
      status_change_source: "manual" | "event";
      extraction_signal_state: "absent" | "unclear" | "present";
      extraction_job_status: "pending" | "processed" | "dead";
      unmatched_transcript_status: "open" | "assigned" | "discarded";
      follow_up_branch:
        | "closed"
        | "follow_up_scheduled"
        | "objection_hold"
        | "no_show"
        | "not_interested"
        | "ghost_risk";
      follow_up_draft_status:
        | "pending"
        | "approved"
        | "sent"
        | "rejected"
        | "discarded"
        | "expired"
        | "failed";
      follow_up_quality_failure:
        | "banned_phrase"
        | "unverified_quote"
        | "ungrounded_topic"
        | "no_lead_specific"
        | "length"
        | "greeting"
        | "signoff";
      follow_up_event_kind:
        | "generated"
        | "edited"
        | "approved"
        | "rejected"
        | "sent"
        | "failed"
        | "regenerated"
        | "discarded"
        | "quality_failed"
        | "enqueue_failed";
      follow_up_sequence_status: "active" | "halted" | "completed";
      follow_up_halt_reason:
        | "inbound_reply"
        | "appointment_booked"
        | "payment"
        | "status_closed"
        | "status_not_interested"
        | "operator"
        | "org_stop"
        | "max_length"
        | "max_duration"
        | "new_call"
        | "suppressed";
      voice_formality: "casual" | "professional";
      voice_emoji: "never" | "sparing" | "natural";
      voice_suggestion_kind: "shorter" | "less_formal" | "drop_phrase";
      voice_suggestion_status: "pending" | "accepted" | "dismissed";
      follow_up_job_status: "pending" | "processed" | "dead";
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

export type OrgRole = Enums<"org_role">;
