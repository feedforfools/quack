-- E3-T1: rounds and role_assignments tables + RLS.
--
-- rounds     — one row per round within a room; inserted by the start_round
--              RPC (E3-T4). Members can SELECT rounds for their room.
-- role_assignments — one row per (round, player); inserted by the same RPC.
--              RLS restricts SELECT and UPDATE to the owning player only.
--              UPDATE is allowed so that a player can set revealed_at when
--              they flip their card.
--
-- INSERT into both tables is intentionally withheld from the anon role.
-- All writes go through SECURITY DEFINER RPCs (start_round, end_round).

-- ── player_role enum ──────────────────────────────────────────────────────────

CREATE TYPE public.player_role AS ENUM ('civilian', 'imposter');

-- ── rounds ────────────────────────────────────────────────────────────────────

CREATE TABLE public.rounds (
  id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id          uuid        NOT NULL REFERENCES public.rooms(id) ON DELETE CASCADE,
  index            integer     NOT NULL,
  config_snapshot  jsonb       NOT NULL DEFAULT '{}',
  started_at       timestamptz NOT NULL DEFAULT now(),
  ended_at         timestamptz,
  CONSTRAINT rounds_room_index_unique UNIQUE (room_id, index)
);

CREATE INDEX rounds_room_id_idx ON public.rounds (room_id);

ALTER TABLE public.rounds ENABLE ROW LEVEL SECURITY;

-- Grant SELECT only; INSERT/UPDATE/DELETE are reserved for SECURITY DEFINER RPCs.
GRANT SELECT ON public.rounds TO anon;

-- Members can read all rounds for rooms they belong to.
CREATE POLICY "rounds_select_member"
  ON public.rounds
  FOR SELECT
  TO anon
  USING (public.player_in_room(room_id));

-- ── role_assignments ──────────────────────────────────────────────────────────

CREATE TABLE public.role_assignments (
  round_id    uuid               NOT NULL REFERENCES public.rounds(id)   ON DELETE CASCADE,
  player_id   uuid               NOT NULL,
  role        public.player_role NOT NULL,
  word        text,
  revealed_at timestamptz,
  PRIMARY KEY (round_id, player_id)
);

CREATE INDEX role_assignments_player_id_idx ON public.role_assignments (player_id);

ALTER TABLE public.role_assignments ENABLE ROW LEVEL SECURITY;

-- Grant SELECT and UPDATE; INSERT is reserved for the start_round RPC.
GRANT SELECT, UPDATE ON public.role_assignments TO anon;

-- A player can read ONLY their own assignment row.
-- This is the privacy-critical constraint: no player can see another's role or word.
CREATE POLICY "role_assignments_select_own"
  ON public.role_assignments
  FOR SELECT
  TO anon
  USING (player_id = public.requesting_player_id());

-- A player can update ONLY their own row (to set revealed_at when flipping the card).
CREATE POLICY "role_assignments_update_own"
  ON public.role_assignments
  FOR UPDATE
  TO anon
  USING     (player_id = public.requesting_player_id())
  WITH CHECK (player_id = public.requesting_player_id());
