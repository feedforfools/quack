-- E3-T11/E3-T12: RLS and RPC tests for seen_at / mark_game_seen / all_players_seen.
--
-- Test UUIDs (distinct from other test files):
--   Room:   a1000000-0000-0000-0000-000000000001
--   Round/Game: c1000000-0000-0000-0000-000000000001
--   Alice:  b1000000-0000-0000-0000-000000000001  (player 1)
--   Bob:    b1000000-0000-0000-0000-000000000002  (player 2)

BEGIN;

SELECT plan(6);

-- ── Fixtures (superuser, bypasses RLS) ───────────────────────────────────────

INSERT INTO public.rooms (id, code, host_player_id, host_secret_hash, state)
VALUES (
  'a1000000-0000-0000-0000-000000000001',
  'SEENXX',
  'b1000000-0000-0000-0000-000000000001',
  'fakehash-seen',
  'round_active'
);

INSERT INTO public.players (id, room_id, display_name)
VALUES
  ('b1000000-0000-0000-0000-000000000001',
   'a1000000-0000-0000-0000-000000000001',
   'Alice'),
  ('b1000000-0000-0000-0000-000000000002',
   'a1000000-0000-0000-0000-000000000001',
   'Bob');

INSERT INTO public.games (id, room_id, index, config_snapshot)
VALUES (
  'c1000000-0000-0000-0000-000000000001',
  'a1000000-0000-0000-0000-000000000001',
  0,
  '{}'
);

INSERT INTO public.role_assignments (game_id, player_id, role, word, seen_at)
VALUES
  ('c1000000-0000-0000-0000-000000000001',
   'b1000000-0000-0000-0000-000000000001',
   'civilian', 'pizza', NULL),
  ('c1000000-0000-0000-0000-000000000001',
   'b1000000-0000-0000-0000-000000000002',
   'imposter', NULL, NULL);

-- ── Test 1: Alice can stamp her own seen_at ───────────────────────────────────

SELECT set_config('request.headers',
  '{"x-device-id": "b1000000-0000-0000-0000-000000000001"}', true);

SELECT lives_ok(
  $$ SELECT public.mark_game_seen('c1000000-0000-0000-0000-000000000001') $$,
  'Alice can stamp her own seen_at via mark_game_seen'
);

-- ── Test 2: Stamping is idempotent ────────────────────────────────────────────

SELECT set_config('request.headers',
  '{"x-device-id": "b1000000-0000-0000-0000-000000000001"}', true);

SELECT is(
  (
    SELECT count(*) FILTER (WHERE seen_at IS NOT NULL)
    FROM   public.role_assignments
    WHERE  game_id   = 'c1000000-0000-0000-0000-000000000001'
      AND  player_id = 'b1000000-0000-0000-0000-000000000001'
  )::int,
  1,
  'Alice seen_at is set after mark_game_seen'
);

-- Call again to verify idempotency (no error, timestamp does not change).
SELECT public.mark_game_seen('c1000000-0000-0000-0000-000000000001');

SELECT is(
  (
    SELECT count(*) FILTER (WHERE seen_at IS NOT NULL)
    FROM   public.role_assignments
    WHERE  game_id   = 'c1000000-0000-0000-0000-000000000001'
      AND  player_id = 'b1000000-0000-0000-0000-000000000001'
  )::int,
  1,
  'mark_game_seen is idempotent (second call is a no-op)'
);

-- ── Test 3: RLS blocks direct UPDATE of another player's seen_at ─────────────
-- RLS silently blocks the update (0 rows affected); no error is thrown.

SET ROLE anon;
SELECT set_config('request.headers',
  '{"x-device-id": "b1000000-0000-0000-0000-000000000001"}', true);

UPDATE public.role_assignments
   SET seen_at = now()
 WHERE game_id   = 'c1000000-0000-0000-0000-000000000001'
   AND player_id = 'b1000000-0000-0000-0000-000000000002';

RESET ROLE;

SELECT is(
  (
    SELECT seen_at
    FROM   public.role_assignments
    WHERE  game_id   = 'c1000000-0000-0000-0000-000000000001'
      AND  player_id = 'b1000000-0000-0000-0000-000000000002'
  ),
  NULL::timestamptz,
  'Alice cannot update Bob''s seen_at via direct UPDATE (RLS blocks it)'
);

-- ── Test 4: all_players_seen returns FALSE while Bob has not yet seen ─────────

SELECT is(
  public.all_players_seen('c1000000-0000-0000-0000-000000000001'),
  false,
  'all_players_seen is FALSE when Bob has not yet seen'
);

-- Stamp Bob (superuser context).
SELECT set_config('request.headers',
  '{"x-device-id": "b1000000-0000-0000-0000-000000000002"}', true);
SELECT public.mark_game_seen('c1000000-0000-0000-0000-000000000001');

-- ── Test 5: all_players_seen returns TRUE when all players have seen ──────────

SELECT is(
  public.all_players_seen('c1000000-0000-0000-0000-000000000001'),
  true,
  'all_players_seen is TRUE when all players have seen'
);

SELECT * FROM finish();
ROLLBACK;
