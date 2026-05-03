-- E5-T7: pgTAP tests for request_vote, cast_vote, and retract_vote RPCs.
--
-- Verifies:
--   request_vote
--     1. Outsider cannot call request_vote (42501).
--     2. First request transitions vote_state none → requested, count = 1.
--     3. Same player calling again is idempotent (count stays at 1).
--     4. Second player request meets threshold (threshold=1 in fixtures) →
--        vote_state → active, vote_ends_at stamped.
--     5. Calling request_vote when already active raises P0001.
--
--   cast_vote
--     6. Casting when vote_state ≠ active raises P0001.
--     7. Self-vote raises P0001.
--     8. Outsider cannot cast (42501).
--     9. Target not in game raises P0001.
--    10. Successful cast inserts a votes row.
--    11. Changing vote (upsert) updates the target.
--    12. Casting after vote_ends_at expired raises P0001.
--
--   retract_vote
--    13. Retracting when vote_state ≠ active raises P0001.
--    14. Successful retract deletes the votes row.
--    15. Retract is idempotent (no error if no row to delete).
--    16. Retracting after vote_ends_at expired raises P0001.
--
-- Test UUIDs (distinct from other test files):
--   Room:                a4000000-0000-0000-0000-000000000001
--   Game "none":         a4000000-0000-0000-0000-00000000000a
--   Game "active":       a4000000-0000-0000-0000-00000000000b  (vote_state=active, future ends_at)
--   Game "expired":      a4000000-0000-0000-0000-00000000000c  (vote_state=active, past ends_at)
--   Alice (imposter):    a4000000-0000-0000-0000-000000000011
--   Bob   (civilian):    a4000000-0000-0000-0000-000000000012
--   Carol (civilian):    a4000000-0000-0000-0000-000000000013
--   Outsider:            a4000000-0000-0000-0000-000000000099

BEGIN;

SELECT plan(23);

-- ─────────────────────────────────────────────────────────────────────────────
-- Fixtures (superuser, bypasses RLS)
-- ─────────────────────────────────────────────────────────────────────────────

INSERT INTO public.rooms (id, code, host_player_id, host_secret_hash, state)
VALUES (
  'a4000000-0000-0000-0000-000000000001',
  'VTRPC1',
  'a4000000-0000-0000-0000-000000000011',
  'fakehash-vrpc',
  'round_active'
);

INSERT INTO public.players (id, room_id, display_name)
VALUES
  ('a4000000-0000-0000-0000-000000000011',
   'a4000000-0000-0000-0000-000000000001', 'Alice'),
  ('a4000000-0000-0000-0000-000000000012',
   'a4000000-0000-0000-0000-000000000001', 'Bob'),
  ('a4000000-0000-0000-0000-000000000013',
   'a4000000-0000-0000-0000-000000000001', 'Carol'),
  -- Outsider: in room but not role-assigned in any game
  ('a4000000-0000-0000-0000-000000000099',
   'a4000000-0000-0000-0000-000000000001', 'Outsider');

-- Game "none": vote_state = 'none' (default), threshold_fraction = 1.0
-- so a single request from Alice (1 of 3 players = CEIL(3*1.0)=3) will NOT
-- trigger active; a request from all three players would. We use threshold
-- fraction = 0.34 so CEIL(3 * 0.34) = 2, requiring 2 requests.
-- For simplicity we use threshold_fraction = 0.34 → threshold = CEIL(3*0.34) = 2.
INSERT INTO public.games (id, room_id, index, config_snapshot)
VALUES (
  'a4000000-0000-0000-0000-00000000000a',
  'a4000000-0000-0000-0000-000000000001',
  1,
  '{"vote_threshold_fraction": 0.34, "voting_duration_seconds": 60}'
);

-- Game "active": already in active state, vote_ends_at = 1 hour from now.
INSERT INTO public.games (id, room_id, index, config_snapshot, vote_state, vote_ends_at)
VALUES (
  'a4000000-0000-0000-0000-00000000000b',
  'a4000000-0000-0000-0000-000000000001',
  2,
  '{"vote_threshold_fraction": 0.5, "voting_duration_seconds": 60}',
  'active',
  now() + interval '1 hour'
);

-- Game "expired": active but vote_ends_at is in the past.
INSERT INTO public.games (id, room_id, index, config_snapshot, vote_state, vote_ends_at)
VALUES (
  'a4000000-0000-0000-0000-00000000000c',
  'a4000000-0000-0000-0000-000000000001',
  3,
  '{"vote_threshold_fraction": 0.5, "voting_duration_seconds": 60}',
  'active',
  now() - interval '1 hour'
);

-- Role assignments for all three games: Alice=imposter, Bob=civilian, Carol=civilian.
-- Outsider (099) intentionally has no role assignment.
INSERT INTO public.role_assignments (game_id, player_id, role, word)
SELECT g.id, p.player_id, p.role::public.player_role, p.word
FROM (VALUES
  ('a4000000-0000-0000-0000-000000000011'::uuid, 'imposter', NULL   ),
  ('a4000000-0000-0000-0000-000000000012'::uuid, 'civilian', 'duck' ),
  ('a4000000-0000-0000-0000-000000000013'::uuid, 'civilian', 'duck' )
) AS p(player_id, role, word)
CROSS JOIN (
  VALUES
    ('a4000000-0000-0000-0000-00000000000a'::uuid),
    ('a4000000-0000-0000-0000-00000000000b'::uuid),
    ('a4000000-0000-0000-0000-00000000000c'::uuid)
) AS g(id);

-- Seed a pre-existing vote in Game "active" (Alice → Bob) for retract tests.
INSERT INTO public.votes (game_id, voter_player_id, target_player_id)
VALUES (
  'a4000000-0000-0000-0000-00000000000b',
  'a4000000-0000-0000-0000-000000000011',
  'a4000000-0000-0000-0000-000000000012'
);

-- ─────────────────────────────────────────────────────────────────────────────
-- Test 1: outsider cannot call request_vote
-- ─────────────────────────────────────────────────────────────────────────────

SELECT set_config('request.headers',
  '{"x-device-id":"a4000000-0000-0000-0000-000000000099"}', true);
SET ROLE anon;
SELECT throws_ok(
  $$ SELECT public.request_vote('a4000000-0000-0000-0000-00000000000a') $$,
  '42501',
  NULL,
  'outsider cannot call request_vote'
);
RESET ROLE;

-- ─────────────────────────────────────────────────────────────────────────────
-- Test 2: first request transitions to 'requested', count = 1
-- ─────────────────────────────────────────────────────────────────────────────

SELECT set_config('request.headers',
  '{"x-device-id":"a4000000-0000-0000-0000-000000000011"}', true);
SET ROLE anon;
SELECT lives_ok(
  $$ SELECT public.request_vote('a4000000-0000-0000-0000-00000000000a') $$,
  'first request_vote succeeds'
);
RESET ROLE;

SELECT results_eq(
  $$ SELECT vote_state::text, vote_request_count
     FROM public.games
     WHERE id = 'a4000000-0000-0000-0000-00000000000a' $$,
  $$ VALUES ('requested', 1) $$,
  'vote_state=requested, count=1 after first request'
);

-- ─────────────────────────────────────────────────────────────────────────────
-- Test 3: same player calling again is idempotent (count stays at 1)
-- ─────────────────────────────────────────────────────────────────────────────

SELECT set_config('request.headers',
  '{"x-device-id":"a4000000-0000-0000-0000-000000000011"}', true);
SET ROLE anon;
SELECT lives_ok(
  $$ SELECT public.request_vote('a4000000-0000-0000-0000-00000000000a') $$,
  'repeated request_vote by same player is idempotent'
);
RESET ROLE;

SELECT results_eq(
  $$ SELECT vote_request_count FROM public.games
     WHERE id = 'a4000000-0000-0000-0000-00000000000a' $$,
  $$ VALUES (1) $$,
  'count remains 1 after duplicate request'
);

-- ─────────────────────────────────────────────────────────────────────────────
-- Test 4: second player reaches threshold (CEIL(3*0.34)=2) → active, ends_at stamped
-- ─────────────────────────────────────────────────────────────────────────────

SELECT set_config('request.headers',
  '{"x-device-id":"a4000000-0000-0000-0000-000000000012"}', true);
SET ROLE anon;
SELECT lives_ok(
  $$ SELECT public.request_vote('a4000000-0000-0000-0000-00000000000a') $$,
  'second request_vote triggers threshold'
);
RESET ROLE;

SELECT results_eq(
  $$ SELECT vote_state::text, vote_request_count
     FROM public.games
     WHERE id = 'a4000000-0000-0000-0000-00000000000a' $$,
  $$ VALUES ('active', 2) $$,
  'vote_state=active, count=2 after threshold reached'
);

SELECT isnt(
  (SELECT vote_ends_at FROM public.games
   WHERE id = 'a4000000-0000-0000-0000-00000000000a'),
  NULL,
  'vote_ends_at is stamped when active'
);

-- ─────────────────────────────────────────────────────────────────────────────
-- Test 5: request_vote when already active raises P0001
-- ─────────────────────────────────────────────────────────────────────────────

SELECT set_config('request.headers',
  '{"x-device-id":"a4000000-0000-0000-0000-000000000013"}', true);
SET ROLE anon;
SELECT throws_ok(
  $$ SELECT public.request_vote('a4000000-0000-0000-0000-00000000000a') $$,
  'P0001',
  NULL,
  'request_vote rejects when vote already active'
);
RESET ROLE;

-- ─────────────────────────────────────────────────────────────────────────────
-- Test 6: cast_vote when vote_state ≠ active raises P0001
-- ─────────────────────────────────────────────────────────────────────────────
-- Reset game "none" state for this test (it's now active from tests 2-4,
-- so use a different game that was never touched).  We'll use game "expired"
-- but override its state to 'none' for this test by temporarily using game
-- "none"'s initial state.  Since game "none" is now 'active', we cannot
-- use it; instead we rely on a fresh game. Because the test runs inside a
-- single transaction the game "none" state was modified in-place.
-- We test against 'requested' by (ab)using game "none" being active now —
-- actually the simplest approach is to run this test against a game in
-- 'requested' state. The game "none" is now 'active', so any non-active
-- game must be constructed differently.  The simplest workaround: insert
-- a mini fixture game for this single test.

INSERT INTO public.games (id, room_id, index, config_snapshot, vote_state)
VALUES (
  'a4000000-0000-0000-0000-00000000000d',
  'a4000000-0000-0000-0000-000000000001',
  4,
  '{}',
  'requested'
);
INSERT INTO public.role_assignments (game_id, player_id, role, word)
VALUES
  ('a4000000-0000-0000-0000-00000000000d',
   'a4000000-0000-0000-0000-000000000011', 'imposter', NULL),
  ('a4000000-0000-0000-0000-00000000000d',
   'a4000000-0000-0000-0000-000000000012', 'civilian', 'duck');

SELECT set_config('request.headers',
  '{"x-device-id":"a4000000-0000-0000-0000-000000000011"}', true);
SET ROLE anon;
SELECT throws_ok(
  $$ SELECT public.cast_vote(
      'a4000000-0000-0000-0000-00000000000d',
      'a4000000-0000-0000-0000-000000000012') $$,
  'P0001',
  NULL,
  'cast_vote rejects when vote_state is not active'
);
RESET ROLE;

-- ─────────────────────────────────────────────────────────────────────────────
-- Test 7: self-vote raises P0001
-- ─────────────────────────────────────────────────────────────────────────────

SELECT set_config('request.headers',
  '{"x-device-id":"a4000000-0000-0000-0000-000000000012"}', true);
SET ROLE anon;
SELECT throws_ok(
  $$ SELECT public.cast_vote(
      'a4000000-0000-0000-0000-00000000000b',
      'a4000000-0000-0000-0000-000000000012') $$,
  'P0001',
  NULL,
  'cast_vote rejects self-vote'
);
RESET ROLE;

-- ─────────────────────────────────────────────────────────────────────────────
-- Test 8: outsider cannot cast vote (42501)
-- ─────────────────────────────────────────────────────────────────────────────

SELECT set_config('request.headers',
  '{"x-device-id":"a4000000-0000-0000-0000-000000000099"}', true);
SET ROLE anon;
SELECT throws_ok(
  $$ SELECT public.cast_vote(
      'a4000000-0000-0000-0000-00000000000b',
      'a4000000-0000-0000-0000-000000000012') $$,
  '42501',
  NULL,
  'outsider cannot cast a vote'
);
RESET ROLE;

-- ─────────────────────────────────────────────────────────────────────────────
-- Test 9: target not in game raises P0001
-- ─────────────────────────────────────────────────────────────────────────────

SELECT set_config('request.headers',
  '{"x-device-id":"a4000000-0000-0000-0000-000000000012"}', true);
SET ROLE anon;
SELECT throws_ok(
  $$ SELECT public.cast_vote(
      'a4000000-0000-0000-0000-00000000000b',
      'a4000000-0000-0000-0000-000000000099') $$,
  'P0001',
  NULL,
  'cast_vote rejects target not in game'
);
RESET ROLE;

-- ─────────────────────────────────────────────────────────────────────────────
-- Test 10: successful cast inserts a votes row
-- ─────────────────────────────────────────────────────────────────────────────

SELECT set_config('request.headers',
  '{"x-device-id":"a4000000-0000-0000-0000-000000000012"}', true);
SET ROLE anon;
SELECT lives_ok(
  $$ SELECT public.cast_vote(
      'a4000000-0000-0000-0000-00000000000b',
      'a4000000-0000-0000-0000-000000000011') $$,
  'cast_vote succeeds'
);
RESET ROLE;

SELECT ok(
  EXISTS (
    SELECT 1 FROM public.votes
    WHERE game_id        = 'a4000000-0000-0000-0000-00000000000b'
      AND voter_player_id  = 'a4000000-0000-0000-0000-000000000012'
      AND target_player_id = 'a4000000-0000-0000-0000-000000000011'
  ),
  'votes row exists after cast_vote'
);

-- ─────────────────────────────────────────────────────────────────────────────
-- Test 11: changing vote (upsert) updates target
-- ─────────────────────────────────────────────────────────────────────────────

SELECT set_config('request.headers',
  '{"x-device-id":"a4000000-0000-0000-0000-000000000012"}', true);
SET ROLE anon;
SELECT lives_ok(
  $$ SELECT public.cast_vote(
      'a4000000-0000-0000-0000-00000000000b',
      'a4000000-0000-0000-0000-000000000013') $$,
  'changing vote succeeds'
);
RESET ROLE;

SELECT results_eq(
  $$ SELECT target_player_id::text FROM public.votes
     WHERE game_id       = 'a4000000-0000-0000-0000-00000000000b'
       AND voter_player_id = 'a4000000-0000-0000-0000-000000000012' $$,
  $$ VALUES ('a4000000-0000-0000-0000-000000000013') $$,
  'changing vote updates the target_player_id'
);

-- ─────────────────────────────────────────────────────────────────────────────
-- Test 12: cast_vote after vote_ends_at expired raises P0001
-- ─────────────────────────────────────────────────────────────────────────────

SELECT set_config('request.headers',
  '{"x-device-id":"a4000000-0000-0000-0000-000000000012"}', true);
SET ROLE anon;
SELECT throws_ok(
  $$ SELECT public.cast_vote(
      'a4000000-0000-0000-0000-00000000000c',
      'a4000000-0000-0000-0000-000000000011') $$,
  'P0001',
  NULL,
  'cast_vote rejects after vote_ends_at has passed'
);
RESET ROLE;

-- ─────────────────────────────────────────────────────────────────────────────
-- Test 13: retract_vote when vote_state ≠ active raises P0001
-- ─────────────────────────────────────────────────────────────────────────────

SELECT set_config('request.headers',
  '{"x-device-id":"a4000000-0000-0000-0000-000000000011"}', true);
SET ROLE anon;
SELECT throws_ok(
  $$ SELECT public.retract_vote('a4000000-0000-0000-0000-00000000000d') $$,
  'P0001',
  NULL,
  'retract_vote rejects when vote_state is not active'
);
RESET ROLE;

-- ─────────────────────────────────────────────────────────────────────────────
-- Test 14: successful retract deletes the votes row
-- ─────────────────────────────────────────────────────────────────────────────
-- (Alice's pre-seeded vote Alice→Bob in game "active" is still present.)

SELECT set_config('request.headers',
  '{"x-device-id":"a4000000-0000-0000-0000-000000000011"}', true);
SET ROLE anon;
SELECT lives_ok(
  $$ SELECT public.retract_vote('a4000000-0000-0000-0000-00000000000b') $$,
  'retract_vote succeeds'
);
RESET ROLE;

SELECT ok(
  NOT EXISTS (
    SELECT 1 FROM public.votes
    WHERE game_id        = 'a4000000-0000-0000-0000-00000000000b'
      AND voter_player_id = 'a4000000-0000-0000-0000-000000000011'
  ),
  'votes row removed after retract_vote'
);

-- ─────────────────────────────────────────────────────────────────────────────
-- Test 15: retract_vote is idempotent (no error if no row to delete)
-- ─────────────────────────────────────────────────────────────────────────────

SELECT set_config('request.headers',
  '{"x-device-id":"a4000000-0000-0000-0000-000000000011"}', true);
SET ROLE anon;
SELECT lives_ok(
  $$ SELECT public.retract_vote('a4000000-0000-0000-0000-00000000000b') $$,
  'retract_vote is idempotent (no error when no vote exists)'
);
RESET ROLE;

-- ─────────────────────────────────────────────────────────────────────────────
-- Test 16: retract_vote after vote_ends_at expired raises P0001
-- ─────────────────────────────────────────────────────────────────────────────

SELECT set_config('request.headers',
  '{"x-device-id":"a4000000-0000-0000-0000-000000000011"}', true);
SET ROLE anon;
SELECT throws_ok(
  $$ SELECT public.retract_vote('a4000000-0000-0000-0000-00000000000c') $$,
  'P0001',
  NULL,
  'retract_vote rejects after vote_ends_at has passed'
);
RESET ROLE;

-- ─────────────────────────────────────────────────────────────────────────────

SELECT * FROM finish();
ROLLBACK;
