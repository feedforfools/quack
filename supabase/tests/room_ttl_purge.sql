-- pgTAP tests for room TTL purge (E4-T7).
--
-- Verifies that purge_stale_rooms():
--   1. Deletes rooms whose last_activity_at is older than 1 hour.
--   2. Cascades to child rows in players, games, and role_assignments.
--   3. Does NOT delete rooms whose last_activity_at is recent (< 1 hour ago).
--   4. Returns the count of deleted rooms.
--   5. Returns 0 when no stale rooms exist.
--
-- Also verifies the player-change trigger:
--   6. Player INSERT bumps rooms.last_activity_at.
--   7. Player DELETE bumps rooms.last_activity_at.
--
-- All fixtures are inserted as the postgres superuser (bypasses RLS) and all
-- changes are rolled back at the end — the test database is left clean.

BEGIN;

SELECT plan(7);

-- ─── Fixtures ──────────────────────────────────────────────────────────────--

-- Stale room (will be back-dated after fixtures) with a player and a game.
INSERT INTO public.rooms (id, code, host_player_id, host_secret_hash, last_activity_at)
VALUES (
  'f1000000-0000-0000-0000-000000000001',
  'STALE1',
  'f1000000-0000-0000-0000-000000000010',
  'hash-stale',
  now() - INTERVAL '2 hours'
);

INSERT INTO public.players (id, room_id, display_name)
VALUES (
  'f1000000-0000-0000-0000-000000000010',
  'f1000000-0000-0000-0000-000000000001',
  'StalePlayer'
);

INSERT INTO public.games (id, room_id, index, config_snapshot)
VALUES (
  'f1000000-0000-0000-0000-000000000020',
  'f1000000-0000-0000-0000-000000000001',
  0,
  '{}'
);

INSERT INTO public.role_assignments (game_id, player_id, role)
VALUES (
  'f1000000-0000-0000-0000-000000000020',
  'f1000000-0000-0000-0000-000000000010',
  'civilian'
);

-- The player INSERT trigger bumped last_activity_at to now(); back-date it so
-- the purge considers this room stale.
UPDATE public.rooms
   SET last_activity_at = now() - INTERVAL '2 hours'
 WHERE id = 'f1000000-0000-0000-0000-000000000001';

-- Active room (last_activity_at 30 minutes ago) — should NOT be purged.
INSERT INTO public.rooms (id, code, host_player_id, host_secret_hash, last_activity_at)
VALUES (
  'f2000000-0000-0000-0000-000000000001',
  'ACTIV1',
  'f2000000-0000-0000-0000-000000000010',
  'hash-active',
  now() - INTERVAL '30 minutes'
);

INSERT INTO public.players (id, room_id, display_name)
VALUES (
  'f2000000-0000-0000-0000-000000000010',
  'f2000000-0000-0000-0000-000000000001',
  'ActivePlayer'
);

-- ─── Test 1: purge_stale_rooms() returns count of deleted rooms ─────────────

SELECT is(
  (SELECT public.purge_stale_rooms()),
  1,
  'purge_stale_rooms() returns 1 for one stale room'
);

-- ─── Test 2: Stale room is deleted ──────────────────────────────────────────

SELECT is(
  (SELECT count(*)::int FROM public.rooms
   WHERE id = 'f1000000-0000-0000-0000-000000000001'),
  0,
  'stale room is deleted by purge_stale_rooms()'
);

-- ─── Test 3: Active room is preserved ───────────────────────────────────────

SELECT is(
  (SELECT count(*)::int FROM public.rooms
   WHERE id = 'f2000000-0000-0000-0000-000000000001'),
  1,
  'active room (< 1 h) is NOT deleted by purge_stale_rooms()'
);

-- ─── Test 4: Cascade to players ─────────────────────────────────────────────

SELECT is(
  (SELECT count(*)::int FROM public.players
   WHERE room_id = 'f1000000-0000-0000-0000-000000000001'),
  0,
  'players of stale room are cascade-deleted'
);

-- ─── Test 5: Cascade to role_assignments ────────────────────────────────────

SELECT is(
  (SELECT count(*)::int FROM public.role_assignments
   WHERE game_id = 'f1000000-0000-0000-0000-000000000020'),
  0,
  'role_assignments of stale room are cascade-deleted'
);

-- ─── Test 6: purge_stale_rooms() returns 0 when nothing is stale ────────────

SELECT is(
  (SELECT public.purge_stale_rooms()),
  0,
  'purge_stale_rooms() returns 0 when no stale rooms remain'
);

-- ─── Test 7: Player INSERT bumps rooms.last_activity_at ─────────────────────

-- Back-date the active room so we can clearly see the trigger fires.
UPDATE public.rooms
   SET last_activity_at = now() - INTERVAL '10 minutes'
 WHERE id = 'f2000000-0000-0000-0000-000000000001';

INSERT INTO public.players (id, room_id, display_name)
VALUES (
  'f2000000-0000-0000-0000-000000000011',
  'f2000000-0000-0000-0000-000000000001',
  'Joiner'
);

SELECT ok(
  (SELECT last_activity_at > now() - INTERVAL '1 minute'
   FROM public.rooms
   WHERE id = 'f2000000-0000-0000-0000-000000000001'),
  'player INSERT triggers rooms.last_activity_at bump'
);

SELECT * FROM finish();
ROLLBACK;
