-- pgTAP tests for transfer_host and end_room_as_host RPCs (E2.5-T2).
-- Run with: supabase test db
--
-- Strategy: insert fixtures as postgres (bypasses RLS), then call the RPCs
-- as the anon role with the x-device-id header set via set_config(). Tests
-- for the success paths verify DB state after the call. Everything rolls back.
--
-- Test UUIDs (distinct from rls_rooms_players.sql to avoid conflicts):
--   Room R1 (Alice+Bob):  d1000000-0000-0000-0000-000000000000
--   Room R2 (Charlie):    d2000000-0000-0000-0000-000000000000
--   Alice  (host of R1):  e1000000-0000-0000-0000-000000000000
--   Bob    (member R1):   e2000000-0000-0000-0000-000000000000
--   Charlie (host of R2): e3000000-0000-0000-0000-000000000000
--   Non-member:           e9000000-0000-0000-0000-000000000000

BEGIN;

SELECT plan(8);

-- ─── Fixtures (superuser, bypasses RLS) ──────────────────────────────────────

INSERT INTO public.rooms (id, code, host_player_id, host_secret_hash)
VALUES
  ('d1000000-0000-0000-0000-000000000000', 'RRRSSS',
   'e1000000-0000-0000-0000-000000000000', 'hash-alice'),
  ('d2000000-0000-0000-0000-000000000000', 'TTTUVV',
   'e3000000-0000-0000-0000-000000000000', 'hash-charlie');

INSERT INTO public.players (id, room_id, display_name)
VALUES
  ('e1000000-0000-0000-0000-000000000000',
   'd1000000-0000-0000-0000-000000000000', 'Alice'),
  ('e2000000-0000-0000-0000-000000000000',
   'd1000000-0000-0000-0000-000000000000', 'Bob'),
  ('e3000000-0000-0000-0000-000000000000',
   'd2000000-0000-0000-0000-000000000000', 'Charlie');

-- ─── 1. transfer_host rejects a wrong host secret ────────────────────────────

SELECT set_config('request.headers',
  '{"x-device-id":"e1000000-0000-0000-0000-000000000000"}', true);
SET ROLE anon;
SELECT throws_ok(
  $$SELECT public.transfer_host(
      'd1000000-0000-0000-0000-000000000000',
      'wrong-hash',
      'e2000000-0000-0000-0000-000000000000',
      'new-hash-bob')$$,
  '42501',
  NULL,
  'transfer_host rejects an invalid host secret'
);
RESET ROLE;

-- ─── 2. transfer_host rejects a successor not in the room ────────────────────

SELECT set_config('request.headers',
  '{"x-device-id":"e1000000-0000-0000-0000-000000000000"}', true);
SET ROLE anon;
SELECT throws_ok(
  $$SELECT public.transfer_host(
      'd1000000-0000-0000-0000-000000000000',
      'hash-alice',
      'e9000000-0000-0000-0000-000000000000',
      'new-hash-stranger')$$,
  'P0002',
  NULL,
  'transfer_host rejects a successor who is not in the room'
);
RESET ROLE;

-- ─── 3. transfer_host succeeds with valid params ──────────────────────────────

SELECT set_config('request.headers',
  '{"x-device-id":"e1000000-0000-0000-0000-000000000000"}', true);
SET ROLE anon;
SELECT lives_ok(
  $$SELECT public.transfer_host(
      'd1000000-0000-0000-0000-000000000000',
      'hash-alice',
      'e2000000-0000-0000-0000-000000000000',
      'new-hash-bob')$$,
  'transfer_host succeeds with valid host secret and in-room successor'
);
RESET ROLE;

-- ─── 3a. After transfer: room host is now Bob ─────────────────────────────────

SELECT is(
  (SELECT host_player_id FROM public.rooms
   WHERE  id = 'd1000000-0000-0000-0000-000000000000'),
  'e2000000-0000-0000-0000-000000000000'::uuid,
  'after transfer_host, host_player_id is updated to the successor'
);

-- ─── 3b. After transfer: Alice (leaving host) is removed from players ─────────

SELECT is(
  (SELECT count(*)::int FROM public.players
   WHERE  id      = 'e1000000-0000-0000-0000-000000000000'
     AND  room_id = 'd1000000-0000-0000-0000-000000000000'),
  0,
  'after transfer_host, the leaving host is removed from the players table'
);

-- ─── 4. end_room_as_host rejects a wrong host secret ─────────────────────────

SELECT set_config('request.headers',
  '{"x-device-id":"e3000000-0000-0000-0000-000000000000"}', true);
SET ROLE anon;
SELECT throws_ok(
  $$SELECT public.end_room_as_host(
      'd2000000-0000-0000-0000-000000000000',
      'wrong-hash')$$,
  '42501',
  NULL,
  'end_room_as_host rejects an invalid host secret'
);
RESET ROLE;

-- ─── 5. end_room_as_host succeeds for the valid host ─────────────────────────

SELECT set_config('request.headers',
  '{"x-device-id":"e3000000-0000-0000-0000-000000000000"}', true);
SET ROLE anon;
SELECT lives_ok(
  $$SELECT public.end_room_as_host(
      'd2000000-0000-0000-0000-000000000000',
      'hash-charlie')$$,
  'end_room_as_host succeeds with valid host secret'
);
RESET ROLE;

-- ─── 5a. After end: room R2 is deleted (cascade removes players too) ──────────

SELECT is(
  (SELECT count(*)::int FROM public.rooms
   WHERE  id = 'd2000000-0000-0000-0000-000000000000'),
  0,
  'after end_room_as_host, the rooms row is deleted'
);

SELECT * FROM finish();
ROLLBACK;
