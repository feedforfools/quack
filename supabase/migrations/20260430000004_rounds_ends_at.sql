-- E3-T7: Add ends_at to rounds; update start_round to compute it from config.
--
-- When a room's config contains timer_seconds (a positive integer), the RPC
-- now sets ends_at = now() + timer_seconds on the new round row.  All clients
-- read this timestamp from their own role_assignments fetch (via the rounds
-- join in useRoleAssignment) so every device has the same authoritative
-- end-time.  null means no timer was configured for this round.

ALTER TABLE public.rounds
  ADD COLUMN IF NOT EXISTS ends_at timestamptz;

-- Replace start_round with the same external signature (uuid, text, integer,
-- text) — no callers need to change.  The only change is the new v_ends_at
-- computation and the updated INSERT into rounds.
CREATE OR REPLACE FUNCTION public.start_round(
  p_room_id          uuid,
  p_host_secret_hash text,
  p_intended_index   integer,
  p_word             text
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
  v_timer_seconds  integer;
  v_ends_at        timestamptz;
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

  -- Compute ends_at from timer_seconds in config.
  -- NULLIF(..., 0) converts 0 to NULL so a zero/absent timer produces no
  -- ends_at, keeping the column NULL for untimed rounds.
  v_timer_seconds := NULLIF(COALESCE((v_config ->> 'timer_seconds')::integer, 0), 0);
  v_ends_at := CASE
    WHEN v_timer_seconds IS NOT NULL
    THEN now() + (v_timer_seconds || ' seconds')::interval
    ELSE NULL
  END;

  -- Create the round row, freezing current config as config_snapshot.
  INSERT INTO public.rounds (room_id, index, config_snapshot, ends_at)
  VALUES (p_room_id, p_intended_index, v_config, v_ends_at)
  RETURNING id INTO v_round_id;

  -- Randomly select imposters server-side so no client learns the assignment
  -- before their individual reveal.
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
  -- Civilians receive the word; imposters receive NULL.
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

-- Grant unchanged — same signature, same permissions.
GRANT EXECUTE ON FUNCTION public.start_round(uuid, text, integer, text) TO anon;
