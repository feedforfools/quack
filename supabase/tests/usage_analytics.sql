-- pgTAP tests for usage analytics (E7-T1).
--
-- Verifies:
--   1.  bump_metric() increments daily_stats for a whitelisted metric.
--   2.  bump_metric() with a non-whitelisted metric is silently ignored
--       (no row written to daily_stats).
--   3.  add_metric() accumulates correctly (double-call on same day merges).
--   4.  trg_count_rooms_created fires on room INSERT.
--   5.  trg_count_games_started fires on game INSERT.
--   6.  touch_room_on_player_change updates peak_players on INSERT.
--   7.  peak_players is a high-water mark (does not decrease on DELETE).
--   8.  purge_stale_rooms accumulates player_sessions before deleting.
--   9.  purge_stale_rooms marks rooms_abandoned for lobby-state rooms.
--  10.  purge_stale_rooms accumulates room_lifetime_seconds_total.
--  11.  purge_stale_rooms does not write zero rows when no stale rooms exist.
--
-- All fixtures are inserted as the postgres superuser (bypasses RLS).
-- Everything is rolled back at end — the test database is left clean.

BEGIN;

SELECT plan(11);

-- ─── Helper: read a specific daily_stats counter ────────────────────────────

CREATE OR REPLACE FUNCTION _test_stat(p_metric text)
RETURNS bigint
LANGUAGE sql
AS $$
  SELECT COALESCE(
    (SELECT count FROM public.daily_stats
      WHERE day = current_date AND metric = p_metric),
    0
  );
$$;

-- ─── Fixtures: shared rooms used across multiple tests ────────────────────────

-- Room A: will be kept alive (not purged)
INSERT INTO public.rooms (id, code, host_player_id, host_secret_hash)
VALUES (
  'a0000000-0000-0000-0000-000000000001',
  'TESTA1',
  'a0000000-0000-0000-0000-000000000010',
  'hash-a'
);

-- Room B: will be made stale; has a player and a game (played, not abandoned)
INSERT INTO public.rooms (id, code, host_player_id, host_secret_hash)
VALUES (
  'b0000000-0000-0000-0000-000000000001',
  'TESTB1',
  'b0000000-0000-0000-0000-000000000010',
  'hash-b'
);

-- Room C: will be made stale; stays in lobby state (rooms_abandoned)
INSERT INTO public.rooms (id, code, host_player_id, host_secret_hash)
VALUES (
  'c0000000-0000-0000-0000-000000000001',
  'TESTC1',
  'c0000000-0000-0000-0000-000000000010',
  'hash-c'
);

-- Wipe any rooms_created increments from the fixture INSERTs above so the
-- tests that check rooms_created start from a known baseline.
DELETE FROM public.daily_stats WHERE metric IN ('rooms_created', 'games_started');

-- ─── Test 1: bump_metric() increments for a whitelisted metric ───────────────

SELECT is(
  _test_stat('new_devices'),
  0::bigint,
  'new_devices starts at 0'
);

SELECT public.bump_metric('new_devices');

-- After one call the count should be 1.  We use a separate SELECT rather than
-- calling _test_stat again inside is() to make the assertion value clear.
SELECT is(
  _test_stat('new_devices'),
  1::bigint,
  'bump_metric increments new_devices to 1'
);

-- ─── Test 2: bump_metric() silently ignores non-whitelisted metrics ──────────

SELECT public.bump_metric('evil_metric');

SELECT is(
  (SELECT count(*) FROM public.daily_stats WHERE metric = 'evil_metric')::bigint,
  0::bigint,
  'non-whitelisted metric produces no row in daily_stats'
);

-- ─── Test 3: add_metric() merges on conflict (idempotent accumulation) ───────

SELECT public.add_metric('rooms_created', 5, current_date);
SELECT public.add_metric('rooms_created', 3, current_date);

SELECT is(
  _test_stat('rooms_created'),
  8::bigint,
  'add_metric accumulates: 5 + 3 = 8'
);

-- ─── Test 4: trg_count_rooms_created fires on room INSERT ────────────────────
-- Reset counter; then create a new room to trigger the increment.

DELETE FROM public.daily_stats WHERE metric = 'rooms_created';

INSERT INTO public.rooms (id, code, host_player_id, host_secret_hash)
VALUES (
  'd0000000-0000-0000-0000-000000000001',
  'TESTD1',
  'd0000000-0000-0000-0000-000000000010',
  'hash-d'
);

SELECT is(
  _test_stat('rooms_created'),
  1::bigint,
  'trg_count_rooms_created increments rooms_created on INSERT'
);

-- ─── Test 5: trg_count_games_started fires on game INSERT ────────────────────

DELETE FROM public.daily_stats WHERE metric = 'games_started';

INSERT INTO public.games (id, room_id, index, config_snapshot)
VALUES (
  'b0000000-0000-0000-0000-000000000020',
  'b0000000-0000-0000-0000-000000000001',
  1,
  '{}'
);

SELECT is(
  _test_stat('games_started'),
  1::bigint,
  'trg_count_games_started increments games_started on game INSERT'
);

-- ─── Test 6: peak_players is maintained on player INSERT ─────────────────────

-- Room A has no players yet; insert two and verify the peak reflects the max.

INSERT INTO public.players (id, room_id, display_name)
VALUES ('a0000000-0000-0000-0000-000000000011', 'a0000000-0000-0000-0000-000000000001', 'P1');

INSERT INTO public.players (id, room_id, display_name)
VALUES ('a0000000-0000-0000-0000-000000000012', 'a0000000-0000-0000-0000-000000000001', 'P2');

SELECT is(
  (SELECT peak_players FROM public.rooms WHERE id = 'a0000000-0000-0000-0000-000000000001'),
  2,
  'peak_players reaches 2 after two players join'
);

-- ─── Test 7: peak_players does not decrease when a player leaves ─────────────

DELETE FROM public.players
 WHERE id = 'a0000000-0000-0000-0000-000000000012'
   AND room_id = 'a0000000-0000-0000-0000-000000000001';

SELECT is(
  (SELECT peak_players FROM public.rooms WHERE id = 'a0000000-0000-0000-0000-000000000001'),
  2,
  'peak_players stays at 2 after a player leaves (high-water mark)'
);

-- ─── Tests 8 & 9: purge_stale_rooms accumulates analytics ────────────────────
-- Set up Room B (has a game, not lobby) and Room C (lobby, abandoned) as stale.
-- Room A remains active (< 1 hour).

-- Give Room B one player (peak_players will be 1 via trigger).
INSERT INTO public.players (id, room_id, display_name)
VALUES ('b0000000-0000-0000-0000-000000000010', 'b0000000-0000-0000-0000-000000000001', 'BPlayer');

-- Room B already has a game row (inserted in test 5); update state to reflect
-- a round has started/ended so it is NOT considered abandoned.
UPDATE public.rooms SET state = 'round_ended' WHERE id = 'b0000000-0000-0000-0000-000000000001';

-- Back-date both stale rooms so purge_stale_rooms picks them up.  created_at is
-- set 3h ago and last_activity_at 2h ago, giving each room a known 1-hour
-- lifetime (now() is constant within a statement, so the delta is exactly
-- INTERVAL '1 hour' = 3600s).  This makes room_lifetime_seconds_total
-- deterministic for test 10.
UPDATE public.rooms
   SET created_at       = now() - INTERVAL '3 hours',
       last_activity_at = now() - INTERVAL '2 hours'
 WHERE id IN (
   'b0000000-0000-0000-0000-000000000001',
   'c0000000-0000-0000-0000-000000000001'
 );

-- Wipe any earlier analytics so we can assert on the purge increments cleanly.
DELETE FROM public.daily_stats
 WHERE metric IN ('player_sessions', 'room_lifetime_seconds_total',
                  'rooms_purged', 'rooms_abandoned');

SELECT public.purge_stale_rooms();

-- Test 8: player_sessions = sum of peak_players across purged rooms.
-- Room B has peak_players = 1 (one player joined via trigger above).
-- Room C has peak_players = 0 (no players ever joined the lobby room).
SELECT is(
  _test_stat('player_sessions'),
  1::bigint,
  'purge accumulates player_sessions = sum of peak_players (1 + 0 = 1)'
);

-- Test 9: rooms_abandoned = rooms still in lobby at purge time.
-- Room C is in lobby; Room B was advanced to round_ended.
SELECT is(
  _test_stat('rooms_abandoned'),
  1::bigint,
  'purge counts rooms_abandoned = 1 (only lobby-state Room C)'
);

-- Test 10: room_lifetime_seconds_total = sum of (last_activity_at - created_at)
-- across purged rooms.  Both Room B and Room C were given a 1-hour lifetime
-- above, so the total is 2 * 3600 = 7200 seconds.
SELECT is(
  _test_stat('room_lifetime_seconds_total'),
  7200::bigint,
  'purge accumulates room_lifetime_seconds_total = 7200 (2 rooms x 3600s)'
);

-- Test 11: purge on an already-clean DB does not write zero rows.
-- After the purge above both stale rooms are gone; running again should be a no-op.
DELETE FROM public.daily_stats WHERE metric IN (
  'player_sessions', 'room_lifetime_seconds_total', 'rooms_purged', 'rooms_abandoned'
);

SELECT public.purge_stale_rooms();

SELECT is(
  (SELECT count(*) FROM public.daily_stats
    WHERE metric IN ('player_sessions', 'room_lifetime_seconds_total',
                     'rooms_purged', 'rooms_abandoned'))::bigint,
  0::bigint,
  'purge writes no zero rows when nothing is stale'
);

SELECT * FROM finish();
ROLLBACK;
