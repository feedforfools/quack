-- E5-T6: Voting schema & RLS.
--
-- Adds:
--   * vote_state enum (none | requested | active | resolved)
--   * games.vote_state, games.vote_ends_at, games.vote_request_count
--   * votes table (one row per voter per game)
--   * RLS on votes:
--       - voters can read their own row;
--       - imposters can read all rows authored by fellow imposters in the
--         same game.
--       - civilians can never read another player's row directly.
--   * get_vote_tally(game_id) SECURITY DEFINER function that exposes
--     aggregated per-target vote counts when config_snapshot.live_tally
--     is true. Civilians use this fn to learn the live tally without
--     leaking individual votes.
--
-- Writes (insert/update/delete) on votes are not granted to anon. They
-- will land in E5-T7 via SECURITY DEFINER RPCs (request_vote, cast_vote,
-- retract_vote, resolve_vote) so that vote_ends_at gating, threshold
-- maths, and self-vote rejection are enforced server-side.

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. vote_state enum + games columns
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TYPE public.vote_state AS ENUM ('none', 'requested', 'active', 'resolved');

ALTER TABLE public.games
  ADD COLUMN vote_state         public.vote_state NOT NULL DEFAULT 'none',
  ADD COLUMN vote_ends_at       timestamptz,
  ADD COLUMN vote_request_count integer           NOT NULL DEFAULT 0;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. votes table
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE public.votes (
  game_id          uuid        NOT NULL REFERENCES public.games(id) ON DELETE CASCADE,
  voter_player_id  uuid        NOT NULL,
  target_player_id uuid        NOT NULL,
  created_at       timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (game_id, voter_player_id),
  CONSTRAINT votes_no_self_vote CHECK (voter_player_id <> target_player_id)
);

CREATE INDEX votes_game_id_idx           ON public.votes (game_id);
CREATE INDEX votes_target_player_id_idx  ON public.votes (game_id, target_player_id);

ALTER TABLE public.votes ENABLE ROW LEVEL SECURITY;

-- Grant SELECT only. Writes go through SECURITY DEFINER RPCs (E5-T7).
GRANT SELECT ON public.votes TO anon;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. RLS policies on votes
-- ─────────────────────────────────────────────────────────────────────────────

-- Helper: returns true when both the caller and the supplied voter are
-- imposters in the same game.  SECURITY DEFINER so it can read
-- role_assignments rows that the caller would otherwise be denied by the
-- role_assignments_select_own policy (a player can only see their own
-- assignment row).  Without this bypass, the votes RLS policy below
-- would never resolve "co-imposter" because the EXISTS subquery itself
-- runs under the caller's RLS context.
CREATE OR REPLACE FUNCTION public.caller_is_co_imposter(
  p_game_id uuid,
  p_voter_id uuid
)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM   public.role_assignments ra_caller
    JOIN   public.role_assignments ra_voter
      ON   ra_voter.game_id   = ra_caller.game_id
     AND   ra_voter.player_id = p_voter_id
    WHERE  ra_caller.game_id   = p_game_id
      AND  ra_caller.player_id = public.requesting_player_id()
      AND  ra_caller.role      = 'imposter'
      AND  ra_voter.role       = 'imposter'
  );
$$;

REVOKE EXECUTE ON FUNCTION public.caller_is_co_imposter(uuid, uuid) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.caller_is_co_imposter(uuid, uuid) TO anon;

-- A caller may read a vote row if:
--   (a) they are the voter, OR
--   (b) caller and voter are both imposters in the same game.
-- Civilians can never read another player's vote directly; they get
-- aggregated counts via get_vote_tally() when live_tally is on.
CREATE POLICY "votes_select_self_or_co_imposter"
  ON public.votes
  FOR SELECT
  TO anon
  USING (
    voter_player_id = public.requesting_player_id()
    OR public.caller_is_co_imposter(game_id, voter_player_id)
  );

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. get_vote_tally(game_id) — aggregated counts when live_tally = true
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.get_vote_tally(p_game_id uuid)
RETURNS TABLE(target_player_id uuid, vote_count bigint)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_caller_id uuid;
  v_in_game   boolean;
  v_live      boolean;
BEGIN
  v_caller_id := public.requesting_player_id();

  -- Caller must be a participant (role-assigned) in this game.
  SELECT EXISTS (
    SELECT 1
    FROM   public.role_assignments
    WHERE  game_id   = p_game_id
      AND  player_id = v_caller_id
  ) INTO v_in_game;

  IF NOT v_in_game THEN
    RETURN;
  END IF;

  -- Only expose tally when the host enabled live_tally for this game.
  SELECT (config_snapshot ->> 'live_tally')::boolean
  INTO   v_live
  FROM   public.games
  WHERE  id = p_game_id;

  IF v_live IS NOT TRUE THEN
    RETURN;
  END IF;

  RETURN QUERY
    SELECT v.target_player_id, count(*)::bigint
    FROM   public.votes v
    WHERE  v.game_id = p_game_id
    GROUP  BY v.target_player_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.get_vote_tally(uuid) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.get_vote_tally(uuid) TO anon;
