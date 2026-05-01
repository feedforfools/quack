-- pgTAP RLS policy tests for games and role_assignments tables (E3-T1, renamed E3-T12).
-- Run with: supabase test db
--
-- Strategy: insert fixtures as the postgres superuser (bypasses RLS), then
-- switch to the anon role and set the x-device-id request header via
-- set_config() to simulate individual client requests. All changes are rolled
-- back — the test database is left unmodified.
--
-- Test UUIDs (distinct from rls_rooms_players.sql and host_leave_rpcs.sql):
--   Room 1 (Alice's room):  fa000000-0000-0000-0000-000000000000
--   Room 2 (Bob's room):    fb000000-0000-0000-0000-000000000000
--   Alice (host of R1):     ac000000-0000-0000-0000-000000000000
--   Bob   (host of R2):     ad000000-0000-0000-0000-000000000000
--   Game 1 (in R1):         bc000000-0000-0000-0000-000000000000
--   Game 2 (in R2):         bd000000-0000-0000-0000-000000000000

BEGIN;

SELECT plan(9);

-- ─── Fixtures (superuser, bypasses RLS) ──────────────────────────────────────

INSERT INTO public.rooms (id, code, host_player_id, host_secret_hash)
VALUES
  ('fa000000-0000-0000-0000-000000000000', 'FFFGGG',
   'ac000000-0000-0000-0000-000000000000', 'hash-alice'),
  ('fb000000-0000-0000-0000-000000000000', 'PPQRST',
   'ad000000-0000-0000-0000-000000000000', 'hash-bob');

INSERT INTO public.players (id, room_id, display_name)
VALUES
  ('ac000000-0000-0000-0000-000000000000',
   'fa000000-0000-0000-0000-000000000000', 'Alice'),
  ('ad000000-0000-0000-0000-000000000000',
   'fb000000-0000-0000-0000-000000000000', 'Bob');

INSERT INTO public.games (id, room_id, index, config_snapshot)
VALUES
  ('bc000000-0000-0000-0000-000000000000',
   'fa000000-0000-0000-0000-000000000000', 1, '{}'),
  ('bd000000-0000-0000-0000-000000000000',
   'fb000000-0000-0000-0000-000000000000', 1, '{}');

INSERT INTO public.role_assignments (game_id, player_id, role, word)
VALUES
  ('bc000000-0000-0000-0000-000000000000',
   'ac000000-0000-0000-0000-000000000000', 'civilian', 'apple'),
  ('bd000000-0000-0000-0000-000000000000',
   'ad000000-0000-0000-0000-000000000000', 'imposter', NULL);

-- ─── 1. Member can SELECT games for their room ────────────────────────────────

SELECT set_config('request.headers',
  '{"x-device-id":"ac000000-0000-0000-0000-000000000000"}', true);
SET ROLE anon;
SELECT is(
  (SELECT count(*)::int FROM public.games
   WHERE room_id = 'fa000000-0000-0000-0000-000000000000'),
  1,
  'member can SELECT games for their room'
);
RESET ROLE;

-- ─── 2. Non-member cannot SELECT games for another room ──────────────────────

SELECT set_config('request.headers',
  '{"x-device-id":"ac000000-0000-0000-0000-000000000000"}', true);
SET ROLE anon;
SELECT is(
  (SELECT count(*)::int FROM public.games
   WHERE room_id = 'fb000000-0000-0000-0000-000000000000'),
  0,
  'non-member cannot SELECT games for another room'
);
RESET ROLE;

-- ─── 3. Player can SELECT their own role_assignment row ──────────────────────

SELECT set_config('request.headers',
  '{"x-device-id":"ac000000-0000-0000-0000-000000000000"}', true);
SET ROLE anon;
SELECT is(
  (SELECT count(*)::int FROM public.role_assignments
   WHERE player_id = 'ac000000-0000-0000-0000-000000000000'),
  1,
  'player can SELECT their own role_assignment row'
);
RESET ROLE;

-- ─── 4. Player cannot SELECT another player's role_assignment row ─────────────

SELECT set_config('request.headers',
  '{"x-device-id":"ac000000-0000-0000-0000-000000000000"}', true);
SET ROLE anon;
SELECT is(
  (SELECT count(*)::int FROM public.role_assignments
   WHERE player_id = 'ad000000-0000-0000-0000-000000000000'),
  0,
  'player cannot SELECT another player role_assignment row'
);
RESET ROLE;

-- ─── 5. Request with no device-id header sees zero role_assignment rows ───────

SELECT set_config('request.headers', '{}', true);
SET ROLE anon;
SELECT is(
  (SELECT count(*)::int FROM public.role_assignments),
  0,
  'headerless request sees zero role_assignment rows'
);
RESET ROLE;

-- ─── 6. Player can UPDATE revealed_at on their own role_assignment row ────────

SELECT set_config('request.headers',
  '{"x-device-id":"ac000000-0000-0000-0000-000000000000"}', true);
SET ROLE anon;
UPDATE public.role_assignments
  SET revealed_at = now()
  WHERE player_id = 'ac000000-0000-0000-0000-000000000000';
SELECT is(
  (SELECT count(*)::int FROM public.role_assignments
   WHERE player_id = 'ac000000-0000-0000-0000-000000000000'
     AND revealed_at IS NOT NULL),
  1,
  'player can UPDATE revealed_at on their own role_assignment row'
);
RESET ROLE;

-- ─── 7. Player cannot UPDATE another player's role_assignment row ─────────────

SELECT set_config('request.headers',
  '{"x-device-id":"ac000000-0000-0000-0000-000000000000"}', true);
SET ROLE anon;
UPDATE public.role_assignments
  SET revealed_at = now()
  WHERE player_id = 'ad000000-0000-0000-0000-000000000000';
SELECT is(
  (SELECT count(*)::int FROM public.role_assignments
   WHERE player_id = 'ad000000-0000-0000-0000-000000000000'
     AND revealed_at IS NOT NULL),
  0,
  'player cannot UPDATE another player role_assignment row'
);
RESET ROLE;

-- ─── 8. Player cannot INSERT into games directly (no INSERT grant) ────────────

SELECT set_config('request.headers',
  '{"x-device-id":"ac000000-0000-0000-0000-000000000000"}', true);
SET ROLE anon;
SELECT throws_ok(
  $$INSERT INTO public.games (room_id, index, config_snapshot)
    VALUES ('fa000000-0000-0000-0000-000000000000', 99, '{}')$$,
  '42501',
  NULL,
  'anon cannot INSERT into games directly (no privilege granted)'
);
RESET ROLE;

-- ─── 9. Player cannot INSERT into role_assignments directly (no INSERT grant) ─

SELECT set_config('request.headers',
  '{"x-device-id":"ac000000-0000-0000-0000-000000000000"}', true);
SET ROLE anon;
SELECT throws_ok(
  $$INSERT INTO public.role_assignments (game_id, player_id, role, word)
    VALUES ('bc000000-0000-0000-0000-000000000000',
            'ac000000-0000-0000-0000-000000000000', 'civilian', 'banana')$$,
  '42501',
  NULL,
  'anon cannot INSERT into role_assignments directly (no privilege granted)'
);
RESET ROLE;

SELECT * FROM finish();
ROLLBACK;
