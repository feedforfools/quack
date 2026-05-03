-- E5-T9: Result resolution.
--
-- Adds:
--   * game_outcome enum (imposters_caught | imposters_win | tie)
--   * games.outcome             — set by resolve_vote
--   * games.voted_out_player_id — nullable; null on a tie or no votes
--   * resolve_vote(p_game_id)   — tallies votes, marks vote_state = resolved;
--                                  idempotent; callable when vote_ends_at has
--                                  passed OR every participant has voted.
--   * get_game_result(p_game_id) — SECURITY DEFINER; reveals full result
--                                  (outcome, voted-out player, word, imposters)
--                                  only when vote_state = resolved.

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. game_outcome enum + games columns
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TYPE public.game_outcome AS ENUM (
  'imposters_caught',
  'imposters_win',
  'tie'
);

ALTER TABLE public.games
  ADD COLUMN outcome              public.game_outcome,
  ADD COLUMN voted_out_player_id  uuid;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. resolve_vote(p_game_id uuid)
-- ─────────────────────────────────────────────────────────────────────────────
-- Tallies vote rows for the game, determines the outcome, and transitions
-- vote_state → resolved.
--
-- Preconditions:
--   * Caller must be a role_assignment participant in the game.
--   * vote_state must be 'active'.
--   * Either vote_ends_at < now() OR every participant has cast a vote.
--
-- Idempotent: if vote_state is already 'resolved' the function returns
-- immediately without error, so concurrent calls from multiple clients are
-- safe.
--
-- Outcome rules:
--   * No votes cast OR multiple players tied for most votes → 'tie'.
--   * Single leader who is an imposter → 'imposters_caught'.
--   * Single leader who is a civilian → 'imposters_win'.

CREATE OR REPLACE FUNCTION public.resolve_vote(p_game_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_caller_id       uuid;
  v_vote_state      public.vote_state;
  v_vote_ends_at    timestamptz;
  v_all_voted       boolean;
  v_max_votes       bigint;
  v_count_with_max  bigint;
  v_voted_out_id    uuid;
  v_voted_out_role  public.player_role;
  v_outcome         public.game_outcome;
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

  -- Lock the game row so concurrent resolve calls serialise.
  SELECT vote_state, vote_ends_at
  INTO   v_vote_state, v_vote_ends_at
  FROM   public.games
  WHERE  id = p_game_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'game not found' USING ERRCODE = 'P0002';
  END IF;

  -- Idempotent: already resolved → no-op.
  IF v_vote_state = 'resolved'::public.vote_state THEN
    RETURN;
  END IF;

  -- Only valid when vote is active.
  IF v_vote_state != 'active'::public.vote_state THEN
    RAISE EXCEPTION 'vote is not active' USING ERRCODE = 'P0001';
  END IF;

  -- Check: timer expired OR every participant has cast a vote.
  SELECT (COUNT(ra.player_id) = COUNT(v.voter_player_id))
  INTO   v_all_voted
  FROM   public.role_assignments ra
  LEFT JOIN public.votes v
    ON  v.game_id         = ra.game_id
    AND v.voter_player_id = ra.player_id
  WHERE  ra.game_id = p_game_id;

  IF NOT (v_vote_ends_at < now() OR v_all_voted) THEN
    RAISE EXCEPTION 'voting is still in progress' USING ERRCODE = 'P0001';
  END IF;

  -- ── Tally ─────────────────────────────────────────────────────────────────

  -- Maximum votes received by any single target.
  SELECT COALESCE(MAX(cnt), 0)
  INTO   v_max_votes
  FROM (
    SELECT COUNT(*) AS cnt
    FROM   public.votes
    WHERE  game_id = p_game_id
    GROUP BY target_player_id
  ) sub;

  -- How many targets are tied at that maximum?
  SELECT COUNT(*)
  INTO   v_count_with_max
  FROM (
    SELECT target_player_id
    FROM   public.votes
    WHERE  game_id = p_game_id
    GROUP BY target_player_id
    HAVING COUNT(*) = v_max_votes
  ) sub;

  -- ── Determine outcome ─────────────────────────────────────────────────────

  IF v_max_votes = 0 OR v_count_with_max > 1 THEN
    -- No votes cast, or multiple players are tied.
    v_outcome      := 'tie';
    v_voted_out_id := NULL;
  ELSE
    -- Single clear leader — find their player ID.
    SELECT target_player_id
    INTO   v_voted_out_id
    FROM   public.votes
    WHERE  game_id = p_game_id
    GROUP BY target_player_id
    ORDER BY COUNT(*) DESC
    LIMIT  1;

    -- Determine their role.
    SELECT role
    INTO   v_voted_out_role
    FROM   public.role_assignments
    WHERE  game_id   = p_game_id
      AND  player_id = v_voted_out_id;

    IF v_voted_out_role = 'imposter'::public.player_role THEN
      v_outcome := 'imposters_caught';
    ELSE
      v_outcome := 'imposters_win';
    END IF;
  END IF;

  -- ── Commit ────────────────────────────────────────────────────────────────

  UPDATE public.games
  SET    vote_state          = 'resolved',
         outcome             = v_outcome,
         voted_out_player_id = v_voted_out_id
  WHERE  id = p_game_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.resolve_vote(uuid) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.resolve_vote(uuid) TO anon;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. get_game_result(p_game_id uuid)
-- ─────────────────────────────────────────────────────────────────────────────
-- Returns the full post-resolution result for the calling player.
-- Bypasses normal RLS on role_assignments so all imposters and the secret
-- word can be revealed to everyone now that the game is over.
--
-- Preconditions:
--   * Caller must be a participant.
--   * vote_state must be 'resolved'.

CREATE OR REPLACE FUNCTION public.get_game_result(p_game_id uuid)
RETURNS TABLE (
  outcome               public.game_outcome,
  voted_out_player_id   uuid,
  voted_out_player_name text,
  secret_word           text,
  imposters             jsonb
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_caller_id  uuid;
  v_vote_state public.vote_state;
BEGIN
  v_caller_id := public.requesting_player_id();

  -- Verify caller is a participant.
  IF NOT EXISTS (
    SELECT 1
    FROM   public.role_assignments
    WHERE  game_id   = p_game_id
      AND  player_id = v_caller_id
  ) THEN
    RAISE EXCEPTION 'caller is not a participant in this game'
      USING ERRCODE = '42501';
  END IF;

  -- Only expose results for resolved games.
  SELECT g.vote_state
  INTO   v_vote_state
  FROM   public.games g
  WHERE  g.id = p_game_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'game not found' USING ERRCODE = 'P0002';
  END IF;

  IF v_vote_state != 'resolved'::public.vote_state THEN
    RAISE EXCEPTION 'game result is not yet available' USING ERRCODE = 'P0001';
  END IF;

  RETURN QUERY
  SELECT
    g.outcome,
    g.voted_out_player_id,
    p_voted.display_name                                              AS voted_out_player_name,
    (
      SELECT ra.word
      FROM   public.role_assignments ra
      WHERE  ra.game_id = p_game_id
        AND  ra.role    = 'civilian'
      LIMIT  1
    )                                                                 AS secret_word,
    COALESCE(
      (
        SELECT jsonb_agg(
                 jsonb_build_object(
                   'player_id',    ra2.player_id,
                   'display_name', pl2.display_name
                 )
                 ORDER BY pl2.display_name
               )
        FROM   public.role_assignments ra2
        JOIN   public.players pl2 ON pl2.id = ra2.player_id
        WHERE  ra2.game_id = p_game_id
          AND  ra2.role    = 'imposter'
      ),
      '[]'::jsonb
    )                                                                 AS imposters
  FROM   public.games g
  LEFT JOIN public.players p_voted ON p_voted.id = g.voted_out_player_id
  WHERE  g.id = p_game_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.get_game_result(uuid) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.get_game_result(uuid) TO anon;
