export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.18"
  }
  public: {
    Tables: {
      action_calls: {
        Row: {
          action: string
          id: number
          kind: string
          ts: number
        }
        Insert: {
          action: string
          id?: number
          kind: string
          ts: number
        }
        Update: {
          action?: string
          id?: number
          kind?: string
          ts?: number
        }
        Relationships: []
      }
      agent_runs: {
        Row: {
          agent: string
          asset: string | null
          detail: string | null
          id: number
          status: string
          ts: string
        }
        Insert: {
          agent: string
          asset?: string | null
          detail?: string | null
          id?: number
          status: string
          ts?: string
        }
        Update: {
          agent?: string
          asset?: string | null
          detail?: string | null
          id?: number
          status?: string
          ts?: string
        }
        Relationships: []
      }
      agent_settings: {
        Row: {
          agent: string
          max_tokens: number
          prompt: string
          temperature: number
        }
        Insert: {
          agent: string
          max_tokens?: number
          prompt?: string
          temperature?: number
        }
        Update: {
          agent?: string
          max_tokens?: number
          prompt?: string
          temperature?: number
        }
        Relationships: []
      }
      alerts: {
        Row: {
          asset: string
          id: number
          payload: Json
          ts: string
        }
        Insert: {
          asset: string
          id?: number
          payload: Json
          ts?: string
        }
        Update: {
          asset?: string
          id?: number
          payload?: Json
          ts?: string
        }
        Relationships: []
      }
      approvals: {
        Row: {
          action: string
          actor: string
          created_ts: number
          decided_by: string | null
          decided_ts: number | null
          expires_ts: number
          id: number
          params_hash: string
          params_json: string
          result_json: string | null
          run_id: string
          status: string
        }
        Insert: {
          action: string
          actor: string
          created_ts: number
          decided_by?: string | null
          decided_ts?: number | null
          expires_ts: number
          id?: number
          params_hash: string
          params_json: string
          result_json?: string | null
          run_id: string
          status: string
        }
        Update: {
          action?: string
          actor?: string
          created_ts?: number
          decided_by?: string | null
          decided_ts?: number | null
          expires_ts?: number
          id?: number
          params_hash?: string
          params_json?: string
          result_json?: string | null
          run_id?: string
          status?: string
        }
        Relationships: []
      }
      audit_events: {
        Row: {
          action: string
          actor: string
          detail: string
          event: string
          hash: string
          id: number
          prev_hash: string
          run_id: string
          status: string
          ts: number
          ts_exact: number | null
        }
        Insert: {
          action?: string
          actor: string
          detail?: string
          event: string
          hash: string
          id?: number
          prev_hash: string
          run_id: string
          status?: string
          ts: number
          ts_exact?: number | null
        }
        Update: {
          action?: string
          actor?: string
          detail?: string
          event?: string
          hash?: string
          id?: number
          prev_hash?: string
          run_id?: string
          status?: string
          ts?: number
          ts_exact?: number | null
        }
        Relationships: []
      }
      capabilities: {
        Row: {
          agent: string
          tool: string
        }
        Insert: {
          agent: string
          tool: string
        }
        Update: {
          agent?: string
          tool?: string
        }
        Relationships: []
      }
      content_drafts: {
        Row: {
          caption: string
          content_hash: string
          created_at: string
          hashtags: string[]
          hook: string
          id: number
          language: string
          persona_id: string
          script: string
          tema: string
        }
        Insert: {
          caption: string
          content_hash: string
          created_at?: string
          hashtags?: string[]
          hook: string
          id?: number
          language: string
          persona_id: string
          script: string
          tema: string
        }
        Update: {
          caption?: string
          content_hash?: string
          created_at?: string
          hashtags?: string[]
          hook?: string
          id?: number
          language?: string
          persona_id?: string
          script?: string
          tema?: string
        }
        Relationships: []
      }
      dev_outputs: {
        Row: {
          code: string
          created_at: string
          explanation: string
          filename: string
          id: number
          metrics: Json
          warnings: Json
        }
        Insert: {
          code: string
          created_at?: string
          explanation?: string
          filename: string
          id?: number
          metrics?: Json
          warnings?: Json
        }
        Update: {
          code?: string
          created_at?: string
          explanation?: string
          filename?: string
          id?: number
          metrics?: Json
          warnings?: Json
        }
        Relationships: []
      }
      event_logs: {
        Row: {
          event: string
          fields: Json
          id: number
          run_id: string | null
          stream: string
          ts: string
        }
        Insert: {
          event: string
          fields?: Json
          id?: number
          run_id?: string | null
          stream: string
          ts?: string
        }
        Update: {
          event?: string
          fields?: Json
          id?: number
          run_id?: string | null
          stream?: string
          ts?: string
        }
        Relationships: []
      }
      kill_switch: {
        Row: {
          engaged: boolean
          id: number
          reason: string
          set_by: string
          ts: number
        }
        Insert: {
          engaged: boolean
          id: number
          reason: string
          set_by: string
          ts: number
        }
        Update: {
          engaged?: boolean
          id?: number
          reason?: string
          set_by?: string
          ts?: number
        }
        Relationships: []
      }
      personas: {
        Row: {
          accounts: string[]
          allowed_topics: string[]
          credential_reference: string | null
          editorial_identity: string
          enabled: boolean
          forbidden_topics: string[]
          language: string
          niche: string
          persona_id: string
          require_sources_for_factual_claims: boolean
          schema_version: number
          style: string
          updated_at: string
        }
        Insert: {
          accounts?: string[]
          allowed_topics?: string[]
          credential_reference?: string | null
          editorial_identity?: string
          enabled?: boolean
          forbidden_topics?: string[]
          language: string
          niche?: string
          persona_id: string
          require_sources_for_factual_claims?: boolean
          schema_version?: number
          style?: string
          updated_at?: string
        }
        Update: {
          accounts?: string[]
          allowed_topics?: string[]
          credential_reference?: string | null
          editorial_identity?: string
          enabled?: boolean
          forbidden_topics?: string[]
          language?: string
          niche?: string
          persona_id?: string
          require_sources_for_factual_claims?: boolean
          schema_version?: number
          style?: string
          updated_at?: string
        }
        Relationships: []
      }
      portfolio: {
        Row: {
          daily_pnl_pct: number | null
          equity: number | null
          equity_snapshot_consistent: boolean
          id: number
          updated_at: string
        }
        Insert: {
          daily_pnl_pct?: number | null
          equity?: number | null
          equity_snapshot_consistent?: boolean
          id: number
          updated_at?: string
        }
        Update: {
          daily_pnl_pct?: number | null
          equity?: number | null
          equity_snapshot_consistent?: boolean
          id?: number
          updated_at?: string
        }
        Relationships: []
      }
      publish_dryrun: {
        Row: {
          id: number
          line: string
          ts: string
        }
        Insert: {
          id?: number
          line: string
          ts?: string
        }
        Update: {
          id?: number
          line?: string
          ts?: string
        }
        Relationships: []
      }
      research_notes: {
        Row: {
          asset: string
          body: string
          created_at: string
          id: number
          name: string
        }
        Insert: {
          asset: string
          body: string
          created_at?: string
          id?: number
          name: string
        }
        Update: {
          asset?: string
          body?: string
          created_at?: string
          id?: number
          name?: string
        }
        Relationships: []
      }
      runtime_settings: {
        Row: {
          groq_model: string
          id: string
          llm_max_tokens: number
          studio_allowed_hosts: string[]
          studio_base_url: string
          studio_timeout_ms: number
        }
        Insert: {
          groq_model?: string
          id?: string
          llm_max_tokens?: number
          studio_allowed_hosts: string[]
          studio_base_url: string
          studio_timeout_ms?: number
        }
        Update: {
          groq_model?: string
          id?: string
          llm_max_tokens?: number
          studio_allowed_hosts?: string[]
          studio_base_url?: string
          studio_timeout_ms?: number
        }
        Relationships: []
      }
      site_publications: {
        Row: {
          approval_id: number
          audit_id: number
          caption: string
          draft_id: number
          hashtags: string[]
          hook: string
          id: number
          language: string
          published_at: string
          script: string
        }
        Insert: {
          approval_id: number
          audit_id: number
          caption: string
          draft_id: number
          hashtags: string[]
          hook: string
          id?: number
          language: string
          published_at?: string
          script: string
        }
        Update: {
          approval_id?: number
          audit_id?: number
          caption?: string
          draft_id?: number
          hashtags?: string[]
          hook?: string
          id?: number
          language?: string
          published_at?: string
          script?: string
        }
        Relationships: [
          {
            foreignKeyName: "site_publications_approval_id_fkey"
            columns: ["approval_id"]
            isOneToOne: true
            referencedRelation: "approvals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "site_publications_audit_id_fkey"
            columns: ["audit_id"]
            isOneToOne: false
            referencedRelation: "audit_events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "site_publications_draft_id_fkey"
            columns: ["draft_id"]
            isOneToOne: true
            referencedRelation: "content_drafts"
            referencedColumns: ["id"]
          },
        ]
      }
      trend_observations: {
        Row: {
          collected_at: string
          id: number
          language: string
          metric: string
          published_at: string | null
          region: string
          source: string
          subject_id: string
          topic: string
          url: string
          views: number | null
        }
        Insert: {
          collected_at: string
          id?: number
          language: string
          metric: string
          published_at?: string | null
          region: string
          source: string
          subject_id: string
          topic: string
          url: string
          views?: number | null
        }
        Update: {
          collected_at?: string
          id?: number
          language?: string
          metric?: string
          published_at?: string | null
          region?: string
          source?: string
          subject_id?: string
          topic?: string
          url?: string
          views?: number | null
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      ctl_append_audit: {
        Args: {
          p_action: string
          p_actor: string
          p_canon: string
          p_detail: string
          p_event: string
          p_run_id: string
          p_status: string
          p_ts: number
        }
        Returns: number
      }
      ctl_append_audit_exact: {
        Args: {
          p_action: string
          p_actor: string
          p_canon: string
          p_detail: string
          p_event: string
          p_run_id: string
          p_status: string
          p_ts: number
        }
        Returns: number
      }
      ctl_consume: { Args: { p_id: number }; Returns: boolean }
      ctl_create_approval: {
        Args: {
          p_action: string
          p_actor: string
          p_params_hash: string
          p_params_json: string
          p_run_id: string
          p_ttl: number
        }
        Returns: {
          action: string
          actor: string
          created_ts: number
          decided_by: string | null
          decided_ts: number | null
          expires_ts: number
          id: number
          params_hash: string
          params_json: string
          result_json: string | null
          run_id: string
          status: string
        }
        SetofOptions: {
          from: "*"
          to: "approvals"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      ctl_finish: {
        Args: { p_id: number; p_ok: boolean; p_result_json: string }
        Returns: undefined
      }
      ctl_human_decide: {
        Args: { p_approve: boolean; p_by: string; p_id: number }
        Returns: string
      }
      ctl_kill_engage: {
        Args: { p_by: string; p_reason: string }
        Returns: undefined
      }
      ctl_kill_release: { Args: { p_by: string }; Returns: undefined }
      ctl_now: { Args: never; Returns: number }
      ctl_publish_site: {
        Args: {
          p_actor: string
          p_approval_id: number
          p_canon: string
          p_confirm: string
          p_detail: string
          p_draft_id: number
          p_params_hash: string
          p_run_id: string
          p_ts: number
        }
        Returns: number
      }
      ctl_try_record_call: {
        Args: {
          p_action: string
          p_kind: string
          p_limit: number
          p_window: number
        }
        Returns: boolean
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      require_operator: { Args: never; Returns: undefined }
    }
    Enums: {
      app_role: "admin"
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
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
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
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
      app_role: ["admin"],
    },
  },
} as const
