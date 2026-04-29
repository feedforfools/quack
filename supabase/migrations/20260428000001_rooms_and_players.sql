-- E2-T1: rooms and players tables
-- Creates the core schema for room creation, joining, and the lobby roster.
-- RLS policies are added in the next migration (E2-T2).

-- ─── Custom types ─────────────────────────────────────────────────────────────

CREATE TYPE public.room_state AS ENUM (
    'lobby',
    'round_active',
    'round_ended'
);

-- ─── rooms ────────────────────────────────────────────────────────────────────
-- One row per active game room. Rows are physically deleted by the TTL purge
-- job (E4-T7) 24 h after last_activity_at, so no "purged" state is needed.
--
-- code:               6-char join code; unique across all rows because stale
--                     rooms are hard-deleted before a code can be reused.
-- host_player_id:     UUID of the player who created the room. Stored without a
--                     FK to players to avoid a circular dependency — the insert
--                     sequence creates rooms first, players second. Application
--                     logic maintains referential integrity.
-- host_secret_hash:   SHA-256 hex of the host-secret UUID held only in the
--                     host's localStorage. Used to authenticate host actions.
-- config:             JSONB bag of room settings (language, categories, imposter
--                     count, etc.). Locked into round.config_snapshot at start.
-- state:              Current lifecycle phase.
-- locked_after_start: When true, players who try to join mid-round are rejected.
-- last_activity_at:   Updated on every significant event; drives 24 h TTL purge.

CREATE TABLE public.rooms (
    id                  uuid              PRIMARY KEY DEFAULT gen_random_uuid(),
    code                text              NOT NULL,
    host_player_id      uuid              NOT NULL,
    host_secret_hash    text              NOT NULL,
    config              jsonb             NOT NULL DEFAULT '{}',
    state               public.room_state NOT NULL DEFAULT 'lobby',
    locked_after_start  boolean           NOT NULL DEFAULT false,
    created_at          timestamptz       NOT NULL DEFAULT now(),
    last_activity_at    timestamptz       NOT NULL DEFAULT now(),

    CONSTRAINT rooms_code_length CHECK (char_length(code) = 6)
);

-- Unique join code across all active rows.
CREATE UNIQUE INDEX rooms_code_unique ON public.rooms (code);

-- Used by the 24 h TTL purge job to find and delete stale rooms efficiently.
CREATE INDEX rooms_last_activity_at_idx ON public.rooms (last_activity_at);

-- Enable RLS immediately — deny-all until E2-T2 adds the policies.
-- This is the secure-by-default posture: no accidental open access between migrations.
ALTER TABLE public.rooms ENABLE ROW LEVEL SECURITY;

-- ─── players ──────────────────────────────────────────────────────────────────
-- One row per (device × room) pair. The same device UUID may appear in multiple
-- rooms across different sessions; the composite PK prevents duplicate presence
-- within a single room.
--
-- id:            Device UUID minted client-side and persisted in localStorage.
--                Matches quack_device_id in the player's browser.
-- room_id:       FK to rooms with CASCADE delete so player rows vanish when
--                their room is purged.
-- display_name:  User-supplied nickname; ephemeral, no PII beyond 24 h TTL.
-- is_ready:      Player has tapped Ready in the lobby.
-- is_connected:  Maintained by the Realtime presence heartbeat.
-- last_seen_at:  Updated by the presence heartbeat; used in host-migration logic
--                (E4-T2) to detect 30 s of absence.

CREATE TABLE public.players (
    id            uuid        NOT NULL,
    room_id       uuid        NOT NULL REFERENCES public.rooms (id) ON DELETE CASCADE,
    display_name  text        NOT NULL,
    is_ready      boolean     NOT NULL DEFAULT false,
    is_connected  boolean     NOT NULL DEFAULT false,
    joined_at     timestamptz NOT NULL DEFAULT now(),
    last_seen_at  timestamptz NOT NULL DEFAULT now(),

    CONSTRAINT players_display_name_length CHECK (char_length(display_name) BETWEEN 1 AND 30),

    PRIMARY KEY (id, room_id)
);

-- Used in every per-room query: roster fetch, presence update, round-start validation.
CREATE INDEX players_room_id_idx ON public.players (room_id);

-- Enable RLS immediately.
ALTER TABLE public.players ENABLE ROW LEVEL SECURITY;
