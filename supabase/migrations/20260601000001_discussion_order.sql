-- E5.5-T10: Per-game discussion order — starter player + rotation direction.
--
-- Adds two columns to games, randomised once per game at start_game time so
-- every device agrees on who speaks first and which way the turn order flows:
--   * starter_player_id    — a random non-spectator participant.
--   * discussion_direction — 'clockwise' | 'counterclockwise'.
--
-- These are read by useRoleAssignment (alongside ends_at) and surfaced as a
-- card on the Discussion screen, mirroring the lobby's "next game" card.

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Columns
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE public.games
  ADD COLUMN IF NOT EXISTS starter_player_id    uuid,
  ADD COLUMN IF NOT EXISTS discussion_direction text;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Replace start_game so it stamps the discussion order at game creation.
--    (Signature unchanged from 20260502000002 — CREATE OR REPLACE is safe.)
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.start_game(
  p_room_id          uuid,
  p_host_secret_hash text,
  p_intended_index   integer,
  p_word             text,
  p_hints            text[] DEFAULT '{}'
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
  v_hint_count     integer;
  v_next_index     integer;
  v_game_id        uuid;
  v_player_count   bigint;
  v_imposter_ids   uuid[];
  i                integer;
  v_start          integer;
  v_end            integer;
  v_hints_slice    jsonb;
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

  v_imposter_count := COALESCE((v_config ->> 'imposter_count')::integer, 1);
  v_hint_count     := COALESCE((v_config ->> 'imposter_hint_count')::integer, 0);

  SELECT COUNT(*)
  INTO   v_player_count
  FROM   public.players
  WHERE  room_id = p_room_id;

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

  -- Randomly assign imposters (deterministic order within the array for
  -- hint distribution — imposter_ids[1] gets hints[1..hint_count], etc.)
  SELECT ARRAY_AGG(id ORDER BY random())
  INTO   v_imposter_ids
  FROM   (
    SELECT id
    FROM   public.players
    WHERE  room_id = p_room_id
    ORDER BY random()
    LIMIT  v_imposter_count
  ) sub;

  -- Insert all civilian rows (payload stays default '{}').
  INSERT INTO public.role_assignments (game_id, player_id, role, word, payload)
  SELECT
    v_game_id,
    p.id,
    CASE WHEN p.id = ANY(v_imposter_ids) THEN 'imposter'::public.player_role
         ELSE 'civilian'::public.player_role END,
    CASE WHEN p.id = ANY(v_imposter_ids) THEN NULL
         ELSE p_word END,
    '{}'::jsonb
  FROM public.players p
  WHERE p.room_id = p_room_id;

  -- Distribute hints to each imposter when hints were provided.
  IF v_hint_count > 0 AND cardinality(p_hints) > 0 THEN
    FOR i IN 1..array_length(v_imposter_ids, 1) LOOP
      -- 1-based slice: hints for imposter i occupy positions
      --   (i-1)*hint_count+1 .. i*hint_count  (clamped to array bounds).
      v_start := (i - 1) * v_hint_count + 1;
      v_end   := LEAST(i * v_hint_count, cardinality(p_hints));

      IF v_start <= cardinality(p_hints) THEN
        SELECT jsonb_agg(p_hints[j])
        INTO   v_hints_slice
        FROM   generate_series(v_start, v_end) j;

        UPDATE public.role_assignments
        SET    payload = jsonb_build_object('hints', v_hints_slice)
        WHERE  game_id   = v_game_id
          AND  player_id = v_imposter_ids[i];
      END IF;
    END LOOP;
  END IF;

  -- Stamp the discussion order: a random non-spectator speaks first, and a
  -- random rotation direction is chosen. All clients read this so the
  -- "who starts" card is identical on every device (E5.5-T10).
  UPDATE public.games
  SET    starter_player_id = (
           SELECT p.id
           FROM   public.players p
           WHERE  p.room_id = p_room_id
             AND  p.is_spectator = false
           ORDER BY random()
           LIMIT 1
         ),
         discussion_direction =
           (ARRAY['clockwise', 'counterclockwise'])[1 + floor(random() * 2)::int]
  WHERE  id = v_game_id;

  UPDATE public.rooms
  SET    state            = 'round_active',
         last_activity_at = now()
  WHERE  id = p_room_id;

  UPDATE public.players
  SET    is_ready = false
  WHERE  room_id = p_room_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.start_game(uuid, text, integer, text, text[]) TO anon;
