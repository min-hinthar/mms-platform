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
      mms_approvals: {
        Row: {
          amount_cents: number
          approver_staff_id: string | null
          cart_id: string | null
          cooked: boolean
          created_at: string
          gate_reason: string | null
          id: string
          initiator_staff_id: string
          kind: string
          line_id: string | null
          line_name: string | null
          qty: number | null
          reason_code: string
          resolved_at: string | null
          session_id: string | null
          status: string
        }
        Insert: {
          amount_cents?: number
          approver_staff_id?: string | null
          cart_id?: string | null
          cooked?: boolean
          created_at?: string
          gate_reason?: string | null
          id?: string
          initiator_staff_id: string
          kind: string
          line_id?: string | null
          line_name?: string | null
          qty?: number | null
          reason_code: string
          resolved_at?: string | null
          session_id?: string | null
          status?: string
        }
        Update: {
          amount_cents?: number
          approver_staff_id?: string | null
          cart_id?: string | null
          cooked?: boolean
          created_at?: string
          gate_reason?: string | null
          id?: string
          initiator_staff_id?: string
          kind?: string
          line_id?: string | null
          line_name?: string | null
          qty?: number | null
          reason_code?: string
          resolved_at?: string | null
          session_id?: string | null
          status?: string
        }
        Relationships: []
      }
      mms_loss_config: {
        Row: {
          id: boolean
          max_loss_cents: number
          max_loss_percent: number
          updated_at: string
        }
        Insert: {
          id?: boolean
          max_loss_cents?: number
          max_loss_percent?: number
          updated_at?: string
        }
        Update: {
          id?: boolean
          max_loss_cents?: number
          max_loss_percent?: number
          updated_at?: string
        }
        Relationships: []
      }
      mms_tab_config: {
        Row: {
          ceiling_cents: number
          id: boolean
          nudge_party_size: number
          updated_at: string
        }
        Insert: {
          ceiling_cents?: number
          id?: boolean
          nudge_party_size?: number
          updated_at?: string
        }
        Update: {
          ceiling_cents?: number
          id?: boolean
          nudge_party_size?: number
          updated_at?: string
        }
        Relationships: []
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
      pickup_config: {
        Row: {
          capacity_per_slot: number
          close_time: string
          hold_minutes: number
          horizon_days: number
          id: boolean
          lead_minutes: number
          open_time: string
          prep_minutes: number
          slot_minutes: number
          tz: string
        }
        Insert: {
          capacity_per_slot?: number
          close_time?: string
          hold_minutes?: number
          horizon_days?: number
          id?: boolean
          lead_minutes?: number
          open_time?: string
          prep_minutes?: number
          slot_minutes?: number
          tz?: string
        }
        Update: {
          capacity_per_slot?: number
          close_time?: string
          hold_minutes?: number
          horizon_days?: number
          id?: boolean
          lead_minutes?: number
          open_time?: string
          prep_minutes?: number
          slot_minutes?: number
          tz?: string
        }
        Relationships: []
      }
      promo_attempts: {
        Row: {
          attempted_at: string
          id: string
          session_id: string
        }
        Insert: {
          attempted_at?: string
          id?: string
          session_id: string
        }
        Update: {
          attempted_at?: string
          id?: string
          session_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "promo_attempts_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "table_sessions"
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
          min_subtotal_cents: number
          per_session_limit: number
          used: number
          valid_from: string | null
          valid_until: string | null
          value: number
        }
        Insert: {
          active?: boolean
          code: string
          kind: string
          max_uses?: number | null
          min_subtotal_cents?: number
          per_session_limit?: number
          used?: number
          valid_from?: string | null
          valid_until?: string | null
          value: number
        }
        Update: {
          active?: boolean
          code?: string
          kind?: string
          max_uses?: number | null
          min_subtotal_cents?: number
          per_session_limit?: number
          used?: number
          valid_from?: string | null
          valid_until?: string | null
          value?: number
        }
        Relationships: []
      }
      promo_redemptions: {
        Row: {
          code: string
          id: string
          order_id: string | null
          redeemed_at: string
          session_id: string
        }
        Insert: {
          code: string
          id?: string
          order_id?: string | null
          redeemed_at?: string
          session_id: string
        }
        Update: {
          code?: string
          id?: string
          order_id?: string | null
          redeemed_at?: string
          session_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "promo_redemptions_code_fkey"
            columns: ["code"]
            isOneToOne: false
            referencedRelation: "promo_codes"
            referencedColumns: ["code"]
          },
          {
            foreignKeyName: "promo_redemptions_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "qr_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "promo_redemptions_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "table_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      qbo_sync_queue: {
        Row: {
          attempts: number
          created_at: string
          last_error: string | null
          order_id: string
          qbo_doc_id: string | null
          status: string
          updated_at: string
        }
        Insert: {
          attempts?: number
          created_at?: string
          last_error?: string | null
          order_id: string
          qbo_doc_id?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          attempts?: number
          created_at?: string
          last_error?: string | null
          order_id?: string
          qbo_doc_id?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "qbo_sync_queue_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: true
            referencedRelation: "qr_orders"
            referencedColumns: ["id"]
          },
        ]
      }
      qr_cart_items: {
        Row: {
          by_seat: string | null
          cart_id: string
          comped: boolean
          created_at: string
          fire_at: string | null
          fire_batch: string | null
          id: string
          menu_item_id: string
          modifiers: Json
          name: string
          qty: number
          state: string
          tax_cents: number
          unit_price_cents: number
        }
        Insert: {
          by_seat?: string | null
          cart_id: string
          comped?: boolean
          created_at?: string
          fire_at?: string | null
          fire_batch?: string | null
          id?: string
          menu_item_id: string
          modifiers?: Json
          name: string
          qty: number
          state?: string
          tax_cents?: number
          unit_price_cents: number
        }
        Update: {
          by_seat?: string | null
          cart_id?: string
          comped?: boolean
          created_at?: string
          fire_at?: string | null
          fire_batch?: string | null
          id?: string
          menu_item_id?: string
          modifiers?: Json
          name?: string
          qty?: number
          state?: string
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
      qr_cart_shares: {
        Row: {
          amount_cents: number
          cart_id: string
          created_at: string
          discount_cents: number
          id: string
          order_id: string | null
          seat_id: string
          service_charge_cents: number
          status: string
          stripe_payment_intent_id: string | null
          subtotal_cents: number
          tax_cents: number
          tip_cents: number
          tip_rate: number
          updated_at: string
        }
        Insert: {
          amount_cents: number
          cart_id: string
          created_at?: string
          discount_cents?: number
          id?: string
          order_id?: string | null
          seat_id: string
          service_charge_cents?: number
          status?: string
          stripe_payment_intent_id?: string | null
          subtotal_cents: number
          tax_cents?: number
          tip_cents?: number
          tip_rate?: number
          updated_at?: string
        }
        Update: {
          amount_cents?: number
          cart_id?: string
          created_at?: string
          discount_cents?: number
          id?: string
          order_id?: string | null
          seat_id?: string
          service_charge_cents?: number
          status?: string
          stripe_payment_intent_id?: string | null
          subtotal_cents?: number
          tax_cents?: number
          tip_cents?: number
          tip_rate?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "qr_cart_shares_cart_id_fkey"
            columns: ["cart_id"]
            isOneToOne: false
            referencedRelation: "qr_carts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "qr_cart_shares_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "qr_orders"
            referencedColumns: ["id"]
          },
        ]
      }
      qr_carts: {
        Row: {
          created_at: string
          fire_at: string | null
          id: string
          locked: boolean
          locked_at: string | null
          locked_by: string | null
          pickup_slot: string | null
          promo_code: string | null
          session_id: string
          settle_at: string | null
          settle_by: string | null
          status: string
          tab_opened_at: string | null
          tab_type: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          fire_at?: string | null
          id?: string
          locked?: boolean
          locked_at?: string | null
          locked_by?: string | null
          pickup_slot?: string | null
          promo_code?: string | null
          session_id: string
          settle_at?: string | null
          settle_by?: string | null
          status?: string
          tab_opened_at?: string | null
          tab_type?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          fire_at?: string | null
          id?: string
          locked?: boolean
          locked_at?: string | null
          locked_by?: string | null
          pickup_slot?: string | null
          promo_code?: string | null
          session_id?: string
          settle_at?: string | null
          settle_by?: string | null
          status?: string
          tab_opened_at?: string | null
          tab_type?: string
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
          cart_id: string | null
          created_at: string
          discount_cents: number
          fire_at: string | null
          id: string
          pickup_slot: string | null
          service_charge_cents: number
          session_id: string | null
          settled_by: string | null
          status: string
          stripe_payment_intent_id: string | null
          subtotal_cents: number
          tax_cents: number
          tender: string
          tip_cents: number
          total_cents: number
        }
        Insert: {
          cart_id?: string | null
          created_at?: string
          discount_cents?: number
          fire_at?: string | null
          id?: string
          pickup_slot?: string | null
          service_charge_cents: number
          session_id?: string | null
          settled_by?: string | null
          status?: string
          stripe_payment_intent_id?: string | null
          subtotal_cents: number
          tax_cents: number
          tender?: string
          tip_cents?: number
          total_cents: number
        }
        Update: {
          cart_id?: string | null
          created_at?: string
          discount_cents?: number
          fire_at?: string | null
          id?: string
          pickup_slot?: string | null
          service_charge_cents?: number
          session_id?: string | null
          settled_by?: string | null
          status?: string
          stripe_payment_intent_id?: string | null
          subtotal_cents?: number
          tax_cents?: number
          tender?: string
          tip_cents?: number
          total_cents?: number
        }
        Relationships: [
          {
            foreignKeyName: "qr_orders_cart_id_fkey"
            columns: ["cart_id"]
            isOneToOne: false
            referencedRelation: "qr_carts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "qr_orders_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "table_sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "qr_orders_settled_by_fkey"
            columns: ["settled_by"]
            isOneToOne: false
            referencedRelation: "staff"
            referencedColumns: ["user_id"]
          },
        ]
      }
      qr_refunds_needed: {
        Row: {
          amount_cents: number | null
          cart_id: string | null
          created_at: string
          id: string
          payment_intent: string
          reason: string
          resolved: boolean
        }
        Insert: {
          amount_cents?: number | null
          cart_id?: string | null
          created_at?: string
          id?: string
          payment_intent: string
          reason: string
          resolved?: boolean
        }
        Update: {
          amount_cents?: number | null
          cart_id?: string | null
          created_at?: string
          id?: string
          payment_intent?: string
          reason?: string
          resolved?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "qr_refunds_needed_cart_id_fkey"
            columns: ["cart_id"]
            isOneToOne: false
            referencedRelation: "qr_carts"
            referencedColumns: ["id"]
          },
        ]
      }
      rate_events: {
        Row: {
          bucket: string
          created_at: string
          id: string
          key: string
        }
        Insert: {
          bucket: string
          created_at?: string
          id?: string
          key: string
        }
        Update: {
          bucket?: string
          created_at?: string
          id?: string
          key?: string
        }
        Relationships: []
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
      staff: {
        Row: {
          active: boolean
          created_at: string
          display_name: string
          email: string | null
          role: string
          updated_at: string
          user_id: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          display_name: string
          email?: string | null
          role: string
          updated_at?: string
          user_id: string
        }
        Update: {
          active?: boolean
          created_at?: string
          display_name?: string
          email?: string | null
          role?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      staff_pins: {
        Row: {
          failed_attempts: number
          locked_until: string | null
          pin_hash: string
          set_at: string
          staff_id: string
          updated_at: string
        }
        Insert: {
          failed_attempts?: number
          locked_until?: string | null
          pin_hash: string
          set_at?: string
          staff_id: string
          updated_at?: string
        }
        Update: {
          failed_attempts?: number
          locked_until?: string | null
          pin_hash?: string
          set_at?: string
          staff_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "staff_pins_staff_id_fkey"
            columns: ["staff_id"]
            isOneToOne: true
            referencedRelation: "staff"
            referencedColumns: ["user_id"]
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
      is_staff: { Args: never; Returns: boolean }
      is_staff_at_least: { Args: { min_role: string }; Returns: boolean }
      mms_cart_item_inc_qty: { Args: { p_id: string }; Returns: undefined }
      mms_cart_item_insert_if_open: {
        Args: {
          p_by_seat: string
          p_cart_id: string
          p_menu_item_id: string
          p_modifiers: Json
          p_name: string
          p_tax_cents: number
          p_unit_price_cents: number
        }
        Returns: string
      }
      mms_cart_item_set_qty_if_open: {
        Args: { p_id: string; p_qty: number }
        Returns: number
      }
      mms_fire_cart: { Args: { p_cart_id: string }; Returns: number }
      mms_fulfill_cash_order: {
        Args: {
          p_cart_id: string
          p_discount_cents: number
          p_service_charge_cents: number
          p_settled_by: string
          p_subtotal_cents: number
          p_tax_cents: number
          p_tip_cents?: number
        }
        Returns: string
      }
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
      mms_fulfill_split_order: {
        Args: { p_cart_id: string; p_expected_total_cents: number }
        Returns: string
      }
      mms_line_tax: {
        Args: { amount_cents: number; category: string; dine_in: boolean }
        Returns: number
      }
      mms_line_transition: {
        Args: { p_line: string; p_to: string }
        Returns: number
      }
      mms_merge_table_orders: {
        Args: { p_source_cart: string; p_target_cart: string }
        Returns: number
      }
      mms_now: { Args: never; Returns: string }
      mms_open_tab: { Args: { p_cart: string }; Returns: string }
      mms_pickup_slots: {
        Args: { p_exclude_cart?: string }
        Returns: {
          remaining: number
          slot_time: string
        }[]
      }
      mms_promo_attempt: {
        Args: {
          p_max?: number
          p_session_id: string
          p_window_seconds?: number
        }
        Returns: boolean
      }
      mms_promo_check: {
        Args: { p_cart_id: string; p_code: string }
        Returns: {
          discount_cents: number
          kind: string
          reason: string
          valid: boolean
          value: number
        }[]
      }
      mms_promo_consume: {
        Args: { p_code: string; p_order_id: string; p_session_id: string }
        Returns: undefined
      }
      mms_promo_discount: { Args: { p_cart_id: string }; Returns: number }
      mms_rate_limit: {
        Args: {
          p_bucket: string
          p_key: string
          p_max: number
          p_window_seconds: number
        }
        Returns: boolean
      }
      mms_request_approval: {
        Args: {
          p_action: string
          p_initiator: string
          p_line: string
          p_reason: string
        }
        Returns: string
      }
      mms_resolve_approval: {
        Args: { p_approver: string; p_decision: string; p_id: string }
        Returns: string
      }
      mms_set_pickup_slot: {
        Args: { p_cart_id: string; p_slot: string }
        Returns: {
          ok: boolean
          reason: string
        }[]
      }
      mms_staff_clear_pin: { Args: { p_staff_id: string }; Returns: undefined }
      mms_staff_set_pin: {
        Args: { p_pin: string; p_staff_id: string }
        Returns: undefined
      }
      mms_staff_verify_pin: {
        Args: { p_pin: string; p_staff_id: string }
        Returns: {
          attempts_remaining: number
          locked_until: string
          status: string
        }[]
      }
      mms_sweep_expired_sessions: { Args: never; Returns: number }
      mms_tax_rate: { Args: never; Returns: number }
      mms_taxable: {
        Args: { category: string; dine_in: boolean }
        Returns: boolean
      }
      mms_undo_fire: { Args: { p_cart_id: string }; Returns: number }
      mms_void_line: {
        Args: {
          p_action: string
          p_approver?: string
          p_initiator: string
          p_line: string
          p_reason: string
        }
        Returns: string
      }
      staff_session_email_match: { Args: { p_email: string }; Returns: boolean }
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

