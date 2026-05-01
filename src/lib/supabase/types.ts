export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type Database = {
  graphql_public: {
    Tables: {
      [_ in never]: never;
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      graphql: {
        Args: {
          extensions?: Json;
          operationName?: string;
          query?: string;
          variables?: Json;
        };
        Returns: Json;
      };
    };
    Enums: {
      [_ in never]: never;
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
  public: {
    Tables: {
      players: {
        Row: {
          display_name: string;
          id: string;
          is_connected: boolean;
          is_ready: boolean;
          is_spectator: boolean;
          joined_at: string;
          last_seen_at: string;
          room_id: string;
        };
        Insert: {
          display_name: string;
          id: string;
          is_connected?: boolean;
          is_ready?: boolean;
          is_spectator?: boolean;
          joined_at?: string;
          last_seen_at?: string;
          room_id: string;
        };
        Update: {
          display_name?: string;
          id?: string;
          is_connected?: boolean;
          is_ready?: boolean;
          is_spectator?: boolean;
          joined_at?: string;
          last_seen_at?: string;
          room_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "players_room_id_fkey";
            columns: ["room_id"];
            isOneToOne: false;
            referencedRelation: "rooms";
            referencedColumns: ["id"];
          },
        ];
      };
      role_assignments: {
        Row: {
          game_id: string;
          player_id: string;
          revealed_at: string | null;
          role: Database["public"]["Enums"]["player_role"];
          seen_at: string | null;
          word: string | null;
        };
        Insert: {
          game_id: string;
          player_id: string;
          revealed_at?: string | null;
          role: Database["public"]["Enums"]["player_role"];
          seen_at?: string | null;
          word?: string | null;
        };
        Update: {
          game_id?: string;
          player_id?: string;
          revealed_at?: string | null;
          role?: Database["public"]["Enums"]["player_role"];
          seen_at?: string | null;
          word?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "role_assignments_game_id_fkey";
            columns: ["game_id"];
            isOneToOne: false;
            referencedRelation: "games";
            referencedColumns: ["id"];
          },
        ];
      };
      rooms: {
        Row: {
          code: string;
          config: Json;
          created_at: string;
          host_player_id: string;
          host_secret_hash: string;
          id: string;
          last_activity_at: string;
          locked_after_start: boolean;
          state: Database["public"]["Enums"]["room_state"];
        };
        Insert: {
          code: string;
          config?: Json;
          created_at?: string;
          host_player_id: string;
          host_secret_hash: string;
          id?: string;
          last_activity_at?: string;
          locked_after_start?: boolean;
          state?: Database["public"]["Enums"]["room_state"];
        };
        Update: {
          code?: string;
          config?: Json;
          created_at?: string;
          host_player_id?: string;
          host_secret_hash?: string;
          id?: string;
          last_activity_at?: string;
          locked_after_start?: boolean;
          state?: Database["public"]["Enums"]["room_state"];
        };
        Relationships: [];
      };
      games: {
        Row: {
          config_snapshot: Json;
          ended_at: string | null;
          ends_at: string | null;
          id: string;
          index: number;
          room_id: string;
          started_at: string;
        };
        Insert: {
          config_snapshot?: Json;
          ended_at?: string | null;
          ends_at?: string | null;
          id?: string;
          index: number;
          room_id: string;
          started_at?: string;
        };
        Update: {
          config_snapshot?: Json;
          ended_at?: string | null;
          ends_at?: string | null;
          id?: string;
          index?: number;
          room_id?: string;
          started_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "games_room_id_fkey";
            columns: ["room_id"];
            isOneToOne: false;
            referencedRelation: "rooms";
            referencedColumns: ["id"];
          },
        ];
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      end_room_as_host: {
        Args: { p_host_secret_hash: string; p_room_id: string };
        Returns: undefined;
      };
      kick_player: {
        Args: {
          p_host_secret_hash: string;
          p_player_id: string;
          p_room_id: string;
        };
        Returns: undefined;
      };
      mark_game_seen: { Args: { p_game_id: string }; Returns: undefined };
      all_players_seen: { Args: { p_game_id: string }; Returns: boolean };
      end_game: {
        Args: { p_host_secret_hash: string; p_room_id: string };
        Returns: undefined;
      };
      player_in_room: { Args: { p_room_id: string }; Returns: boolean };
      requesting_player_id: { Args: never; Returns: string };
      start_game_timer: {
        Args: { p_room_id: string; p_host_secret_hash: string };
        Returns: Json;
      };
      start_game: {
        Args: {
          p_host_secret_hash: string;
          p_intended_index: number;
          p_room_id: string;
          p_word: string;
        };
        Returns: undefined;
      };
      transfer_host: {
        Args: {
          p_host_secret_hash: string;
          p_new_secret_hash: string;
          p_room_id: string;
          p_successor_id: string;
        };
        Returns: undefined;
      };
    };
    Enums: {
      player_role: "civilian" | "imposter";
      room_state: "lobby" | "round_active" | "round_ended";
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">;

type DefaultSchema = DatabaseWithoutInternals[Extract<
  keyof Database,
  "public"
>];

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R;
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R;
      }
      ? R
      : never
    : never;

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I;
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I;
      }
      ? I
      : never
    : never;

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U;
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U;
      }
      ? U
      : never
    : never;

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never;

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never;

export const Constants = {
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {
      player_role: ["civilian", "imposter"],
      room_state: ["lobby", "round_active", "round_ended"],
    },
  },
} as const;
