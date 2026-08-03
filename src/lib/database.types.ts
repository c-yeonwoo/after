export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  graphql_public: {
    Tables: {
      [_ in never]: never
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      graphql: {
        Args: {
          extensions?: Json
          operationName?: string
          query?: string
          variables?: Json
        }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  public: {
    Tables: {
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
            foreignKeyName: "feedbacks_meeting_id_fkey"
            columns: ["meeting_id"]
            isOneToOne: false
            referencedRelation: "meetings"
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
        ]
      }
      intros: {
        Row: {
          closed_at: string | null
          female_id: string
          id: string
          male_id: string
          opened_at: string
          outcome: Database["public"]["Enums"]["intro_outcome"] | null
        }
        Insert: {
          closed_at?: string | null
          female_id: string
          id?: string
          male_id: string
          opened_at?: string
          outcome?: Database["public"]["Enums"]["intro_outcome"] | null
        }
        Update: {
          closed_at?: string | null
          female_id?: string
          id?: string
          male_id?: string
          opened_at?: string
          outcome?: Database["public"]["Enums"]["intro_outcome"] | null
        }
        Relationships: [
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
        ]
      }
      meetings: {
        Row: {
          cancel_reason: string | null
          cancelled_at: string | null
          completed_at: string | null
          completed_by: string[]
          confirmed_at: string | null
          created_at: string
          id: string
          intro_id: string
          place_kind: string | null
          place_name: string | null
          prefs: Json | null
          prefs_submitted_at: string | null
          private_opens_at: string | null
          scheduled_at: string | null
          ticket_id: string
        }
        Insert: {
          cancel_reason?: string | null
          cancelled_at?: string | null
          completed_at?: string | null
          completed_by?: string[]
          confirmed_at?: string | null
          created_at?: string
          id?: string
          intro_id: string
          place_kind?: string | null
          place_name?: string | null
          prefs?: Json | null
          prefs_submitted_at?: string | null
          private_opens_at?: string | null
          scheduled_at?: string | null
          ticket_id: string
        }
        Update: {
          cancel_reason?: string | null
          cancelled_at?: string | null
          completed_at?: string | null
          completed_by?: string[]
          confirmed_at?: string | null
          created_at?: string
          id?: string
          intro_id?: string
          place_kind?: string | null
          place_name?: string | null
          prefs?: Json | null
          prefs_submitted_at?: string | null
          private_opens_at?: string | null
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
            foreignKeyName: "meetings_ticket_id_fkey"
            columns: ["ticket_id"]
            isOneToOne: true
            referencedRelation: "tickets"
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
        ]
      }
      no_show_reports: {
        Row: {
          accused_id: string
          confirm_by: string
          created_at: string
          id: string
          meeting_id: string
          reporter_id: string
          resolved_at: string | null
          state: Database["public"]["Enums"]["report_state"]
        }
        Insert: {
          accused_id: string
          confirm_by: string
          created_at?: string
          id?: string
          meeting_id: string
          reporter_id: string
          resolved_at?: string | null
          state?: Database["public"]["Enums"]["report_state"]
        }
        Update: {
          accused_id?: string
          confirm_by?: string
          created_at?: string
          id?: string
          meeting_id?: string
          reporter_id?: string
          resolved_at?: string | null
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
          gender: Database["public"]["Enums"]["gender"]
          headline: string | null
          hub_id: string
          id: string
          interests: string[]
          intro: string | null
          job: string | null
          match_note: string | null
          match_tags: string[]
          mbti: string | null
          name: string | null
          onboarding_step: number
          photo_url: string | null
          privacy_agreed_at: string | null
          religion: string | null
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
          gender: Database["public"]["Enums"]["gender"]
          headline?: string | null
          hub_id: string
          id: string
          interests?: string[]
          intro?: string | null
          job?: string | null
          match_note?: string | null
          match_tags?: string[]
          mbti?: string | null
          name?: string | null
          onboarding_step?: number
          photo_url?: string | null
          privacy_agreed_at?: string | null
          religion?: string | null
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
          gender?: Database["public"]["Enums"]["gender"]
          headline?: string | null
          hub_id?: string
          id?: string
          interests?: string[]
          intro?: string | null
          job?: string | null
          match_note?: string | null
          match_tags?: string[]
          mbti?: string | null
          name?: string | null
          onboarding_step?: number
          photo_url?: string | null
          privacy_agreed_at?: string | null
          religion?: string | null
          smoking?: string | null
          terms_agreed_at?: string | null
          topic_note?: string | null
          topics?: string[]
          updated_at?: string
        }
        Relationships: []
      }
      ticket_orders: {
        Row: {
          amount: number
          confirmed_at: string | null
          created_at: string
          order_id: string
          state: string
          user_id: string
        }
        Insert: {
          amount: number
          confirmed_at?: string | null
          created_at?: string
          order_id: string
          state?: string
          user_id: string
        }
        Update: {
          amount?: number
          confirmed_at?: string | null
          created_at?: string
          order_id?: string
          state?: string
          user_id?: string
        }
        Relationships: [
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
        ]
      }
      tickets: {
        Row: {
          id: string
          intro_id: string | null
          issued_at: string
          payment_id: string | null
          price_krw: number
          refunded_at: string | null
          state: Database["public"]["Enums"]["ticket_state"]
          used_at: string | null
          user_id: string
        }
        Insert: {
          id?: string
          intro_id?: string | null
          issued_at?: string
          payment_id?: string | null
          price_krw?: number
          refunded_at?: string | null
          state?: Database["public"]["Enums"]["ticket_state"]
          used_at?: string | null
          user_id: string
        }
        Update: {
          id?: string
          intro_id?: string | null
          issued_at?: string
          payment_id?: string | null
          price_krw?: number
          refunded_at?: string | null
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
          photo_url: string | null
          privacy_agreed_at: string | null
          religion: string | null
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
          photo_url?: string | null
          privacy_agreed_at?: string | null
          religion?: string | null
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
          photo_url?: string | null
          privacy_agreed_at?: string | null
          religion?: string | null
          smoking?: string | null
          terms_agreed_at?: string | null
          topic_note?: string | null
          topics?: string[] | null
          updated_at?: string | null
        }
        Relationships: []
      }
    }
    Functions: {
      apply_no_show_confirmed: {
        Args: { p_report_id: string }
        Returns: {
          accused_id: string
          confirm_by: string
          created_at: string
          id: string
          meeting_id: string
          reporter_id: string
          resolved_at: string | null
          state: Database["public"]["Enums"]["report_state"]
        }
        SetofOptions: {
          from: "*"
          to: "no_show_reports"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      confirm_meeting: {
        Args: {
          p_meeting_id: string
          p_place_kind?: string
          p_place_name: string
          p_scheduled_at: string
        }
        Returns: {
          cancel_reason: string | null
          cancelled_at: string | null
          completed_at: string | null
          completed_by: string[]
          confirmed_at: string | null
          created_at: string
          id: string
          intro_id: string
          place_kind: string | null
          place_name: string | null
          prefs: Json | null
          prefs_submitted_at: string | null
          private_opens_at: string | null
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
      create_ticket_order: {
        Args: never
        Returns: {
          amount: number
          confirmed_at: string | null
          created_at: string
          order_id: string
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
      exclude_pair: {
        Args: { a: string; b: string; p_reason: string }
        Returns: undefined
      }
      expire_unanswered_meetings: { Args: never; Returns: number }
      expire_unanswered_no_show_reports: { Args: never; Returns: number }
      is_channel_open: {
        Args: {
          p_channel: Database["public"]["Enums"]["msg_channel"]
          p_meeting_id: string
        }
        Returns: boolean
      }
      is_excluded: { Args: { a: string; b: string }; Returns: boolean }
      is_meeting_participant: {
        Args: { p_meeting_id: string }
        Returns: boolean
      }
      issue_ticket: {
        Args: { p_payment_id: string; p_price_krw?: number; p_user_id: string }
        Returns: {
          id: string
          intro_id: string | null
          issued_at: string
          payment_id: string | null
          price_krw: number
          refunded_at: string | null
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
          cancel_reason: string | null
          cancelled_at: string | null
          completed_at: string | null
          completed_by: string[]
          confirmed_at: string | null
          created_at: string
          id: string
          intro_id: string
          place_kind: string | null
          place_name: string | null
          prefs: Json | null
          prefs_submitted_at: string | null
          private_opens_at: string | null
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
      my_gender: { Args: never; Returns: Database["public"]["Enums"]["gender"] }
      my_hub_id: { Args: never; Returns: string }
      open_intro: {
        Args: never
        Returns: {
          closed_at: string | null
          female_id: string
          id: string
          male_id: string
          opened_at: string
          outcome: Database["public"]["Enums"]["intro_outcome"] | null
        }
        SetofOptions: {
          from: "*"
          to: "intros"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      pass_intro: { Args: { p_intro_id: string }; Returns: undefined }
      private_open_at: {
        Args: { p_confirmed: string; p_scheduled: string }
        Returns: string
      }
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
          gender: Database["public"]["Enums"]["gender"]
          headline: string | null
          hub_id: string
          id: string
          interests: string[]
          intro: string | null
          job: string | null
          match_note: string | null
          match_tags: string[]
          mbti: string | null
          name: string | null
          onboarding_step: number
          photo_url: string | null
          privacy_agreed_at: string | null
          religion: string | null
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
      refund_ticket: {
        Args: { p_reason: string; p_ticket_id: string }
        Returns: {
          id: string
          intro_id: string | null
          issued_at: string
          payment_id: string | null
          price_krw: number
          refunded_at: string | null
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
      report_no_show: {
        Args: { p_meeting_id: string }
        Returns: {
          accused_id: string
          confirm_by: string
          created_at: string
          id: string
          meeting_id: string
          reporter_id: string
          resolved_at: string | null
          state: Database["public"]["Enums"]["report_state"]
        }
        SetofOptions: {
          from: "*"
          to: "no_show_reports"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      respond_no_show: {
        Args: { p_admit: boolean; p_report_id: string }
        Returns: {
          accused_id: string
          confirm_by: string
          created_at: string
          id: string
          meeting_id: string
          reporter_id: string
          resolved_at: string | null
          state: Database["public"]["Enums"]["report_state"]
        }
        SetofOptions: {
          from: "*"
          to: "no_show_reports"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      submit_meeting_prefs: {
        Args: { p_meeting_id: string; p_prefs: Json }
        Returns: {
          cancel_reason: string | null
          cancelled_at: string | null
          completed_at: string | null
          completed_by: string[]
          confirmed_at: string | null
          created_at: string
          id: string
          intro_id: string
          place_kind: string | null
          place_name: string | null
          prefs: Json | null
          prefs_submitted_at: string | null
          private_opens_at: string | null
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
          gender: Database["public"]["Enums"]["gender"]
          headline: string | null
          hub_id: string
          id: string
          interests: string[]
          intro: string | null
          job: string | null
          match_note: string | null
          match_tags: string[]
          mbti: string | null
          name: string | null
          onboarding_step: number
          photo_url: string | null
          privacy_agreed_at: string | null
          religion: string | null
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
      use_meeting_ticket: {
        Args: { p_intro_id: string }
        Returns: {
          cancel_reason: string | null
          cancelled_at: string | null
          completed_at: string | null
          completed_by: string[]
          confirmed_at: string | null
          created_at: string
          id: string
          intro_id: string
          place_kind: string | null
          place_name: string | null
          prefs: Json | null
          prefs_submitted_at: string | null
          private_opens_at: string | null
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
    }
    Enums: {
      account_state: "active" | "banned" | "withdrawn"
      affinity_verdict: "like" | "pass"
      gender: "female" | "male"
      intro_outcome: "passed" | "ticket_used" | "expired" | "withdrawn"
      msg_channel: "coord" | "private"
      report_state: "pending" | "confirmed" | "dismissed"
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
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {
      account_state: ["active", "banned", "withdrawn"],
      affinity_verdict: ["like", "pass"],
      gender: ["female", "male"],
      intro_outcome: ["passed", "ticket_used", "expired", "withdrawn"],
      msg_channel: ["coord", "private"],
      report_state: ["pending", "confirmed", "dismissed"],
      ticket_state: ["unused", "used", "refunded"],
    },
  },
} as const

