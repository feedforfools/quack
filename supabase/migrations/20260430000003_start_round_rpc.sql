-- E3-T4: start_round RPC.
--
-- Atomically starts a new round for a room:
--   1. Validates host identity + secret.
--   2. Validates room is in 'lobby' state (not mid-round).
--   3. Validates intended_index matches the expected next round index
--      (provides idempotency: re-sending the same index while already active
--      is a no-op rather than an error).
--   4. Freezes the current room config into rounds.config_snapshot.
--   5. Randomly assigns imposters server-side using Postgres random().
--   6. Inserts one role_assignments row per current player.
--   7. Transitions room state → 'round_active'.
--   8. Resets all players' is_ready to false (clean slate for next round).
--
-- The civilian word is chosen client-side by the host from the static word-pool
-- JSON files (src/lib/words) and passed in as p_word.  The server never fetches
-- external resources; imposter assignment happens here so no client can learn
-- who the imposters are before the reveal.
--
-- Error codes follow the established convention:
--   42501  — caller is not the host, or host secret mismatch
--   P0002  — room not found
--   P0001  — business-rule violation (wrong state, bad index, not enough players)

CREATE OR REPLACE FUNCTION public.start_round(
  p_room_id          uuid,
  p_host_secret_hash text,    -- SHA-256 hex of host's raw secret (never logged)
  p_intended_index   integer, -- expected next round index (1-based, for idempotency)
  p_word             text     -- civilian word chosen by host from curated word pool
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_host_id        uuid;
  v_stored_hash    text;
  v_state          public.room_state;
  v_config         jsonb;
  v_imposter_count integer;
  v_next_index     integer;
  v_round_id       uuid;
  v_player_count   bigint;
  v_imposter_ids   uuid[];
BEGIN
  -- Lock the rooms row for the duration of this transaction to serialise
  -- concurrent start attempts from multiple host-browser tabs.
  SELECT host_player_id, host_secret_hash, state, config
  INTO   v_host_id, v_stored_hash, v_state, v_config
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

  -- Compute the next expected round index (1-based).
  SELECT COALESCE(MAX(index), 0) + 1
  INTO   v_next_index
  FROM   public.rounds
  WHERE  room_id = p_room_id;

  -- Idempotency: if a round with this exact index already exists and the room
  -- is already active, the host likely double-tapped — return silently.
  IF p_intended_index < v_next_index AND v_state = 'round_active' THEN
    RETURN;
  END IF;

  -- Reject if room is not in lobby state.
  IF v_state <> 'lobby' THEN
    RAISE EXCEPTION 'room is not in lobby state' USING ERRCODE = 'P0001';
  END IF;

  -- Reject if intended_index does not match the next expected index.
  IF p_intended_index <> v_next_index THEN
    RAISE EXCEPTION 'intended_index % does not match expected %',
      p_intended_index, v_next_index
      USING ERRCODE = 'P0001';
  END IF;

  -- Read imposter_count from config with a default of 1.
  v_imposter_count := COALESCE(
    (v_config ->> 'imposter_count')::integer,
    1
  );

  -- Count current players.
  SELECT COUNT(*)
  INTO   v_player_count
  FROM   public.players
  WHERE  room_id = p_room_id;

  -- Need at least imposter_count + 2 players (at least 2 civilians).
  IF v_player_count < v_imposter_count + 2 THEN
    RAISE EXCEPTION 'not enough players: need %, have %',
      v_imposter_count + 2, v_player_count
      USING ERRCODE = 'P0001';
  END IF;

  -- Sanity: imposter_count must be strictly less than player count.
  IF v_imposter_count >= v_player_count THEN
    RAISE EXCEPTION 'imposter_count must be less than total player count'
      USING ERRCODE = 'P0001';
  END IF;

  -- Create the round row, freezing current config as config_snapshot.
  INSERT INTO public.rounds (room_id, index, config_snapshot)
  VALUES (p_room_id, p_intended_index, v_config)
  RETURNING id INTO v_round_id;

  -- Randomly select imposters server-side so no client learns the assignment
  -- before their individual reveal.  ORDER BY random() gives a uniform shuffle;
  -- LIMIT restricts to the required count.
  SELECT ARRAY_AGG(id)
  INTO   v_imposter_ids
  FROM (
    SELECT id
    FROM   public.players
    WHERE  room_id = p_room_id
    ORDER  BY random()
    LIMIT  v_imposter_count
  ) shuffled;

  -- Insert one role_assignments row per player.
  -- Civilians receive the word; imposters receive NULL (word is hidden from them).
  INSERT INTO public.role_assignments (round_id, player_id, role, word)
  SELECT
    v_round_id,
    p.id,
    CASE
      WHEN p.id = ANY(v_imposter_ids) THEN 'imposter'::public.player_role
      ELSE                                 'civilian'::public.player_role
    END,
    CASE
      WHEN p.id = ANY(v_imposter_ids) THEN NULL
      ELSE                                 p_word
    END
  FROM public.players p
  WHERE p.room_id = p_room_id;

  -- Transition room to round_active.
  UPDATE public.rooms
  SET    state            = 'round_active',
         last_activity_at = now()
  WHERE  id = p_room_id;

  -- Reset all players' ready state so the lobby is clean for the next round.
  UPDATE public.players
  SET    is_ready = false
  WHERE  room_id = p_room_id;
END;
$$;

-- Allow the anon role to call this function; SECURITY DEFINER provides the
-- elevated privileges needed to write to rounds + role_assignments.
GRANT EXECUTE ON FUNCTION public.start_round(uuid, text, integer, text) TO anon;
