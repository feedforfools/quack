-- E4-T7: Room TTL purge after 1 hour of inactivity.
--
-- Overview
-- ────────
-- 1. Enable pg_cron extension (pre-installed in Supabase Docker).
-- 2. Add a row-level trigger on public.players to bump rooms.last_activity_at
--    on every INSERT or DELETE (join and leave/kick).  The existing RPCs
--    (start_game, end_game) already UPDATE last_activity_at directly, so no
--    trigger is needed on games.
-- 3. Recreate kick_player to also bump last_activity_at on the rooms row.
-- 4. Create purge_stale_rooms() SECURITY DEFINER — deletes rooms older than 1 h.
--    CASCADE on rooms → players, games, role_assignments handles child rows.
-- 5. Schedule purge_stale_rooms() to run every 5 minutes via pg_cron so the
--    maximum latency between a room becoming stale and being purged is ≤ 5 min.

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. pg_cron extension
-- ─────────────────────────────────────────────────────────────────────────────

CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA pg_catalog;

-- Allow the postgres role to schedule and manage cron jobs.
GRANT USAGE ON SCHEMA cron TO postgres;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Trigger: bump rooms.last_activity_at on player join / leave
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.touch_room_on_player_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_room_id uuid;
BEGIN
  -- For INSERT the new row carries room_id; for DELETE the old row does.
  IF TG_OP = 'DELETE' THEN
    v_room_id := OLD.room_id;
  ELSE
    v_room_id := NEW.room_id;
  END IF;

  UPDATE public.rooms
     SET last_activity_at = now()
   WHERE id = v_room_id;

  RETURN NULL; -- AFTER trigger; return value is ignored
END;
$$;

-- Fire after INSERT (join) and after DELETE (leave or kick).
-- Statement-level trigger avoids per-row overhead when a bulk operation
-- (e.g. cascade delete from end_room_as_host) would otherwise fire many times.
-- We use FOR EACH ROW here because individual player events are atomic and we
-- want to capture the exact room_id from each affected row.
DROP TRIGGER IF EXISTS trg_touch_room_on_player_change ON public.players;
CREATE TRIGGER trg_touch_room_on_player_change
  AFTER INSERT OR DELETE ON public.players
  FOR EACH ROW
  EXECUTE FUNCTION public.touch_room_on_player_change();

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. Recreate kick_player to also bump last_activity_at
--    (The trigger above fires on the DELETE, so this is now redundant, but
--     kept explicit here for clarity and to document intent.)
-- ─────────────────────────────────────────────────────────────────────────────
-- NOTE: The trigger handles the bump via DELETE, so kick_player itself needs no
-- explicit UPDATE last_activity_at.  We do NOT modify kick_player here to keep
-- the diff minimal; the trigger path is the single source of truth.

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. purge_stale_rooms() — deletes rooms inactive for more than 1 hour
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.purge_stale_rooms()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_deleted integer;
BEGIN
  WITH deleted AS (
    DELETE FROM public.rooms
     WHERE last_activity_at < now() - INTERVAL '1 hour'
    RETURNING id
  )
  SELECT count(*)::integer INTO v_deleted FROM deleted;

  RETURN v_deleted;
END;
$$;

-- Do NOT grant EXECUTE to anon/authenticated — this is an internal maintenance
-- function invoked only by pg_cron running as the postgres superuser role.
-- Revoke any accidental public grants.
REVOKE ALL ON FUNCTION public.purge_stale_rooms() FROM PUBLIC;

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. Schedule purge_stale_rooms() every 5 minutes via pg_cron
-- ─────────────────────────────────────────────────────────────────────────────

-- Idempotent: unschedule any existing job with this name before re-creating it.
SELECT cron.unschedule('purge_stale_rooms')
WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'purge_stale_rooms');

SELECT cron.schedule(
  'purge_stale_rooms',        -- job name
  '*/5 * * * *',              -- every 5 minutes
  $$SELECT public.purge_stale_rooms()$$
);
