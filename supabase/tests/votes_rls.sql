-- E5-T6: pgTAP tests for votes RLS and get_vote_tally().
--
-- Verifies the visibility branches:
--   1. A voter can read their own vote row.
--   2. An imposter can read a fellow imposter's vote row.
--   3. A civilian cannot read another player's vote row (sees only their own).
--   4. An imposter cannot read a civilian's vote row.
--   5. The (game_id, voter_player_id) primary key prevents double-voting.
--   6. The CHECK constraint forbids self-voting.
--   7. get_vote_tally returns aggregated counts when live_tally = true.
--   8. get_vote_tally returns no rows when live_tally = false.
--   9. get_vote_tally returns no rows for a non-participant caller.
--
-- Test UUIDs (distinct from other test files):
--   Room:                a2000000-0000-0000-0000-000000000001
--   Game L (live=true):  a2000000-0000-0000-0000-00000000000a
--   Game N (live=false): a2000000-0000-0000-0000-00000000000b
--   Alice (imposter):    a2000000-0000-0000-0000-000000000011
--   Bob   (imposter):    a2000000-0000-0000-0000-000000000012
--   Carol (civilian):    a2000000-0000-0000-0000-000000000013
--   Dave  (civilian):    a2000000-0000-0000-0000-000000000014
--   Eve   (outsider, not in any game): a2000000-0000-0000-0000-000000000015

BEGIN;

SELECT plan(12);

-- ─── Fixtures (superuser, bypasses RLS) ──────────────────────────────────────

INSERT INTO public.rooms (id, code, host_player_id, host_secret_hash, state)
VALUES (
  'a2000000-0000-0000-0000-000000000001',
  'VOTET1',
  'a2000000-0000-0000-0000-000000000011',
  'fakehash-vote',
  'round_active'
);

INSERT INTO public.players (id, room_id, display_name)
VALUES
  ('a2000000-0000-0000-0000-000000000011',
   'a2000000-0000-0000-0000-000000000001', 'Alice'),
  ('a2000000-0000-0000-0000-000000000012',
   'a2000000-0000-0000-0000-000000000001', 'Bob'),
  ('a2000000-0000-0000-0000-000000000013',
   'a2000000-0000-0000-0000-000000000001', 'Carol'),
  ('a2000000-0000-0000-0000-000000000014',
   'a2000000-0000-0000-0000-000000000001', 'Dave'),
  ('a2000000-0000-0000-0000-000000000015',
   'a2000000-0000-0000-0000-000000000001', 'Eve');

-- Game L: live_tally = true
INSERT INTO public.games (id, room_id, index, config_snapshot)
VALUES (
  'a2000000-0000-0000-0000-00000000000a',
  'a2000000-0000-0000-0000-000000000001',
  1,
  '{"live_tally": true}'
);

-- Game N: live_tally = false
INSERT INTO public.games (id, room_id, index, config_snapshot)
VALUES (
  'a2000000-0000-0000-0000-00000000000b',
  'a2000000-0000-0000-0000-000000000001',
  2,
  '{"live_tally": false}'
);

-- Role assignments — Alice & Bob imposters, Carol & Dave civilians,
-- Eve is intentionally NOT assigned (outsider for tally test 9).
INSERT INTO public.role_assignments (game_id, player_id, role, word)
SELECT g.id, p.player_id, p.role::public.player_role, p.word
FROM   (
  VALUES
    ('a2000000-0000-0000-0000-000000000011'::uuid, 'imposter', NULL),
    ('a2000000-0000-0000-0000-000000000012'::uuid, 'imposter', NULL),
    ('a2000000-0000-0000-0000-000000000013'::uuid, 'civilian', 'duck'),
    ('a2000000-0000-0000-0000-000000000014'::uuid, 'civilian', 'duck')
) AS p(player_id, role, word)
CROSS JOIN public.games g
WHERE  g.room_id = 'a2000000-0000-0000-0000-000000000001';

-- Votes (in Game L only): A→C, B→D, C→A, D→B.
INSERT INTO public.votes (game_id, voter_player_id, target_player_id)
VALUES
  ('a2000000-0000-0000-0000-00000000000a',
   'a2000000-0000-0000-0000-000000000011',
   'a2000000-0000-0000-0000-000000000013'),
  ('a2000000-0000-0000-0000-00000000000a',
   'a2000000-0000-0000-0000-000000000012',
   'a2000000-0000-0000-0000-000000000014'),
  ('a2000000-0000-0000-0000-00000000000a',
   'a2000000-0000-0000-0000-000000000013',
   'a2000000-0000-0000-0000-000000000011'),
  ('a2000000-0000-0000-0000-00000000000a',
   'a2000000-0000-0000-0000-000000000014',
   'a2000000-0000-0000-0000-000000000012');

-- ─── Test 1: Alice (imposter) sees own row + Bob's row = 2 rows ──────────────

SELECT set_config('request.headers',
  '{"x-device-id":"a2000000-0000-0000-0000-000000000011"}', true);
SET ROLE anon;

SELECT is(
  (SELECT count(*)::int FROM public.votes
   WHERE game_id = 'a2000000-0000-0000-0000-00000000000a'),
  2,
  'imposter Alice sees 2 vote rows (own + co-imposter Bob)'
);

SELECT ok(
  EXISTS (
    SELECT 1 FROM public.votes
    WHERE game_id = 'a2000000-0000-0000-0000-00000000000a'
      AND voter_player_id = 'a2000000-0000-0000-0000-000000000012'
  ),
  'imposter Alice can read co-imposter Bob''s vote row'
);

SELECT ok(
  NOT EXISTS (
    SELECT 1 FROM public.votes
    WHERE game_id = 'a2000000-0000-0000-0000-00000000000a'
      AND voter_player_id = 'a2000000-0000-0000-0000-000000000013'
  ),
  'imposter Alice CANNOT read civilian Carol''s vote row'
);

RESET ROLE;

-- ─── Test 2: Carol (civilian) sees only her own row = 1 row ──────────────────

SELECT set_config('request.headers',
  '{"x-device-id":"a2000000-0000-0000-0000-000000000013"}', true);
SET ROLE anon;

SELECT is(
  (SELECT count(*)::int FROM public.votes
   WHERE game_id = 'a2000000-0000-0000-0000-00000000000a'),
  1,
  'civilian Carol sees only her own vote row'
);

SELECT ok(
  EXISTS (
    SELECT 1 FROM public.votes
    WHERE game_id = 'a2000000-0000-0000-0000-00000000000a'
      AND voter_player_id = 'a2000000-0000-0000-0000-000000000013'
  ),
  'civilian Carol can read her own vote row'
);

RESET ROLE;

-- ─── Test 3: get_vote_tally on live_tally=true game returns 4 target rows ───

SELECT set_config('request.headers',
  '{"x-device-id":"a2000000-0000-0000-0000-000000000013"}', true);

SELECT is(
  (SELECT count(*)::int FROM public.get_vote_tally(
    'a2000000-0000-0000-0000-00000000000a')),
  4,
  'get_vote_tally returns 4 target rows when live_tally = true'
);

SELECT is(
  (SELECT vote_count FROM public.get_vote_tally(
     'a2000000-0000-0000-0000-00000000000a')
   WHERE target_player_id = 'a2000000-0000-0000-0000-000000000011'),
  1::bigint,
  'get_vote_tally count for Alice = 1'
);

-- ─── Test 4: get_vote_tally on live_tally=false game returns 0 rows ─────────

-- Add a vote in Game N so we have something to count if visibility were wrong.
RESET ROLE;
INSERT INTO public.votes (game_id, voter_player_id, target_player_id)
VALUES (
  'a2000000-0000-0000-0000-00000000000b',
  'a2000000-0000-0000-0000-000000000011',
  'a2000000-0000-0000-0000-000000000013'
);

SELECT set_config('request.headers',
  '{"x-device-id":"a2000000-0000-0000-0000-000000000013"}', true);

SELECT is(
  (SELECT count(*)::int FROM public.get_vote_tally(
    'a2000000-0000-0000-0000-00000000000b')),
  0,
  'get_vote_tally returns 0 rows when live_tally = false'
);

-- ─── Test 5: get_vote_tally returns 0 rows for non-participant Eve ──────────

SELECT set_config('request.headers',
  '{"x-device-id":"a2000000-0000-0000-0000-000000000015"}', true);

SELECT is(
  (SELECT count(*)::int FROM public.get_vote_tally(
    'a2000000-0000-0000-0000-00000000000a')),
  0,
  'get_vote_tally returns 0 rows for non-participant caller'
);

-- ─── Test 6: votes PRIMARY KEY prevents double-voting ────────────────────────

SELECT throws_ok(
  $$INSERT INTO public.votes (game_id, voter_player_id, target_player_id)
    VALUES ('a2000000-0000-0000-0000-00000000000a',
            'a2000000-0000-0000-0000-000000000011',
            'a2000000-0000-0000-0000-000000000014')$$,
  '23505',
  NULL,
  'duplicate vote (same game_id, voter_player_id) is rejected by PK'
);

-- ─── Test 7: votes_no_self_vote CHECK constraint ─────────────────────────────

SELECT throws_ok(
  $$INSERT INTO public.votes (game_id, voter_player_id, target_player_id)
    VALUES ('a2000000-0000-0000-0000-00000000000b',
            'a2000000-0000-0000-0000-000000000012',
            'a2000000-0000-0000-0000-000000000012')$$,
  '23514',
  NULL,
  'self-vote (voter = target) is rejected by CHECK constraint'
);

-- ─── Test 8: games gained vote_state with default 'none' ─────────────────────

SELECT is(
  (SELECT vote_state::text FROM public.games
   WHERE id = 'a2000000-0000-0000-0000-00000000000a'),
  'none',
  'games.vote_state defaults to ''none'''
);

SELECT * FROM finish();
ROLLBACK;
