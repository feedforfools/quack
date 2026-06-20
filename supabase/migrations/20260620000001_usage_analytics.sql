-- E7-T1: Privacy-preserving usage analytics.
--
-- Overview
-- ────────
-- All analytics are stored as aggregate counters — no device UUIDs or player
-- identifiers are ever written here.  The privacy posture mirrors the rest of
-- the schema: anon can call a narrow, whitelisted RPC; everything else is
-- SECURITY DEFINER or inaccessible to the client.
--
-- 1. daily_stats table              — (day, metric) → count; append-only.
-- 2. add_metric()                   — internal atomic counter upsert; not
--                                     callable by anon/authenticated directly.
-- 3. bump_metric()                  — anon-callable, whitelisted; fires from
--                                     the client on first device mint only.
-- 4. rooms.peak_players column      — per-room peak concurrent player count,
--                                     maintained by an extended
--                                     touch_room_on_player_change trigger.
-- 5. trg_count_rooms_created        — AFTER INSERT on rooms → rooms_created.
-- 6. trg_count_games_started        — AFTER INSERT on games → games_started.
-- 7. purge_stale_rooms() extended   — accumulates player_sessions,
--                                     room_lifetime_seconds_total, rooms_purged,
--                                     rooms_abandoned before deleting stale rooms.

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. daily_stats — append-only counter table
-- ─────────────────────────────────────────────────────────────────────────────
--
-- Each row is a (day, metric) pair; count is atomically incremented via the
-- add_metric() UPSERT below.  There is intentionally no DELETE path for this
-- table — the purge job must never touch it; historical data is the asset.
--
-- Direct access is intentionally denied to anon/authenticated: RLS is enabled
-- with no permissive policies.  All reads are via the Supabase dashboard or
-- the service-role key held by the founder's tooling.

CREATE TABLE public.daily_stats (
  day    date   NOT NULL,
  metric text   NOT NULL,
  count  bigint NOT NULL DEFAULT 0,
  PRIMARY KEY (day, metric)
);

-- Enable RLS immediately.  No policies are added, so the effective posture is
-- deny-all for anon and authenticated.  Service-role bypasses RLS and can read
-- freely from the dashboard or reporting queries.
ALTER TABLE public.daily_stats ENABLE ROW LEVEL SECURITY;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. add_metric() — internal atomic counter upsert
-- ─────────────────────────────────────────────────────────────────────────────
--
-- Called only from:
--   • bump_metric()             (which IS callable by anon, but only for
--                                whitelisted metrics)
--   • trg_count_rooms_created   (trigger runs as definer)
--   • trg_count_games_started   (trigger runs as definer)
--   • purge_stale_rooms()       (SECURITY DEFINER)
--
-- p_day defaults to current_date so callers that do not care about back-dating
-- can omit it; purge_stale_rooms passes current_date explicitly for clarity.

CREATE OR REPLACE FUNCTION public.add_metric(
  p_metric text,
  p_amount bigint,
  p_day    date DEFAULT current_date
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  INSERT INTO public.daily_stats (day, metric, count)
  VALUES (p_day, p_metric, p_amount)
  ON CONFLICT (day, metric)
  DO UPDATE SET count = public.daily_stats.count + excluded.count;
END;
$$;

-- Not callable by anon or authenticated directly.  Triggers and SECURITY
-- DEFINER functions run as their owner, so they do not need an explicit grant.
REVOKE EXECUTE ON FUNCTION public.add_metric(text, bigint, date) FROM PUBLIC;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. bump_metric() — anon-callable, whitelisted metric increment
-- ─────────────────────────────────────────────────────────────────────────────
--
-- The client fires this RPC once per device lifetime (on first UUID mint).
-- The whitelist ensures a malicious caller cannot pollute server-side counters
-- with arbitrary metric names: any non-whitelisted metric is silently ignored
-- (rather than raised as an error) so a future client-version mismatch does
-- not surface an error toast.
--
-- Allowed metrics:
--   'new_devices'  — fired by useDeviceId on first mint; one per browser profile.

CREATE OR REPLACE FUNCTION public.bump_metric(p_metric text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  -- Whitelist gate: silently ignore any metric not on the approved list.
  -- Add new client-facing metrics here as the product grows.  Entries MUST be
  -- fixed string literals, never client-derived values — this is what bounds
  -- daily_stats growth (one row per metric per day) and keeps anon from
  -- inflating arbitrary counters.
  IF p_metric NOT IN ('new_devices') THEN
    RETURN;
  END IF;

  PERFORM public.add_metric(p_metric, 1);
END;
$$;

-- Callable by unauthenticated (anon) clients and authenticated users.
REVOKE EXECUTE ON FUNCTION public.bump_metric(text) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.bump_metric(text) TO anon;
GRANT  EXECUTE ON FUNCTION public.bump_metric(text) TO authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. rooms.peak_players — per-room peak concurrent player count
-- ─────────────────────────────────────────────────────────────────────────────
--
-- Maintained by touch_room_on_player_change (extended below) on every INSERT
-- into players.  Read by purge_stale_rooms to accumulate player_sessions
-- before the room is deleted.

ALTER TABLE public.rooms
  ADD COLUMN peak_players int NOT NULL DEFAULT 0;

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. touch_room_on_player_change() — extended to maintain peak_players
-- ─────────────────────────────────────────────────────────────────────────────
--
-- Original behaviour (from 20260501000003_room_ttl_purge.sql):
--   bump rooms.last_activity_at on INSERT and DELETE from players.
--
-- New behaviour added here:
--   on INSERT only, also set peak_players = GREATEST(peak_players, current
--   player count for that room).  The sub-select counts AFTER the row is
--   inserted (AFTER trigger), so it already includes the new player.
--
-- DELETE path is unchanged: a player leaving does not reduce peak_players
-- because peak is a high-water mark, not a live count.

CREATE OR REPLACE FUNCTION public.touch_room_on_player_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_room_id     uuid;
  v_player_count bigint;
BEGIN
  -- For INSERT the new row carries room_id; for DELETE the old row does.
  IF TG_OP = 'DELETE' THEN
    v_room_id := OLD.room_id;
  ELSE
    v_room_id := NEW.room_id;
  END IF;

  IF TG_OP = 'INSERT' THEN
    -- Count all players currently in the room (includes the just-inserted row
    -- because this is an AFTER trigger).
    -- Note: under READ COMMITTED, two simultaneous joins can each miss the
    -- other's uncommitted row, so peak_players is a best-effort high-water mark
    -- that may slightly undercount on concurrent joins.  Acceptable for an
    -- analytics-only metric; do not rely on it as an exact concurrency figure.
    SELECT COUNT(*)
      INTO v_player_count
      FROM public.players
     WHERE room_id = v_room_id;

    UPDATE public.rooms
       SET last_activity_at = now(),
           peak_players      = GREATEST(peak_players, v_player_count)
     WHERE id = v_room_id;
  ELSE
    -- DELETE path: bump last_activity_at only; peak_players is a high-water mark.
    UPDATE public.rooms
       SET last_activity_at = now()
     WHERE id = v_room_id;
  END IF;

  RETURN NULL; -- AFTER trigger; return value is ignored
END;
$$;

-- The trigger definition itself (trg_touch_room_on_player_change) was created
-- in 20260501000003 and does not need to be re-created; CREATE OR REPLACE on
-- the function above is sufficient.

-- ─────────────────────────────────────────────────────────────────────────────
-- 6. rooms_created counter — AFTER INSERT trigger on rooms
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.count_room_created()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  PERFORM public.add_metric('rooms_created', 1);
  RETURN NULL; -- AFTER trigger; return value is ignored
END;
$$;

REVOKE EXECUTE ON FUNCTION public.count_room_created() FROM PUBLIC;

DROP TRIGGER IF EXISTS trg_count_rooms_created ON public.rooms;
CREATE TRIGGER trg_count_rooms_created
  AFTER INSERT ON public.rooms
  FOR EACH ROW
  EXECUTE FUNCTION public.count_room_created();

-- ─────────────────────────────────────────────────────────────────────────────
-- 7. games_started counter — AFTER INSERT trigger on games
-- ─────────────────────────────────────────────────────────────────────────────
--
-- Instrumentation choice: AFTER INSERT on games.
--
-- Each row in public.games represents one started round/game — the INSERT
-- happens inside start_game() immediately before roles are assigned and the
-- room state flips to 'round_active'.  This is the lowest-touch, most
-- accurate signal for "a game started".  A state-transition approach (watching
-- rooms.state flip to 'round_active') would require an UPDATE trigger and a
-- careful check that the previous state was 'lobby', which is more complex for
-- no additional accuracy.
--
-- Granularity: games_started counts one per games row, i.e. one per start_game()
-- call.  In multi-round mode the round counter is advanced by advance_round()
-- via UPDATE games SET current_round = current_round + 1 (no new row), so a
-- multi-round game still counts as ONE started game regardless of how many
-- rounds it runs.  If per-round counting is ever wanted, instrument
-- advance_round() instead — do not change this trigger.

CREATE OR REPLACE FUNCTION public.count_game_started()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  PERFORM public.add_metric('games_started', 1);
  RETURN NULL; -- AFTER trigger; return value is ignored
END;
$$;

REVOKE EXECUTE ON FUNCTION public.count_game_started() FROM PUBLIC;

DROP TRIGGER IF EXISTS trg_count_games_started ON public.games;
CREATE TRIGGER trg_count_games_started
  AFTER INSERT ON public.games
  FOR EACH ROW
  EXECUTE FUNCTION public.count_game_started();

-- ─────────────────────────────────────────────────────────────────────────────
-- 8. purge_stale_rooms() — extended to accumulate analytics before deletion
-- ─────────────────────────────────────────────────────────────────────────────
--
-- Original behaviour (from 20260501000003_room_ttl_purge.sql):
--   DELETE rooms WHERE last_activity_at < now() - 1 hour; return count.
--
-- New behaviour added here (delete and account in one statement):
--   1. Delete the stale rooms with DELETE … RETURNING and aggregate analytics
--      over EXACTLY the returned rows.  Driving the accounting off the deleted
--      set (rather than a separate same-predicate SELECT) closes the race
--      window entirely: because now() is evaluated once and both the deletion
--      and the aggregation come from the same statement, a concurrent
--      last_activity_at bump can never cause a room to be counted-but-not-
--      deleted or deleted-but-not-counted.
--   2. Accumulate into daily_stats (all on current_date):
--        player_sessions               += SUM(peak_players)
--        room_lifetime_seconds_total   += SUM(EXTRACT(EPOCH FROM (last_activity_at - created_at)))
--        rooms_purged                  += COUNT(*)
--        rooms_abandoned               += COUNT(*) WHERE state = 'lobby'
--      "abandoned" = room was created but no game was ever started, i.e. the
--      room is still in 'lobby' state at purge time.  The 'round_active' and
--      'round_ended' states both imply at least one game row was inserted.
--      rooms_played is derivable as (rooms_purged − rooms_abandoned) so we do
--      not store it explicitly (avoids a redundant counter that can drift).
--   3. Skip add_metric calls when nothing was purged (no rows to aggregate).
--   4. Return the deleted count as before.
--
-- Note: add_metric is called once per metric with a set-based aggregate rather
-- than once per room, so the purge job scales to large batches without per-row
-- function overhead.

CREATE OR REPLACE FUNCTION public.purge_stale_rooms()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_deleted                    integer;
  v_player_sessions            bigint;
  v_lifetime_seconds_total     bigint;
  v_rooms_abandoned            bigint;
BEGIN
  -- ── Step 1: delete the stale rooms and aggregate over the deleted set ─────
  -- DELETE … RETURNING gives us the exact rows removed; aggregating over them
  -- guarantees the accounting matches the deletion with no race window.
  -- EXTRACT(EPOCH …) returns double precision; cast to bigint truncates to the
  -- nearest second, which is fine for a lifetime counter.

  WITH deleted AS (
    DELETE FROM public.rooms
     WHERE last_activity_at < now() - INTERVAL '1 hour'
    RETURNING peak_players, created_at, last_activity_at, state
  )
  SELECT
    COUNT(*)::integer,
    COALESCE(SUM(peak_players), 0)::bigint,
    COALESCE(SUM(
      EXTRACT(EPOCH FROM (last_activity_at - created_at))::bigint
    ), 0)::bigint,
    COUNT(*) FILTER (WHERE state = 'lobby')::bigint
  INTO
    v_deleted,
    v_player_sessions,
    v_lifetime_seconds_total,
    v_rooms_abandoned
  FROM deleted;

  -- ── Step 2: write analytics (skip if nothing was purged) ─────────────────
  -- Avoid writing zero-valued rows to daily_stats on quiet runs.

  IF v_deleted > 0 THEN
    PERFORM public.add_metric('player_sessions',             v_player_sessions,        current_date);
    PERFORM public.add_metric('room_lifetime_seconds_total', v_lifetime_seconds_total, current_date);
    PERFORM public.add_metric('rooms_purged',                v_deleted::bigint,        current_date);
    PERFORM public.add_metric('rooms_abandoned',             v_rooms_abandoned,        current_date);
  END IF;

  RETURN v_deleted;
END;
$$;

-- Not callable by anon/authenticated — internal maintenance only (pg_cron).
REVOKE ALL ON FUNCTION public.purge_stale_rooms() FROM PUBLIC;
