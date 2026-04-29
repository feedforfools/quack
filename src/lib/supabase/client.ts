import { createClient } from "@supabase/supabase-js";
import type { Database } from "./types";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error(
    "Missing Supabase env vars: VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY are required.",
  );
}

/**
 * Singleton Supabase client.
 * The device UUID is injected per-request via the `x-device-id` header
 * so that RLS policies can identify the calling player without an auth session.
 */
export const supabase = createClient<Database>(supabaseUrl, supabaseAnonKey);

/**
 * Returns a Supabase client with the x-device-id header pre-set.
 * Use this for all data operations that require player identity.
 */
export function supabaseWithDevice(deviceId: string) {
  return createClient<Database>(supabaseUrl, supabaseAnonKey, {
    global: {
      headers: { "x-device-id": deviceId },
    },
  });
}
