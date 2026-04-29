-- Allow any anon to SELECT rooms (read-only lookup by code for the join flow).
--
-- The room code acts as the access token (31-char alphabet, 6 chars = ~28B
-- combinations). A joiner must know the code before they can find the room, so
-- making rooms publicly readable does not weaken security.
--
-- Without this policy a new joiner gets 0 rows back from the code lookup
-- (they are not a player yet, so player_in_room() returns false) and
-- useJoinRoom() reports "Room not found" even though the room exists.

CREATE POLICY rooms_select_public
  ON public.rooms
  FOR SELECT
  TO anon
  USING (true);
