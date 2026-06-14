-- E6-T1: Multi-round elimination mode — schema.
--
-- The Imposter game gains a second flow ("multi" round mode): after each vote
-- the most-voted player is eliminated and the game continues round by round
-- until all imposters are out, imposters reach parity with civilians, a fixed
-- round cap is hit, or the host declares an imposter guessed the word.
--
-- The structures are deliberately game-agnostic (rounds + per-round votes +
-- eliminations + per-round results) so future social-deduction modes
-- (Lupus/Mafia, Secret Hitler) can reuse them.
--
-- Adds:
--   * games.current_round            — 1-based vote-round counter.
--   * role_assignments.eliminated_in_round — NULL while alive; set by
--     resolve_vote when the player is voted out in multi mode.
--   * votes.round                    — ballots are now scoped per round; the
--     PK becomes (game_id, round, voter_player_id).
--   * round_results                  — one row per resolved vote round with
--     the eliminated player (if any), their revealed role, and the final
--     per-target tally snapshot. Read only via the get_round_results RPC.
--   * game_outcome value 'word_guessed' — imposters win because one of them
--     guessed the secret word (host-declared).
--
-- Function changes land in the companion migration (multi_round_rpcs) because
-- a freshly added enum value cannot be referenced in the same transaction.

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. games / role_assignments columns
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE public.games
  ADD COLUMN current_round integer NOT NULL DEFAULT 1;

ALTER TABLE public.role_assignments
  ADD COLUMN eliminated_in_round integer;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. votes — per-round ballots
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE public.votes
  ADD COLUMN round integer NOT NULL DEFAULT 1;

ALTER TABLE public.votes
  DROP CONSTRAINT votes_pkey;

ALTER TABLE public.votes
  ADD PRIMARY KEY (game_id, round, voter_player_id);

DROP INDEX IF EXISTS public.votes_target_player_id_idx;
CREATE INDEX votes_round_target_idx
  ON public.votes (game_id, round, target_player_id);

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. round_results — per-round resolution history
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE public.round_results (
  game_id              uuid        NOT NULL REFERENCES public.games(id) ON DELETE CASCADE,
  round                integer     NOT NULL,
  -- NULL when the round ended in a tie / without votes (nobody eliminated).
  eliminated_player_id uuid,
  -- Revealed on elimination so the room learns who they voted out.
  eliminated_role      public.player_role,
  -- Snapshot of the final per-target tally: [{"player_id": uuid, "votes": n}].
  tally                jsonb       NOT NULL DEFAULT '[]'::jsonb,
  resolved_at          timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (game_id, round)
);

-- No direct SELECT grant — clients read this through the get_round_results
-- SECURITY DEFINER RPC, which gates the tally on config.show_vote_counts.

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. game_outcome — host-declared imposter word guess
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TYPE public.game_outcome ADD VALUE IF NOT EXISTS 'word_guessed';
