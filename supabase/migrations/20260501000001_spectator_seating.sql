-- E4-T3: Spectator seating for late joiners.
--
-- A player who joins a room that is already in `round_active` state is seated
-- as a spectator: they see a neutral "joining next game" screen for the
-- duration of the active game and are automatically included when the next
-- game starts.
--
-- Changes:
--   1. Add `is_spectator boolean NOT NULL DEFAULT false` to `players`.
--   2. Recreate `start_game` to:
--        - Count and validate only non-spectator players.
--        - Assign roles only to non-spectator players.
--        - Clear `is_spectator` for ALL players after the game starts (so
--          late joiners become full participants for the next game).
--   3. No changes to `end_game` — spectator flag is cleared in `start_game`
--      so clearing it in `end_game` is not needed (spectators are converted
--      to regular lobby players as soon as the next game starts).

-- ── Column ────────────────────────────────────────────────────────────────────

ALTER TABLE public.players
  ADD COLUMN is_spectator boolean NOT NULL DEFAULT false;

-- ── Recreate start_game ───────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.start_game(
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
  v_game_id        uuid;
  v_player_count   bigint;
  v_imposter_ids   uuid[];
BEGIN
  SELECT host_player_id, host_secret_hash, state, config
  INTO   v_host_id, v_stored_hash, v_state, v_config
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

  SELECT COALESCE(MAX(index), 0) + 1
  INTO   v_next_index
  FROM   public.games
  WHERE  room_id = p_room_id;

  -- Idempotency: same intended_index while already active → silent no-op.
  IF p_intended_index < v_next_index AND v_state = 'round_active' THEN
    RETURN;
  END IF;

  IF v_state <> 'lobby' THEN
    RAISE EXCEPTION 'room is not in lobby state' USING ERRCODE = 'P0001';
  END IF;

  IF p_intended_index <> v_next_index THEN
    RAISE EXCEPTION 'intended_index % does not match expected %',
      p_intended_index, v_next_index
      USING ERRCODE = 'P0001';
  END IF;

  v_imposter_count := COALESCE(
    (v_config ->> 'imposter_count')::integer,
    1
  );

  -- Only count non-spectator players for minimum player validation.
  -- Spectators are seated but not assigned a role; they participate next game.
  SELECT COUNT(*)
  INTO   v_player_count
  FROM   public.players
  WHERE  room_id      = p_room_id
    AND  is_spectator = false;

  IF v_player_count < v_imposter_count + 2 THEN
    RAISE EXCEPTION 'not enough players: need %, have %',
      v_imposter_count + 2, v_player_count
      USING ERRCODE = 'P0001';
  END IF;

  IF v_imposter_count >= v_player_count THEN
    RAISE EXCEPTION 'imposter_count must be less than total player count'
      USING ERRCODE = 'P0001';
  END IF;

  INSERT INTO public.games (room_id, index, config_snapshot)
  VALUES (p_room_id, p_intended_index, v_config)
  RETURNING id INTO v_game_id;

  -- Randomly select imposters from non-spectator players only.
  SELECT ARRAY_AGG(id ORDER BY random())
  INTO   v_imposter_ids
  FROM   (
    SELECT id
    FROM   public.players
    WHERE  room_id      = p_room_id
      AND  is_spectator = false
    ORDER BY random()
    LIMIT  v_imposter_count
  ) sub;

  -- Insert one role_assignments row per non-spectator player.
  -- Spectators deliberately receive no assignment row — they watch this game.
  INSERT INTO public.role_assignments (game_id, player_id, role, word)
  SELECT
    v_game_id,
    p.id,
    CASE WHEN p.id = ANY(v_imposter_ids) THEN 'imposter'::public.player_role
         ELSE 'civilian'::public.player_role END,
    CASE WHEN p.id = ANY(v_imposter_ids) THEN NULL
         ELSE p_word END
  FROM public.players p
  WHERE p.room_id      = p_room_id
    AND p.is_spectator = false;

  -- Convert all spectators to regular participants so they are included in
  -- the next game (clearing is_spectator here means end_game needs no change).
  UPDATE public.players
  SET    is_spectator = false
  WHERE  room_id = p_room_id
    AND  is_spectator = true;

  UPDATE public.rooms
  SET    state            = 'round_active',
         last_activity_at = now()
  WHERE  id = p_room_id;

  -- Reset all players' ready state so the lobby is clean for the next game.
  UPDATE public.players
  SET    is_ready = false
  WHERE  room_id = p_room_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.start_game(uuid, text, integer, text) TO anon;
