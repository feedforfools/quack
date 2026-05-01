-- E3-T8: end_round RPC.
--
-- Host-initiated action to return the room from 'round_active' back to
-- 'lobby' state after the discussion is complete.  Preserves the player
-- roster so the same group can immediately start another round.
--
-- Actions (all in a single transaction):
--   1. Validates host identity + secret hash.
--   2. Validates the room is currently in 'round_active' state.
--   3. Sets ended_at on the current (latest) round.
--   4. Transitions room.state → 'lobby'.
--   5. Resets all players' is_ready = false (clean slate for next round).
--
-- Error codes follow the established convention:
--   42501  — caller is not the host, or host secret mismatch
--   P0002  — room not found
--   P0001  — business-rule violation (room not in round_active state)

CREATE OR REPLACE FUNCTION public.end_round(
  p_room_id          uuid,
  p_host_secret_hash text    -- SHA-256 hex of host's raw secret (never logged)
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_host_id     uuid;
  v_stored_hash text;
  v_state       public.room_state;
BEGIN
  -- Lock the rooms row to serialise concurrent end-round attempts.
  SELECT host_player_id, host_secret_hash, state
  INTO   v_host_id, v_stored_hash, v_state
  FROM   public.rooms
  WHERE  id = p_room_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'room not found' USING ERRCODE = 'P0002';
  END IF;

  -- Validate caller is the host.
  IF v_host_id IS DISTINCT FROM public.requesting_player_id() THEN
    RAISE EXCEPTION 'caller is not the host' USING ERRCODE = '42501';
  END IF;

  -- Validate host secret.
  IF v_stored_hash IS DISTINCT FROM p_host_secret_hash THEN
    RAISE EXCEPTION 'invalid host secret' USING ERRCODE = '42501';
  END IF;

  -- Must be in round_active state to end a round.
  IF v_state <> 'round_active' THEN
    RAISE EXCEPTION 'room is not in round_active state' USING ERRCODE = 'P0001';
  END IF;

  -- Mark the current (latest open) round as ended.
  UPDATE public.rounds
  SET    ended_at = now()
  WHERE  room_id = p_room_id
    AND  ended_at IS NULL
    AND  index = (
      SELECT MAX(index)
      FROM   public.rounds
      WHERE  room_id = p_room_id
    );

  -- Return room to lobby state.
  UPDATE public.rooms
  SET    state            = 'lobby',
         last_activity_at = now()
  WHERE  id = p_room_id;

  -- Reset all players' ready state so the lobby is clean for the next round.
  UPDATE public.players
  SET    is_ready = false
  WHERE  room_id = p_room_id;
END;
$$;

-- Allow the anon role to call this function; SECURITY DEFINER provides the
-- elevated privileges needed to update rooms + players.
GRANT EXECUTE ON FUNCTION public.end_round(uuid, text) TO anon;
