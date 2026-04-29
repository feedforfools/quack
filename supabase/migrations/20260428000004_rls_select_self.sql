-- Hotfix: allow hosts/players to SELECT their own row immediately after INSERT.
--
-- The original SELECT policies only matched rows where the requester is already
-- a member of the room (via player_in_room(room_id)). That created a chicken-
-- and-egg problem when the client uses `.insert(...).select(...)` (PostgREST
-- chains a RETURNING + post-SELECT through the SELECT policy):
--   1. Host INSERTs into `rooms`. WITH CHECK passes (host_player_id matches).
--   2. PostgREST tries to SELECT the new row to return it. SELECT policy fails
--      because no `players` row exists yet -> player_in_room() returns false.
--   3. The transaction is aborted with code 42501; the misleading error says
--      "new row violates row-level security policy".
--
-- Fix: add a second permissive SELECT policy on each table so the row's owner
-- can read it even before the membership row exists.

DROP POLICY IF EXISTS rooms_select_host ON public.rooms;
CREATE POLICY rooms_select_host
  ON public.rooms
  FOR SELECT
  TO anon
  USING (host_player_id = public.requesting_player_id());

DROP POLICY IF EXISTS players_select_self ON public.players;
CREATE POLICY players_select_self
  ON public.players
  FOR SELECT
  TO anon
  USING (id = public.requesting_player_id());
