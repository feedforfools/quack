-- E3-T12: Rename rounds → games across the schema.
--
-- This is a pure structural rename; no behavioural change.
-- Steps:
--   1. Rename table  public.rounds → public.games
--   2. Rename FK column role_assignments.round_id → game_id
--   3. Drop old indexes / constraints, create new ones under new names
--   4. Recreate the RLS policies under new names
--   5. Drop old RPCs (start_round, end_round, start_round_timer,
--      mark_role_seen, all_players_seen) and recreate under new names
--      (start_game, end_game, start_game_timer, mark_game_seen,
--       all_players_seen kept as-is but param renamed to p_game_id)
--
-- The room_state enum still contains 'round_active' — that is renamed
-- separately only when the enum label itself needs changing.  For now we
-- keep it as-is; only the table name changes.

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Rename table
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE public.rounds RENAME TO games;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Rename FK column in role_assignments
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE public.role_assignments RENAME COLUMN round_id TO game_id;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. Rename indexes and constraints
-- ─────────────────────────────────────────────────────────────────────────────

-- Rename PK constraint on games (was rounds_pkey)
ALTER TABLE public.games RENAME CONSTRAINT rounds_pkey TO games_pkey;

-- Rename unique constraint
ALTER TABLE public.games RENAME CONSTRAINT rounds_room_index_unique TO games_room_index_unique;

-- Rename FK constraint on role_assignments
ALTER TABLE public.role_assignments RENAME CONSTRAINT role_assignments_round_id_fkey TO role_assignments_game_id_fkey;

-- Drop old index and recreate under new name
DROP INDEX IF EXISTS public.rounds_room_id_idx;
CREATE INDEX games_room_id_idx ON public.games (room_id);

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. Recreate RLS policies (policies are dropped with the old table name)
-- ─────────────────────────────────────────────────────────────────────────────

-- The RLS policy on games was named "rounds_select_member" — rename it.
ALTER POLICY "rounds_select_member" ON public.games RENAME TO "games_select_member";

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. Drop old RPCs and recreate under new names
-- ─────────────────────────────────────────────────────────────────────────────

-- ── start_game (was start_round) ─────────────────────────────────────────────

DROP FUNCTION IF EXISTS public.start_round(uuid, text, integer, text);

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

  SELECT ARRAY_AGG(id ORDER BY random())
  INTO   v_imposter_ids
  FROM   (
    SELECT id
    FROM   public.players
    WHERE  room_id = p_room_id
    ORDER BY random()
    LIMIT  v_imposter_count
  ) sub;

  INSERT INTO public.role_assignments (game_id, player_id, role, word)
  SELECT
    v_game_id,
    p.id,
    CASE WHEN p.id = ANY(v_imposter_ids) THEN 'imposter'::public.player_role
         ELSE 'civilian'::public.player_role END,
    CASE WHEN p.id = ANY(v_imposter_ids) THEN NULL
         ELSE p_word END
  FROM public.players p
  WHERE p.room_id = p_room_id;

  UPDATE public.rooms
  SET    state            = 'round_active',
         last_activity_at = now()
  WHERE  id = p_room_id;

  UPDATE public.players
  SET    is_ready = false
  WHERE  room_id = p_room_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.start_game(uuid, text, integer, text) TO anon;

-- ── end_game (was end_round) ──────────────────────────────────────────────────

DROP FUNCTION IF EXISTS public.end_round(uuid, text);

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
END;
$$;

GRANT EXECUTE ON FUNCTION public.end_game(uuid, text) TO anon;

-- ── mark_game_seen (was mark_role_seen) ──────────────────────────────────────

DROP FUNCTION IF EXISTS public.mark_role_seen(uuid);

CREATE OR REPLACE FUNCTION public.mark_game_seen(
  p_game_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_player_id uuid;
BEGIN
  v_player_id := public.requesting_player_id();

  IF v_player_id IS NULL THEN
    RAISE EXCEPTION 'unauthenticated' USING ERRCODE = '42501';
  END IF;

  UPDATE public.role_assignments
  SET    seen_at = now()
  WHERE  game_id   = p_game_id
    AND  player_id = v_player_id
    AND  seen_at   IS NULL;

  IF NOT FOUND THEN
    IF NOT EXISTS (
      SELECT 1
      FROM   public.role_assignments
      WHERE  game_id   = p_game_id
        AND  player_id = v_player_id
    ) THEN
      RAISE EXCEPTION 'assignment not found' USING ERRCODE = 'P0002';
    END IF;
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.mark_game_seen(uuid) TO anon;

-- ── all_players_seen (arg renamed p_round_id → p_game_id) ────────────────────

DROP FUNCTION IF EXISTS public.all_players_seen(uuid);

CREATE OR REPLACE FUNCTION public.all_players_seen(
  p_game_id uuid
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_total   int;
  v_seen    int;
BEGIN
  SELECT
    COUNT(*)                                    FILTER (WHERE true),
    COUNT(*) FILTER (WHERE seen_at IS NOT NULL)
  INTO v_total, v_seen
  FROM public.role_assignments
  WHERE game_id = p_game_id;

  IF v_total = 0 THEN
    RETURN false;
  END IF;

  RETURN v_seen = v_total;
END;
$$;

GRANT EXECUTE ON FUNCTION public.all_players_seen(uuid) TO anon;

-- ── start_game_timer (was start_round_timer) ─────────────────────────────────

DROP FUNCTION IF EXISTS public.start_round_timer(uuid, text);

CREATE OR REPLACE FUNCTION public.start_game_timer(
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
  v_game_id       uuid;
  v_config        jsonb;
  v_existing_ends timestamptz;
  v_timer_secs    integer;
  v_ends_at       timestamptz;
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

  SELECT id, config_snapshot, ends_at
  INTO   v_game_id, v_config, v_existing_ends
  FROM   public.games
  WHERE  room_id   = p_room_id
    AND  ended_at  IS NULL
  ORDER BY index DESC
  LIMIT 1;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'no active game found' USING ERRCODE = 'P0002';
  END IF;

  IF v_existing_ends IS NOT NULL THEN
    v_timer_secs := EXTRACT(EPOCH FROM (v_existing_ends - now()))::integer;
    RETURN jsonb_build_object(
      'ends_at',       v_existing_ends,
      'timer_seconds', GREATEST(v_timer_secs, 0)
    );
  END IF;

  IF NOT public.all_players_seen(v_game_id) THEN
    RAISE EXCEPTION 'not all players have seen their role' USING ERRCODE = 'P0001';
  END IF;

  v_timer_secs := NULLIF(
    COALESCE((v_config ->> 'timer_seconds')::integer, 0),
    0
  );
  v_timer_secs := COALESCE(v_timer_secs, 120);

  v_ends_at := now() + (v_timer_secs || ' seconds')::interval;

  UPDATE public.games
  SET    ends_at = v_ends_at
  WHERE  id = v_game_id;

  RETURN jsonb_build_object(
    'ends_at',       v_ends_at,
    'timer_seconds', v_timer_secs
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.start_game_timer(uuid, text) TO anon;

-- ── host_leave RPCs — drop and recreate referencing games ─────────────────────
-- (The host_leave RPCs query rounds to determine round_index; they need no
--  changes since they access rooms.round_index directly, not the rounds table.
--  Verify this is the case by checking — no DROP/RECREATE needed here.)
