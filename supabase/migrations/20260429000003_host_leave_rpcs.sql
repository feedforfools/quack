-- E2.5-T2: RPCs for host-initiated room leave (hand-off and end-room).
--
-- transfer_host: host picks a successor. Atomically updates host_player_id +
-- host_secret_hash in the rooms row, then deletes the leaving host's own
-- players row. The caller must supply the SHA-256 hex hash of their current
-- host secret so the RPC can validate authority without needing pgcrypto.
-- (Client computes SHA-256 via Web Crypto; same pattern used by start_round
-- in E3-T4.)
--
-- end_room_as_host: host leaves when alone (or chooses to end the room
-- entirely). Deletes the rooms row; ON DELETE CASCADE removes all players
-- rows, including the host's.
--
-- Both functions are SECURITY DEFINER (execute as postgres) so they can
-- bypass the anon-role RLS policies that restrict rooms UPDATE/DELETE.
-- The x-device-id request header is still honoured via requesting_player_id()
-- because GUC settings (set by PostgREST via set_config) persist for the
-- duration of the request transaction regardless of execution role.

-- ─── transfer_host ────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.transfer_host(
  p_room_id          uuid,
  p_host_secret_hash text,   -- SHA-256 hex of the leaving host's raw secret
  p_successor_id     uuid,
  p_new_secret_hash  text    -- SHA-256 hex of a fresh secret for the successor
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_host_id     uuid;
  v_stored_hash text;
BEGIN
  -- Lock the row for the duration of this transaction to prevent races.
  SELECT host_player_id, host_secret_hash
  INTO   v_host_id, v_stored_hash
  FROM   public.rooms
  WHERE  id = p_room_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'room not found' USING ERRCODE = 'P0002';
  END IF;

  IF v_host_id IS DISTINCT FROM public.requesting_player_id() THEN
    RAISE EXCEPTION 'caller is not the host' USING ERRCODE = '42501';
  END IF;

  IF v_stored_hash IS DISTINCT FROM p_host_secret_hash THEN
    RAISE EXCEPTION 'invalid host secret' USING ERRCODE = '42501';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.players
    WHERE  id      = p_successor_id
      AND  room_id = p_room_id
  ) THEN
    RAISE EXCEPTION 'successor is not a member of this room' USING ERRCODE = 'P0002';
  END IF;

  UPDATE public.rooms
  SET    host_player_id   = p_successor_id,
         host_secret_hash = p_new_secret_hash
  WHERE  id = p_room_id;

  DELETE FROM public.players
  WHERE  id      = public.requesting_player_id()
    AND  room_id = p_room_id;
END;
$$;

-- ─── end_room_as_host ─────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.end_room_as_host(
  p_room_id          uuid,
  p_host_secret_hash text    -- SHA-256 hex of the host's raw secret
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_host_id     uuid;
  v_stored_hash text;
BEGIN
  SELECT host_player_id, host_secret_hash
  INTO   v_host_id, v_stored_hash
  FROM   public.rooms
  WHERE  id = p_room_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'room not found' USING ERRCODE = 'P0002';
  END IF;

  IF v_host_id IS DISTINCT FROM public.requesting_player_id() THEN
    RAISE EXCEPTION 'caller is not the host' USING ERRCODE = '42501';
  END IF;

  IF v_stored_hash IS DISTINCT FROM p_host_secret_hash THEN
    RAISE EXCEPTION 'invalid host secret' USING ERRCODE = '42501';
  END IF;

  -- Delete the room; ON DELETE CASCADE removes all players rows automatically.
  DELETE FROM public.rooms WHERE id = p_room_id;
END;
$$;

-- ─── Privilege grants ─────────────────────────────────────────────────────────

REVOKE EXECUTE ON FUNCTION public.transfer_host(uuid, text, uuid, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.end_room_as_host(uuid, text)          FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.transfer_host(uuid, text, uuid, text) TO anon;
GRANT EXECUTE ON FUNCTION public.end_room_as_host(uuid, text)          TO anon;
