-- E3-T11: server-tracked seen_at + mark_role_seen RPC + all_players_seen helper.
--
-- seen_at  — records the first time a player actually peeked at their role
--            (lid held past PEEK_THRESHOLD in the client). Stamped by the
--            mark_role_seen RPC below.  NULL means the player has not yet
--            peeked. Used by E3-T7 to gate the host "Start Timer" button.
--
-- mark_role_seen(p_round_id)
--   Stamps the calling player's own row idempotently (no-op if already set).
--   SECURITY DEFINER so we can do a targeted UPDATE without relying on the
--   UPDATE RLS policy.
--
-- all_players_seen(p_round_id) RETURNS boolean
--   Returns TRUE when every role_assignment row for the round has a non-NULL
--   seen_at. SECURITY DEFINER so callers cannot read each other's role/word;
--   returns only a boolean.

-- ── Column ────────────────────────────────────────────────────────────────────

ALTER TABLE public.role_assignments
  ADD COLUMN seen_at timestamptz;

-- ── mark_role_seen RPC ────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.mark_role_seen(
  p_round_id uuid
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

  -- Idempotent: only stamp on first call.
  UPDATE public.role_assignments
  SET    seen_at = now()
  WHERE  round_id  = p_round_id
    AND  player_id = v_player_id
    AND  seen_at   IS NULL;

  -- Verify the row exists (player must belong to this round).
  IF NOT FOUND THEN
    -- Row may already be stamped — that is fine.
    IF NOT EXISTS (
      SELECT 1
      FROM   public.role_assignments
      WHERE  round_id  = p_round_id
        AND  player_id = v_player_id
    ) THEN
      RAISE EXCEPTION 'assignment not found' USING ERRCODE = 'P0002';
    END IF;
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.mark_role_seen(uuid) TO anon;

-- ── all_players_seen helper ───────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.all_players_seen(
  p_round_id uuid
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
  WHERE round_id = p_round_id;

  IF v_total = 0 THEN
    RETURN false;
  END IF;

  RETURN v_seen = v_total;
END;
$$;

GRANT EXECUTE ON FUNCTION public.all_players_seen(uuid) TO anon;
