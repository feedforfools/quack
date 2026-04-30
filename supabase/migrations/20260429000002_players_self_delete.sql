-- E2.5-T1: Allow players to delete their own row (Leave Room for non-host players).
--
-- Prior to this migration, DELETE on players was intentionally omitted from
-- the anon grant because room purge is privileged. This migration adds a
-- targeted GRANT and a narrow RLS policy so that a player can explicitly leave
-- a room by deleting only their own players row.
--
-- The rooms TTL purge (E4-T7) will run as a service-role function and is
-- unaffected by this policy — service_role bypasses RLS entirely.

-- ─── Grant ────────────────────────────────────────────────────────────────────

GRANT DELETE ON public.players TO anon;

-- ─── RLS policy ───────────────────────────────────────────────────────────────

-- DELETE: a device may only delete its own player row.
-- Using `id = public.requesting_player_id()` is sufficient: if the header is
-- absent or malformed, requesting_player_id() returns NULL and the expression
-- evaluates to false, silently blocking the delete.
CREATE POLICY "players_delete_own_row"
  ON public.players
  FOR DELETE
  TO anon
  USING (id = public.requesting_player_id());
