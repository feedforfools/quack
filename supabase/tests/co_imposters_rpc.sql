-- E5-T4: pgTAP tests for get_co_imposters RPC.
--
-- Verifies:
--   1. An imposter in a game with imposters_see_each_other = true receives
--      the display names of the other imposters.
--   2. An imposter in a game with imposters_see_each_other = false receives
--      an empty result set.
--   3. A civilian always receives an empty result set (even when the setting
--      is on), so role information cannot be inferred.
--
-- Test UUIDs (distinct from other test files):
--   Room:   d1000000-0000-0000-0000-000000000001
--   Game A (see_each_other=true):  f1000000-0000-0000-0000-000000000001
--   Game B (see_each_other=false): f1000000-0000-0000-0000-000000000002
--   Alice (imposter):  e1000000-0000-0000-0000-000000000001
--   Bob   (imposter):  e1000000-0000-0000-0000-000000000002
--   Carol (civilian):  e1000000-0000-0000-0000-000000000003

BEGIN;

SELECT plan(4);

-- ── Fixtures (superuser, bypasses RLS) ───────────────────────────────────────

INSERT INTO public.rooms (id, code, host_player_id, host_secret_hash, state)
VALUES (
  'd1000000-0000-0000-0000-000000000001',
  'COIMP1',
  'e1000000-0000-0000-0000-000000000001',
  'fakehash-coimp',
  'round_active'
);

INSERT INTO public.players (id, room_id, display_name)
VALUES
  ('e1000000-0000-0000-0000-000000000001',
   'd1000000-0000-0000-0000-000000000001',
   'Alice'),
  ('e1000000-0000-0000-0000-000000000002',
   'd1000000-0000-0000-0000-000000000001',
   'Bob'),
  ('e1000000-0000-0000-0000-000000000003',
   'd1000000-0000-0000-0000-000000000001',
   'Carol');

-- Game A: imposters_see_each_other = true
INSERT INTO public.games (id, room_id, index, config_snapshot)
VALUES (
  'f1000000-0000-0000-0000-000000000001',
  'd1000000-0000-0000-0000-000000000001',
  1,
  '{"imposters_see_each_other": true}'
);

-- Game B: imposters_see_each_other = false
INSERT INTO public.games (id, room_id, index, config_snapshot)
VALUES (
  'f1000000-0000-0000-0000-000000000002',
  'd1000000-0000-0000-0000-000000000001',
  2,
  '{"imposters_see_each_other": false}'
);

-- Role assignments for Game A
INSERT INTO public.role_assignments (game_id, player_id, role, word)
VALUES
  ('f1000000-0000-0000-0000-000000000001',
   'e1000000-0000-0000-0000-000000000001',
   'imposter', NULL),
  ('f1000000-0000-0000-0000-000000000001',
   'e1000000-0000-0000-0000-000000000002',
   'imposter', NULL),
  ('f1000000-0000-0000-0000-000000000001',
   'e1000000-0000-0000-0000-000000000003',
   'civilian', 'duck');

-- Role assignments for Game B
INSERT INTO public.role_assignments (game_id, player_id, role, word)
VALUES
  ('f1000000-0000-0000-0000-000000000002',
   'e1000000-0000-0000-0000-000000000001',
   'imposter', NULL),
  ('f1000000-0000-0000-0000-000000000002',
   'e1000000-0000-0000-0000-000000000002',
   'imposter', NULL),
  ('f1000000-0000-0000-0000-000000000002',
   'e1000000-0000-0000-0000-000000000003',
   'civilian', 'duck');

-- ── Test 1: Imposter (Alice) sees Bob when imposters_see_each_other = true ────

SELECT set_config('request.headers',
  '{"x-device-id": "e1000000-0000-0000-0000-000000000001"}', true);

SELECT is(
  (
    SELECT count(*)::int
    FROM   public.get_co_imposters('f1000000-0000-0000-0000-000000000001')
  ),
  1,
  'Imposter Alice gets 1 co-imposter row when imposters_see_each_other = true'
);

SELECT is(
  (
    SELECT display_name
    FROM   public.get_co_imposters('f1000000-0000-0000-0000-000000000001')
  ),
  'Bob',
  'Co-imposter returned is Bob'
);

-- ── Test 2: Imposter (Alice) sees nothing when imposters_see_each_other = false

SELECT set_config('request.headers',
  '{"x-device-id": "e1000000-0000-0000-0000-000000000001"}', true);

SELECT is(
  (
    SELECT count(*)::int
    FROM   public.get_co_imposters('f1000000-0000-0000-0000-000000000002')
  ),
  0,
  'Imposter Alice gets 0 rows when imposters_see_each_other = false'
);

-- ── Test 3: Civilian (Carol) sees nothing even when imposters_see_each_other = true

SELECT set_config('request.headers',
  '{"x-device-id": "e1000000-0000-0000-0000-000000000003"}', true);

SELECT is(
  (
    SELECT count(*)::int
    FROM   public.get_co_imposters('f1000000-0000-0000-0000-000000000001')
  ),
  0,
  'Civilian Carol gets 0 rows regardless of imposters_see_each_other setting'
);

SELECT * FROM finish();
ROLLBACK;
