-- E5.5-T9 fix: resolve "column reference player_id is ambiguous" (SQLSTATE 42702).
--
-- The original 20260531000001 migration declared both functions with
-- `RETURNS TABLE(player_id uuid)`. The participant-guard EXISTS subquery
-- referenced an unqualified `player_id`, which Postgres could not disambiguate
-- from the function's OUT parameter of the same name — so every call raised
-- 42702 and the client silently fell back to an empty set (no "seen" eye and
-- no "called to vote" indicator ever appeared).
--
-- This migration re-creates both functions with the guard column qualified via
-- a table alias. The 20260531000001 file has also been corrected in place so a
-- fresh `db reset` produces the fixed definitions directly.

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. get_seen_player_ids(p_game_id)
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
-- 2. get_vote_requesters(p_game_id)
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
