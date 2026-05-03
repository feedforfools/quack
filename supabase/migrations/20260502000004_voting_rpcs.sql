-- E5-T7: Voting RPCs — request_vote, cast_vote, retract_vote.
--
-- Adds:
--   * vote_requests table  — tracks which players have requested a vote in a
--     given game (one row per player per game, PK deduplicates).
--   * request_vote(p_game_id)
--       Any game participant may call this to express "I want to vote".
--       The first call transitions vote_state none → requested.
--       Subsequent calls from different players increment vote_request_count.
--       When the count reaches CEIL(player_count × vote_threshold_fraction),
--       vote_state transitions to active and vote_ends_at is stamped.
--       Idempotent: a second call from the same player is a no-op.
--       Rejected when vote_state is already active or resolved.
--
--   * cast_vote(p_game_id, p_target_player_id)
--       Upserts the caller's vote row (changing vote is allowed).
--       Rejected: self-vote, caller/target not in game, state ≠ active,
--       or vote_ends_at has already passed.
--
--   * retract_vote(p_game_id)
--       Deletes the caller's vote row.
--       Idempotent: no error if the caller has no vote to retract.
--       Rejected: caller not in game, state ≠ active, vote_ends_at passed.
--
-- All three functions are SECURITY DEFINER because the votes table grants
-- only SELECT to anon (write access is deliberately withheld from direct
-- DML so that vote_ends_at gating and self-vote rejection are enforced
-- server-side without relying on RLS CHECK constraints alone).
--
-- Error codes follow the project convention:
--   42501  — caller not a participant in the game
--   P0002  — game not found
--   P0001  — business-rule violation (wrong state, self-vote, deadline, etc.)

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. vote_requests table
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE public.vote_requests (
  game_id    uuid        NOT NULL REFERENCES public.games(id) ON DELETE CASCADE,
  player_id  uuid        NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (game_id, player_id)
);

CREATE INDEX vote_requests_game_id_idx ON public.vote_requests (game_id);

-- No direct RLS or SELECT grant needed — this table is only touched by the
-- SECURITY DEFINER request_vote RPC; no client reads it directly.

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. request_vote(p_game_id uuid)
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.request_vote(p_game_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_caller_id        uuid;
  v_vote_state       public.vote_state;
  v_config           jsonb;
  v_request_count    integer;
  v_player_count     bigint;
  v_threshold_frac   numeric;
  v_threshold        integer;
  v_duration_secs    integer;
  v_new_count        integer;
BEGIN
  v_caller_id := public.requesting_player_id();

  -- Verify caller is a participant in this game.
  IF NOT EXISTS (
    SELECT 1
    FROM   public.role_assignments
    WHERE  game_id   = p_game_id
      AND  player_id = v_caller_id
  ) THEN
    RAISE EXCEPTION 'caller is not a participant in this game'
      USING ERRCODE = '42501';
  END IF;

  -- Lock the games row so concurrent requests serialise through here.
  SELECT vote_state, vote_request_count, config_snapshot
  INTO   v_vote_state, v_request_count, v_config
  FROM   public.games
  WHERE  id = p_game_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'game not found' USING ERRCODE = 'P0002';
  END IF;

  -- Only allow requesting when vote has not yet become active or resolved.
  IF v_vote_state NOT IN ('none'::public.vote_state, 'requested'::public.vote_state) THEN
    RAISE EXCEPTION 'voting is already active or resolved'
      USING ERRCODE = 'P0001';
  END IF;

  -- Idempotency: try to record this player's request.
  -- ON CONFLICT DO NOTHING leaves FOUND = false when the row already exists.
  INSERT INTO public.vote_requests (game_id, player_id)
  VALUES (p_game_id, v_caller_id)
  ON CONFLICT (game_id, player_id) DO NOTHING;

  -- If the insert was suppressed the player already requested — no-op.
  IF NOT FOUND THEN
    RETURN;
  END IF;

  -- Compute threshold from config (default: simple majority = 0.5).
  SELECT COUNT(*)
  INTO   v_player_count
  FROM   public.role_assignments
  WHERE  game_id = p_game_id;

  v_threshold_frac := COALESCE(
    (v_config ->> 'vote_threshold_fraction')::numeric,
    0.5
  );
  -- At least 1 request must always suffice to trigger the transition.
  v_threshold := GREATEST(1, CEIL(v_player_count * v_threshold_frac)::integer);

  v_duration_secs := COALESCE(
    (v_config ->> 'voting_duration_seconds')::integer,
    60
  );

  v_new_count := v_request_count + 1;

  UPDATE public.games
  SET    vote_request_count = v_new_count,
         vote_state         = CASE
           WHEN v_new_count >= v_threshold
             THEN 'active'::public.vote_state
           ELSE 'requested'::public.vote_state
         END,
         vote_ends_at       = CASE
           WHEN v_new_count >= v_threshold
             THEN now() + make_interval(secs => v_duration_secs)
           ELSE vote_ends_at
         END
  WHERE  id = p_game_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.request_vote(uuid) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.request_vote(uuid) TO anon;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. cast_vote(p_game_id uuid, p_target_player_id uuid)
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.cast_vote(
  p_game_id          uuid,
  p_target_player_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_caller_id  uuid;
  v_vote_state public.vote_state;
  v_ends_at    timestamptz;
BEGIN
  v_caller_id := public.requesting_player_id();

  -- Self-vote rejection (belt-and-suspenders alongside the CHECK constraint).
  IF v_caller_id = p_target_player_id THEN
    RAISE EXCEPTION 'cannot vote for yourself' USING ERRCODE = 'P0001';
  END IF;

  -- Caller must be a participant.
  IF NOT EXISTS (
    SELECT 1
    FROM   public.role_assignments
    WHERE  game_id   = p_game_id
      AND  player_id = v_caller_id
  ) THEN
    RAISE EXCEPTION 'caller is not a participant in this game'
      USING ERRCODE = '42501';
  END IF;

  -- Target must also be a participant.
  IF NOT EXISTS (
    SELECT 1
    FROM   public.role_assignments
    WHERE  game_id   = p_game_id
      AND  player_id = p_target_player_id
  ) THEN
    RAISE EXCEPTION 'target is not a participant in this game'
      USING ERRCODE = 'P0001';
  END IF;

  -- Lock the games row and read current voting state.
  SELECT vote_state, vote_ends_at
  INTO   v_vote_state, v_ends_at
  FROM   public.games
  WHERE  id = p_game_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'game not found' USING ERRCODE = 'P0002';
  END IF;

  IF v_vote_state <> 'active'::public.vote_state THEN
    RAISE EXCEPTION 'voting is not currently active' USING ERRCODE = 'P0001';
  END IF;

  -- Reject if the voting window has closed.
  IF v_ends_at IS NOT NULL AND now() > v_ends_at THEN
    RAISE EXCEPTION 'voting period has ended' USING ERRCODE = 'P0001';
  END IF;

  -- Upsert: insert or update the caller's vote (changing vote is allowed).
  INSERT INTO public.votes (game_id, voter_player_id, target_player_id, created_at)
  VALUES (p_game_id, v_caller_id, p_target_player_id, now())
  ON CONFLICT (game_id, voter_player_id) DO UPDATE
    SET target_player_id = EXCLUDED.target_player_id,
        created_at       = EXCLUDED.created_at;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.cast_vote(uuid, uuid) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.cast_vote(uuid, uuid) TO anon;

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. retract_vote(p_game_id uuid)
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.retract_vote(p_game_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_caller_id  uuid;
  v_vote_state public.vote_state;
  v_ends_at    timestamptz;
BEGIN
  v_caller_id := public.requesting_player_id();

  -- Caller must be a participant.
  IF NOT EXISTS (
    SELECT 1
    FROM   public.role_assignments
    WHERE  game_id   = p_game_id
      AND  player_id = v_caller_id
  ) THEN
    RAISE EXCEPTION 'caller is not a participant in this game'
      USING ERRCODE = '42501';
  END IF;

  -- Read current voting state (no FOR UPDATE needed — delete is idempotent).
  SELECT vote_state, vote_ends_at
  INTO   v_vote_state, v_ends_at
  FROM   public.games
  WHERE  id = p_game_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'game not found' USING ERRCODE = 'P0002';
  END IF;

  IF v_vote_state <> 'active'::public.vote_state THEN
    RAISE EXCEPTION 'voting is not currently active' USING ERRCODE = 'P0001';
  END IF;

  -- Reject if the voting window has closed.
  IF v_ends_at IS NOT NULL AND now() > v_ends_at THEN
    RAISE EXCEPTION 'voting period has ended' USING ERRCODE = 'P0001';
  END IF;

  -- Delete caller's vote row (idempotent — no error if no row exists).
  DELETE FROM public.votes
  WHERE  game_id        = p_game_id
    AND  voter_player_id = v_caller_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.retract_vote(uuid) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.retract_vote(uuid) TO anon;
