-- E5.5-T11: Host-controlled, synced timer pause / resume.
--
-- The discussion countdown is server-driven via games.ends_at (an absolute
-- timestamp). To pause it for everyone we cannot simply freeze a client:
--   * pause_game_timer  — captures the remaining whole seconds into
--       games.timer_paused_seconds and clears ends_at (countdown stops on
--       every device once they refetch).
--   * resume_game_timer — re-stamps ends_at = now() + paused_seconds and
--       clears timer_paused_seconds (countdown resumes everywhere).
--
-- Both are host-only (host secret required) and operate on the latest active
-- (un-ended) game of the room. Clients broadcast the existing `timer_started`
-- realtime event after each call so peers refetch their assignment.
--
-- Error codes (project convention):
--   42501  — not the host, or host secret mismatch
--   P0002  — room or active game not found
--   P0001  — room not in round_active state

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Column — frozen remaining seconds while the timer is paused.
--    NULL  → not paused (either never started, or currently running).
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE public.games
  ADD COLUMN IF NOT EXISTS timer_paused_seconds integer;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. pause_game_timer(p_room_id, p_host_secret_hash)
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.pause_game_timer(
  p_room_id          uuid,
  p_host_secret_hash text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_host_id     uuid;
  v_stored_hash text;
  v_state       public.room_state;
  v_game_id     uuid;
  v_ends_at     timestamptz;
  v_remaining   integer;
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

  SELECT id, ends_at
  INTO   v_game_id, v_ends_at
  FROM   public.games
  WHERE  room_id  = p_room_id
    AND  ended_at IS NULL
  ORDER BY index DESC
  LIMIT 1;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'no active game found' USING ERRCODE = 'P0002';
  END IF;

  -- Already paused or never started — return current paused value (no-op).
  IF v_ends_at IS NULL THEN
    SELECT timer_paused_seconds INTO v_remaining
    FROM   public.games WHERE id = v_game_id;
    RETURN jsonb_build_object('paused_seconds', v_remaining);
  END IF;

  v_remaining := GREATEST(
    CEIL(EXTRACT(EPOCH FROM (v_ends_at - now())))::integer,
    0
  );

  UPDATE public.games
  SET    ends_at              = NULL,
         timer_paused_seconds = v_remaining
  WHERE  id = v_game_id;

  RETURN jsonb_build_object('paused_seconds', v_remaining);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.pause_game_timer(uuid, text) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.pause_game_timer(uuid, text) TO anon;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. resume_game_timer(p_room_id, p_host_secret_hash)
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.resume_game_timer(
  p_room_id          uuid,
  p_host_secret_hash text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_host_id     uuid;
  v_stored_hash text;
  v_state       public.room_state;
  v_game_id     uuid;
  v_ends_at     timestamptz;
  v_paused      integer;
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

  SELECT id, ends_at, timer_paused_seconds
  INTO   v_game_id, v_ends_at, v_paused
  FROM   public.games
  WHERE  room_id  = p_room_id
    AND  ended_at IS NULL
  ORDER BY index DESC
  LIMIT 1;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'no active game found' USING ERRCODE = 'P0002';
  END IF;

  -- Already running, or nothing to resume — return current ends_at (no-op).
  IF v_ends_at IS NOT NULL OR v_paused IS NULL THEN
    RETURN jsonb_build_object('ends_at', v_ends_at);
  END IF;

  v_ends_at := now() + make_interval(secs => GREATEST(v_paused, 0));

  UPDATE public.games
  SET    ends_at              = v_ends_at,
         timer_paused_seconds = NULL
  WHERE  id = v_game_id;

  RETURN jsonb_build_object('ends_at', v_ends_at);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.resume_game_timer(uuid, text) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.resume_game_timer(uuid, text) TO anon;
