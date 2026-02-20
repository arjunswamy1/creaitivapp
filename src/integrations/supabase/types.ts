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
    PostgrestVersion: "14.1"
  }
  public: {
    Tables: {
      ad_campaigns: {
        Row: {
          campaign_name: string
          clicks: number
          client_id: string | null
          conversions: number
          created_at: string
          date: string
          id: string
          impression_share: number | null
          impressions: number
          lost_is_budget: number | null
          lost_is_rank: number | null
          platform: string
          platform_campaign_id: string
          revenue: number
          roas: number | null
          spend: number
          status: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          campaign_name: string
          clicks?: number
          client_id?: string | null
          conversions?: number
          created_at?: string
          date: string
          id?: string
          impression_share?: number | null
          impressions?: number
          lost_is_budget?: number | null
          lost_is_rank?: number | null
          platform: string
          platform_campaign_id: string
          revenue?: number
          roas?: number | null
          spend?: number
          status?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          campaign_name?: string
          clicks?: number
          client_id?: string | null
          conversions?: number
          created_at?: string
          date?: string
          id?: string
          impression_share?: number | null
          impressions?: number
          lost_is_budget?: number | null
          lost_is_rank?: number | null
          platform?: string
          platform_campaign_id?: string
          revenue?: number
          roas?: number | null
          spend?: number
          status?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ad_campaigns_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      ad_daily_metrics: {
        Row: {
          clicks: number
          client_id: string | null
          conversions: number
          cpc: number | null
          cpm: number | null
          created_at: string
          ctr: number | null
          date: string
          id: string
          impressions: number
          platform: string
          revenue: number
          roas: number | null
          spend: number
          updated_at: string
          user_id: string
        }
        Insert: {
          clicks?: number
          client_id?: string | null
          conversions?: number
          cpc?: number | null
          cpm?: number | null
          created_at?: string
          ctr?: number | null
          date: string
          id?: string
          impressions?: number
          platform: string
          revenue?: number
          roas?: number | null
          spend?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          clicks?: number
          client_id?: string | null
          conversions?: number
          cpc?: number | null
          cpm?: number | null
          created_at?: string
          ctr?: number | null
          date?: string
          id?: string
          impressions?: number
          platform?: string
          revenue?: number
          roas?: number | null
          spend?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ad_daily_metrics_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      ad_sets: {
        Row: {
          adset_name: string
          campaign_name: string | null
          clicks: number
          client_id: string | null
          conversions: number
          created_at: string
          date: string
          id: string
          impressions: number
          platform: string
          platform_adset_id: string
          platform_campaign_id: string
          revenue: number
          roas: number | null
          spend: number
          status: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          adset_name: string
          campaign_name?: string | null
          clicks?: number
          client_id?: string | null
          conversions?: number
          created_at?: string
          date: string
          id?: string
          impressions?: number
          platform: string
          platform_adset_id: string
          platform_campaign_id: string
          revenue?: number
          roas?: number | null
          spend?: number
          status?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          adset_name?: string
          campaign_name?: string | null
          clicks?: number
          client_id?: string | null
          conversions?: number
          created_at?: string
          date?: string
          id?: string
          impressions?: number
          platform?: string
          platform_adset_id?: string
          platform_campaign_id?: string
          revenue?: number
          roas?: number | null
          spend?: number
          status?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ad_sets_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      ad_sync_log: {
        Row: {
          completed_at: string | null
          error_message: string | null
          id: string
          platform: string
          records_synced: number | null
          started_at: string
          status: string
          user_id: string
        }
        Insert: {
          completed_at?: string | null
          error_message?: string | null
          id?: string
          platform: string
          records_synced?: number | null
          started_at?: string
          status?: string
          user_id: string
        }
        Update: {
          completed_at?: string | null
          error_message?: string | null
          id?: string
          platform?: string
          records_synced?: number | null
          started_at?: string
          status?: string
          user_id?: string
        }
        Relationships: []
      }
      ads: {
        Row: {
          ad_name: string
          adset_name: string | null
          campaign_name: string | null
          clicks: number
          client_id: string | null
          conversions: number
          created_at: string
          creative_url: string | null
          date: string
          format: string | null
          frequency: number | null
          id: string
          impressions: number
          platform: string
          platform_ad_id: string
          platform_adset_id: string
          platform_campaign_id: string
          revenue: number
          roas: number | null
          spend: number
          status: string | null
          thumbnail_url: string | null
          updated_at: string
          user_id: string
          video_views_25: number | null
          video_views_3s: number | null
          video_views_50: number | null
          video_views_95: number | null
        }
        Insert: {
          ad_name: string
          adset_name?: string | null
          campaign_name?: string | null
          clicks?: number
          client_id?: string | null
          conversions?: number
          created_at?: string
          creative_url?: string | null
          date: string
          format?: string | null
          frequency?: number | null
          id?: string
          impressions?: number
          platform: string
          platform_ad_id: string
          platform_adset_id: string
          platform_campaign_id: string
          revenue?: number
          roas?: number | null
          spend?: number
          status?: string | null
          thumbnail_url?: string | null
          updated_at?: string
          user_id: string
          video_views_25?: number | null
          video_views_3s?: number | null
          video_views_50?: number | null
          video_views_95?: number | null
        }
        Update: {
          ad_name?: string
          adset_name?: string | null
          campaign_name?: string | null
          clicks?: number
          client_id?: string | null
          conversions?: number
          created_at?: string
          creative_url?: string | null
          date?: string
          format?: string | null
          frequency?: number | null
          id?: string
          impressions?: number
          platform?: string
          platform_ad_id?: string
          platform_adset_id?: string
          platform_campaign_id?: string
          revenue?: number
          roas?: number | null
          spend?: number
          status?: string | null
          thumbnail_url?: string | null
          updated_at?: string
          user_id?: string
          video_views_25?: number | null
          video_views_3s?: number | null
          video_views_50?: number | null
          video_views_95?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "ads_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      alert_settings: {
        Row: {
          client_id: string | null
          created_at: string
          enabled: boolean
          id: string
          max_cac: number | null
          min_roas: number | null
          slack_channel: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          client_id?: string | null
          created_at?: string
          enabled?: boolean
          id?: string
          max_cac?: number | null
          min_roas?: number | null
          slack_channel?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          client_id?: string | null
          created_at?: string
          enabled?: boolean
          id?: string
          max_cac?: number | null
          min_roas?: number | null
          slack_channel?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "alert_settings_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      client_dashboard_config: {
        Row: {
          client_id: string
          created_at: string
          custom_metrics: Json | null
          enabled_kpis: string[] | null
          enabled_platforms: string[] | null
          id: string
          revenue_source: string
          updated_at: string
        }
        Insert: {
          client_id: string
          created_at?: string
          custom_metrics?: Json | null
          enabled_kpis?: string[] | null
          enabled_platforms?: string[] | null
          id?: string
          revenue_source?: string
          updated_at?: string
        }
        Update: {
          client_id?: string
          created_at?: string
          custom_metrics?: Json | null
          enabled_kpis?: string[] | null
          enabled_platforms?: string[] | null
          id?: string
          revenue_source?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "client_dashboard_config_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: true
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      client_members: {
        Row: {
          client_id: string
          created_at: string
          id: string
          role: Database["public"]["Enums"]["client_role"]
          user_id: string
        }
        Insert: {
          client_id: string
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["client_role"]
          user_id: string
        }
        Update: {
          client_id?: string
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["client_role"]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "client_members_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      clients: {
        Row: {
          brand_colors: Json | null
          created_at: string
          id: string
          logo_url: string | null
          name: string
          slug: string
          updated_at: string
        }
        Insert: {
          brand_colors?: Json | null
          created_at?: string
          id?: string
          logo_url?: string | null
          name: string
          slug: string
          updated_at?: string
        }
        Update: {
          brand_colors?: Json | null
          created_at?: string
          id?: string
          logo_url?: string | null
          name?: string
          slug?: string
          updated_at?: string
        }
        Relationships: []
      }
      keywords: {
        Row: {
          adset_name: string | null
          campaign_name: string | null
          clicks: number
          client_id: string | null
          conversions: number
          created_at: string
          date: string
          id: string
          impressions: number
          keyword_text: string
          match_type: string | null
          platform: string
          platform_adset_id: string
          platform_campaign_id: string
          quality_score: number | null
          revenue: number
          roas: number | null
          spend: number
          status: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          adset_name?: string | null
          campaign_name?: string | null
          clicks?: number
          client_id?: string | null
          conversions?: number
          created_at?: string
          date: string
          id?: string
          impressions?: number
          keyword_text: string
          match_type?: string | null
          platform?: string
          platform_adset_id: string
          platform_campaign_id: string
          quality_score?: number | null
          revenue?: number
          roas?: number | null
          spend?: number
          status?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          adset_name?: string | null
          campaign_name?: string | null
          clicks?: number
          client_id?: string | null
          conversions?: number
          created_at?: string
          date?: string
          id?: string
          impressions?: number
          keyword_text?: string
          match_type?: string | null
          platform?: string
          platform_adset_id?: string
          platform_campaign_id?: string
          quality_score?: number | null
          revenue?: number
          roas?: number | null
          spend?: number
          status?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "keywords_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      platform_connections: {
        Row: {
          access_token: string
          account_id: string | null
          account_name: string | null
          client_id: string | null
          connected_at: string
          id: string
          metadata: Json | null
          platform: string
          refresh_token: string | null
          selected_ad_account: Json | null
          token_expires_at: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          access_token: string
          account_id?: string | null
          account_name?: string | null
          client_id?: string | null
          connected_at?: string
          id?: string
          metadata?: Json | null
          platform: string
          refresh_token?: string | null
          selected_ad_account?: Json | null
          token_expires_at?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          access_token?: string
          account_id?: string | null
          account_name?: string | null
          client_id?: string | null
          connected_at?: string
          id?: string
          metadata?: Json | null
          platform?: string
          refresh_token?: string | null
          selected_ad_account?: Json | null
          token_expires_at?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "platform_connections_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          created_at: string
          display_name: string | null
          email: string | null
          id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          display_name?: string | null
          email?: string | null
          id?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          display_name?: string | null
          email?: string | null
          id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      shopify_orders: {
        Row: {
          client_id: string | null
          created_at: string
          currency: string | null
          customer_id: number | null
          financial_status: string
          fulfillment_status: string | null
          id: string
          line_items_count: number | null
          order_date: string | null
          order_number: string | null
          shopify_order_id: number
          subtotal_price: number
          synced_at: string
          total_cost: number
          total_discounts: number
          total_price: number
          total_shipping: number
          total_tax: number
          updated_at: string
        }
        Insert: {
          client_id?: string | null
          created_at?: string
          currency?: string | null
          customer_id?: number | null
          financial_status: string
          fulfillment_status?: string | null
          id?: string
          line_items_count?: number | null
          order_date?: string | null
          order_number?: string | null
          shopify_order_id: number
          subtotal_price?: number
          synced_at?: string
          total_cost?: number
          total_discounts?: number
          total_price?: number
          total_shipping?: number
          total_tax?: number
          updated_at?: string
        }
        Update: {
          client_id?: string | null
          created_at?: string
          currency?: string | null
          customer_id?: number | null
          financial_status?: string
          fulfillment_status?: string | null
          id?: string
          line_items_count?: number | null
          order_date?: string | null
          order_number?: string | null
          shopify_order_id?: number
          subtotal_price?: number
          synced_at?: string
          total_cost?: number
          total_discounts?: number
          total_price?: number
          total_shipping?: number
          total_tax?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "shopify_orders_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      subbly_invoices: {
        Row: {
          amount: number
          client_id: string | null
          created_at: string
          currency_code: string | null
          customer_id: number
          id: string
          invoice_date: string | null
          status: string
          subbly_id: number
          subscription_id: number | null
          synced_at: string
          updated_at: string
        }
        Insert: {
          amount?: number
          client_id?: string | null
          created_at?: string
          currency_code?: string | null
          customer_id: number
          id?: string
          invoice_date?: string | null
          status: string
          subbly_id: number
          subscription_id?: number | null
          synced_at?: string
          updated_at?: string
        }
        Update: {
          amount?: number
          client_id?: string | null
          created_at?: string
          currency_code?: string | null
          customer_id?: number
          id?: string
          invoice_date?: string | null
          status?: string
          subbly_id?: number
          subscription_id?: number | null
          synced_at?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "subbly_invoices_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      subbly_subscriptions: {
        Row: {
          client_id: string | null
          created_at: string
          currency_code: string | null
          customer_id: number
          id: string
          last_payment_at: string | null
          next_payment_date: string | null
          past_due: boolean | null
          product_id: number
          quantity: number
          status: string
          subbly_created_at: string | null
          subbly_id: number
          successful_charges_count: number | null
          synced_at: string
          updated_at: string
        }
        Insert: {
          client_id?: string | null
          created_at?: string
          currency_code?: string | null
          customer_id: number
          id?: string
          last_payment_at?: string | null
          next_payment_date?: string | null
          past_due?: boolean | null
          product_id: number
          quantity?: number
          status: string
          subbly_created_at?: string | null
          subbly_id: number
          successful_charges_count?: number | null
          synced_at?: string
          updated_at?: string
        }
        Update: {
          client_id?: string | null
          created_at?: string
          currency_code?: string | null
          customer_id?: number
          id?: string
          last_payment_at?: string | null
          next_payment_date?: string | null
          past_due?: boolean | null
          product_id?: number
          quantity?: number
          status?: string
          subbly_created_at?: string | null
          subbly_id?: number
          successful_charges_count?: number | null
          synced_at?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "subbly_subscriptions_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      get_user_client_ids: { Args: { _user_id: string }; Returns: string[] }
      is_agency_admin: { Args: { _user_id: string }; Returns: boolean }
      is_client_member: {
        Args: { _client_id: string; _user_id: string }
        Returns: boolean
      }
    }
    Enums: {
      client_role: "agency_admin" | "client_admin" | "viewer"
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
      client_role: ["agency_admin", "client_admin", "viewer"],
    },
  },
} as const
