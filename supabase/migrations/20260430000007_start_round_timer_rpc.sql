-- E3-T7: start_round_timer RPC.
--
-- Host-initiated action to start the discussion countdown after all players
-- have peeked at their role (seen_at IS NOT NULL for every assignment in the
-- round).  Separate from start_round (which starts the round itself) so the
-- timer has a human-initiated start, not an automatic one.
--
-- Actions (single transaction):
--   1. Validates host identity + secret.
--   2. Validates room is in round_active state.
--   3. Validates all players have seen their role (all_players_seen check).
--   4. Sets rounds.ends_at = now() + duration (idempotent: no-op if already set).
--   5. Returns ends_at and timer_seconds so the caller can update local state.
--
-- Timer duration priority:
--   config_snapshot->>'timer_seconds' if set and > 0, else 120 seconds default.
--
-- Error codes:
--   42501  — not the host, or host secret mismatch
--   P0002  — room not found
--   P0001  — wrong state, not all players seen, or timer already running

CREATE OR REPLACE FUNCTION public.start_round_timer(
  p_room_id          uuid,
  p_host_secret_hash text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_host_id       uuid;
  v_stored_hash   text;
  v_state         public.room_state;
  v_round_id      uuid;
  v_config        jsonb;
  v_existing_ends timestamptz;
  v_timer_secs    integer;
  v_ends_at       timestamptz;
BEGIN
  -- Lock the room row to serialise concurrent timer-start attempts.
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

  -- Must be in round_active state.
  IF v_state <> 'round_active' THEN
    RAISE EXCEPTION 'room is not in round_active state' USING ERRCODE = 'P0001';
  END IF;

  -- Find the current (latest open) round.
  SELECT id, config_snapshot, ends_at
  INTO   v_round_id, v_config, v_existing_ends
  FROM   public.rounds
  WHERE  room_id   = p_room_id
    AND  ended_at  IS NULL
  ORDER BY index DESC
  LIMIT 1;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'no active round found' USING ERRCODE = 'P0002';
  END IF;

  -- Idempotent: if ends_at is already set, return it unchanged.
  IF v_existing_ends IS NOT NULL THEN
    v_timer_secs := EXTRACT(EPOCH FROM (v_existing_ends - now()))::integer;
    RETURN jsonb_build_object(
      'ends_at',       v_existing_ends,
      'timer_seconds', GREATEST(v_timer_secs, 0)
    );
  END IF;

  -- Validate all players have seen their role.
  IF NOT public.all_players_seen(v_round_id) THEN
    RAISE EXCEPTION 'not all players have seen their role' USING ERRCODE = 'P0001';
  END IF;

  -- Determine timer duration.
  v_timer_secs := NULLIF(
    COALESCE((v_config ->> 'timer_seconds')::integer, 0),
    0
  );
  -- Default to 120 s when config does not specify (until E5-T1 settings land).
  v_timer_secs := COALESCE(v_timer_secs, 120);

  v_ends_at := now() + (v_timer_secs || ' seconds')::interval;

  UPDATE public.rounds
  SET    ends_at = v_ends_at
  WHERE  id = v_round_id;

  RETURN jsonb_build_object(
    'ends_at',       v_ends_at,
    'timer_seconds', v_timer_secs
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.start_round_timer(uuid, text) TO anon;
