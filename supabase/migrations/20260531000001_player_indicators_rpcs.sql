-- E5.5-T9: Per-player in-game indicator RPCs.
--
-- The redesigned Discussion screen renders two per-player roster indicators
-- that need data the client cannot otherwise read under RLS:
--
--   * "seen their card"  — who has peeked at their role at least once
--       (role_assignments.seen_at IS NOT NULL). A player may only read their
--       OWN role_assignments row (role_assignments_select_own), so the full
--       set is exposed here through a SECURITY DEFINER function that returns
--       only player_ids (never role/word).
--
--   * "called to vote"   — who has tapped skip-to-vote (vote_requests rows).
--       vote_requests has no SELECT grant (it is written only by the
--       request_vote RPC), so this function exposes the requester player_ids.
--
-- Both functions:
--   * are SECURITY DEFINER with a locked-down search_path;
--   * require the caller to be a participant (role-assigned) in the game,
--     returning an empty set otherwise (no error — avoids leaking existence);
--   * return only opaque player_ids that the client already knows from the
--     public players roster, so no private data is disclosed.

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. get_seen_player_ids(p_game_id) — who has peeked at their card
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.get_seen_player_ids(p_game_id uuid)
RETURNS TABLE(player_id uuid)
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = ''
AS $$
DECLARE
  v_caller_id uuid;
BEGIN
  v_caller_id := public.requesting_player_id();

  -- Caller must be a participant in this game; otherwise return nothing.
  IF NOT EXISTS (
    SELECT 1
    FROM   public.role_assignments guard
    WHERE  guard.game_id   = p_game_id
      AND  guard.player_id = v_caller_id
  ) THEN
    RETURN;
  END IF;

  RETURN QUERY
    SELECT ra.player_id
    FROM   public.role_assignments ra
    WHERE  ra.game_id = p_game_id
      AND  ra.seen_at IS NOT NULL;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.get_seen_player_ids(uuid) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.get_seen_player_ids(uuid) TO anon;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. get_vote_requesters(p_game_id) — who has called to vote
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.get_vote_requesters(p_game_id uuid)
RETURNS TABLE(player_id uuid)
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = ''
AS $$
DECLARE
  v_caller_id uuid;
BEGIN
  v_caller_id := public.requesting_player_id();

  -- Caller must be a participant in this game; otherwise return nothing.
  IF NOT EXISTS (
    SELECT 1
    FROM   public.role_assignments guard
    WHERE  guard.game_id   = p_game_id
      AND  guard.player_id = v_caller_id
  ) THEN
    RETURN;
  END IF;

  RETURN QUERY
    SELECT vr.player_id
    FROM   public.vote_requests vr
    WHERE  vr.game_id = p_game_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.get_vote_requesters(uuid) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.get_vote_requesters(uuid) TO anon;
