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
      grocery_items: {
        Row: {
          available: boolean
          barcode: string
          ebt_eligible: boolean
          image_url: string | null
          name: string
          name_my: string | null
          price_cents: number
          tax_category: string
          weighed: boolean
        }
        Insert: {
          available?: boolean
          barcode: string
          ebt_eligible?: boolean
          image_url?: string | null
          name: string
          name_my?: string | null
          price_cents: number
          tax_category: string
          weighed?: boolean
        }
        Update: {
          available?: boolean
          barcode?: string
          ebt_eligible?: boolean
          image_url?: string | null
          name?: string
          name_my?: string | null
          price_cents?: number
          tax_category?: string
          weighed?: boolean
        }
        Relationships: []
      }
      item_modifier_groups: {
        Row: {
          group_id: string
          item_id: string
        }
        Insert: {
          group_id: string
          item_id: string
        }
        Update: {
          group_id?: string
          item_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "item_modifier_groups_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "modifier_groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "item_modifier_groups_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "menu_items"
            referencedColumns: ["id"]
          },
        ]
      }
      menu_categories: {
        Row: {
          created_at: string
          id: string
          is_active: boolean
          name: string
          slug: string
          sort_order: number
        }
        Insert: {
          created_at?: string
          id?: string
          is_active?: boolean
          name: string
          slug: string
          sort_order?: number
        }
        Update: {
          created_at?: string
          id?: string
          is_active?: boolean
          name?: string
          slug?: string
          sort_order?: number
        }
        Relationships: []
      }
      menu_items: {
        Row: {
          allergens: string[]
          base_price_cents: number
          category_id: string
          created_at: string
          description_en: string | null
          id: string
          image_updated_at: string | null
          image_url: string | null
          is_active: boolean
          is_sold_out: boolean
          name_en: string
          name_my: string | null
          slug: string
          tags: string[]
          tax_category: string
          updated_at: string
        }
        Insert: {
          allergens?: string[]
          base_price_cents: number
          category_id: string
          created_at?: string
          description_en?: string | null
          id?: string
          image_updated_at?: string | null
          image_url?: string | null
          is_active?: boolean
          is_sold_out?: boolean
          name_en: string
          name_my?: string | null
          slug: string
          tags?: string[]
          tax_category?: string
          updated_at?: string
        }
        Update: {
          allergens?: string[]
          base_price_cents?: number
          category_id?: string
          created_at?: string
          description_en?: string | null
          id?: string
          image_updated_at?: string | null
          image_url?: string | null
          is_active?: boolean
          is_sold_out?: boolean
          name_en?: string
          name_my?: string | null
          slug?: string
          tags?: string[]
          tax_category?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "menu_items_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "menu_categories"
            referencedColumns: ["id"]
          },
        ]
      }
      modifier_groups: {
        Row: {
          created_at: string
          id: string
          max_select: number
          min_select: number
          name: string
          selection_type: string
          slug: string
        }
        Insert: {
          created_at?: string
          id?: string
          max_select?: number
          min_select?: number
          name: string
          selection_type?: string
          slug: string
        }
        Update: {
          created_at?: string
          id?: string
          max_select?: number
          min_select?: number
          name?: string
          selection_type?: string
          slug?: string
        }
        Relationships: []
      }
      modifier_options: {
        Row: {
          created_at: string
          group_id: string
          id: string
          is_active: boolean
          name: string
          price_delta_cents: number
          slug: string
          sort_order: number
        }
        Insert: {
          created_at?: string
          group_id: string
          id?: string
          is_active?: boolean
          name: string
          price_delta_cents?: number
          slug: string
          sort_order?: number
        }
        Update: {
          created_at?: string
          group_id?: string
          id?: string
          is_active?: boolean
          name?: string
          price_delta_cents?: number
          slug?: string
          sort_order?: number
        }
        Relationships: [
          {
            foreignKeyName: "modifier_options_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "modifier_groups"
            referencedColumns: ["id"]
          },
        ]
      }
      promo_codes: {
        Row: {
          active: boolean
          code: string
          kind: string
          max_uses: number | null
          used: number
          value: number
        }
        Insert: {
          active?: boolean
          code: string
          kind: string
          max_uses?: number | null
          used?: number
          value: number
        }
        Update: {
          active?: boolean
          code?: string
          kind?: string
          max_uses?: number | null
          used?: number
          value?: number
        }
        Relationships: []
      }
      qr_cart_items: {
        Row: {
          by_seat: string | null
          cart_id: string
          created_at: string
          id: string
          menu_item_id: string
          modifiers: Json
          name: string
          qty: number
          tax_cents: number
          unit_price_cents: number
        }
        Insert: {
          by_seat?: string | null
          cart_id: string
          created_at?: string
          id?: string
          menu_item_id: string
          modifiers?: Json
          name: string
          qty: number
          tax_cents?: number
          unit_price_cents: number
        }
        Update: {
          by_seat?: string | null
          cart_id?: string
          created_at?: string
          id?: string
          menu_item_id?: string
          modifiers?: Json
          name?: string
          qty?: number
          tax_cents?: number
          unit_price_cents?: number
        }
        Relationships: [
          {
            foreignKeyName: "qr_cart_items_cart_id_fkey"
            columns: ["cart_id"]
            isOneToOne: false
            referencedRelation: "qr_carts"
            referencedColumns: ["id"]
          },
        ]
      }
      qr_carts: {
        Row: {
          created_at: string
          id: string
          locked: boolean
          promo_code: string | null
          session_id: string
          status: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          locked?: boolean
          promo_code?: string | null
          session_id: string
          status?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          locked?: boolean
          promo_code?: string | null
          session_id?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "qr_carts_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "table_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      qr_order_items: {
        Row: {
          id: string
          menu_item_id: string
          modifiers: Json
          name: string
          order_id: string
          qty: number
          tax_cents: number
          unit_price_cents: number
        }
        Insert: {
          id?: string
          menu_item_id: string
          modifiers?: Json
          name: string
          order_id: string
          qty: number
          tax_cents: number
          unit_price_cents: number
        }
        Update: {
          id?: string
          menu_item_id?: string
          modifiers?: Json
          name?: string
          order_id?: string
          qty?: number
          tax_cents?: number
          unit_price_cents?: number
        }
        Relationships: [
          {
            foreignKeyName: "qr_order_items_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "qr_orders"
            referencedColumns: ["id"]
          },
        ]
      }
      qr_orders: {
        Row: {
          created_at: string
          discount_cents: number
          id: string
          service_charge_cents: number
          session_id: string | null
          status: string
          stripe_payment_intent_id: string | null
          subtotal_cents: number
          tax_cents: number
          tip_cents: number
          total_cents: number
        }
        Insert: {
          created_at?: string
          discount_cents?: number
          id?: string
          service_charge_cents: number
          session_id?: string | null
          status?: string
          stripe_payment_intent_id?: string | null
          subtotal_cents: number
          tax_cents: number
          tip_cents?: number
          total_cents: number
        }
        Update: {
          created_at?: string
          discount_cents?: number
          id?: string
          service_charge_cents?: number
          session_id?: string | null
          status?: string
          stripe_payment_intent_id?: string | null
          subtotal_cents?: number
          tax_cents?: number
          tip_cents?: number
          total_cents?: number
        }
        Relationships: [
          {
            foreignKeyName: "qr_orders_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "table_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      session_members: {
        Row: {
          created_at: string
          display_name: string
          id: string
          role: string
          seat_id: string
          session_id: string
        }
        Insert: {
          created_at?: string
          display_name: string
          id?: string
          role?: string
          seat_id: string
          session_id: string
        }
        Update: {
          created_at?: string
          display_name?: string
          id?: string
          role?: string
          seat_id?: string
          session_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "session_members_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "table_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      table_sessions: {
        Row: {
          created_at: string
          expires_at: string
          host_seat: string | null
          id: string
          mode: string
          pickup_slot: string | null
          qr_code: string
          status: string
        }
        Insert: {
          created_at?: string
          expires_at?: string
          host_seat?: string | null
          id?: string
          mode: string
          pickup_slot?: string | null
          qr_code: string
          status?: string
        }
        Update: {
          created_at?: string
          expires_at?: string
          host_seat?: string | null
          id?: string
          mode?: string
          pickup_slot?: string | null
          qr_code?: string
          status?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      is_host: { Args: { sess: string }; Returns: boolean }
      is_member: { Args: { sess: string }; Returns: boolean }
      mms_fulfill_order: {
        Args: {
          p_amount_cents: number
          p_cart_id: string
          p_discount_cents: number
          p_payment_intent: string
          p_service_charge_cents: number
          p_subtotal_cents: number
          p_tax_cents: number
          p_tip_cents?: number
        }
        Returns: string
      }
      mms_line_tax: {
        Args: { amount_cents: number; category: string; dine_in: boolean }
        Returns: number
      }
      mms_tax_rate: { Args: never; Returns: number }
      mms_taxable: {
        Args: { category: string; dine_in: boolean }
        Returns: boolean
      }
    }
    Enums: {
      [_ in never]: never
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
    Enums: {},
  },
} as const

