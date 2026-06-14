-- E6-T3: Call-to-vote fixes + host-forced vote start.
--
-- Fixes three real-world problems with the call-to-vote flow:
--
--   1. Late taps errored. Once the threshold flipped the vote to 'active',
--      any player whose screen had not caught up yet received a hard P0001
--      ("voting is already active") from request_vote. Their intent — "let's
--      vote" — is already satisfied, so request_vote (and retract) now return
--      silently in that case; the client refetches and lands on the ballot.
--
--   2. Threshold is now a STRICT majority of alive players: floor(n/2) + 1
--      (4 players → 3, 3 players → 2). The configurable
--      vote_threshold_fraction is no longer consulted.
--
--   3. games.vote_request_count was a denormalised counter that could drift
--      from the vote_requests rows under races / no-op paths. Both RPCs now
--      derive the count from the rows (single source of truth) and write it
--      back as a mirror for the UI.
--
-- Adds start_vote(p_game_id, p_host_secret_hash): the host can open the
-- ballot directly. This is the only way to reach voting when call-to-vote is
-- disabled, and works in both single and multi round modes.

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. request_vote — tolerant, strict-majority, row-derived count
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.request_vote(p_game_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_caller_id      uuid;
  v_vote_state     public.vote_state;
  v_config         jsonb;
  v_alive_count    bigint;
  v_threshold      integer;
  v_duration_secs  integer;
  v_request_count  integer;
BEGIN
  v_caller_id := public.requesting_player_id();

  -- Verify caller is a still-alive participant in this game.
  IF NOT EXISTS (
    SELECT 1
    FROM   public.role_assignments
    WHERE  game_id   = p_game_id
      AND  player_id = v_caller_id
      AND  eliminated_in_round IS NULL
  ) THEN
    RAISE EXCEPTION 'caller is not an active participant in this game'
      USING ERRCODE = '42501';
  END IF;

  -- Lock the games row so concurrent requests serialise through here.
  SELECT vote_state, config_snapshot
  INTO   v_vote_state, v_config
  FROM   public.games
  WHERE  id = p_game_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'game not found' USING ERRCODE = 'P0002';
  END IF;

  -- Voting already open or finished — the caller's intent is satisfied.
  -- Return silently so a late tap never surfaces an error toast.
  IF v_vote_state NOT IN ('none'::public.vote_state, 'requested'::public.vote_state) THEN
    RETURN;
  END IF;

  -- Idempotency: record this player's request (no-op if already present).
  INSERT INTO public.vote_requests (game_id, player_id)
  VALUES (p_game_id, v_caller_id)
  ON CONFLICT (game_id, player_id) DO NOTHING;

  -- Derive the count from the rows — never trust the mirror column.
  SELECT COUNT(*)
  INTO   v_request_count
  FROM   public.vote_requests
  WHERE  game_id = p_game_id;

  -- Strict majority of alive players: floor(n/2) + 1.
  SELECT COUNT(*)
  INTO   v_alive_count
  FROM   public.role_assignments
  WHERE  game_id = p_game_id
    AND  eliminated_in_round IS NULL;

  v_threshold := (v_alive_count / 2)::integer + 1;

  v_duration_secs := COALESCE(
    (v_config ->> 'voting_duration_seconds')::integer,
    30
  );

  UPDATE public.games
  SET    vote_request_count = v_request_count,
         vote_state         = CASE
           WHEN v_request_count >= v_threshold
             THEN 'active'::public.vote_state
           ELSE 'requested'::public.vote_state
         END,
         vote_ends_at       = CASE
           WHEN v_request_count >= v_threshold
             THEN now() + make_interval(secs => v_duration_secs)
           ELSE vote_ends_at
         END
  WHERE  id = p_game_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.request_vote(uuid) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.request_vote(uuid) TO anon;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. retract_vote_request — row-derived count
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.retract_vote_request(p_game_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_caller_id     uuid;
  v_vote_state    public.vote_state;
  v_request_count integer;
BEGIN
  v_caller_id := public.requesting_player_id();

  IF NOT EXISTS (
    SELECT 1
    FROM   public.role_assignments
    WHERE  game_id   = p_game_id
      AND  player_id = v_caller_id
  ) THEN
    RAISE EXCEPTION 'caller is not a participant in this game'
      USING ERRCODE = '42501';
  END IF;

  -- Lock the games row so this serialises against request_vote.
  SELECT vote_state
  INTO   v_vote_state
  FROM   public.games
  WHERE  id = p_game_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'game not found' USING ERRCODE = 'P0002';
  END IF;

  -- Voting already active or resolved — too late to retract; silent no-op.
  IF v_vote_state NOT IN ('none'::public.vote_state, 'requested'::public.vote_state) THEN
    RETURN;
  END IF;

  DELETE FROM public.vote_requests
  WHERE  game_id   = p_game_id
    AND  player_id = v_caller_id;

  -- Derive the count from the rows (idempotent even when nothing was deleted).
  SELECT COUNT(*)
  INTO   v_request_count
  FROM   public.vote_requests
  WHERE  game_id = p_game_id;

  UPDATE public.games
  SET    vote_request_count = v_request_count,
         vote_state         = CASE
           WHEN v_request_count = 0 THEN 'none'::public.vote_state
           ELSE 'requested'::public.vote_state
         END
  WHERE  id = p_game_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.retract_vote_request(uuid) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.retract_vote_request(uuid) TO anon;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. start_vote — host opens the ballot directly
-- ─────────────────────────────────────────────────────────────────────────────
-- The only path to a vote when call-to-vote is disabled; also usable as a
-- host override. Idempotent when the vote is already active or resolved.

CREATE OR REPLACE FUNCTION public.start_vote(
  p_game_id          uuid,
  p_host_secret_hash text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_room_id       uuid;
  v_host_id       uuid;
  v_stored_hash   text;
  v_vote_state    public.vote_state;
  v_config        jsonb;
  v_duration_secs integer;
BEGIN
  SELECT g.room_id, g.vote_state, g.config_snapshot
  INTO   v_room_id, v_vote_state, v_config
  FROM   public.games g
  WHERE  g.id = p_game_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'game not found' USING ERRCODE = 'P0002';
  END IF;

  SELECT host_player_id, host_secret_hash
  INTO   v_host_id, v_stored_hash
  FROM   public.rooms
  WHERE  id = v_room_id;

  IF v_host_id IS DISTINCT FROM public.requesting_player_id()
     OR v_stored_hash IS DISTINCT FROM p_host_secret_hash THEN
    RAISE EXCEPTION 'caller is not the host' USING ERRCODE = '42501';
  END IF;

  -- Already voting → idempotent no-op. Already resolved → nothing to start.
  IF v_vote_state NOT IN ('none'::public.vote_state, 'requested'::public.vote_state) THEN
    RETURN;
  END IF;

  v_duration_secs := COALESCE(
    (v_config ->> 'voting_duration_seconds')::integer,
    30
  );

  UPDATE public.games
  SET    vote_state   = 'active',
         vote_ends_at = now() + make_interval(secs => v_duration_secs)
  WHERE  id = p_game_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.start_vote(uuid, text) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.start_vote(uuid, text) TO anon;
