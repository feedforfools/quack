-- E4-T5: kick_player RPC
-- Host can remove any non-host player from a room.
-- Validates the host secret before deleting the player row.
-- CASCADE on players.room_id ensures any role_assignments are also removed.

CREATE OR REPLACE FUNCTION public.kick_player(
  p_room_id          uuid,
  p_host_secret_hash text,
  p_player_id        uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_host_secret_hash text;
  v_host_player_id   uuid;
BEGIN
  SELECT host_secret_hash, host_player_id
    INTO v_host_secret_hash, v_host_player_id
    FROM public.rooms
   WHERE id = p_room_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'room_not_found';
  END IF;

  IF v_host_secret_hash IS DISTINCT FROM p_host_secret_hash THEN
    RAISE EXCEPTION 'not_host';
  END IF;

  IF v_host_player_id = p_player_id THEN
    RAISE EXCEPTION 'cannot_kick_host';
  END IF;

  DELETE FROM public.players WHERE room_id = p_room_id AND id = p_player_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.kick_player(uuid, text, uuid) TO anon, authenticated;
