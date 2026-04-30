-- E2.5-T4: Enforce single-room membership at the database level.
--
-- A device UUID (players.id) may appear in at most one room at a time.
-- The composite PK (id, room_id) already prevents duplicate presence within a
-- single room; this unique index on just (id) prevents the same device from
-- simultaneously being a member of two different rooms.
--
-- The index is non-partial: since rows are hard-deleted on leave/end-room
-- (cascade), there are no "soft-deleted" rows to exempt from the constraint.

CREATE UNIQUE INDEX players_device_single_room ON public.players (id);
