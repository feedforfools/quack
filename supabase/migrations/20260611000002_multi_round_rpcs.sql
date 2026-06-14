-- E6-T2: Multi-round elimination mode — RPCs.
--
-- Companion to multi_round_schema. Replaces the voting RPCs so they are
-- round-aware and elimination-aware, and adds the round-lifecycle RPCs:
--
--   * request_vote / cast_vote / retract_vote — scoped to games.current_round;
--     eliminated players can no longer vote, be voted, or call a vote.
--   * get_vote_tally — current round only. Also fixes the config key: the
--     client persists `live_vote_tally` but the old function read `live_tally`
--     (live tally never showed). Both keys are now accepted.
--   * resolve_vote — single mode keeps the original outcome rules; multi mode
--     eliminates the leader (tie = nobody), stores a round_results row, then
--     either finishes the game (all imposters out / parity / round cap) or
--     leaves outcome NULL so the room can advance to the next round.
--   * advance_round — host-only; opens round N+1 after an intermediate result.
--   * declare_word_guessed — host-only; ends a multi-mode game because an
--     imposter guessed the secret word.
--   * get_round_results — per-round history (eliminations + tallies) for all
--     participants; the tally is hidden when config.show_vote_counts is false.
--
-- Error code conventions (unchanged):
--   42501 — caller is not allowed (not a participant / not the host)
--   P0002 — game/room not found
--   P0001 — business-rule violation

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. request_vote — alive players only; threshold counts alive players
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
  INSERT INTO public.vote_requests (game_id, player_id)
  VALUES (p_game_id, v_caller_id)
  ON CONFLICT (game_id, player_id) DO NOTHING;

  IF NOT FOUND THEN
    RETURN;
  END IF;

  -- Threshold counts only alive players — eliminated ones no longer vote.
  SELECT COUNT(*)
  INTO   v_player_count
  FROM   public.role_assignments
  WHERE  game_id = p_game_id
    AND  eliminated_in_round IS NULL;

  v_threshold_frac := COALESCE(
    (v_config ->> 'vote_threshold_fraction')::numeric,
    0.5
  );
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
-- 2. cast_vote — stamped with the game's current round; alive voters/targets
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
  v_round      integer;
BEGIN
  v_caller_id := public.requesting_player_id();

  IF v_caller_id = p_target_player_id THEN
    RAISE EXCEPTION 'cannot vote for yourself' USING ERRCODE = 'P0001';
  END IF;

  -- Caller must be an alive participant.
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

  -- Target must also be an alive participant.
  IF NOT EXISTS (
    SELECT 1
    FROM   public.role_assignments
    WHERE  game_id   = p_game_id
      AND  player_id = p_target_player_id
      AND  eliminated_in_round IS NULL
  ) THEN
    RAISE EXCEPTION 'target is not an active participant in this game'
      USING ERRCODE = 'P0001';
  END IF;

  SELECT vote_state, vote_ends_at, current_round
  INTO   v_vote_state, v_ends_at, v_round
  FROM   public.games
  WHERE  id = p_game_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'game not found' USING ERRCODE = 'P0002';
  END IF;

  IF v_vote_state <> 'active'::public.vote_state THEN
    RAISE EXCEPTION 'voting is not currently active' USING ERRCODE = 'P0001';
  END IF;

  IF v_ends_at IS NOT NULL AND now() > v_ends_at THEN
    RAISE EXCEPTION 'voting period has ended' USING ERRCODE = 'P0001';
  END IF;

  INSERT INTO public.votes (game_id, round, voter_player_id, target_player_id, created_at)
  VALUES (p_game_id, v_round, v_caller_id, p_target_player_id, now())
  ON CONFLICT (game_id, round, voter_player_id) DO UPDATE
    SET target_player_id = EXCLUDED.target_player_id,
        created_at       = EXCLUDED.created_at;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.cast_vote(uuid, uuid) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.cast_vote(uuid, uuid) TO anon;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. retract_vote — current round only
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
  v_round      integer;
BEGIN
  v_caller_id := public.requesting_player_id();

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

  SELECT vote_state, vote_ends_at, current_round
  INTO   v_vote_state, v_ends_at, v_round
  FROM   public.games
  WHERE  id = p_game_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'game not found' USING ERRCODE = 'P0002';
  END IF;

  IF v_vote_state <> 'active'::public.vote_state THEN
    RAISE EXCEPTION 'voting is not currently active' USING ERRCODE = 'P0001';
  END IF;

  IF v_ends_at IS NOT NULL AND now() > v_ends_at THEN
    RAISE EXCEPTION 'voting period has ended' USING ERRCODE = 'P0001';
  END IF;

  DELETE FROM public.votes
  WHERE  game_id         = p_game_id
    AND  round           = v_round
    AND  voter_player_id = v_caller_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.retract_vote(uuid) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.retract_vote(uuid) TO anon;

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. get_vote_tally — current round; accepts both live-tally config keys
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
  v_round     integer;
BEGIN
  v_caller_id := public.requesting_player_id();

  SELECT EXISTS (
    SELECT 1
    FROM   public.role_assignments
    WHERE  game_id   = p_game_id
      AND  player_id = v_caller_id
  ) INTO v_in_game;

  IF NOT v_in_game THEN
    RETURN;
  END IF;

  -- The settings UI persists `live_vote_tally`; older snapshots may carry
  -- `live_tally`. Accept either.
  SELECT COALESCE(
           (config_snapshot ->> 'live_vote_tally')::boolean,
           (config_snapshot ->> 'live_tally')::boolean
         ),
         current_round
  INTO   v_live, v_round
  FROM   public.games
  WHERE  id = p_game_id;

  IF v_live IS NOT TRUE THEN
    RETURN;
  END IF;

  RETURN QUERY
    SELECT v.target_player_id, count(*)::bigint
    FROM   public.votes v
    WHERE  v.game_id = p_game_id
      AND  v.round   = v_round
    GROUP  BY v.target_player_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.get_vote_tally(uuid) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.get_vote_tally(uuid) TO anon;

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. resolve_vote — single-shot outcome OR per-round elimination
-- ─────────────────────────────────────────────────────────────────────────────
-- Single mode (default): unchanged outcome rules (tie / caught / win), plus a
-- round_results row so the result screen can show per-player vote counts.
--
-- Multi mode:
--   * Clear leader → that player is eliminated (role revealed in the result).
--   * Tie or no votes → nobody eliminated this round.
--   * End conditions, checked after the elimination:
--       - no alive imposters left           → outcome 'imposters_caught'
--       - alive imposters >= alive civilians → outcome 'imposters_win'
--       - current_round >= max_rounds        → outcome 'imposters_win'
--     Otherwise outcome stays NULL: vote_state is 'resolved' but the game
--     continues — the host advances via advance_round.

CREATE OR REPLACE FUNCTION public.resolve_vote(p_game_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_caller_id        uuid;
  v_vote_state       public.vote_state;
  v_vote_ends_at     timestamptz;
  v_config           jsonb;
  v_round            integer;
  v_round_mode       text;
  v_max_rounds       integer;
  v_all_voted        boolean;
  v_max_votes        bigint;
  v_count_with_max   bigint;
  v_voted_out_id     uuid;
  v_voted_out_role   public.player_role;
  v_outcome          public.game_outcome;
  v_tally            jsonb;
  v_alive_imposters  bigint;
  v_alive_civilians  bigint;
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

  -- Lock the game row so concurrent resolve calls serialise.
  SELECT vote_state, vote_ends_at, config_snapshot, current_round
  INTO   v_vote_state, v_vote_ends_at, v_config, v_round
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

  IF v_vote_state != 'active'::public.vote_state THEN
    RAISE EXCEPTION 'vote is not active' USING ERRCODE = 'P0001';
  END IF;

  -- Check: timer expired OR every alive participant has cast a vote.
  SELECT (COUNT(ra.player_id) = COUNT(v.voter_player_id))
  INTO   v_all_voted
  FROM   public.role_assignments ra
  LEFT JOIN public.votes v
    ON  v.game_id         = ra.game_id
    AND v.round           = v_round
    AND v.voter_player_id = ra.player_id
  WHERE  ra.game_id = p_game_id
    AND  ra.eliminated_in_round IS NULL;

  IF NOT (v_vote_ends_at < now() OR v_all_voted) THEN
    RAISE EXCEPTION 'voting is still in progress' USING ERRCODE = 'P0001';
  END IF;

  v_round_mode := COALESCE(v_config ->> 'round_mode', 'single');
  v_max_rounds := COALESCE((v_config ->> 'max_rounds')::integer, 5);

  -- ── Tally (current round) ─────────────────────────────────────────────────

  SELECT COALESCE(MAX(cnt), 0)
  INTO   v_max_votes
  FROM (
    SELECT COUNT(*) AS cnt
    FROM   public.votes
    WHERE  game_id = p_game_id
      AND  round   = v_round
    GROUP BY target_player_id
  ) sub;

  SELECT COUNT(*)
  INTO   v_count_with_max
  FROM (
    SELECT target_player_id
    FROM   public.votes
    WHERE  game_id = p_game_id
      AND  round   = v_round
    GROUP BY target_player_id
    HAVING COUNT(*) = v_max_votes
  ) sub;

  -- Snapshot the per-target counts for the result screens.
  SELECT COALESCE(
           jsonb_agg(
             jsonb_build_object('player_id', t.target_player_id, 'votes', t.cnt)
             ORDER BY t.cnt DESC
           ),
           '[]'::jsonb
         )
  INTO   v_tally
  FROM (
    SELECT target_player_id, COUNT(*) AS cnt
    FROM   public.votes
    WHERE  game_id = p_game_id
      AND  round   = v_round
    GROUP BY target_player_id
  ) t;

  -- ── Leader ────────────────────────────────────────────────────────────────

  IF v_max_votes = 0 OR v_count_with_max > 1 THEN
    v_voted_out_id   := NULL;
    v_voted_out_role := NULL;
  ELSE
    SELECT target_player_id
    INTO   v_voted_out_id
    FROM   public.votes
    WHERE  game_id = p_game_id
      AND  round   = v_round
    GROUP BY target_player_id
    ORDER BY COUNT(*) DESC
    LIMIT  1;

    SELECT role
    INTO   v_voted_out_role
    FROM   public.role_assignments
    WHERE  game_id   = p_game_id
      AND  player_id = v_voted_out_id;
  END IF;

  -- ── Outcome ───────────────────────────────────────────────────────────────

  IF v_round_mode = 'multi' THEN
    -- Eliminate the leader (tie / no votes → nobody this round).
    IF v_voted_out_id IS NOT NULL THEN
      UPDATE public.role_assignments
      SET    eliminated_in_round = v_round
      WHERE  game_id   = p_game_id
        AND  player_id = v_voted_out_id;
    END IF;

    SELECT
      COUNT(*) FILTER (WHERE role = 'imposter'::public.player_role),
      COUNT(*) FILTER (WHERE role = 'civilian'::public.player_role)
    INTO   v_alive_imposters, v_alive_civilians
    FROM   public.role_assignments
    WHERE  game_id = p_game_id
      AND  eliminated_in_round IS NULL;

    IF v_alive_imposters = 0 THEN
      v_outcome := 'imposters_caught';
    ELSIF v_alive_imposters >= v_alive_civilians THEN
      v_outcome := 'imposters_win';
    ELSIF v_round >= v_max_rounds THEN
      -- Round cap reached with imposters still alive → they survived.
      v_outcome := 'imposters_win';
    ELSE
      v_outcome := NULL; -- game continues; host advances to the next round
    END IF;
  ELSE
    -- Single mode — original rules.
    IF v_voted_out_id IS NULL THEN
      v_outcome := 'tie';
    ELSIF v_voted_out_role = 'imposter'::public.player_role THEN
      v_outcome := 'imposters_caught';
    ELSE
      v_outcome := 'imposters_win';
    END IF;
  END IF;

  -- ── Commit ────────────────────────────────────────────────────────────────

  INSERT INTO public.round_results
    (game_id, round, eliminated_player_id, eliminated_role, tally)
  VALUES
    (p_game_id, v_round, v_voted_out_id, v_voted_out_role, v_tally)
  ON CONFLICT (game_id, round) DO NOTHING;

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
-- 6. advance_round — host opens the next round after an intermediate result
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.advance_round(
  p_game_id          uuid,
  p_host_secret_hash text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_room_id     uuid;
  v_host_id     uuid;
  v_stored_hash text;
  v_vote_state  public.vote_state;
  v_outcome     public.game_outcome;
BEGIN
  SELECT g.room_id, g.vote_state, g.outcome
  INTO   v_room_id, v_vote_state, v_outcome
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

  -- Idempotency: a double-tap after the round already advanced is a no-op.
  IF v_vote_state = 'none'::public.vote_state THEN
    RETURN;
  END IF;

  IF v_vote_state <> 'resolved'::public.vote_state OR v_outcome IS NOT NULL THEN
    RAISE EXCEPTION 'game has no round to advance' USING ERRCODE = 'P0001';
  END IF;

  UPDATE public.games
  SET    current_round        = current_round + 1,
         vote_state           = 'none',
         vote_request_count   = 0,
         vote_ends_at         = NULL,
         voted_out_player_id  = NULL,
         -- Fresh discussion timer slate for the new round.
         ends_at              = NULL,
         timer_paused_seconds = NULL
  WHERE  id = p_game_id;

  -- Players may call to vote again in the new round.
  DELETE FROM public.vote_requests
  WHERE  game_id = p_game_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.advance_round(uuid, text) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.advance_round(uuid, text) TO anon;

-- ─────────────────────────────────────────────────────────────────────────────
-- 7. declare_word_guessed — host ends a multi-mode game (imposters win)
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.declare_word_guessed(
  p_game_id          uuid,
  p_host_secret_hash text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_room_id     uuid;
  v_host_id     uuid;
  v_stored_hash text;
  v_outcome     public.game_outcome;
  v_config      jsonb;
BEGIN
  SELECT g.room_id, g.outcome, g.config_snapshot
  INTO   v_room_id, v_outcome, v_config
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

  IF COALESCE(v_config ->> 'round_mode', 'single') <> 'multi' THEN
    RAISE EXCEPTION 'word guessing only ends multi-round games'
      USING ERRCODE = 'P0001';
  END IF;

  -- Idempotent once the game already has a final outcome.
  IF v_outcome IS NOT NULL THEN
    RETURN;
  END IF;

  UPDATE public.games
  SET    vote_state   = 'resolved',
         outcome      = 'word_guessed',
         vote_ends_at = NULL
  WHERE  id = p_game_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.declare_word_guessed(uuid, text) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.declare_word_guessed(uuid, text) TO anon;

-- ─────────────────────────────────────────────────────────────────────────────
-- 8. get_round_results — resolution history for the result screens
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.get_round_results(p_game_id uuid)
RETURNS TABLE (
  round                  integer,
  eliminated_player_id   uuid,
  eliminated_player_name text,
  eliminated_role        public.player_role,
  tally                  jsonb
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_caller_id   uuid;
  v_show_counts boolean;
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

  SELECT COALESCE((config_snapshot ->> 'show_vote_counts')::boolean, true)
  INTO   v_show_counts
  FROM   public.games
  WHERE  id = p_game_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'game not found' USING ERRCODE = 'P0002';
  END IF;

  RETURN QUERY
  SELECT
    rr.round,
    rr.eliminated_player_id,
    pl.display_name AS eliminated_player_name,
    rr.eliminated_role,
    CASE WHEN v_show_counts THEN rr.tally ELSE '[]'::jsonb END AS tally
  FROM   public.round_results rr
  LEFT JOIN public.players pl ON pl.id = rr.eliminated_player_id
  WHERE  rr.game_id = p_game_id
  ORDER  BY rr.round;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.get_round_results(uuid) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.get_round_results(uuid) TO anon;

-- ─────────────────────────────────────────────────────────────────────────────
-- 9. get_game_result — only expose the final result (outcome stamped)
-- ─────────────────────────────────────────────────────────────────────────────
-- In multi mode an intermediate round is also vote_state = 'resolved' but has
-- outcome NULL; the full reveal (roles + word) must wait for the final round.

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
  v_outcome    public.game_outcome;
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

  SELECT g.vote_state, g.outcome
  INTO   v_vote_state, v_outcome
  FROM   public.games g
  WHERE  g.id = p_game_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'game not found' USING ERRCODE = 'P0002';
  END IF;

  IF v_vote_state != 'resolved'::public.vote_state OR v_outcome IS NULL THEN
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
