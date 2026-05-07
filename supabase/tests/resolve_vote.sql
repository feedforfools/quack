-- E5.5-T2: pgTAP coverage for resolve_vote after vote expiry.
--
-- Verifies:
--   1. An outsider cannot call resolve_vote.
--   2. A non-host participant can resolve after vote_ends_at has passed.
--   3. The game is marked resolved with the expected outcome / voted-out row.
--   4. A second participant can call resolve_vote again idempotently.

BEGIN;

SELECT plan(4);

INSERT INTO public.rooms (id, code, host_player_id, host_secret_hash, state)
VALUES (
  'a5000000-0000-0000-0000-000000000001',
  'RSLV55',
  'a5000000-0000-0000-0000-000000000011',
  'fakehash-rslv',
  'round_active'
);

INSERT INTO public.players (id, room_id, display_name)
VALUES
  ('a5000000-0000-0000-0000-000000000011',
   'a5000000-0000-0000-0000-000000000001', 'Host Alice'),
  ('a5000000-0000-0000-0000-000000000012',
   'a5000000-0000-0000-0000-000000000001', 'Bob'),
  ('a5000000-0000-0000-0000-000000000013',
   'a5000000-0000-0000-0000-000000000001', 'Carol'),
  ('a5000000-0000-0000-0000-000000000099',
   'a5000000-0000-0000-0000-000000000001', 'Outsider');

INSERT INTO public.games (
  id,
  room_id,
  index,
  config_snapshot,
  vote_state,
  vote_ends_at
)
VALUES (
  'a5000000-0000-0000-0000-00000000000a',
  'a5000000-0000-0000-0000-000000000001',
  1,
  '{"vote_threshold_fraction": 0.5, "voting_duration_seconds": 60}',
  'active',
  now() - interval '1 minute'
);

INSERT INTO public.role_assignments (game_id, player_id, role, word)
VALUES
  ('a5000000-0000-0000-0000-00000000000a',
   'a5000000-0000-0000-0000-000000000011', 'imposter', NULL),
  ('a5000000-0000-0000-0000-00000000000a',
   'a5000000-0000-0000-0000-000000000012', 'civilian', 'duck'),
  ('a5000000-0000-0000-0000-00000000000a',
   'a5000000-0000-0000-0000-000000000013', 'civilian', 'duck');

INSERT INTO public.votes (game_id, voter_player_id, target_player_id)
VALUES
  ('a5000000-0000-0000-0000-00000000000a',
   'a5000000-0000-0000-0000-000000000012',
   'a5000000-0000-0000-0000-000000000011'),
  ('a5000000-0000-0000-0000-00000000000a',
   'a5000000-0000-0000-0000-000000000013',
   'a5000000-0000-0000-0000-000000000011');

SELECT set_config(
  'request.headers',
  '{"x-device-id":"a5000000-0000-0000-0000-000000000099"}',
  true
);
SET ROLE anon;
SELECT throws_ok(
  $$ SELECT public.resolve_vote('a5000000-0000-0000-0000-00000000000a') $$,
  '42501',
  NULL,
  'outsider cannot resolve_vote'
);
RESET ROLE;

SELECT set_config(
  'request.headers',
  '{"x-device-id":"a5000000-0000-0000-0000-000000000012"}',
  true
);
SET ROLE anon;
SELECT lives_ok(
  $$ SELECT public.resolve_vote('a5000000-0000-0000-0000-00000000000a') $$,
  'non-host participant can resolve_vote after the deadline'
);
RESET ROLE;

SELECT results_eq(
  $$
    SELECT vote_state::text, outcome::text, voted_out_player_id::text
    FROM public.games
    WHERE id = 'a5000000-0000-0000-0000-00000000000a'
  $$,
  $$
    VALUES (
      'resolved',
      'imposters_caught',
      'a5000000-0000-0000-0000-000000000011'
    )
  $$,
  'resolve_vote marks the game resolved with the expected outcome'
);

SELECT set_config(
  'request.headers',
  '{"x-device-id":"a5000000-0000-0000-0000-000000000013"}',
  true
);
SET ROLE anon;
SELECT lives_ok(
  $$ SELECT public.resolve_vote('a5000000-0000-0000-0000-00000000000a') $$,
  'resolve_vote remains idempotent for a second participant'
);
RESET ROLE;

SELECT * FROM finish();
ROLLBACK;