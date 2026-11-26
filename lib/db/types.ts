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
      ai_usage: {
        Row: {
          cost_cents: number
          created_at: string
          household_id: string
          id: string
          input_tokens: number
          kind: string
          model: string
          output_tokens: number
        }
        Insert: {
          cost_cents?: number
          created_at?: string
          household_id: string
          id?: string
          input_tokens?: number
          kind: string
          model: string
          output_tokens?: number
        }
        Update: {
          cost_cents?: number
          created_at?: string
          household_id?: string
          id?: string
          input_tokens?: number
          kind?: string
          model?: string
          output_tokens?: number
        }
        Relationships: [
          {
            foreignKeyName: "ai_usage_household_id_fkey"
            columns: ["household_id"]
            isOneToOne: false
            referencedRelation: "households"
            referencedColumns: ["id"]
          },
        ]
      }
      always_have: {
        Row: {
          canonical: string
          created_at: string
          household_id: string
          id: string
        }
        Insert: {
          canonical: string
          created_at?: string
          household_id: string
          id?: string
        }
        Update: {
          canonical?: string
          created_at?: string
          household_id?: string
          id?: string
        }
        Relationships: [
          {
            foreignKeyName: "always_have_household_id_fkey"
            columns: ["household_id"]
            isOneToOne: false
            referencedRelation: "households"
            referencedColumns: ["id"]
          },
        ]
      }
      households: {
        Row: {
          ai_cap_cents: number
          budget_cents: number
          category_store: Json
          created_at: string
          cushion_cents: number
          id: string
          kroger_location_id: string | null
          kroger_location_name: string | null
          name: string
          recipe_source: string
          slots: string[]
          time_zone: string
          week_start: string
        }
        Insert: {
          ai_cap_cents?: number
          budget_cents?: number
          category_store?: Json
          created_at?: string
          cushion_cents?: number
          id?: string
          kroger_location_id?: string | null
          kroger_location_name?: string | null
          name: string
          recipe_source?: string
          slots?: string[]
          time_zone?: string
          week_start?: string
        }
        Update: {
          ai_cap_cents?: number
          budget_cents?: number
          category_store?: Json
          created_at?: string
          cushion_cents?: number
          id?: string
          kroger_location_id?: string | null
          kroger_location_name?: string | null
          name?: string
          recipe_source?: string
          slots?: string[]
          time_zone?: string
          week_start?: string
        }
        Relationships: []
      }
      invites: {
        Row: {
          created_at: string
          created_by: string
          expires_at: string
          household_id: string
          id: string
          token: string
          used_by: string | null
        }
        Insert: {
          created_at?: string
          created_by: string
          expires_at: string
          household_id: string
          id?: string
          token: string
          used_by?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string
          expires_at?: string
          household_id?: string
          id?: string
          token?: string
          used_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "invites_household_id_fkey"
            columns: ["household_id"]
            isOneToOne: false
            referencedRelation: "households"
            referencedColumns: ["id"]
          },
        ]
      }
      item_store: {
        Row: {
          canonical: string
          created_at: string
          household_id: string
          id: string
          store: string
        }
        Insert: {
          canonical: string
          created_at?: string
          household_id: string
          id?: string
          store: string
        }
        Update: {
          canonical?: string
          created_at?: string
          household_id?: string
          id?: string
          store?: string
        }
        Relationships: [
          {
            foreignKeyName: "item_store_household_id_fkey"
            columns: ["household_id"]
            isOneToOne: false
            referencedRelation: "households"
            referencedColumns: ["id"]
          },
        ]
      }
      meals: {
        Row: {
          base_servings: number
          created_at: string
          everyone_vegetarian: boolean
          household_id: string
          id: string
          ingredients: Json
          is_favorite: boolean
          name: string
          photo_credit: string | null
          photo_credit_url: string | null
          photo_path: string | null
          photo_url: string | null
          source_url: string | null
          times_planned: number
          veg_swap: Json | null
        }
        Insert: {
          base_servings?: number
          created_at?: string
          everyone_vegetarian?: boolean
          household_id: string
          id?: string
          ingredients?: Json
          is_favorite?: boolean
          name: string
          photo_credit?: string | null
          photo_credit_url?: string | null
          photo_path?: string | null
          photo_url?: string | null
          source_url?: string | null
          times_planned?: number
          veg_swap?: Json | null
        }
        Update: {
          base_servings?: number
          created_at?: string
          everyone_vegetarian?: boolean
          household_id?: string
          id?: string
          ingredients?: Json
          is_favorite?: boolean
          name?: string
          photo_credit?: string | null
          photo_credit_url?: string | null
          photo_path?: string | null
          photo_url?: string | null
          source_url?: string | null
          times_planned?: number
          veg_swap?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "meals_household_id_fkey"
            columns: ["household_id"]
            isOneToOne: false
            referencedRelation: "households"
            referencedColumns: ["id"]
          },
        ]
      }
      members: {
        Row: {
          created_at: string
          household_id: string
          id: string
          role: string
          user_id: string
        }
        Insert: {
          created_at?: string
          household_id: string
          id?: string
          role: string
          user_id: string
        }
        Update: {
          created_at?: string
          household_id?: string
          id?: string
          role?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "members_household_id_fkey"
            columns: ["household_id"]
            isOneToOne: false
            referencedRelation: "households"
            referencedColumns: ["id"]
          },
        ]
      }
      people: {
        Row: {
          age: number | null
          appetite: number
          created_at: string
          diet: string
          dislikes: string[]
          household_id: string
          id: string
          name: string
          sort: number
        }
        Insert: {
          age?: number | null
          appetite?: number
          created_at?: string
          diet?: string
          dislikes?: string[]
          household_id: string
          id?: string
          name: string
          sort?: number
        }
        Update: {
          age?: number | null
          appetite?: number
          created_at?: string
          diet?: string
          dislikes?: string[]
          household_id?: string
          id?: string
          name?: string
          sort?: number
        }
        Relationships: [
          {
            foreignKeyName: "people_household_id_fkey"
            columns: ["household_id"]
            isOneToOne: false
            referencedRelation: "households"
            referencedColumns: ["id"]
          },
        ]
      }
      price_estimates: {
        Row: {
          canonical: string
          cents_per_base: number
          created_at: string
          household_id: string
          id: string
          kind: string
          on_sale: boolean
          product_image_url: string | null
          product_name: string | null
          source: string
          store: string
          updated_at: string
        }
        Insert: {
          canonical: string
          cents_per_base: number
          created_at?: string
          household_id: string
          id?: string
          kind: string
          on_sale?: boolean
          product_image_url?: string | null
          product_name?: string | null
          source?: string
          store: string
          updated_at?: string
        }
        Update: {
          canonical?: string
          cents_per_base?: number
          created_at?: string
          household_id?: string
          id?: string
          kind?: string
          on_sale?: boolean
          product_image_url?: string | null
          product_name?: string | null
          source?: string
          store?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "price_estimates_household_id_fkey"
            columns: ["household_id"]
            isOneToOne: false
            referencedRelation: "households"
            referencedColumns: ["id"]
          },
        ]
      }
      staples: {
        Row: {
          active: boolean
          amount: number
          canonical: string
          created_at: string
          household_id: string
          id: string
          role: string
          unit: string
        }
        Insert: {
          active?: boolean
          amount: number
          canonical: string
          created_at?: string
          household_id: string
          id?: string
          role: string
          unit: string
        }
        Update: {
          active?: boolean
          amount?: number
          canonical?: string
          created_at?: string
          household_id?: string
          id?: string
          role?: string
          unit?: string
        }
        Relationships: [
          {
            foreignKeyName: "staples_household_id_fkey"
            columns: ["household_id"]
            isOneToOne: false
            referencedRelation: "households"
            referencedColumns: ["id"]
          },
        ]
      }
      week_item_state: {
        Row: {
          checked: boolean
          created_at: string
          have_it: boolean
          household_id: string
          id: string
          item_key: string
          outside_budget: boolean
          updated_by: string | null
          week_id: string
        }
        Insert: {
          checked?: boolean
          created_at?: string
          have_it?: boolean
          household_id: string
          id?: string
          item_key: string
          outside_budget?: boolean
          updated_by?: string | null
          week_id: string
        }
        Update: {
          checked?: boolean
          created_at?: string
          have_it?: boolean
          household_id?: string
          id?: string
          item_key?: string
          outside_budget?: boolean
          updated_by?: string | null
          week_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "week_item_state_household_id_fkey"
            columns: ["household_id"]
            isOneToOne: false
            referencedRelation: "households"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "week_item_state_week_id_household_id_fkey"
            columns: ["week_id", "household_id"]
            isOneToOne: false
            referencedRelation: "weeks"
            referencedColumns: ["id", "household_id"]
          },
        ]
      }
      week_meals: {
        Row: {
          created_at: string
          day: string
          household_id: string
          id: string
          meal_id: string
          servings_override: number | null
          slot: string
          updated_by: string | null
          week_id: string
        }
        Insert: {
          created_at?: string
          day: string
          household_id: string
          id?: string
          meal_id: string
          servings_override?: number | null
          slot: string
          updated_by?: string | null
          week_id: string
        }
        Update: {
          created_at?: string
          day?: string
          household_id?: string
          id?: string
          meal_id?: string
          servings_override?: number | null
          slot?: string
          updated_by?: string | null
          week_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "week_meals_household_id_fkey"
            columns: ["household_id"]
            isOneToOne: false
            referencedRelation: "households"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "week_meals_meal_id_household_id_fkey"
            columns: ["meal_id", "household_id"]
            isOneToOne: false
            referencedRelation: "meals"
            referencedColumns: ["id", "household_id"]
          },
          {
            foreignKeyName: "week_meals_week_id_household_id_fkey"
            columns: ["week_id", "household_id"]
            isOneToOne: false
            referencedRelation: "weeks"
            referencedColumns: ["id", "household_id"]
          },
        ]
      }
      weeks: {
        Row: {
          created_at: string
          household_id: string
          id: string
          week_start: string
        }
        Insert: {
          created_at?: string
          household_id: string
          id?: string
          week_start: string
        }
        Update: {
          created_at?: string
          household_id?: string
          id?: string
          week_start?: string
        }
        Relationships: [
          {
            foreignKeyName: "weeks_household_id_fkey"
            columns: ["household_id"]
            isOneToOne: false
            referencedRelation: "households"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      accept_invite: { Args: { p_token: string }; Returns: string }
      ai_spend_since: { Args: { h: string; since: string }; Returns: number }
      create_household: { Args: { p_name: string }; Returns: string }
      create_invite: { Args: never; Returns: string }
      is_member: { Args: { h: string }; Returns: boolean }
      is_member_of_photo_folder: {
        Args: { object_name: string }
        Returns: boolean
      }
      is_owner: { Args: { h: string }; Returns: boolean }
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
    Enums: {},
  },
} as const
