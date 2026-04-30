-- pgTAP RLS policy tests for rooms and players tables (E2-T2).
-- Run with: supabase test db
--
-- Strategy: insert fixtures as the postgres superuser (bypasses RLS), then
-- switch to the anon role and set the x-device-id request header via
-- set_config() to simulate individual client requests. All changes are rolled
-- back at the end — the test database is left unmodified.
--
-- Test UUIDs:
--   Room 1  (Alice's room):  a1000000-0000-0000-0000-000000000000
--   Room 2  (Bob's room):    a2000000-0000-0000-0000-000000000000
--   Alice   (host of R1):    b1000000-0000-0000-0000-000000000000
--   Bob     (host of R2):    b2000000-0000-0000-0000-000000000000
--   Non-member device:       b9000000-0000-0000-0000-000000000000

BEGIN;

SELECT plan(13);

-- ─── Fixtures (superuser, bypasses RLS) ──────────────────────────────────────

INSERT INTO public.rooms (id, code, host_player_id, host_secret_hash)
VALUES
  ('a1000000-0000-0000-0000-000000000000', 'AAABBB',
   'b1000000-0000-0000-0000-000000000000', 'hash-alice'),
  ('a2000000-0000-0000-0000-000000000000', 'CCCDDD',
   'b2000000-0000-0000-0000-000000000000', 'hash-bob');

INSERT INTO public.players (id, room_id, display_name)
VALUES
  ('b1000000-0000-0000-0000-000000000000',
   'a1000000-0000-0000-0000-000000000000', 'Alice'),
  ('b2000000-0000-0000-0000-000000000000',
   'a2000000-0000-0000-0000-000000000000', 'Bob');

-- ─── 1. Member can SELECT their own room ──────────────────────────────────────

SELECT set_config('request.headers',
  '{"x-device-id":"b1000000-0000-0000-0000-000000000000"}', true);
SET ROLE anon;
SELECT is(
  (SELECT count(*)::int FROM public.rooms
   WHERE id = 'a1000000-0000-0000-0000-000000000000'),
  1,
  'member player can SELECT their own room'
);
RESET ROLE;

-- ─── 2. Any anon device can SELECT a room (rooms_select_public policy) ─────────
-- Migration 20260429000001 deliberately added USING(true) to rooms SELECT so
-- that joiners can look up a room by code before they have a players row.
-- The rooms table contains no PII; role assignments are protected separately.

SELECT set_config('request.headers',
  '{"x-device-id":"b1000000-0000-0000-0000-000000000000"}', true);
SET ROLE anon;
SELECT is(
  (SELECT count(*)::int FROM public.rooms
   WHERE id = 'a2000000-0000-0000-0000-000000000000'),
  1,
  'any anon device can SELECT any room (public join-flow lookup)'
);
RESET ROLE;

-- ─── 3. Request with no device-id can still SELECT rooms (join-flow requirement) ──
-- Joiners arrive without a players row; the public rooms policy lets them look
-- up a room by code. Players rows remain protected by the members-only policy.

SELECT set_config('request.headers', '{}', true);
SET ROLE anon;
SELECT is(
  (SELECT count(*)::int FROM public.rooms),
  2,
  'headerless request can SELECT rooms (public join-flow lookup permitted)'
);
RESET ROLE;

-- ─── 4. Device can INSERT a room with itself as host ──────────────────────────

SELECT set_config('request.headers',
  '{"x-device-id":"b9000000-0000-0000-0000-000000000000"}', true);
SET ROLE anon;
SELECT lives_ok(
  $$INSERT INTO public.rooms (id, code, host_player_id, host_secret_hash)
    VALUES ('a9000000-0000-0000-0000-000000000000', 'EEEFFF',
            'b9000000-0000-0000-0000-000000000000', 'hash-nonmember')$$,
  'device can INSERT a room with itself as host'
);
RESET ROLE;

-- ─── 5. Device cannot INSERT a room with a different host_player_id ──────────

SELECT set_config('request.headers',
  '{"x-device-id":"b9000000-0000-0000-0000-000000000000"}', true);
SET ROLE anon;
SELECT throws_ok(
  $$INSERT INTO public.rooms (id, code, host_player_id, host_secret_hash)
    VALUES ('aF000000-0000-0000-0000-000000000000', 'GGGHIJ',
            'bF000000-0000-0000-0000-000000000000', 'hash-forged')$$,
  '42501',
  NULL,
  'device cannot INSERT a room with a forged host_player_id'
);
RESET ROLE;

-- ─── 6. Host can UPDATE their own room ───────────────────────────────────────

SELECT set_config('request.headers',
  '{"x-device-id":"b1000000-0000-0000-0000-000000000000"}', true);
SET ROLE anon;
SELECT lives_ok(
  $$UPDATE public.rooms
    SET config = '{"language":"it"}'
    WHERE id = 'a1000000-0000-0000-0000-000000000000'$$,
  'host can UPDATE their own room config'
);
RESET ROLE;

-- ─── 7. Non-host UPDATE is silently filtered — data is unchanged ─────────────
-- Run the UPDATE as Alice (non-host of room 2), then verify as the superuser
-- that the config column was NOT modified (RLS silently filtered all rows).

SELECT set_config('request.headers',
  '{"x-device-id":"b1000000-0000-0000-0000-000000000000"}', true);
SET ROLE anon;
UPDATE public.rooms
SET config = '{"tampered":true}'
WHERE id = 'a2000000-0000-0000-0000-000000000000';
RESET ROLE;
SELECT is(
  (SELECT config FROM public.rooms
   WHERE id = 'a2000000-0000-0000-0000-000000000000'),
  '{}'::jsonb,
  'non-host UPDATE is silently filtered by RLS — row config is unchanged'
);

-- ─── 8. Member can SELECT the roster of their room ───────────────────────────

SELECT set_config('request.headers',
  '{"x-device-id":"b1000000-0000-0000-0000-000000000000"}', true);
SET ROLE anon;
SELECT is(
  (SELECT count(*)::int FROM public.players
   WHERE room_id = 'a1000000-0000-0000-0000-000000000000'),
  1,
  'member player can SELECT the roster of their room'
);
RESET ROLE;

-- ─── 9. Non-member cannot SELECT players in another room ─────────────────────

SELECT set_config('request.headers',
  '{"x-device-id":"b1000000-0000-0000-0000-000000000000"}', true);
SET ROLE anon;
SELECT is(
  (SELECT count(*)::int FROM public.players
   WHERE room_id = 'a2000000-0000-0000-0000-000000000000'),
  0,
  'non-member cannot SELECT players in another room'
);
RESET ROLE;

-- ─── 10. Device cannot INSERT a player row with a different id ───────────────

SELECT set_config('request.headers',
  '{"x-device-id":"b1000000-0000-0000-0000-000000000000"}', true);
SET ROLE anon;
SELECT throws_ok(
  $$INSERT INTO public.players (id, room_id, display_name)
    VALUES ('bF000000-0000-0000-0000-000000000000',
            'a1000000-0000-0000-0000-000000000000', 'Impersonator')$$,
  '42501',
  NULL,
  'device cannot INSERT a player row with a different device id'
);
RESET ROLE;

-- ─── 11. Player can DELETE their own row (Leave Room) ──────────────────────
-- Add a second player (Carol) to Alice's room so we can isolate the delete.

INSERT INTO public.players (id, room_id, display_name)
VALUES ('bC000000-0000-0000-0000-000000000000',
        'a1000000-0000-0000-0000-000000000000', 'Carol');

SELECT set_config('request.headers',
  '{"x-device-id":"bC000000-0000-0000-0000-000000000000"}', true);
SET ROLE anon;
SELECT lives_ok(
  $$DELETE FROM public.players
    WHERE id = 'bC000000-0000-0000-0000-000000000000'$$,
  'player can DELETE their own row'
);
RESET ROLE;

-- ─── 12. Player cannot DELETE another player's row ───────────────────────────

SELECT set_config('request.headers',
  '{"x-device-id":"b1000000-0000-0000-0000-000000000000"}', true);
SET ROLE anon;
-- Alice attempts to delete Bob's row — should be silently blocked (0 rows deleted).
DELETE FROM public.players
WHERE id = 'b2000000-0000-0000-0000-000000000000';
RESET ROLE;
SELECT is(
  (SELECT count(*)::int FROM public.players
   WHERE id = 'b2000000-0000-0000-0000-000000000000'),
  1,
  'player cannot DELETE another player''s row (RLS silently blocks it)'
);

-- ─── 13. Unique index prevents a device from joining a second room ───────────
-- Alice (b1) is already in room 1. Attempting to insert her into room 2 must
-- fail with 23505 (unique_violation) on the players_device_single_room index.

SELECT set_config('request.headers',
  '{"x-device-id":"b1000000-0000-0000-0000-000000000000"}', true);
SET ROLE anon;
SELECT throws_ok(
  $$INSERT INTO public.players (id, room_id, display_name)
    VALUES ('b1000000-0000-0000-0000-000000000000',
            'a2000000-0000-0000-0000-000000000000', 'Alice-dup')$$,
  '23505',
  NULL,
  'unique index prevents a device from being in two rooms simultaneously'
);
RESET ROLE;

SELECT * FROM finish();
ROLLBACK;
