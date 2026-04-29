-- Defensive: harden requesting_player_id() against possible future PostgREST
-- changes to the request.headers format.
--
-- As of PostgREST 14 (Supabase CLI v2), request.headers is a JSON object:
--   {"x-device-id": "uuid", "authorization": "Bearer ...", ...}
-- The original implementation in 20260428000002_rooms_rls.sql uses
-- `->> 'x-device-id'` which works correctly on this format.
--
-- This migration replaces the function with a version that also tolerates the
-- alternative JSON-array-of-pairs format ([["name","value"],...]) that some
-- documentation describes for PostgREST v12+. Both formats now work.

CREATE OR REPLACE FUNCTION public.requesting_player_id()
RETURNS uuid
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_device_id text;
  v_headers   jsonb;
BEGIN
  v_headers := current_setting('request.headers', true)::jsonb;

  IF jsonb_typeof(v_headers) = 'array' THEN
    SELECT elem->>1 INTO v_device_id
    FROM   jsonb_array_elements(v_headers) AS elem
    WHERE  elem->>0 = 'x-device-id'
    LIMIT  1;
  ELSE
    v_device_id := v_headers ->> 'x-device-id';
  END IF;

  RETURN v_device_id::uuid;
EXCEPTION WHEN OTHERS THEN
  RETURN NULL;
END;
$$;
