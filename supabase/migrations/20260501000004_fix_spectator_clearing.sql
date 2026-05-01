-- E4-Bug3: Fix spectator-clearing order so late joiners participate in the
-- *next* game, not the game-after-next.
--
-- Bug:
--   When a player joined mid game-1 (is_spectator=true), the original
--   `start_game` recreated in 20260501000001_spectator_seating.sql cleared
--   `is_spectator` AFTER inserting role_assignments. Sequence on game-2
--   start was:
--     1. SELECT imposters from non-spectator players  → joiner excluded
--     2. INSERT role_assignments for non-spectator    → joiner has no row
--     3. UPDATE is_spectator = false                  → joiner becomes regular
--   So the joiner sat out game-2 too and only played starting game-3.
--
-- Fix:
--   1. `end_game` clears `is_spectator = false` for all players in the room.
--      Once the active game ends there is no longer an "active game" to be a
--      spectator of, so the lobby between games shows everyone as a regular
--      player and the next start_game assigns them a role.
--   2. `start_game` is recreated with the spectator-clear UPDATE moved BEFORE
--      imposter selection / role-assignment INSERT. This is a defensive
--      belt-and-braces measure: even if `end_game` is somehow bypassed, any
--      lingering spectators are converted to participants of the game being
--      started rather than the one after it.

-- ── Recreate end_game ─────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.end_game(
  p_room_id          uuid,
  p_host_secret_hash text
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
  SELECT host_player_id, host_secret_hash, state
  INTO   v_host_id, v_stored_hash, v_state
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

  IF v_state <> 'round_active' THEN
    RAISE EXCEPTION 'room is not in round_active state' USING ERRCODE = 'P0001';
  END IF;

  UPDATE public.games
  SET    ended_at = now()
  WHERE  room_id  = p_room_id
    AND  ended_at IS NULL;

  UPDATE public.rooms
  SET    state = 'lobby'
  WHERE  id = p_room_id;

  UPDATE public.players
  SET    is_ready = false
  WHERE  room_id  = p_room_id;

  -- Clear spectator status so late joiners participate in the next game.
  UPDATE public.players
  SET    is_spectator = false
  WHERE  room_id      = p_room_id
    AND  is_spectator = true;
END;
$$;

GRANT EXECUTE ON FUNCTION public.end_game(uuid, text) TO anon;

-- ── Recreate start_game with spectator clear moved before role assignment ─────

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

  -- Defensive: clear any lingering spectator flags BEFORE role assignment so
  -- that late joiners from a previous game are included in this game's roles
  -- (end_game already clears them; this is a belt-and-braces safety net).
  UPDATE public.players
  SET    is_spectator = false
  WHERE  room_id      = p_room_id
    AND  is_spectator = true;

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
