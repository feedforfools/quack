-- E5.5-T12: retract_vote_request — undo a "skip / call to vote" request.
--
-- Counterpart to request_vote (20260502000004). A player who tapped
-- "Skip to vote" may change their mind while the vote is still only pending
-- (vote_state in 'none' | 'requested'). This:
--   * deletes the caller's vote_requests row,
--   * decrements games.vote_request_count,
--   * drops vote_state back to 'none' when the count reaches zero.
--
-- Idempotent: a no-op if the caller has no pending request.
-- Once voting has gone 'active' or 'resolved' the request can no longer be
-- retracted (the threshold was already met) — the call becomes a no-op.
--
-- Error codes:
--   42501  — caller not a participant in the game
--   P0002  — game not found

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
  v_new_count     integer;
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

  -- Lock the games row so this serialises against request_vote.
  SELECT vote_state, vote_request_count
  INTO   v_vote_state, v_request_count
  FROM   public.games
  WHERE  id = p_game_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'game not found' USING ERRCODE = 'P0002';
  END IF;

  -- Voting already active or resolved — too late to retract.
  IF v_vote_state NOT IN ('none'::public.vote_state, 'requested'::public.vote_state) THEN
    RETURN;
  END IF;

  -- Remove this player's request. FOUND is false when there was none.
  DELETE FROM public.vote_requests
  WHERE  game_id   = p_game_id
    AND  player_id = v_caller_id;

  IF NOT FOUND THEN
    RETURN;
  END IF;

  v_new_count := GREATEST(0, v_request_count - 1);

  UPDATE public.games
  SET    vote_request_count = v_new_count,
         vote_state         = CASE
           WHEN v_new_count = 0 THEN 'none'::public.vote_state
           ELSE 'requested'::public.vote_state
         END
  WHERE  id = p_game_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.retract_vote_request(uuid) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.retract_vote_request(uuid) TO anon;
