-- E5-T4: get_co_imposters RPC — imposter mutual visibility on reveal.
--
-- When config_snapshot->>'imposters_see_each_other' is true, an imposter may
-- learn the display names of the other imposters in the same game.  Civilians
-- and imposters in games with the setting off always receive an empty result.
--
-- Security model:
--   SECURITY DEFINER with an explicit search_path so we fully control what
--   tables are accessible.  The caller must be an imposter in the requested
--   game; all other callers silently receive zero rows (no error that could
--   be used to infer role information via timing or error branches).

CREATE OR REPLACE FUNCTION public.get_co_imposters(p_game_id uuid)
RETURNS TABLE(player_id uuid, display_name text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_caller_id uuid;
  v_see_each_other boolean;
BEGIN
  v_caller_id := public.requesting_player_id();

  -- Verify the caller is an imposter in this game AND the setting is on.
  -- If either condition fails, return an empty result set (no information leak).
  SELECT
    (g.config_snapshot->>'imposters_see_each_other')::boolean
  INTO v_see_each_other
  FROM public.role_assignments ra
  JOIN public.games g ON g.id = ra.game_id
  WHERE ra.game_id = p_game_id
    AND ra.player_id = v_caller_id
    AND ra.role = 'imposter';

  IF NOT FOUND OR v_see_each_other IS NOT TRUE THEN
    RETURN;
  END IF;

  -- Return the other imposters' IDs and display names.
  RETURN QUERY
    SELECT ra.player_id, p.display_name
    FROM public.role_assignments ra
    JOIN public.players p ON p.id = ra.player_id
    WHERE ra.game_id = p_game_id
      AND ra.role = 'imposter'
      AND ra.player_id != v_caller_id;
END;
$$;

-- Restrict direct calls from public; grant only to anon (Supabase anon key).
REVOKE EXECUTE ON FUNCTION public.get_co_imposters(uuid) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.get_co_imposters(uuid) TO anon;
