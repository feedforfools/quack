-- pgTAP tests for spectator-clearing fix (E4-Bug3).
-- Run with: supabase test db
--
-- Verifies:
--   1. end_game clears is_spectator for late joiners.
--   2. start_game clears any lingering is_spectator before role assignment
--      (defensive belt-and-braces) and assigns a role to the now-included
--      player.

BEGIN;

SELECT plan(4);

-- ─── Fixtures ────────────────────────────────────────────────────────────────

INSERT INTO public.rooms (id, code, host_player_id, host_secret_hash, state, config)
VALUES
  ('f1000000-0000-0000-0000-000000000000', 'SPECT1',
   'a1000000-0000-0000-0000-000000000000', 'hash-host',
   'round_active',
   jsonb_build_object('imposter_count', 1, 'timer_seconds', 60));

INSERT INTO public.players (id, room_id, display_name, is_spectator)
VALUES
  ('a1000000-0000-0000-0000-000000000000',
   'f1000000-0000-0000-0000-000000000000', 'Host', false),
  ('a2000000-0000-0000-0000-000000000000',
   'f1000000-0000-0000-0000-000000000000', 'P2', false),
  ('a3000000-0000-0000-0000-000000000000',
   'f1000000-0000-0000-0000-000000000000', 'P3', false),
  -- Late joiner: arrived mid-game, marked spectator.
  ('a4000000-0000-0000-0000-000000000000',
   'f1000000-0000-0000-0000-000000000000', 'LateJoiner', true);

-- An active game so end_game has something to close.
INSERT INTO public.games (id, room_id, index, config_snapshot, ended_at)
VALUES
  ('b1000000-0000-0000-0000-000000000000',
   'f1000000-0000-0000-0000-000000000000',
   1,
   jsonb_build_object('imposter_count', 1, 'timer_seconds', 60),
   NULL);

-- ─── 1. end_game clears is_spectator for late joiner ────────────────────────

SELECT set_config('request.headers',
  '{"x-device-id":"a1000000-0000-0000-0000-000000000000"}', true);
SET LOCAL ROLE anon;

SELECT lives_ok(
  $$SELECT public.end_game(
      'f1000000-0000-0000-0000-000000000000'::uuid,
      'hash-host'
    )$$,
  'end_game succeeds for the host');

RESET ROLE;

SELECT is(
  (SELECT is_spectator
   FROM public.players
   WHERE id = 'a4000000-0000-0000-0000-000000000000'),
  false,
  'end_game clears is_spectator for the late joiner');

-- ─── 2. start_game then assigns the (now non-spectator) joiner a role ───────

-- Re-mark them as spectator to also exercise the defensive clear in start_game.
UPDATE public.players
   SET is_spectator = true
 WHERE id = 'a4000000-0000-0000-0000-000000000000';

SELECT set_config('request.headers',
  '{"x-device-id":"a1000000-0000-0000-0000-000000000000"}', true);
SET LOCAL ROLE anon;

SELECT lives_ok(
  $$SELECT public.start_game(
      'f1000000-0000-0000-0000-000000000000'::uuid,
      'hash-host',
      2,
      'banana'
    )$$,
  'start_game succeeds for game 2');

RESET ROLE;

-- The late joiner should have a role assignment in game 2 (they were a
-- spectator entering this start_game; the defensive clear should have
-- promoted them before role assignment).
SELECT is(
  (SELECT count(*)::int
   FROM public.role_assignments ra
   JOIN public.games g ON g.id = ra.game_id
   WHERE g.room_id = 'f1000000-0000-0000-0000-000000000000'::uuid
     AND g.index   = 2
     AND ra.player_id = 'a4000000-0000-0000-0000-000000000000'::uuid),
  1,
  'late joiner receives a role assignment in the next game');

SELECT * FROM finish();
ROLLBACK;
