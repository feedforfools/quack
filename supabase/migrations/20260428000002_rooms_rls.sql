-- E2-T2: RLS policies for rooms and players tables.
--
-- All client requests arrive via the `anon` role. The device UUID is passed
-- in a custom `x-device-id` request header and extracted by the helper
-- functions below. Two SECURITY DEFINER functions are used to:
--   1. Parse the header safely (requesting_player_id).
--   2. Check membership without an RLS-recursive self-join (player_in_room).
-- Both functions return NULL / false on any parsing error, which causes
-- every access-check expression to evaluate to false — deny by default.

-- ─── Helper functions ─────────────────────────────────────────────────────────

-- Returns the device UUID from the x-device-id request header, or NULL if the
-- header is absent or the value is not a valid UUID.
-- SECURITY DEFINER + SET search_path = '' prevents search-path injection.
CREATE OR REPLACE FUNCTION public.requesting_player_id()
RETURNS uuid
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_device_id text;
BEGIN
  v_device_id :=
    (current_setting('request.headers', true)::jsonb) ->> 'x-device-id';
  RETURN v_device_id::uuid;
EXCEPTION WHEN OTHERS THEN
  RETURN NULL;
END;
$$;

-- Returns true if the requesting device has a row in public.players for the
-- given room. SECURITY DEFINER bypasses RLS on the inner players query,
-- breaking the circular dependency that would arise if the players SELECT
-- policy itself queried players to decide membership.
CREATE OR REPLACE FUNCTION public.player_in_room(p_room_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM   public.players
    WHERE  id      = public.requesting_player_id()
      AND  room_id = p_room_id
  )
$$;

-- ─── Privilege grants ─────────────────────────────────────────────────────────

-- Revoke PUBLIC default so only explicitly granted roles can call these
-- SECURITY DEFINER functions.
REVOKE EXECUTE ON FUNCTION public.requesting_player_id()   FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.player_in_room(uuid)     FROM PUBLIC;

-- anon is the PostgREST role for all unauthenticated client requests.
GRANT EXECUTE ON FUNCTION public.requesting_player_id()    TO anon;
GRANT EXECUTE ON FUNCTION public.player_in_room(uuid)      TO anon;

-- Table-level grants. DELETE is intentionally omitted — room purge is handled
-- by the scheduled TTL function (E4-T7) which runs as a privileged role.
GRANT SELECT, INSERT, UPDATE ON public.rooms   TO anon;
GRANT SELECT, INSERT, UPDATE ON public.players TO anon;

-- ─── RLS policies: rooms ──────────────────────────────────────────────────────

-- SELECT: a device can read a room only if it has a players row in that room.
CREATE POLICY "rooms_select_member"
  ON public.rooms
  FOR SELECT
  TO anon
  USING (public.player_in_room(id));

-- INSERT: a device may create a room only if it sets itself as host.
-- Prevents a client from forging another device's host_player_id.
CREATE POLICY "rooms_insert_as_host"
  ON public.rooms
  FOR INSERT
  TO anon
  WITH CHECK (host_player_id = public.requesting_player_id());

-- UPDATE: only the current host can modify room rows (config, state, etc.).
-- Host migration (E4-T2) is performed via a SECURITY DEFINER RPC that
-- validates the 30-second absence condition and bypasses this policy.
CREATE POLICY "rooms_update_as_host"
  ON public.rooms
  FOR UPDATE
  TO anon
  USING     (host_player_id = public.requesting_player_id())
  WITH CHECK (host_player_id = public.requesting_player_id());

-- ─── RLS policies: players ────────────────────────────────────────────────────

-- SELECT: a device sees player rows only for rooms it belongs to.
CREATE POLICY "players_select_same_room"
  ON public.players
  FOR SELECT
  TO anon
  USING (public.player_in_room(room_id));

-- INSERT: a device may only add itself to a room (id must match device UUID).
CREATE POLICY "players_insert_as_self"
  ON public.players
  FOR INSERT
  TO anon
  WITH CHECK (id = public.requesting_player_id());

-- UPDATE: a device may only update its own player row.
CREATE POLICY "players_update_own_row"
  ON public.players
  FOR UPDATE
  TO anon
  USING     (id = public.requesting_player_id())
  WITH CHECK (id = public.requesting_player_id());
