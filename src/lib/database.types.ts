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
      admin_actions: {
        Row: {
          actor_id: string
          case_id: string | null
          created_at: string
          id: string
          kind: string
          note: string
          request_id: string | null
          target_ref: string | null
          target_user: string | null
        }
        Insert: {
          actor_id: string
          case_id?: string | null
          created_at?: string
          id?: string
          kind: string
          note: string
          request_id?: string | null
          target_ref?: string | null
          target_user?: string | null
        }
        Update: {
          actor_id?: string
          case_id?: string | null
          created_at?: string
          id?: string
          kind?: string
          note?: string
          request_id?: string | null
          target_ref?: string | null
          target_user?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "admin_actions_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "eligible_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "admin_actions_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "admin_actions_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "public_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "admin_actions_case_id_fkey"
            columns: ["case_id"]
            isOneToOne: false
            referencedRelation: "ops_cases"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "admin_actions_target_user_fkey"
            columns: ["target_user"]
            isOneToOne: false
            referencedRelation: "eligible_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "admin_actions_target_user_fkey"
            columns: ["target_user"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "admin_actions_target_user_fkey"
            columns: ["target_user"]
            isOneToOne: false
            referencedRelation: "public_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      affinities: {
        Row: {
          created_at: string
          from_id: string
          id: string
          to_id: string
          verdict: Database["public"]["Enums"]["affinity_verdict"]
        }
        Insert: {
          created_at?: string
          from_id: string
          id?: string
          to_id: string
          verdict: Database["public"]["Enums"]["affinity_verdict"]
        }
        Update: {
          created_at?: string
          from_id?: string
          id?: string
          to_id?: string
          verdict?: Database["public"]["Enums"]["affinity_verdict"]
        }
        Relationships: [
          {
            foreignKeyName: "affinities_from_id_fkey"
            columns: ["from_id"]
            isOneToOne: false
            referencedRelation: "eligible_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "affinities_from_id_fkey"
            columns: ["from_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "affinities_from_id_fkey"
            columns: ["from_id"]
            isOneToOne: false
            referencedRelation: "public_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "affinities_to_id_fkey"
            columns: ["to_id"]
            isOneToOne: false
            referencedRelation: "eligible_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "affinities_to_id_fkey"
            columns: ["to_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "affinities_to_id_fkey"
            columns: ["to_id"]
            isOneToOne: false
            referencedRelation: "public_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_decisions: {
        Row: {
          created_at: string
          decision: string
          id: number
          run_id: number
          user_id: string | null
        }
        Insert: {
          created_at?: string
          decision: string
          id?: never
          run_id: number
          user_id?: string | null
        }
        Update: {
          created_at?: string
          decision?: string
          id?: never
          run_id?: number
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ai_decisions_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: true
            referencedRelation: "ai_runs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_decisions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "eligible_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_decisions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_decisions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "public_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_runs: {
        Row: {
          created_at: string
          feature: string
          finished_at: string | null
          id: number
          input_tokens: number | null
          latency_ms: number | null
          model: string
          output_tokens: number | null
          prompt_version: string
          request_id: string | null
          source_hash: string | null
          status: string
          user_id: string | null
        }
        Insert: {
          created_at?: string
          feature: string
          finished_at?: string | null
          id?: never
          input_tokens?: number | null
          latency_ms?: number | null
          model: string
          output_tokens?: number | null
          prompt_version: string
          request_id?: string | null
          source_hash?: string | null
          status: string
          user_id?: string | null
        }
        Update: {
          created_at?: string
          feature?: string
          finished_at?: string | null
          id?: never
          input_tokens?: number | null
          latency_ms?: number | null
          model?: string
          output_tokens?: number | null
          prompt_version?: string
          request_id?: string | null
          source_hash?: string | null
          status?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ai_runs_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "eligible_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_runs_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_runs_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "public_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      app_settings: {
        Row: {
          admin_mfa_required: boolean
          id: boolean
          identity_required: boolean
          payments_enabled: boolean
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          admin_mfa_required?: boolean
          id?: boolean
          identity_required?: boolean
          payments_enabled?: boolean
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          admin_mfa_required?: boolean
          id?: boolean
          identity_required?: boolean
          payments_enabled?: boolean
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "app_settings_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "eligible_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "app_settings_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "app_settings_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "public_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      automation_rules: {
        Row: {
          daily_limit: number
          min_interval_hours: number
          mode: string
          observed_since: string | null
          paused_reason: string | null
          rule_key: string
          updated_at: string
          updated_by: string | null
          version: number
        }
        Insert: {
          daily_limit?: number
          min_interval_hours?: number
          mode?: string
          observed_since?: string | null
          paused_reason?: string | null
          rule_key: string
          updated_at?: string
          updated_by?: string | null
          version?: number
        }
        Update: {
          daily_limit?: number
          min_interval_hours?: number
          mode?: string
          observed_since?: string | null
          paused_reason?: string | null
          rule_key?: string
          updated_at?: string
          updated_by?: string | null
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "automation_rules_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "eligible_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "automation_rules_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "automation_rules_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "public_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      automation_runs: {
        Row: {
          approved_at: string | null
          approved_by: string | null
          created_at: string
          id: string
          meeting_id: string | null
          preview_expires_at: string
          preview_hash: string
          result_code: string | null
          rule_key: string
          rule_version: number
          source_used_at: string
          status: string
          user_id: string | null
        }
        Insert: {
          approved_at?: string | null
          approved_by?: string | null
          created_at?: string
          id?: string
          meeting_id?: string | null
          preview_expires_at: string
          preview_hash: string
          result_code?: string | null
          rule_key: string
          rule_version: number
          source_used_at: string
          status: string
          user_id?: string | null
        }
        Update: {
          approved_at?: string | null
          approved_by?: string | null
          created_at?: string
          id?: string
          meeting_id?: string | null
          preview_expires_at?: string
          preview_hash?: string
          result_code?: string | null
          rule_key?: string
          rule_version?: number
          source_used_at?: string
          status?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "automation_runs_approved_by_fkey"
            columns: ["approved_by"]
            isOneToOne: false
            referencedRelation: "eligible_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "automation_runs_approved_by_fkey"
            columns: ["approved_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "automation_runs_approved_by_fkey"
            columns: ["approved_by"]
            isOneToOne: false
            referencedRelation: "public_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "automation_runs_meeting_id_fkey"
            columns: ["meeting_id"]
            isOneToOne: false
            referencedRelation: "meetings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "automation_runs_rule_key_fkey"
            columns: ["rule_key"]
            isOneToOne: false
            referencedRelation: "automation_rules"
            referencedColumns: ["rule_key"]
          },
          {
            foreignKeyName: "automation_runs_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "eligible_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "automation_runs_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "automation_runs_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "public_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      candidate_impressions: {
        Row: {
          candidate_id: string
          first_shown_at: string
          last_shown_at: string
          show_count: number
          viewer_id: string
        }
        Insert: {
          candidate_id: string
          first_shown_at?: string
          last_shown_at?: string
          show_count?: number
          viewer_id: string
        }
        Update: {
          candidate_id?: string
          first_shown_at?: string
          last_shown_at?: string
          show_count?: number
          viewer_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "candidate_impressions_candidate_id_fkey"
            columns: ["candidate_id"]
            isOneToOne: false
            referencedRelation: "eligible_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "candidate_impressions_candidate_id_fkey"
            columns: ["candidate_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "candidate_impressions_candidate_id_fkey"
            columns: ["candidate_id"]
            isOneToOne: false
            referencedRelation: "public_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "candidate_impressions_viewer_id_fkey"
            columns: ["viewer_id"]
            isOneToOne: false
            referencedRelation: "eligible_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "candidate_impressions_viewer_id_fkey"
            columns: ["viewer_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "candidate_impressions_viewer_id_fkey"
            columns: ["viewer_id"]
            isOneToOne: false
            referencedRelation: "public_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      carrier_identity_links: {
        Row: {
          di_hash: string
          user_id: string
        }
        Insert: {
          di_hash: string
          user_id: string
        }
        Update: {
          di_hash?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "carrier_identity_links_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "eligible_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "carrier_identity_links_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "carrier_identity_links_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "public_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      content_reports: {
        Row: {
          accused_id: string
          created_at: string
          detail: string
          id: string
          kind: Database["public"]["Enums"]["report_kind"]
          meeting_id: string | null
          message_id: string | null
          reporter_id: string
          resolved_at: string | null
          resolved_by: string | null
          state: Database["public"]["Enums"]["report_state"]
        }
        Insert: {
          accused_id: string
          created_at?: string
          detail: string
          id?: string
          kind: Database["public"]["Enums"]["report_kind"]
          meeting_id?: string | null
          message_id?: string | null
          reporter_id: string
          resolved_at?: string | null
          resolved_by?: string | null
          state?: Database["public"]["Enums"]["report_state"]
        }
        Update: {
          accused_id?: string
          created_at?: string
          detail?: string
          id?: string
          kind?: Database["public"]["Enums"]["report_kind"]
          meeting_id?: string | null
          message_id?: string | null
          reporter_id?: string
          resolved_at?: string | null
          resolved_by?: string | null
          state?: Database["public"]["Enums"]["report_state"]
        }
        Relationships: [
          {
            foreignKeyName: "content_reports_accused_id_fkey"
            columns: ["accused_id"]
            isOneToOne: false
            referencedRelation: "eligible_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "content_reports_accused_id_fkey"
            columns: ["accused_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "content_reports_accused_id_fkey"
            columns: ["accused_id"]
            isOneToOne: false
            referencedRelation: "public_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "content_reports_meeting_id_fkey"
            columns: ["meeting_id"]
            isOneToOne: false
            referencedRelation: "meetings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "content_reports_message_id_fkey"
            columns: ["message_id"]
            isOneToOne: false
            referencedRelation: "messages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "content_reports_reporter_id_fkey"
            columns: ["reporter_id"]
            isOneToOne: false
            referencedRelation: "eligible_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "content_reports_reporter_id_fkey"
            columns: ["reporter_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "content_reports_reporter_id_fkey"
            columns: ["reporter_id"]
            isOneToOne: false
            referencedRelation: "public_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "content_reports_resolved_by_fkey"
            columns: ["resolved_by"]
            isOneToOne: false
            referencedRelation: "eligible_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "content_reports_resolved_by_fkey"
            columns: ["resolved_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "content_reports_resolved_by_fkey"
            columns: ["resolved_by"]
            isOneToOne: false
            referencedRelation: "public_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      device_tokens: {
        Row: {
          apns_env: string | null
          created_at: string
          platform: string
          token: string
          updated_at: string
          user_id: string
        }
        Insert: {
          apns_env?: string | null
          created_at?: string
          platform?: string
          token: string
          updated_at?: string
          user_id: string
        }
        Update: {
          apns_env?: string | null
          created_at?: string
          platform?: string
          token?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "device_tokens_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "eligible_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "device_tokens_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "device_tokens_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "public_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      domain_events: {
        Row: {
          aggregate_id: string
          aggregate_type: string
          dedupe_key: string
          event_type: string
          id: number
          occurred_at: string
          props: Json
          source_version: string | null
          subject_id: string | null
        }
        Insert: {
          aggregate_id: string
          aggregate_type: string
          dedupe_key: string
          event_type: string
          id?: never
          occurred_at?: string
          props?: Json
          source_version?: string | null
          subject_id?: string | null
        }
        Update: {
          aggregate_id?: string
          aggregate_type?: string
          dedupe_key?: string
          event_type?: string
          id?: never
          occurred_at?: string
          props?: Json
          source_version?: string | null
          subject_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "domain_events_subject_id_fkey"
            columns: ["subject_id"]
            isOneToOne: false
            referencedRelation: "eligible_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "domain_events_subject_id_fkey"
            columns: ["subject_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "domain_events_subject_id_fkey"
            columns: ["subject_id"]
            isOneToOne: false
            referencedRelation: "public_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      events: {
        Row: {
          created_at: string
          id: number
          name: string
          props: Json
          user_id: string | null
        }
        Insert: {
          created_at?: string
          id?: never
          name: string
          props?: Json
          user_id?: string | null
        }
        Update: {
          created_at?: string
          id?: never
          name?: string
          props?: Json
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "events_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "eligible_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "events_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "events_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "public_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      feedbacks: {
        Row: {
          author_id: string
          body: string | null
          created_at: string
          id: string
          meeting_id: string
          met: boolean
          result: string | null
        }
        Insert: {
          author_id: string
          body?: string | null
          created_at?: string
          id?: string
          meeting_id: string
          met: boolean
          result?: string | null
        }
        Update: {
          author_id?: string
          body?: string | null
          created_at?: string
          id?: string
          meeting_id?: string
          met?: boolean
          result?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "feedbacks_author_id_fkey"
            columns: ["author_id"]
            isOneToOne: false
            referencedRelation: "eligible_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "feedbacks_author_id_fkey"
            columns: ["author_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "feedbacks_author_id_fkey"
            columns: ["author_id"]
            isOneToOne: false
            referencedRelation: "public_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "feedbacks_meeting_id_fkey"
            columns: ["meeting_id"]
            isOneToOne: false
            referencedRelation: "meetings"
            referencedColumns: ["id"]
          },
        ]
      }
      identity_verification_attempts: {
        Row: {
          consumed_at: string | null
          created_at: string
          id: string
          user_id: string
        }
        Insert: {
          consumed_at?: string | null
          created_at?: string
          id: string
          user_id: string
        }
        Update: {
          consumed_at?: string | null
          created_at?: string
          id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "identity_verification_attempts_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "eligible_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "identity_verification_attempts_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "identity_verification_attempts_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "public_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      intro_exclusions: {
        Row: {
          created_at: string
          id: string
          reason: string
          user_hi: string
          user_lo: string
        }
        Insert: {
          created_at?: string
          id?: string
          reason: string
          user_hi: string
          user_lo: string
        }
        Update: {
          created_at?: string
          id?: string
          reason?: string
          user_hi?: string
          user_lo?: string
        }
        Relationships: [
          {
            foreignKeyName: "intro_exclusions_user_hi_fkey"
            columns: ["user_hi"]
            isOneToOne: false
            referencedRelation: "eligible_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "intro_exclusions_user_hi_fkey"
            columns: ["user_hi"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "intro_exclusions_user_hi_fkey"
            columns: ["user_hi"]
            isOneToOne: false
            referencedRelation: "public_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "intro_exclusions_user_lo_fkey"
            columns: ["user_lo"]
            isOneToOne: false
            referencedRelation: "eligible_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "intro_exclusions_user_lo_fkey"
            columns: ["user_lo"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "intro_exclusions_user_lo_fkey"
            columns: ["user_lo"]
            isOneToOne: false
            referencedRelation: "public_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      intro_queue: {
        Row: {
          created_at: string
          curated_by: string
          delivered_at: string | null
          expires_at: string | null
          female_id: string
          id: string
          male_id: string
          note: string | null
          opened_at: string | null
          position: number
          reason: string | null
        }
        Insert: {
          created_at?: string
          curated_by: string
          delivered_at?: string | null
          expires_at?: string | null
          female_id: string
          id?: string
          male_id: string
          note?: string | null
          opened_at?: string | null
          position: number
          reason?: string | null
        }
        Update: {
          created_at?: string
          curated_by?: string
          delivered_at?: string | null
          expires_at?: string | null
          female_id?: string
          id?: string
          male_id?: string
          note?: string | null
          opened_at?: string | null
          position?: number
          reason?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "intro_queue_curated_by_fkey"
            columns: ["curated_by"]
            isOneToOne: false
            referencedRelation: "eligible_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "intro_queue_curated_by_fkey"
            columns: ["curated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "intro_queue_curated_by_fkey"
            columns: ["curated_by"]
            isOneToOne: false
            referencedRelation: "public_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "intro_queue_female_id_fkey"
            columns: ["female_id"]
            isOneToOne: false
            referencedRelation: "eligible_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "intro_queue_female_id_fkey"
            columns: ["female_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "intro_queue_female_id_fkey"
            columns: ["female_id"]
            isOneToOne: false
            referencedRelation: "public_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "intro_queue_male_id_fkey"
            columns: ["male_id"]
            isOneToOne: false
            referencedRelation: "eligible_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "intro_queue_male_id_fkey"
            columns: ["male_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "intro_queue_male_id_fkey"
            columns: ["male_id"]
            isOneToOne: false
            referencedRelation: "public_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      intros: {
        Row: {
          closed_at: string | null
          curated_by: string | null
          female_id: string
          id: string
          male_id: string
          opened_at: string
          outcome: Database["public"]["Enums"]["intro_outcome"] | null
          reason: string | null
        }
        Insert: {
          closed_at?: string | null
          curated_by?: string | null
          female_id: string
          id?: string
          male_id: string
          opened_at?: string
          outcome?: Database["public"]["Enums"]["intro_outcome"] | null
          reason?: string | null
        }
        Update: {
          closed_at?: string | null
          curated_by?: string | null
          female_id?: string
          id?: string
          male_id?: string
          opened_at?: string
          outcome?: Database["public"]["Enums"]["intro_outcome"] | null
          reason?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "intros_curated_by_fkey"
            columns: ["curated_by"]
            isOneToOne: false
            referencedRelation: "eligible_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "intros_curated_by_fkey"
            columns: ["curated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "intros_curated_by_fkey"
            columns: ["curated_by"]
            isOneToOne: false
            referencedRelation: "public_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "intros_female_id_fkey"
            columns: ["female_id"]
            isOneToOne: false
            referencedRelation: "eligible_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "intros_female_id_fkey"
            columns: ["female_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "intros_female_id_fkey"
            columns: ["female_id"]
            isOneToOne: false
            referencedRelation: "public_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "intros_male_id_fkey"
            columns: ["male_id"]
            isOneToOne: false
            referencedRelation: "eligible_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "intros_male_id_fkey"
            columns: ["male_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "intros_male_id_fkey"
            columns: ["male_id"]
            isOneToOne: false
            referencedRelation: "public_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      meet_places: {
        Row: {
          active: boolean
          address: string | null
          created_at: string
          created_by: string | null
          hub_id: string
          id: string
          kind: string
          map_url: string | null
          name: string
          note: string | null
          station: string
          updated_at: string
        }
        Insert: {
          active?: boolean
          address?: string | null
          created_at?: string
          created_by?: string | null
          hub_id: string
          id?: string
          kind?: string
          map_url?: string | null
          name: string
          note?: string | null
          station: string
          updated_at?: string
        }
        Update: {
          active?: boolean
          address?: string | null
          created_at?: string
          created_by?: string | null
          hub_id?: string
          id?: string
          kind?: string
          map_url?: string | null
          name?: string
          note?: string | null
          station?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "meet_places_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "eligible_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "meet_places_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "meet_places_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "public_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      meetings: {
        Row: {
          accepted_slot: number | null
          cancel_reason: string | null
          cancelled_at: string | null
          completed_at: string | null
          completed_by: string[]
          confirmed_at: string | null
          created_at: string
          id: string
          intro_id: string
          place_id: string | null
          place_kind: string | null
          place_name: string | null
          prefs: Json | null
          prefs_submitted_at: string | null
          private_opens_at: string | null
          proposed_place_id: string | null
          proposed_place_name: string | null
          proposed_slots: string[] | null
          scheduled_at: string | null
          ticket_id: string
        }
        Insert: {
          accepted_slot?: number | null
          cancel_reason?: string | null
          cancelled_at?: string | null
          completed_at?: string | null
          completed_by?: string[]
          confirmed_at?: string | null
          created_at?: string
          id?: string
          intro_id: string
          place_id?: string | null
          place_kind?: string | null
          place_name?: string | null
          prefs?: Json | null
          prefs_submitted_at?: string | null
          private_opens_at?: string | null
          proposed_place_id?: string | null
          proposed_place_name?: string | null
          proposed_slots?: string[] | null
          scheduled_at?: string | null
          ticket_id: string
        }
        Update: {
          accepted_slot?: number | null
          cancel_reason?: string | null
          cancelled_at?: string | null
          completed_at?: string | null
          completed_by?: string[]
          confirmed_at?: string | null
          created_at?: string
          id?: string
          intro_id?: string
          place_id?: string | null
          place_kind?: string | null
          place_name?: string | null
          prefs?: Json | null
          prefs_submitted_at?: string | null
          private_opens_at?: string | null
          proposed_place_id?: string | null
          proposed_place_name?: string | null
          proposed_slots?: string[] | null
          scheduled_at?: string | null
          ticket_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "meetings_intro_id_fkey"
            columns: ["intro_id"]
            isOneToOne: true
            referencedRelation: "intros"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "meetings_place_id_fkey"
            columns: ["place_id"]
            isOneToOne: false
            referencedRelation: "meet_places"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "meetings_proposed_place_id_fkey"
            columns: ["proposed_place_id"]
            isOneToOne: false
            referencedRelation: "meet_places"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "meetings_ticket_id_fkey"
            columns: ["ticket_id"]
            isOneToOne: true
            referencedRelation: "tickets"
            referencedColumns: ["id"]
          },
        ]
      }
      member_notification_preferences: {
        Row: {
          request_reminders: boolean
          updated_at: string
          user_id: string
        }
        Insert: {
          request_reminders?: boolean
          updated_at?: string
          user_id: string
        }
        Update: {
          request_reminders?: boolean
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "member_notification_preferences_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "eligible_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "member_notification_preferences_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "member_notification_preferences_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "public_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      messages: {
        Row: {
          body: string
          channel: Database["public"]["Enums"]["msg_channel"]
          created_at: string
          id: string
          meeting_id: string
          sender_id: string
        }
        Insert: {
          body: string
          channel: Database["public"]["Enums"]["msg_channel"]
          created_at?: string
          id?: string
          meeting_id: string
          sender_id: string
        }
        Update: {
          body?: string
          channel?: Database["public"]["Enums"]["msg_channel"]
          created_at?: string
          id?: string
          meeting_id?: string
          sender_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "messages_meeting_id_fkey"
            columns: ["meeting_id"]
            isOneToOne: false
            referencedRelation: "meetings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "messages_sender_id_fkey"
            columns: ["sender_id"]
            isOneToOne: false
            referencedRelation: "eligible_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "messages_sender_id_fkey"
            columns: ["sender_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "messages_sender_id_fkey"
            columns: ["sender_id"]
            isOneToOne: false
            referencedRelation: "public_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      metric_instrumentation: {
        Row: {
          id: boolean
          readiness_started_at: string
        }
        Insert: {
          id?: boolean
          readiness_started_at?: string
        }
        Update: {
          id?: boolean
          readiness_started_at?: string
        }
        Relationships: []
      }
      no_show_reports: {
        Row: {
          accused_admitted: boolean | null
          accused_id: string
          confirm_by: string
          created_at: string
          id: string
          meeting_id: string
          reporter_id: string
          resolution_note: string | null
          resolved_at: string | null
          responded_at: string | null
          review_requested_at: string | null
          state: Database["public"]["Enums"]["report_state"]
        }
        Insert: {
          accused_admitted?: boolean | null
          accused_id: string
          confirm_by: string
          created_at?: string
          id?: string
          meeting_id: string
          reporter_id: string
          resolution_note?: string | null
          resolved_at?: string | null
          responded_at?: string | null
          review_requested_at?: string | null
          state?: Database["public"]["Enums"]["report_state"]
        }
        Update: {
          accused_admitted?: boolean | null
          accused_id?: string
          confirm_by?: string
          created_at?: string
          id?: string
          meeting_id?: string
          reporter_id?: string
          resolution_note?: string | null
          resolved_at?: string | null
          responded_at?: string | null
          review_requested_at?: string | null
          state?: Database["public"]["Enums"]["report_state"]
        }
        Relationships: [
          {
            foreignKeyName: "no_show_reports_accused_id_fkey"
            columns: ["accused_id"]
            isOneToOne: false
            referencedRelation: "eligible_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "no_show_reports_accused_id_fkey"
            columns: ["accused_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "no_show_reports_accused_id_fkey"
            columns: ["accused_id"]
            isOneToOne: false
            referencedRelation: "public_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "no_show_reports_meeting_id_fkey"
            columns: ["meeting_id"]
            isOneToOne: false
            referencedRelation: "meetings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "no_show_reports_reporter_id_fkey"
            columns: ["reporter_id"]
            isOneToOne: false
            referencedRelation: "eligible_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "no_show_reports_reporter_id_fkey"
            columns: ["reporter_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "no_show_reports_reporter_id_fkey"
            columns: ["reporter_id"]
            isOneToOne: false
            referencedRelation: "public_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      notification_deliveries: {
        Row: {
          attempt: number
          channel: string
          error_code: string | null
          id: number
          notification_id: string
          provider_ref: string | null
          recipient_ref: string
          status: string
          submitted_at: string | null
          updated_at: string
        }
        Insert: {
          attempt?: number
          channel: string
          error_code?: string | null
          id?: never
          notification_id: string
          provider_ref?: string | null
          recipient_ref: string
          status: string
          submitted_at?: string | null
          updated_at?: string
        }
        Update: {
          attempt?: number
          channel?: string
          error_code?: string | null
          id?: never
          notification_id?: string
          provider_ref?: string | null
          recipient_ref?: string
          status?: string
          submitted_at?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "notification_deliveries_notification_id_fkey"
            columns: ["notification_id"]
            isOneToOne: false
            referencedRelation: "notifications"
            referencedColumns: ["id"]
          },
        ]
      }
      notification_email_verifications: {
        Row: {
          attempts: number
          code_hash: string
          email: string
          expires_at: string
          requested_at: string
          user_id: string
        }
        Insert: {
          attempts?: number
          code_hash: string
          email: string
          expires_at: string
          requested_at?: string
          user_id: string
        }
        Update: {
          attempts?: number
          code_hash?: string
          email?: string
          expires_at?: string
          requested_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "notification_email_verifications_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "eligible_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notification_email_verifications_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notification_email_verifications_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "public_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      notification_worker_runs: {
        Row: {
          claimed: number
          completed_at: string
          duration_ms: number
          failed: number
          id: number
          skipped: number
          submitted: number
          unavailable: number
          unknown: number
        }
        Insert: {
          claimed: number
          completed_at?: string
          duration_ms: number
          failed: number
          id?: never
          skipped: number
          submitted: number
          unavailable: number
          unknown: number
        }
        Update: {
          claimed?: number
          completed_at?: string
          duration_ms?: number
          failed?: number
          id?: never
          skipped?: number
          submitted?: number
          unavailable?: number
          unknown?: number
        }
        Relationships: []
      }
      notifications: {
        Row: {
          attempts: number
          created_at: string
          dispatch_state: string
          event_id: string | null
          id: string
          kind: Database["public"]["Enums"]["notification_kind"]
          last_error: string | null
          lease_token: string | null
          lease_until: string | null
          meeting_id: string | null
          next_attempt_at: string
          payload: Json
          read_at: string | null
          sent_at: string | null
          user_id: string
        }
        Insert: {
          attempts?: number
          created_at?: string
          dispatch_state?: string
          event_id?: string | null
          id?: string
          kind: Database["public"]["Enums"]["notification_kind"]
          last_error?: string | null
          lease_token?: string | null
          lease_until?: string | null
          meeting_id?: string | null
          next_attempt_at?: string
          payload?: Json
          read_at?: string | null
          sent_at?: string | null
          user_id: string
        }
        Update: {
          attempts?: number
          created_at?: string
          dispatch_state?: string
          event_id?: string | null
          id?: string
          kind?: Database["public"]["Enums"]["notification_kind"]
          last_error?: string | null
          lease_token?: string | null
          lease_until?: string | null
          meeting_id?: string | null
          next_attempt_at?: string
          payload?: Json
          read_at?: string | null
          sent_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "notifications_meeting_id_fkey"
            columns: ["meeting_id"]
            isOneToOne: false
            referencedRelation: "meetings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notifications_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "eligible_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notifications_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notifications_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "public_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      ops_case_events: {
        Row: {
          actor_id: string | null
          actor_type: string
          case_id: string
          created_at: string
          event_type: string
          from_status: string | null
          id: number
          note: string | null
          reason_code: string | null
          request_id: string | null
          to_status: string
        }
        Insert: {
          actor_id?: string | null
          actor_type: string
          case_id: string
          created_at?: string
          event_type: string
          from_status?: string | null
          id?: never
          note?: string | null
          reason_code?: string | null
          request_id?: string | null
          to_status: string
        }
        Update: {
          actor_id?: string | null
          actor_type?: string
          case_id?: string
          created_at?: string
          event_type?: string
          from_status?: string | null
          id?: never
          note?: string | null
          reason_code?: string | null
          request_id?: string | null
          to_status?: string
        }
        Relationships: [
          {
            foreignKeyName: "ops_case_events_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "eligible_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ops_case_events_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ops_case_events_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "public_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ops_case_events_case_id_fkey"
            columns: ["case_id"]
            isOneToOne: false
            referencedRelation: "ops_cases"
            referencedColumns: ["id"]
          },
        ]
      }
      ops_cases: {
        Row: {
          case_type: string
          due_at: string
          id: string
          next_check_at: string | null
          occurrence: number
          opened_at: string
          priority: string
          resolution_code: string | null
          resolved_at: string | null
          source_id: string
          source_revision: string
          status: string
          subject_id: string | null
          version: number
        }
        Insert: {
          case_type: string
          due_at: string
          id?: string
          next_check_at?: string | null
          occurrence: number
          opened_at?: string
          priority: string
          resolution_code?: string | null
          resolved_at?: string | null
          source_id: string
          source_revision: string
          status?: string
          subject_id?: string | null
          version?: number
        }
        Update: {
          case_type?: string
          due_at?: string
          id?: string
          next_check_at?: string | null
          occurrence?: number
          opened_at?: string
          priority?: string
          resolution_code?: string | null
          resolved_at?: string | null
          source_id?: string
          source_revision?: string
          status?: string
          subject_id?: string | null
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "ops_cases_subject_id_fkey"
            columns: ["subject_id"]
            isOneToOne: false
            referencedRelation: "eligible_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ops_cases_subject_id_fkey"
            columns: ["subject_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ops_cases_subject_id_fkey"
            columns: ["subject_id"]
            isOneToOne: false
            referencedRelation: "public_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      phone_codes: {
        Row: {
          attempts: number
          code_hash: string
          consumed_at: string | null
          created_at: string
          expires_at: string
          id: string
          phone: string
          user_id: string
        }
        Insert: {
          attempts?: number
          code_hash: string
          consumed_at?: string | null
          created_at?: string
          expires_at: string
          id?: string
          phone: string
          user_id: string
        }
        Update: {
          attempts?: number
          code_hash?: string
          consumed_at?: string | null
          created_at?: string
          expires_at?: string
          id?: string
          phone?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "phone_codes_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "eligible_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "phone_codes_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "phone_codes_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "public_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      policy_catalog: {
        Row: {
          note: string
          published_at: string | null
          status: string
          version: string
        }
        Insert: {
          note: string
          published_at?: string | null
          status: string
          version: string
        }
        Update: {
          note?: string
          published_at?: string | null
          status?: string
          version?: string
        }
        Relationships: []
      }
      policy_consents: {
        Row: {
          accepted_at: string
          evidence_source: string
          id: number
          policy_version: string
          user_id: string
        }
        Insert: {
          accepted_at: string
          evidence_source: string
          id?: never
          policy_version: string
          user_id: string
        }
        Update: {
          accepted_at?: string
          evidence_source?: string
          id?: never
          policy_version?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "policy_consents_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "eligible_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "policy_consents_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "policy_consents_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "public_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      policy_control: {
        Row: {
          id: boolean
          reconsent_effective_at: string | null
          required_reconsent_version: string | null
          signup_version: string
          updated_at: string
          updated_by: string | null
          version: number
        }
        Insert: {
          id?: boolean
          reconsent_effective_at?: string | null
          required_reconsent_version?: string | null
          signup_version: string
          updated_at?: string
          updated_by?: string | null
          version?: number
        }
        Update: {
          id?: boolean
          reconsent_effective_at?: string | null
          required_reconsent_version?: string | null
          signup_version?: string
          updated_at?: string
          updated_by?: string | null
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "policy_control_required_reconsent_version_fkey"
            columns: ["required_reconsent_version"]
            isOneToOne: false
            referencedRelation: "policy_catalog"
            referencedColumns: ["version"]
          },
          {
            foreignKeyName: "policy_control_signup_version_fkey"
            columns: ["signup_version"]
            isOneToOne: false
            referencedRelation: "policy_catalog"
            referencedColumns: ["version"]
          },
          {
            foreignKeyName: "policy_control_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "eligible_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "policy_control_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "policy_control_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "public_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      preference_answers: {
        Row: {
          answered_at: string
          choice: number
          question_id: number
          user_id: string
        }
        Insert: {
          answered_at?: string
          choice: number
          question_id: number
          user_id: string
        }
        Update: {
          answered_at?: string
          choice?: number
          question_id?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "preference_answers_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "eligible_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "preference_answers_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "preference_answers_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "public_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      profile_interview_drafts: {
        Row: {
          data: Json
          revision: number
          updated_at: string
          user_id: string
        }
        Insert: {
          data: Json
          revision?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          data?: Json
          revision?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "profile_interview_drafts_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          account_state: Database["public"]["Enums"]["account_state"]
          agreed_policy_version: string | null
          banned_reason: string | null
          birth: string | null
          company_email: string
          created_at: string
          details: Json
          drinking: string | null
          email_verified_at: string | null
          evening_note: string | null
          feedback_emails: boolean
          gender: Database["public"]["Enums"]["gender"]
          headline: string | null
          hub_id: string
          id: string
          identity_verification_id: string | null
          identity_verified_at: string | null
          interests: string[]
          intro: string | null
          job: string | null
          known_as: string | null
          match_note: string | null
          match_tags: string[]
          mbti: string | null
          name: string | null
          notification_email: string | null
          notification_email_verified_at: string | null
          onboarding_step: number
          paused_at: string | null
          phone: string | null
          phone_verified_at: string | null
          photo_paths: string[] | null
          photo_reject_reason: string | null
          photo_reviewed_at: string | null
          photo_reviewed_by: string | null
          photo_state: Database["public"]["Enums"]["photo_state"]
          photo_url: string | null
          privacy_agreed_at: string | null
          religion: string | null
          role: string
          smoking: string | null
          terms_agreed_at: string | null
          topic_note: string | null
          topics: string[]
          updated_at: string
        }
        Insert: {
          account_state?: Database["public"]["Enums"]["account_state"]
          agreed_policy_version?: string | null
          banned_reason?: string | null
          birth?: string | null
          company_email: string
          created_at?: string
          details?: Json
          drinking?: string | null
          email_verified_at?: string | null
          evening_note?: string | null
          feedback_emails?: boolean
          gender: Database["public"]["Enums"]["gender"]
          headline?: string | null
          hub_id: string
          id: string
          identity_verification_id?: string | null
          identity_verified_at?: string | null
          interests?: string[]
          intro?: string | null
          job?: string | null
          known_as?: string | null
          match_note?: string | null
          match_tags?: string[]
          mbti?: string | null
          name?: string | null
          notification_email?: string | null
          notification_email_verified_at?: string | null
          onboarding_step?: number
          paused_at?: string | null
          phone?: string | null
          phone_verified_at?: string | null
          photo_paths?: string[] | null
          photo_reject_reason?: string | null
          photo_reviewed_at?: string | null
          photo_reviewed_by?: string | null
          photo_state?: Database["public"]["Enums"]["photo_state"]
          photo_url?: string | null
          privacy_agreed_at?: string | null
          religion?: string | null
          role?: string
          smoking?: string | null
          terms_agreed_at?: string | null
          topic_note?: string | null
          topics?: string[]
          updated_at?: string
        }
        Update: {
          account_state?: Database["public"]["Enums"]["account_state"]
          agreed_policy_version?: string | null
          banned_reason?: string | null
          birth?: string | null
          company_email?: string
          created_at?: string
          details?: Json
          drinking?: string | null
          email_verified_at?: string | null
          evening_note?: string | null
          feedback_emails?: boolean
          gender?: Database["public"]["Enums"]["gender"]
          headline?: string | null
          hub_id?: string
          id?: string
          identity_verification_id?: string | null
          identity_verified_at?: string | null
          interests?: string[]
          intro?: string | null
          job?: string | null
          known_as?: string | null
          match_note?: string | null
          match_tags?: string[]
          mbti?: string | null
          name?: string | null
          notification_email?: string | null
          notification_email_verified_at?: string | null
          onboarding_step?: number
          paused_at?: string | null
          phone?: string | null
          phone_verified_at?: string | null
          photo_paths?: string[] | null
          photo_reject_reason?: string | null
          photo_reviewed_at?: string | null
          photo_reviewed_by?: string | null
          photo_state?: Database["public"]["Enums"]["photo_state"]
          photo_url?: string | null
          privacy_agreed_at?: string | null
          religion?: string | null
          role?: string
          smoking?: string | null
          terms_agreed_at?: string | null
          topic_note?: string | null
          topics?: string[]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "profiles_photo_reviewed_by_fkey"
            columns: ["photo_reviewed_by"]
            isOneToOne: false
            referencedRelation: "eligible_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "profiles_photo_reviewed_by_fkey"
            columns: ["photo_reviewed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "profiles_photo_reviewed_by_fkey"
            columns: ["photo_reviewed_by"]
            isOneToOne: false
            referencedRelation: "public_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      support_requests: {
        Row: {
          body: string
          category: string
          created_at: string
          id: string
          responded_at: string | null
          responded_by: string | null
          response: string | null
          status: string
          user_id: string
        }
        Insert: {
          body: string
          category: string
          created_at?: string
          id?: string
          responded_at?: string | null
          responded_by?: string | null
          response?: string | null
          status?: string
          user_id: string
        }
        Update: {
          body?: string
          category?: string
          created_at?: string
          id?: string
          responded_at?: string | null
          responded_by?: string | null
          response?: string | null
          status?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "support_requests_responded_by_fkey"
            columns: ["responded_by"]
            isOneToOne: false
            referencedRelation: "eligible_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "support_requests_responded_by_fkey"
            columns: ["responded_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "support_requests_responded_by_fkey"
            columns: ["responded_by"]
            isOneToOne: false
            referencedRelation: "public_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "support_requests_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "eligible_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "support_requests_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "support_requests_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "public_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      ticket_orders: {
        Row: {
          amount: number
          cancel_reason: string | null
          canceled_at: string | null
          confirmed_at: string | null
          created_at: string
          fulfill_note: string | null
          fulfilled_by: string | null
          kind: Database["public"]["Enums"]["ticket_kind"]
          order_id: string
          paid_at: string | null
          payment_attention: string | null
          payment_key: string | null
          payment_method: string | null
          payment_required: boolean
          provider_checked_at: string | null
          quantity: number
          state: string
          user_id: string
        }
        Insert: {
          amount: number
          cancel_reason?: string | null
          canceled_at?: string | null
          confirmed_at?: string | null
          created_at?: string
          fulfill_note?: string | null
          fulfilled_by?: string | null
          kind: Database["public"]["Enums"]["ticket_kind"]
          order_id: string
          paid_at?: string | null
          payment_attention?: string | null
          payment_key?: string | null
          payment_method?: string | null
          payment_required?: boolean
          provider_checked_at?: string | null
          quantity?: number
          state?: string
          user_id: string
        }
        Update: {
          amount?: number
          cancel_reason?: string | null
          canceled_at?: string | null
          confirmed_at?: string | null
          created_at?: string
          fulfill_note?: string | null
          fulfilled_by?: string | null
          kind?: Database["public"]["Enums"]["ticket_kind"]
          order_id?: string
          paid_at?: string | null
          payment_attention?: string | null
          payment_key?: string | null
          payment_method?: string | null
          payment_required?: boolean
          provider_checked_at?: string | null
          quantity?: number
          state?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ticket_orders_fulfilled_by_fkey"
            columns: ["fulfilled_by"]
            isOneToOne: false
            referencedRelation: "eligible_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ticket_orders_fulfilled_by_fkey"
            columns: ["fulfilled_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ticket_orders_fulfilled_by_fkey"
            columns: ["fulfilled_by"]
            isOneToOne: false
            referencedRelation: "public_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ticket_orders_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "eligible_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ticket_orders_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ticket_orders_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "public_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      tickets: {
        Row: {
          expires_at: string
          id: string
          intro_id: string | null
          issued_at: string
          kind: Database["public"]["Enums"]["ticket_kind"]
          payment_id: string | null
          price_krw: number
          refund_locked: boolean
          refunded_at: string | null
          restored_from_ticket_id: string | null
          state: Database["public"]["Enums"]["ticket_state"]
          used_at: string | null
          user_id: string
        }
        Insert: {
          expires_at?: string
          id?: string
          intro_id?: string | null
          issued_at?: string
          kind: Database["public"]["Enums"]["ticket_kind"]
          payment_id?: string | null
          price_krw?: number
          refund_locked?: boolean
          refunded_at?: string | null
          restored_from_ticket_id?: string | null
          state?: Database["public"]["Enums"]["ticket_state"]
          used_at?: string | null
          user_id: string
        }
        Update: {
          expires_at?: string
          id?: string
          intro_id?: string | null
          issued_at?: string
          kind?: Database["public"]["Enums"]["ticket_kind"]
          payment_id?: string | null
          price_krw?: number
          refund_locked?: boolean
          refunded_at?: string | null
          restored_from_ticket_id?: string | null
          state?: Database["public"]["Enums"]["ticket_state"]
          used_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "tickets_intro_id_fkey"
            columns: ["intro_id"]
            isOneToOne: false
            referencedRelation: "intros"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tickets_restored_from_ticket_id_fkey"
            columns: ["restored_from_ticket_id"]
            isOneToOne: true
            referencedRelation: "tickets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tickets_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "eligible_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tickets_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tickets_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "public_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      eligible_profiles: {
        Row: {
          account_state: Database["public"]["Enums"]["account_state"] | null
          agreed_policy_version: string | null
          banned_reason: string | null
          birth: string | null
          company_email: string | null
          created_at: string | null
          details: Json | null
          drinking: string | null
          email_verified_at: string | null
          feedback_emails: boolean | null
          gender: Database["public"]["Enums"]["gender"] | null
          headline: string | null
          hub_id: string | null
          id: string | null
          interests: string[] | null
          intro: string | null
          job: string | null
          match_note: string | null
          match_tags: string[] | null
          mbti: string | null
          name: string | null
          onboarding_step: number | null
          paused_at: string | null
          phone_verified_at: string | null
          photo_paths: string[] | null
          photo_reject_reason: string | null
          photo_reviewed_at: string | null
          photo_reviewed_by: string | null
          photo_state: Database["public"]["Enums"]["photo_state"] | null
          photo_url: string | null
          privacy_agreed_at: string | null
          religion: string | null
          role: string | null
          smoking: string | null
          terms_agreed_at: string | null
          topic_note: string | null
          topics: string[] | null
          updated_at: string | null
        }
        Insert: {
          account_state?: Database["public"]["Enums"]["account_state"] | null
          agreed_policy_version?: string | null
          banned_reason?: string | null
          birth?: string | null
          company_email?: string | null
          created_at?: string | null
          details?: Json | null
          drinking?: string | null
          email_verified_at?: string | null
          feedback_emails?: boolean | null
          gender?: Database["public"]["Enums"]["gender"] | null
          headline?: string | null
          hub_id?: string | null
          id?: string | null
          interests?: string[] | null
          intro?: string | null
          job?: string | null
          match_note?: string | null
          match_tags?: string[] | null
          mbti?: string | null
          name?: string | null
          onboarding_step?: number | null
          paused_at?: string | null
          phone_verified_at?: string | null
          photo_paths?: string[] | null
          photo_reject_reason?: string | null
          photo_reviewed_at?: string | null
          photo_reviewed_by?: string | null
          photo_state?: Database["public"]["Enums"]["photo_state"] | null
          photo_url?: string | null
          privacy_agreed_at?: string | null
          religion?: string | null
          role?: string | null
          smoking?: string | null
          terms_agreed_at?: string | null
          topic_note?: string | null
          topics?: string[] | null
          updated_at?: string | null
        }
        Update: {
          account_state?: Database["public"]["Enums"]["account_state"] | null
          agreed_policy_version?: string | null
          banned_reason?: string | null
          birth?: string | null
          company_email?: string | null
          created_at?: string | null
          details?: Json | null
          drinking?: string | null
          email_verified_at?: string | null
          feedback_emails?: boolean | null
          gender?: Database["public"]["Enums"]["gender"] | null
          headline?: string | null
          hub_id?: string | null
          id?: string | null
          interests?: string[] | null
          intro?: string | null
          job?: string | null
          match_note?: string | null
          match_tags?: string[] | null
          mbti?: string | null
          name?: string | null
          onboarding_step?: number | null
          paused_at?: string | null
          phone_verified_at?: string | null
          photo_paths?: string[] | null
          photo_reject_reason?: string | null
          photo_reviewed_at?: string | null
          photo_reviewed_by?: string | null
          photo_state?: Database["public"]["Enums"]["photo_state"] | null
          photo_url?: string | null
          privacy_agreed_at?: string | null
          religion?: string | null
          role?: string | null
          smoking?: string | null
          terms_agreed_at?: string | null
          topic_note?: string | null
          topics?: string[] | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "profiles_photo_reviewed_by_fkey"
            columns: ["photo_reviewed_by"]
            isOneToOne: false
            referencedRelation: "eligible_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "profiles_photo_reviewed_by_fkey"
            columns: ["photo_reviewed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "profiles_photo_reviewed_by_fkey"
            columns: ["photo_reviewed_by"]
            isOneToOne: false
            referencedRelation: "public_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      public_profiles: {
        Row: {
          age: number | null
          details: Json | null
          drinking: string | null
          headline: string | null
          hub_id: string | null
          id: string | null
          interests: string[] | null
          intro: string | null
          job: string | null
          match_tags: string[] | null
          mbti: string | null
          name: string | null
          photo_paths: string[] | null
          photo_url: string | null
          religion: string | null
          smoking: string | null
          topics: string[] | null
        }
        Insert: {
          age?: never
          details?: Json | null
          drinking?: string | null
          headline?: string | null
          hub_id?: string | null
          id?: string | null
          interests?: string[] | null
          intro?: string | null
          job?: string | null
          match_tags?: string[] | null
          mbti?: string | null
          name?: string | null
          photo_paths?: string[] | null
          photo_url?: string | null
          religion?: string | null
          smoking?: string | null
          topics?: string[] | null
        }
        Update: {
          age?: never
          details?: Json | null
          drinking?: string | null
          headline?: string | null
          hub_id?: string | null
          id?: string | null
          interests?: string[] | null
          intro?: string | null
          job?: string | null
          match_tags?: string[] | null
          mbti?: string | null
          name?: string | null
          photo_paths?: string[] | null
          photo_url?: string | null
          religion?: string | null
          smoking?: string | null
          topics?: string[] | null
        }
        Relationships: []
      }
    }
    Functions: {
      accept_meeting_slot: {
        Args: { p_index: number; p_meeting_id: string }
        Returns: {
          accepted_slot: number | null
          cancel_reason: string | null
          cancelled_at: string | null
          completed_at: string | null
          completed_by: string[]
          confirmed_at: string | null
          created_at: string
          id: string
          intro_id: string
          place_id: string | null
          place_kind: string | null
          place_name: string | null
          prefs: Json | null
          prefs_submitted_at: string | null
          private_opens_at: string | null
          proposed_place_id: string | null
          proposed_place_name: string | null
          proposed_slots: string[] | null
          scheduled_at: string | null
          ticket_id: string
        }
        SetofOptions: {
          from: "*"
          to: "meetings"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      admin_activate_policy_reconsent: {
        Args: {
          p_effective_at: string
          p_expected_version: number
          p_reason: string
          p_request_id: string
        }
        Returns: Json
      }
      admin_ai_quality_v2: { Args: never; Returns: Json }
      admin_apply_ops_backfill: {
        Args: { p_expected_missing: number; p_note: string }
        Returns: number
      }
      admin_approve_automation: {
        Args: {
          p_preview_hash: string
          p_reason: string
          p_request_id: string
          p_run_id: string
        }
        Returns: string
      }
      admin_automation_overview: { Args: never; Returns: Json }
      admin_cancel_meeting: {
        Args: { p_meeting: string; p_note: string; p_refund?: boolean }
        Returns: {
          accepted_slot: number | null
          cancel_reason: string | null
          cancelled_at: string | null
          completed_at: string | null
          completed_by: string[]
          confirmed_at: string | null
          created_at: string
          id: string
          intro_id: string
          place_id: string | null
          place_kind: string | null
          place_name: string | null
          prefs: Json | null
          prefs_submitted_at: string | null
          private_opens_at: string | null
          proposed_place_id: string | null
          proposed_place_name: string | null
          proposed_slots: string[] | null
          scheduled_at: string | null
          ticket_id: string
        }
        SetofOptions: {
          from: "*"
          to: "meetings"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      admin_curation_targets: {
        Args: never
        Returns: {
          blocked_count: number
          delivered_count: number
          has_open_intro: boolean
          hub_id: string
          id: string
          name: string
          oldest_like_hours: number
          photo_url: string
          pool_count: number
          queued_count: number
          receiving: boolean
        }[]
      }
      admin_curator_stats: {
        Args: { p_since?: string }
        Returns: {
          curated: number
          curator_id: string
          curator_name: string
          delivered: number
          expired: number
          met: number
          opened: number
          passed: number
          undecided: number
          waiting: number
        }[]
      }
      admin_dashboard: { Args: never; Returns: Json }
      admin_fulfill_order: {
        Args: { p_note: string; p_order_id: string }
        Returns: number
      }
      admin_like_pool: {
        Args: { p_male: string }
        Returns: {
          birth: string
          details: Json
          drinking: string
          headline: string
          hub_id: string
          id: string
          interests: string[]
          intro: string
          job: string
          liked_at: string
          match_tags: string[]
          mbti: string
          name: string
          photo_state: Database["public"]["Enums"]["photo_state"]
          photo_url: string
          religion: string
          smoking: string
          topics: string[]
          waiting_hours: number
        }[]
      }
      admin_marketplace_health: { Args: never; Returns: Json }
      admin_marketplace_health_v2: {
        Args: { p_days?: number; p_hub?: string }
        Returns: Json
      }
      admin_meet_places: {
        Args: never
        Returns: {
          active: boolean
          address: string | null
          created_at: string
          created_by: string | null
          hub_id: string
          id: string
          kind: string
          map_url: string | null
          name: string
          note: string | null
          station: string
          updated_at: string
        }[]
        SetofOptions: {
          from: "*"
          to: "meet_places"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      admin_meetings: {
        Args: { p_state?: string }
        Returns: {
          cancel_reason: string
          cancelled_at: string
          completed_at: string
          confirmed_at: string
          created_at: string
          female_id: string
          female_name: string
          id: string
          male_id: string
          male_name: string
          place_name: string
          prefs_submitted_at: string
          scheduled_at: string
          ticket_id: string
          ticket_state: Database["public"]["Enums"]["ticket_state"]
        }[]
      }
      admin_member_detail: { Args: { p_user: string }; Returns: Json }
      admin_member_timeline: {
        Args: { p_cursor?: Json; p_limit?: number; p_user_id: string }
        Returns: Json
      }
      admin_members: {
        Args: {
          p_gender?: Database["public"]["Enums"]["gender"]
          p_hub?: string
          p_paused?: boolean
          p_query?: string
          p_state?: Database["public"]["Enums"]["account_state"]
        }
        Returns: {
          account_state: Database["public"]["Enums"]["account_state"]
          company_email: string
          created_at: string
          gender: Database["public"]["Enums"]["gender"]
          has_active_meeting: boolean
          hub_id: string
          id: string
          name: string
          onboarding_step: number
          paused_at: string
          pending_reports_against: number
          photo_url: string
          role: string
          unused_tickets: number
        }[]
      }
      admin_no_show_reports: {
        Args: { p_state?: Database["public"]["Enums"]["report_state"] }
        Returns: {
          accused_admitted: boolean
          accused_id: string
          accused_name: string
          accused_note: string
          accused_state: Database["public"]["Enums"]["account_state"]
          compensated: boolean
          confirm_by: string
          created_at: string
          id: string
          meeting_id: string
          place_name: string
          reporter_id: string
          reporter_name: string
          reporter_note: string
          resolution_note: string
          resolved_at: string
          responded_at: string
          review_requested_at: string
          scheduled_at: string
          state: Database["public"]["Enums"]["report_state"]
        }[]
      }
      admin_notification_health: { Args: never; Returns: Json }
      admin_notification_health_base: { Args: never; Returns: Json }
      admin_operational_health: { Args: never; Returns: Json }
      admin_operational_health_legacy: { Args: never; Returns: Json }
      admin_ops_case_detail: { Args: { p_case_id: string }; Returns: Json }
      admin_ops_cases: {
        Args: {
          p_cursor?: Json
          p_hub?: string
          p_limit?: number
          p_priority?: string
          p_status?: string
          p_type?: string
        }
        Returns: Json
      }
      admin_ops_overview: { Args: { p_hub?: string }; Returns: Json }
      admin_pause_policy_reconsent: {
        Args: {
          p_expected_version: number
          p_reason: string
          p_request_id: string
        }
        Returns: Json
      }
      admin_photo_queue: {
        Args: { p_state?: Database["public"]["Enums"]["photo_state"] }
        Returns: {
          account_state: Database["public"]["Enums"]["account_state"]
          gender: Database["public"]["Enums"]["gender"]
          hub_id: string
          id: string
          name: string
          onboarding_step: number
          photo_paths: string[]
          photo_state: Database["public"]["Enums"]["photo_state"]
          photo_url: string
          reject_reason: string
          updated_at: string
        }[]
      }
      admin_policy_preview: { Args: never; Returns: Json }
      admin_preview_ops_backfill: { Args: never; Returns: Json }
      admin_queue: {
        Args: { p_male: string }
        Returns: {
          birth: string
          curator_name: string
          delivered_at: string
          details: Json
          drinking: string
          expires_at: string
          female_id: string
          headline: string
          hub_id: string
          interests: string[]
          intro: string
          job: string
          match_tags: string[]
          mbti: string
          name: string
          note: string
          photo_state: Database["public"]["Enums"]["photo_state"]
          photo_url: string
          queue_position: number
          reason: string
          religion: string
          smoking: string
          topics: string[]
        }[]
      }
      admin_reports: {
        Args: { p_state?: Database["public"]["Enums"]["report_state"] }
        Returns: {
          accused_id: string
          accused_name: string
          accused_state: Database["public"]["Enums"]["account_state"]
          created_at: string
          detail: string
          id: string
          kind: Database["public"]["Enums"]["report_kind"]
          meeting_id: string
          message_body: string
          refundable: boolean
          reporter_id: string
          reporter_name: string
          resolve_note: string
          resolved_at: string
          state: Database["public"]["Enums"]["report_state"]
        }[]
      }
      admin_reset_photo: {
        Args: { p_note: string; p_user: string }
        Returns: undefined
      }
      admin_resolve_no_show: {
        Args: { p_note: string; p_report_id: string; p_upheld: boolean }
        Returns: {
          accused_admitted: boolean | null
          accused_id: string
          confirm_by: string
          created_at: string
          id: string
          meeting_id: string
          reporter_id: string
          resolution_note: string | null
          resolved_at: string | null
          responded_at: string | null
          review_requested_at: string | null
          state: Database["public"]["Enums"]["report_state"]
        }
        SetofOptions: {
          from: "*"
          to: "no_show_reports"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      admin_retry_notifications: {
        Args: { p_ids: string[]; p_note: string }
        Returns: number
      }
      admin_review_photo: {
        Args: { p_approve: boolean; p_note: string; p_user: string }
        Returns: {
          account_state: Database["public"]["Enums"]["account_state"]
          agreed_policy_version: string | null
          banned_reason: string | null
          birth: string | null
          company_email: string
          created_at: string
          details: Json
          drinking: string | null
          email_verified_at: string | null
          evening_note: string | null
          feedback_emails: boolean
          gender: Database["public"]["Enums"]["gender"]
          headline: string | null
          hub_id: string
          id: string
          identity_verification_id: string | null
          identity_verified_at: string | null
          interests: string[]
          intro: string | null
          job: string | null
          known_as: string | null
          match_note: string | null
          match_tags: string[]
          mbti: string | null
          name: string | null
          notification_email: string | null
          notification_email_verified_at: string | null
          onboarding_step: number
          paused_at: string | null
          phone: string | null
          phone_verified_at: string | null
          photo_paths: string[] | null
          photo_reject_reason: string | null
          photo_reviewed_at: string | null
          photo_reviewed_by: string | null
          photo_state: Database["public"]["Enums"]["photo_state"]
          photo_url: string | null
          privacy_agreed_at: string | null
          religion: string | null
          role: string
          smoking: string | null
          terms_agreed_at: string | null
          topic_note: string | null
          topics: string[]
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "profiles"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      admin_sensitive_auth_ok: { Args: never; Returns: boolean }
      admin_set_account_state: {
        Args: {
          p_note: string
          p_state: Database["public"]["Enums"]["account_state"]
          p_user: string
        }
        Returns: {
          account_state: Database["public"]["Enums"]["account_state"]
          agreed_policy_version: string | null
          banned_reason: string | null
          birth: string | null
          company_email: string
          created_at: string
          details: Json
          drinking: string | null
          email_verified_at: string | null
          evening_note: string | null
          feedback_emails: boolean
          gender: Database["public"]["Enums"]["gender"]
          headline: string | null
          hub_id: string
          id: string
          identity_verification_id: string | null
          identity_verified_at: string | null
          interests: string[]
          intro: string | null
          job: string | null
          known_as: string | null
          match_note: string | null
          match_tags: string[]
          mbti: string | null
          name: string | null
          notification_email: string | null
          notification_email_verified_at: string | null
          onboarding_step: number
          paused_at: string | null
          phone: string | null
          phone_verified_at: string | null
          photo_paths: string[] | null
          photo_reject_reason: string | null
          photo_reviewed_at: string | null
          photo_reviewed_by: string | null
          photo_state: Database["public"]["Enums"]["photo_state"]
          photo_url: string | null
          privacy_agreed_at: string | null
          religion: string | null
          role: string
          smoking: string | null
          terms_agreed_at: string | null
          topic_note: string | null
          topics: string[]
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "profiles"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      admin_set_payments: {
        Args: { p_note: string; p_on: boolean }
        Returns: {
          admin_mfa_required: boolean
          id: boolean
          identity_required: boolean
          payments_enabled: boolean
          updated_at: string
          updated_by: string | null
        }
        SetofOptions: {
          from: "*"
          to: "app_settings"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      admin_set_queue: {
        Args: { p_female_ids: string[]; p_male: string; p_note: string }
        Returns: number
      }
      admin_set_queue_reason: {
        Args: { p_female: string; p_male: string; p_reason: string }
        Returns: {
          created_at: string
          curated_by: string
          delivered_at: string | null
          expires_at: string | null
          female_id: string
          id: string
          male_id: string
          note: string | null
          opened_at: string | null
          position: number
          reason: string | null
        }
        SetofOptions: {
          from: "*"
          to: "intro_queue"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      admin_support_page: {
        Args: {
          p_before?: string
          p_before_id?: string
          p_limit?: number
          p_status?: string
        }
        Returns: Json
      }
      admin_support_requests: {
        Args: { p_status?: string }
        Returns: {
          body: string
          category: string
          created_at: string
          id: string
          member_name: string
          responded_at: string
          response: string
          status: string
          user_id: string
        }[]
      }
      admin_system_overview: { Args: never; Returns: Json }
      admin_system_overview_legacy: { Args: never; Returns: Json }
      admin_ticket_orders: {
        Args: { p_state?: string }
        Returns: {
          amount: number
          by_admin: boolean
          confirmed_at: string
          created_at: string
          fulfill_note: string
          kind: Database["public"]["Enums"]["ticket_kind"]
          order_id: string
          payment_attention: string
          payment_required: boolean
          provider_checked_at: string
          quantity: number
          state: string
          user_gender: Database["public"]["Enums"]["gender"]
          user_id: string
          user_name: string
        }[]
      }
      admin_transition_case: {
        Args: {
          p_action: string
          p_case_id: string
          p_expected_version: number
          p_next_check_at?: string
          p_reason: string
          p_request_id: string
        }
        Returns: {
          case_type: string
          due_at: string
          id: string
          next_check_at: string | null
          occurrence: number
          opened_at: string
          priority: string
          resolution_code: string | null
          resolved_at: string | null
          source_id: string
          source_revision: string
          status: string
          subject_id: string | null
          version: number
        }
        SetofOptions: {
          from: "*"
          to: "ops_cases"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      admin_update_automation_rule: {
        Args: {
          p_daily_limit: number
          p_expected_version: number
          p_min_interval_hours: number
          p_mode: string
          p_paused_reason: string
          p_reason: string
          p_request_id: string
        }
        Returns: {
          daily_limit: number
          min_interval_hours: number
          mode: string
          observed_since: string | null
          paused_reason: string | null
          rule_key: string
          updated_at: string
          updated_by: string | null
          version: number
        }
        SetofOptions: {
          from: "*"
          to: "automation_rules"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      admin_upsert_meet_place: {
        Args: {
          p_active: boolean
          p_address: string
          p_hub_id: string
          p_id: string
          p_kind: string
          p_map_url: string
          p_name: string
          p_note: string
          p_station: string
        }
        Returns: {
          active: boolean
          address: string | null
          created_at: string
          created_by: string | null
          hub_id: string
          id: string
          kind: string
          map_url: string | null
          name: string
          note: string | null
          station: string
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "meet_places"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      apply_no_show_confirmed: {
        Args: { p_report_id: string }
        Returns: {
          accused_admitted: boolean | null
          accused_id: string
          confirm_by: string
          created_at: string
          id: string
          meeting_id: string
          reporter_id: string
          resolution_note: string | null
          resolved_at: string | null
          responded_at: string | null
          review_requested_at: string | null
          state: Database["public"]["Enums"]["report_state"]
        }
        SetofOptions: {
          from: "*"
          to: "no_show_reports"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      apply_payment_reconciliation: {
        Args: {
          p_actor: string
          p_balance_amount: number
          p_method?: string
          p_order_id: string
          p_payment_key: string
          p_provider_status: string
          p_total_amount: number
        }
        Returns: string
      }
      automation_reminder_valid: {
        Args: { p_meeting_id: string; p_used_at: string; p_user_id: string }
        Returns: boolean
      }
      automation_tick: { Args: never; Returns: number }
      block_user: {
        Args: { p_reason?: string; p_target: string }
        Returns: undefined
      }
      carrier_adult_verified: { Args: { p_user: string }; Returns: boolean }
      carrier_identity_required: { Args: never; Returns: boolean }
      claim_notification_dispatches: {
        Args: { p_limit?: number }
        Returns: {
          attempts: number
          id: string
          kind: Database["public"]["Enums"]["notification_kind"]
          lease_token: string
          meeting_id: string
          payload: Json
          user_id: string
        }[]
      }
      confirm_meeting: {
        Args: {
          p_meeting_id: string
          p_place_kind?: string
          p_place_name: string
          p_scheduled_at: string
        }
        Returns: {
          accepted_slot: number | null
          cancel_reason: string | null
          cancelled_at: string | null
          completed_at: string | null
          completed_by: string[]
          confirmed_at: string | null
          created_at: string
          id: string
          intro_id: string
          place_id: string | null
          place_kind: string | null
          place_name: string | null
          prefs: Json | null
          prefs_submitted_at: string | null
          private_opens_at: string | null
          proposed_place_id: string | null
          proposed_place_name: string | null
          proposed_slots: string[] | null
          scheduled_at: string | null
          ticket_id: string
        }
        SetofOptions: {
          from: "*"
          to: "meetings"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      create_my_profile: {
        Args: {
          p_gender: Database["public"]["Enums"]["gender"]
          p_hub_id: string
        }
        Returns: {
          account_state: Database["public"]["Enums"]["account_state"]
          agreed_policy_version: string | null
          banned_reason: string | null
          birth: string | null
          company_email: string
          created_at: string
          details: Json
          drinking: string | null
          email_verified_at: string | null
          evening_note: string | null
          feedback_emails: boolean
          gender: Database["public"]["Enums"]["gender"]
          headline: string | null
          hub_id: string
          id: string
          identity_verification_id: string | null
          identity_verified_at: string | null
          interests: string[]
          intro: string | null
          job: string | null
          known_as: string | null
          match_note: string | null
          match_tags: string[]
          mbti: string | null
          name: string | null
          notification_email: string | null
          notification_email_verified_at: string | null
          onboarding_step: number
          paused_at: string | null
          phone: string | null
          phone_verified_at: string | null
          photo_paths: string[] | null
          photo_reject_reason: string | null
          photo_reviewed_at: string | null
          photo_reviewed_by: string | null
          photo_state: Database["public"]["Enums"]["photo_state"]
          photo_url: string | null
          privacy_agreed_at: string | null
          religion: string | null
          role: string
          smoking: string | null
          terms_agreed_at: string | null
          topic_note: string | null
          topics: string[]
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "profiles"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      create_support_request: {
        Args: { p_body: string; p_category: string }
        Returns: string
      }
      create_ticket_order: {
        Args: {
          p_kind?: Database["public"]["Enums"]["ticket_kind"]
          p_quantity?: number
        }
        Returns: {
          amount: number
          cancel_reason: string | null
          canceled_at: string | null
          confirmed_at: string | null
          created_at: string
          fulfill_note: string | null
          fulfilled_by: string | null
          kind: Database["public"]["Enums"]["ticket_kind"]
          order_id: string
          paid_at: string | null
          payment_attention: string | null
          payment_key: string | null
          payment_method: string | null
          payment_required: boolean
          provider_checked_at: string | null
          quantity: number
          state: string
          user_id: string
        }
        SetofOptions: {
          from: "*"
          to: "ticket_orders"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      decline_meeting: {
        Args: { p_meeting_id: string; p_reason?: string }
        Returns: undefined
      }
      drain_notification_outbox: { Args: never; Returns: undefined }
      enqueue_feedback_due: { Args: never; Returns: number }
      enqueue_meeting_notification: {
        Args: {
          p_kind: Database["public"]["Enums"]["notification_kind"]
          p_meeting_id: string
          p_to_female: boolean
        }
        Returns: undefined
      }
      exclude_pair: {
        Args: { a: string; b: string; p_reason: string }
        Returns: undefined
      }
      expire_intro_queue: { Args: never; Returns: number }
      expire_unanswered_meetings: { Args: never; Returns: number }
      expire_unanswered_no_show_reports: { Args: never; Returns: number }
      finalize_paid_order_cancel: {
        Args: { p_order_id: string; p_reason: string }
        Returns: number
      }
      finish_ai_run: {
        Args: {
          p_input_tokens?: number
          p_latency_ms: number
          p_output_tokens?: number
          p_request_id: string
          p_status: string
        }
        Returns: number
      }
      finish_carrier_identity: {
        Args: {
          p_birth: string
          p_di: string
          p_id: string
          p_phone: string
          p_user: string
        }
        Returns: {
          account_state: Database["public"]["Enums"]["account_state"]
          agreed_policy_version: string | null
          banned_reason: string | null
          birth: string | null
          company_email: string
          created_at: string
          details: Json
          drinking: string | null
          email_verified_at: string | null
          evening_note: string | null
          feedback_emails: boolean
          gender: Database["public"]["Enums"]["gender"]
          headline: string | null
          hub_id: string
          id: string
          identity_verification_id: string | null
          identity_verified_at: string | null
          interests: string[]
          intro: string | null
          job: string | null
          known_as: string | null
          match_note: string | null
          match_tags: string[]
          mbti: string | null
          name: string | null
          notification_email: string | null
          notification_email_verified_at: string | null
          onboarding_step: number
          paused_at: string | null
          phone: string | null
          phone_verified_at: string | null
          photo_paths: string[] | null
          photo_reject_reason: string | null
          photo_reviewed_at: string | null
          photo_reviewed_by: string | null
          photo_state: Database["public"]["Enums"]["photo_state"]
          photo_url: string | null
          privacy_agreed_at: string | null
          religion: string | null
          role: string
          smoking: string | null
          terms_agreed_at: string | null
          topic_note: string | null
          topics: string[]
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "profiles"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      finish_notification_dispatch: {
        Args: {
          p_error_code: string
          p_id: string
          p_lease_token: string
          p_retryable?: boolean
          p_results?: Json
          p_state: string
        }
        Returns: boolean
      }
      fulfill_paid_ticket_order: {
        Args: { p_method?: string; p_order_id: string; p_payment_key: string }
        Returns: number
      }
      fulfill_ticket_order: { Args: { p_order_id: string }; Returns: number }
      get_public_profile: {
        Args: { p_id: string }
        Returns: {
          age: number | null
          details: Json | null
          drinking: string | null
          headline: string | null
          hub_id: string | null
          id: string | null
          interests: string[] | null
          intro: string | null
          job: string | null
          match_tags: string[] | null
          mbti: string | null
          name: string | null
          photo_paths: string[] | null
          photo_url: string | null
          religion: string | null
          smoking: string | null
          topics: string[] | null
        }[]
        SetofOptions: {
          from: "*"
          to: "public_profiles"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      get_public_profiles: {
        Args: { p_ids: string[] }
        Returns: {
          age: number | null
          details: Json | null
          drinking: string | null
          headline: string | null
          hub_id: string | null
          id: string | null
          interests: string[] | null
          intro: string | null
          job: string | null
          match_tags: string[] | null
          mbti: string | null
          name: string | null
          photo_paths: string[] | null
          photo_url: string | null
          religion: string | null
          smoking: string | null
          topics: string[] | null
        }[]
        SetofOptions: {
          from: "*"
          to: "public_profiles"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      home_state: { Args: never; Returns: Json }
      home_state_v2: { Args: never; Returns: Json }
      home_state_v2_base: { Args: never; Returns: Json }
      intro_teaser: {
        Args: never
        Returns: {
          age: number
          delivered: number
          headline: string
          job: string
          reason: string
          shared: string[]
        }[]
      }
      is_admin: { Args: never; Returns: boolean }
      is_channel_open: {
        Args: {
          p_channel: Database["public"]["Enums"]["msg_channel"]
          p_meeting_id: string
        }
        Returns: boolean
      }
      is_company_email: { Args: { p_email: string }; Returns: boolean }
      is_eligible_candidate: { Args: { p_id: string }; Returns: boolean }
      is_excluded: { Args: { a: string; b: string }; Returns: boolean }
      is_meeting_participant: {
        Args: { p_meeting_id: string }
        Returns: boolean
      }
      issue_phone_code: {
        Args: { p_phone: string; p_user: string }
        Returns: string
      }
      issue_ticket: {
        Args: {
          p_kind?: Database["public"]["Enums"]["ticket_kind"]
          p_payment_id: string
          p_price_krw?: number
          p_user_id: string
        }
        Returns: {
          expires_at: string
          id: string
          intro_id: string | null
          issued_at: string
          kind: Database["public"]["Enums"]["ticket_kind"]
          payment_id: string | null
          price_krw: number
          refund_locked: boolean
          refunded_at: string | null
          restored_from_ticket_id: string | null
          state: Database["public"]["Enums"]["ticket_state"]
          used_at: string | null
          user_id: string
        }
        SetofOptions: {
          from: "*"
          to: "tickets"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      mark_met: {
        Args: { p_meeting_id: string }
        Returns: {
          accepted_slot: number | null
          cancel_reason: string | null
          cancelled_at: string | null
          completed_at: string | null
          completed_by: string[]
          confirmed_at: string | null
          created_at: string
          id: string
          intro_id: string
          place_id: string | null
          place_kind: string | null
          place_name: string | null
          prefs: Json | null
          prefs_submitted_at: string | null
          private_opens_at: string | null
          proposed_place_id: string | null
          proposed_place_name: string | null
          proposed_slots: string[] | null
          scheduled_at: string | null
          ticket_id: string
        }
        SetofOptions: {
          from: "*"
          to: "meetings"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      mark_met_base: {
        Args: { p_meeting_id: string }
        Returns: {
          accepted_slot: number | null
          cancel_reason: string | null
          cancelled_at: string | null
          completed_at: string | null
          completed_by: string[]
          confirmed_at: string | null
          created_at: string
          id: string
          intro_id: string
          place_id: string | null
          place_kind: string | null
          place_name: string | null
          prefs: Json | null
          prefs_submitted_at: string | null
          private_opens_at: string | null
          proposed_place_id: string | null
          proposed_place_name: string | null
          proposed_slots: string[] | null
          scheduled_at: string | null
          ticket_id: string
        }
        SetofOptions: {
          from: "*"
          to: "meetings"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      mark_notifications_read: { Args: never; Returns: undefined }
      meet_places_for_me: {
        Args: never
        Returns: {
          address: string
          id: string
          kind: string
          map_url: string
          name: string
          note: string
          station: string
        }[]
      }
      member_policy_current: { Args: { p_user: string }; Returns: boolean }
      member_readiness: { Args: { p_user: string }; Returns: Json }
      member_readiness_snapshot: {
        Args: { p: Database["public"]["Tables"]["profiles"]["Row"] }
        Returns: Json
      }
      my_carrier_adult_verified: { Args: never; Returns: boolean }
      my_gender: { Args: never; Returns: Database["public"]["Enums"]["gender"] }
      my_hub_id: { Args: never; Returns: string }
      my_notification_preferences: { Args: never; Returns: Json }
      my_notifications: {
        Args: { p_limit?: number }
        Returns: {
          counterpart_name: string
          created_at: string
          id: string
          kind: Database["public"]["Enums"]["notification_kind"]
          meeting_id: string
          read_at: string
        }[]
      }
      my_policy_status: { Args: never; Returns: Json }
      my_readiness: { Args: never; Returns: Json }
      my_request_deadlines: {
        Args: never
        Returns: {
          as_of: string
          deadline_at: string
          meeting_id: string
        }[]
      }
      my_support_requests: {
        Args: never
        Returns: {
          body: string
          category: string
          created_at: string
          id: string
          responded_at: string
          response: string
          status: string
        }[]
      }
      next_candidate: {
        Args: never
        Returns: {
          age: number | null
          details: Json | null
          drinking: string | null
          headline: string | null
          hub_id: string | null
          id: string | null
          interests: string[] | null
          intro: string | null
          job: string | null
          match_tags: string[] | null
          mbti: string | null
          name: string | null
          photo_paths: string[] | null
          photo_url: string | null
          religion: string | null
          smoking: string | null
          topics: string[] | null
        }[]
        SetofOptions: {
          from: "*"
          to: "public_profiles"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      next_openable_card: {
        Args: { p_male: string }
        Returns: {
          created_at: string
          curated_by: string
          delivered_at: string | null
          expires_at: string | null
          female_id: string
          id: string
          male_id: string
          note: string | null
          opened_at: string | null
          position: number
          reason: string | null
        }[]
        SetofOptions: {
          from: "*"
          to: "intro_queue"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      notification_push_still_relevant: {
        Args: { p_id: string; p_lease_token: string }
        Returns: boolean
      }
      notification_push_still_relevant_base: {
        Args: { p_id: string; p_lease_token: string }
        Returns: boolean
      }
      open_intro: {
        Args: never
        Returns: {
          closed_at: string | null
          curated_by: string | null
          female_id: string
          id: string
          male_id: string
          opened_at: string
          outcome: Database["public"]["Enums"]["intro_outcome"] | null
          reason: string | null
        }
        SetofOptions: {
          from: "*"
          to: "intros"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      ops_current_sources: {
        Args: never
        Returns: {
          case_type: string
          priority: string
          source_id: string
          source_revision: string
          subject_id: string
        }[]
      }
      ops_emit_domain_event: {
        Args: {
          p_aggregate_id: string
          p_aggregate_type: string
          p_dedupe_key: string
          p_props?: Json
          p_subject: string
          p_type: string
        }
        Returns: undefined
      }
      ops_source_open: {
        Args: { p_source_id: string; p_type: string }
        Returns: boolean
      }
      ops_sync_case: {
        Args: {
          p_open: boolean
          p_priority: string
          p_revision: string
          p_source_id: string
          p_subject: string
          p_type: string
        }
        Returns: string
      }
      pass_intro: { Args: { p_intro_id: string }; Returns: undefined }
      phone_code_hash: {
        Args: { p_code: string; p_user: string }
        Returns: string
      }
      private_open_at: {
        Args: { p_confirmed: string; p_scheduled: string }
        Returns: string
      }
      publish_profile_interview: {
        Args: { p_conditions: Json; p_expected_revision: number }
        Returns: Database["public"]["Tables"]["profiles"]["Row"]
      }
      profile_candidate_ready: {
        Args: { p: Database["public"]["Tables"]["profiles"]["Row"] }
        Returns: boolean
      }
      profile_photo_paths_distinct: {
        Args: { p_paths: string[] }
        Returns: boolean
      }
      promote_intro_queue: { Args: { p_male: string }; Returns: number }
      record_consent: {
        Args: { p_policy_version: string }
        Returns: {
          account_state: Database["public"]["Enums"]["account_state"]
          agreed_policy_version: string | null
          banned_reason: string | null
          birth: string | null
          company_email: string
          created_at: string
          details: Json
          drinking: string | null
          email_verified_at: string | null
          evening_note: string | null
          feedback_emails: boolean
          gender: Database["public"]["Enums"]["gender"]
          headline: string | null
          hub_id: string
          id: string
          identity_verification_id: string | null
          identity_verified_at: string | null
          interests: string[]
          intro: string | null
          job: string | null
          known_as: string | null
          match_note: string | null
          match_tags: string[]
          mbti: string | null
          name: string | null
          notification_email: string | null
          notification_email_verified_at: string | null
          onboarding_step: number
          paused_at: string | null
          phone: string | null
          phone_verified_at: string | null
          photo_paths: string[] | null
          photo_reject_reason: string | null
          photo_reviewed_at: string | null
          photo_reviewed_by: string | null
          photo_state: Database["public"]["Enums"]["photo_state"]
          photo_url: string | null
          privacy_agreed_at: string | null
          religion: string | null
          role: string
          smoking: string | null
          terms_agreed_at: string | null
          topic_note: string | null
          topics: string[]
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "profiles"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      record_my_ai_decision: {
        Args: { p_decision: string; p_run_id: number }
        Returns: boolean
      }
      record_notification_worker_run: {
        Args: {
          p_claimed: number
          p_duration_ms: number
          p_failed: number
          p_skipped: number
          p_submitted: number
          p_unavailable: number
          p_unknown: number
        }
        Returns: number
      }
      record_payment_provider_check: {
        Args: { p_attention?: string; p_checked?: boolean; p_order_id: string }
        Returns: undefined
      }
      refund_ticket: {
        Args: { p_reason: string; p_ticket_id: string }
        Returns: {
          expires_at: string
          id: string
          intro_id: string | null
          issued_at: string
          kind: Database["public"]["Enums"]["ticket_kind"]
          payment_id: string | null
          price_krw: number
          refund_locked: boolean
          refunded_at: string | null
          restored_from_ticket_id: string | null
          state: Database["public"]["Enums"]["ticket_state"]
          used_at: string | null
          user_id: string
        }
        SetofOptions: {
          from: "*"
          to: "tickets"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      register_device_token: { Args: { p_token: string }; Returns: undefined }
      release_paid_order_cancel: {
        Args: { p_order_id: string }
        Returns: undefined
      }
      remaining_candidates: { Args: never; Returns: number }
      report_content: {
        Args: {
          p_detail: string
          p_kind: Database["public"]["Enums"]["report_kind"]
          p_message_id?: string
          p_target: string
        }
        Returns: {
          accused_id: string
          created_at: string
          detail: string
          id: string
          kind: Database["public"]["Enums"]["report_kind"]
          meeting_id: string | null
          message_id: string | null
          reporter_id: string
          resolved_at: string | null
          resolved_by: string | null
          state: Database["public"]["Enums"]["report_state"]
        }
        SetofOptions: {
          from: "*"
          to: "content_reports"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      report_no_show: {
        Args: { p_meeting_id: string }
        Returns: {
          accused_admitted: boolean | null
          accused_id: string
          confirm_by: string
          created_at: string
          id: string
          meeting_id: string
          reporter_id: string
          resolution_note: string | null
          resolved_at: string | null
          responded_at: string | null
          review_requested_at: string | null
          state: Database["public"]["Enums"]["report_state"]
        }
        SetofOptions: {
          from: "*"
          to: "no_show_reports"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      request_meeting: {
        Args: {
          p_intro_id: string
          p_place_id: string
          p_place_name: string
          p_slots: string[]
        }
        Returns: {
          accepted_slot: number | null
          cancel_reason: string | null
          cancelled_at: string | null
          completed_at: string | null
          completed_by: string[]
          confirmed_at: string | null
          created_at: string
          id: string
          intro_id: string
          place_id: string | null
          place_kind: string | null
          place_name: string | null
          prefs: Json | null
          prefs_submitted_at: string | null
          private_opens_at: string | null
          proposed_place_id: string | null
          proposed_place_name: string | null
          proposed_slots: string[] | null
          scheduled_at: string | null
          ticket_id: string
        }
        SetofOptions: {
          from: "*"
          to: "meetings"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      request_notification_email: { Args: { p_email: string }; Returns: string }
      reserve_ai_run: {
        Args: {
          p_feature: string
          p_model: string
          p_prompt_version: string
          p_request_id: string
          p_source_hash: string
          p_user: string
        }
        Returns: Json
      }
      save_profile_interview_draft: {
        Args: { p_data: Json; p_expected_revision: number }
        Returns: number
      }
      reserve_paid_order_cancel: {
        Args: { p_order_id: string }
        Returns: {
          amount: number
          cancel_reason: string | null
          canceled_at: string | null
          confirmed_at: string | null
          created_at: string
          fulfill_note: string | null
          fulfilled_by: string | null
          kind: Database["public"]["Enums"]["ticket_kind"]
          order_id: string
          paid_at: string | null
          payment_attention: string | null
          payment_key: string | null
          payment_method: string | null
          payment_required: boolean
          provider_checked_at: string | null
          quantity: number
          state: string
          user_id: string
        }
        SetofOptions: {
          from: "*"
          to: "ticket_orders"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      resolve_content_report: {
        Args: {
          p_ban?: boolean
          p_note: string
          p_report_id: string
          p_upheld: boolean
        }
        Returns: {
          accused_id: string
          created_at: string
          detail: string
          id: string
          kind: Database["public"]["Enums"]["report_kind"]
          meeting_id: string | null
          message_id: string | null
          reporter_id: string
          resolved_at: string | null
          resolved_by: string | null
          state: Database["public"]["Enums"]["report_state"]
        }
        SetofOptions: {
          from: "*"
          to: "content_reports"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      respond_no_show: {
        Args: { p_admit: boolean; p_report_id: string }
        Returns: {
          accused_admitted: boolean | null
          accused_id: string
          confirm_by: string
          created_at: string
          id: string
          meeting_id: string
          reporter_id: string
          resolution_note: string | null
          resolved_at: string | null
          responded_at: string | null
          review_requested_at: string | null
          state: Database["public"]["Enums"]["report_state"]
        }
        SetofOptions: {
          from: "*"
          to: "no_show_reports"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      respond_support_request: {
        Args: { p_id: string; p_response: string }
        Returns: undefined
      }
      set_my_request_reminders: { Args: { p_enabled: boolean }; Returns: Json }
      set_paused: {
        Args: { p_on: boolean }
        Returns: {
          account_state: Database["public"]["Enums"]["account_state"]
          agreed_policy_version: string | null
          banned_reason: string | null
          birth: string | null
          company_email: string
          created_at: string
          details: Json
          drinking: string | null
          email_verified_at: string | null
          evening_note: string | null
          feedback_emails: boolean
          gender: Database["public"]["Enums"]["gender"]
          headline: string | null
          hub_id: string
          id: string
          identity_verification_id: string | null
          identity_verified_at: string | null
          interests: string[]
          intro: string | null
          job: string | null
          known_as: string | null
          match_note: string | null
          match_tags: string[]
          mbti: string | null
          name: string | null
          notification_email: string | null
          notification_email_verified_at: string | null
          onboarding_step: number
          paused_at: string | null
          phone: string | null
          phone_verified_at: string | null
          photo_paths: string[] | null
          photo_reject_reason: string | null
          photo_reviewed_at: string | null
          photo_reviewed_by: string | null
          photo_state: Database["public"]["Enums"]["photo_state"]
          photo_url: string | null
          privacy_agreed_at: string | null
          religion: string | null
          role: string
          smoking: string | null
          terms_agreed_at: string | null
          topic_note: string | null
          topics: string[]
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "profiles"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      sever_active_meeting: {
        Args: { p_a: string; p_b: string; p_reason: string }
        Returns: string
      }
      submit_meeting_prefs: {
        Args: { p_meeting_id: string; p_prefs: Json }
        Returns: {
          accepted_slot: number | null
          cancel_reason: string | null
          cancelled_at: string | null
          completed_at: string | null
          completed_by: string[]
          confirmed_at: string | null
          created_at: string
          id: string
          intro_id: string
          place_id: string | null
          place_kind: string | null
          place_name: string | null
          prefs: Json | null
          prefs_submitted_at: string | null
          private_opens_at: string | null
          proposed_place_id: string | null
          proposed_place_name: string | null
          proposed_slots: string[] | null
          scheduled_at: string | null
          ticket_id: string
        }
        SetofOptions: {
          from: "*"
          to: "meetings"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      sync_email_verified: {
        Args: never
        Returns: {
          account_state: Database["public"]["Enums"]["account_state"]
          agreed_policy_version: string | null
          banned_reason: string | null
          birth: string | null
          company_email: string
          created_at: string
          details: Json
          drinking: string | null
          email_verified_at: string | null
          evening_note: string | null
          feedback_emails: boolean
          gender: Database["public"]["Enums"]["gender"]
          headline: string | null
          hub_id: string
          id: string
          identity_verification_id: string | null
          identity_verified_at: string | null
          interests: string[]
          intro: string | null
          job: string | null
          known_as: string | null
          match_note: string | null
          match_tags: string[]
          mbti: string | null
          name: string | null
          notification_email: string | null
          notification_email_verified_at: string | null
          onboarding_step: number
          paused_at: string | null
          phone: string | null
          phone_verified_at: string | null
          photo_paths: string[] | null
          photo_reject_reason: string | null
          photo_reviewed_at: string | null
          photo_reviewed_by: string | null
          photo_state: Database["public"]["Enums"]["photo_state"]
          photo_url: string | null
          privacy_agreed_at: string | null
          religion: string | null
          role: string
          smoking: string | null
          terms_agreed_at: string | null
          topic_note: string | null
          topics: string[]
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "profiles"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      ticket_bundle_amount: {
        Args: {
          p_kind: Database["public"]["Enums"]["ticket_kind"]
          p_quantity: number
        }
        Returns: number
      }
      ticket_bundles: {
        Args: { p_kind?: Database["public"]["Enums"]["ticket_kind"] }
        Returns: {
          amount: number
          quantity: number
        }[]
      }
      unlink_kakao_identity_by_provider_id: {
        Args: { p_provider_id: string }
        Returns: number
      }
      unlink_my_kakao_identity: { Args: never; Returns: number }
      unread_notification_count: { Args: never; Returns: number }
      unregister_device_token: { Args: { p_token: string }; Returns: undefined }
      use_meeting_ticket: {
        Args: { p_intro_id: string }
        Returns: {
          accepted_slot: number | null
          cancel_reason: string | null
          cancelled_at: string | null
          completed_at: string | null
          completed_by: string[]
          confirmed_at: string | null
          created_at: string
          id: string
          intro_id: string
          place_id: string | null
          place_kind: string | null
          place_name: string | null
          prefs: Json | null
          prefs_submitted_at: string | null
          private_opens_at: string | null
          proposed_place_id: string | null
          proposed_place_name: string | null
          proposed_slots: string[] | null
          scheduled_at: string | null
          ticket_id: string
        }
        SetofOptions: {
          from: "*"
          to: "meetings"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      verify_notification_email: { Args: { p_code: string }; Returns: boolean }
      verify_phone_code: {
        Args: { p_code: string; p_phone: string }
        Returns: {
          account_state: Database["public"]["Enums"]["account_state"]
          agreed_policy_version: string | null
          banned_reason: string | null
          birth: string | null
          company_email: string
          created_at: string
          details: Json
          drinking: string | null
          email_verified_at: string | null
          evening_note: string | null
          feedback_emails: boolean
          gender: Database["public"]["Enums"]["gender"]
          headline: string | null
          hub_id: string
          id: string
          identity_verification_id: string | null
          identity_verified_at: string | null
          interests: string[]
          intro: string | null
          job: string | null
          known_as: string | null
          match_note: string | null
          match_tags: string[]
          mbti: string | null
          name: string | null
          notification_email: string | null
          notification_email_verified_at: string | null
          onboarding_step: number
          paused_at: string | null
          phone: string | null
          phone_verified_at: string | null
          photo_paths: string[] | null
          photo_reject_reason: string | null
          photo_reviewed_at: string | null
          photo_reviewed_by: string | null
          photo_state: Database["public"]["Enums"]["photo_state"]
          photo_url: string | null
          privacy_agreed_at: string | null
          religion: string | null
          role: string
          smoking: string | null
          terms_agreed_at: string | null
          topic_note: string | null
          topics: string[]
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "profiles"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      visible_profile_ids: {
        Args: never
        Returns: {
          id: string
        }[]
      }
      withdraw_account: { Args: { p_reason?: string }; Returns: undefined }
    }
    Enums: {
      account_state: "active" | "banned" | "withdrawn"
      affinity_verdict: "like" | "pass"
      gender: "female" | "male"
      intro_outcome:
        | "passed"
        | "ticket_used"
        | "expired"
        | "withdrawn"
        | "blocked"
        | "declined"
      msg_channel: "coord" | "private"
      notification_kind:
        | "meeting_requested"
        | "prefs_submitted"
        | "meeting_confirmed"
        | "feedback_due"
        | "notification_email_verify"
        | "intro_delivered"
        | "candidates_refilled"
        | "no_show_response_required"
        | "meeting_released"
        | "meeting_request_reminder"
      photo_state: "pending" | "approved" | "rejected"
      report_kind: "profile" | "message"
      report_state: "pending" | "confirmed" | "dismissed"
      ticket_kind: "intro" | "meeting"
      ticket_state: "unused" | "used" | "refunded"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      account_state: ["active", "banned", "withdrawn"],
      affinity_verdict: ["like", "pass"],
      gender: ["female", "male"],
      intro_outcome: [
        "passed",
        "ticket_used",
        "expired",
        "withdrawn",
        "blocked",
        "declined",
      ],
      msg_channel: ["coord", "private"],
      notification_kind: [
        "meeting_requested",
        "prefs_submitted",
        "meeting_confirmed",
        "feedback_due",
        "notification_email_verify",
        "intro_delivered",
        "candidates_refilled",
        "no_show_response_required",
        "meeting_released",
        "meeting_request_reminder",
      ],
      photo_state: ["pending", "approved", "rejected"],
      report_kind: ["profile", "message"],
      report_state: ["pending", "confirmed", "dismissed"],
      ticket_kind: ["intro", "meeting"],
      ticket_state: ["unused", "used", "refunded"],
    },
  },
} as const
