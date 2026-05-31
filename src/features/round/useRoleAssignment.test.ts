import { renderHook, act, waitFor } from "@testing-library/react";
import { useRoleAssignment } from "./useRoleAssignment";

// ─── Module mock ──────────────────────────────────────────────────────────────

vi.mock("@/lib/supabase", () => ({
  supabaseWithDevice: vi.fn(),
}));

import { supabaseWithDevice } from "@/lib/supabase";

const mockDevice = vi.mocked(supabaseWithDevice);

// ─── Constants ────────────────────────────────────────────────────────────────

const DEVICE_ID = "device-uuid-aaaa";
const ROOM_ID = "room-uuid-bbbb";
const GAME_ID = "game-uuid-cccc";

// ─── Stub builder ─────────────────────────────────────────────────────────────

function makeClientStub({
  round = {
    id: GAME_ID,
    index: 1,
    ends_at: null,
    started_at: "2026-01-01T00:00:00Z",
  } as {
    id: string;
    index: number;
    ends_at: string | null;
    started_at: string;
    config_snapshot?: Record<string, unknown>;
    timer_paused_seconds?: number | null;
    starter_player_id?: string | null;
    discussion_direction?: string | null;
  } | null,
  ra = {
    role: "civilian" as "civilian" | "imposter",
    word: "pizza",
    seen_at: null,
  } as {
    role: "civilian" | "imposter";
    word: string | null;
    seen_at: string | null;
  } | null,
  roundError = null as unknown,
  raError = null as unknown,
} = {}) {
  // Rounds query chain: .select().eq().order().limit().maybeSingle()
  const roundsMaybeSingle = vi
    .fn()
    .mockResolvedValue({ data: round, error: roundError });
  const roundsLimit = vi.fn(() => ({ maybeSingle: roundsMaybeSingle }));
  const roundsOrder = vi.fn(() => ({ limit: roundsLimit }));
  const roundsEq = vi.fn(() => ({ order: roundsOrder }));
  const roundsSelect = vi.fn(() => ({ eq: roundsEq }));

  // Role assignments query chain: .select().eq().eq().maybeSingle()
  const raMaybeSingle = vi.fn().mockResolvedValue({ data: ra, error: raError });
  const raEq2 = vi.fn(() => ({ maybeSingle: raMaybeSingle }));
  const raEq1 = vi.fn(() => ({ eq: raEq2 }));
  const raSelect = vi.fn(() => ({ eq: raEq1 }));

  const from = vi.fn((table: string) => {
    if (table === "games") return { select: roundsSelect };
    return { select: raSelect };
  });

  return { from };
}

// ─── Setup / teardown ─────────────────────────────────────────────────────────

afterEach(() => {
  vi.clearAllMocks();
});

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("useRoleAssignment", () => {
  it("returns null assignment when roomState is lobby", () => {
    const stub = makeClientStub();
    mockDevice.mockReturnValue(
      stub as unknown as ReturnType<typeof supabaseWithDevice>,
    );

    const { result } = renderHook(() =>
      useRoleAssignment(DEVICE_ID, ROOM_ID, "lobby"),
    );

    expect(result.current.assignment).toBeNull();
    expect(result.current.loading).toBe(false);
    expect(stub.from).not.toHaveBeenCalled();
  });

  it("fetches and returns assignment when round_active", async () => {
    const stub = makeClientStub();
    mockDevice.mockReturnValue(
      stub as unknown as ReturnType<typeof supabaseWithDevice>,
    );

    const { result } = renderHook(() =>
      useRoleAssignment(DEVICE_ID, ROOM_ID, "round_active"),
    );

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.assignment).toEqual({
      gameId: GAME_ID,
      roundIndex: 1,
      role: "civilian",
      word: "pizza",
      endsAt: null,
      timerSeconds: null,
      pausedSeconds: null,
      starterPlayerId: null,
      discussionDirection: null,
      seenAt: null,
      coImposters: [],
      hints: [],
    });
  });

  it("returns null when no round exists for the room", async () => {
    const stub = makeClientStub({ round: null });
    mockDevice.mockReturnValue(
      stub as unknown as ReturnType<typeof supabaseWithDevice>,
    );

    const { result } = renderHook(() =>
      useRoleAssignment(DEVICE_ID, ROOM_ID, "round_active"),
    );

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.assignment).toBeNull();
  });

  it("returns null when no role_assignment row exists", async () => {
    const stub = makeClientStub({ ra: null });
    mockDevice.mockReturnValue(
      stub as unknown as ReturnType<typeof supabaseWithDevice>,
    );

    const { result } = renderHook(() =>
      useRoleAssignment(DEVICE_ID, ROOM_ID, "round_active"),
    );

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.assignment).toBeNull();
  });

  it("returns null and does not throw when games fetch errors", async () => {
    const stub = makeClientStub({
      roundError: { code: "PGRST301", message: "error" },
    });
    mockDevice.mockReturnValue(
      stub as unknown as ReturnType<typeof supabaseWithDevice>,
    );

    const { result } = renderHook(() =>
      useRoleAssignment(DEVICE_ID, ROOM_ID, "round_active"),
    );

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.assignment).toBeNull();
  });

  it("clears assignment when roomState transitions back to lobby", async () => {
    const stub = makeClientStub();
    mockDevice.mockReturnValue(
      stub as unknown as ReturnType<typeof supabaseWithDevice>,
    );

    const { result, rerender } = renderHook(
      ({ state }: { state: "lobby" | "round_active" | "round_ended" }) =>
        useRoleAssignment(DEVICE_ID, ROOM_ID, state),
      {
        initialProps: {
          state: "round_active" as "lobby" | "round_active" | "round_ended",
        },
      },
    );

    await waitFor(() => expect(result.current.assignment).not.toBeNull());

    act(() => {
      rerender({ state: "lobby" });
    });

    expect(result.current.assignment).toBeNull();
  });

  it("uses config_snapshot.timer_seconds as the timer total", async () => {
    // timerSeconds is the configured duration so the strip starts full,
    // independent of when the host actually started the countdown.
    const stub = makeClientStub({
      round: {
        id: GAME_ID,
        index: 1,
        started_at: "2026-01-01T00:00:00.000Z",
        ends_at: "2026-01-01T00:01:30.000Z",
        config_snapshot: { timer_seconds: 300 },
      },
    });
    mockDevice.mockReturnValue(
      stub as unknown as ReturnType<typeof supabaseWithDevice>,
    );

    const { result } = renderHook(() =>
      useRoleAssignment(DEVICE_ID, ROOM_ID, "round_active"),
    );

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.assignment?.timerSeconds).toBe(300);
    expect(result.current.assignment?.endsAt).toBe("2026-01-01T00:01:30.000Z");
  });

  it("sets timerSeconds to null when config timer_seconds is 0", async () => {
    const stub = makeClientStub({
      round: {
        id: GAME_ID,
        index: 1,
        started_at: "2026-01-01T00:00:00.000Z",
        ends_at: "2026-01-01T00:00:59.500Z",
        config_snapshot: { timer_seconds: 0 },
      },
    });
    mockDevice.mockReturnValue(
      stub as unknown as ReturnType<typeof supabaseWithDevice>,
    );

    const { result } = renderHook(() =>
      useRoleAssignment(DEVICE_ID, ROOM_ID, "round_active"),
    );

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.assignment?.timerSeconds).toBeNull();
  });

  it("sets timerSeconds to null when ends_at is null", async () => {
    const stub = makeClientStub({
      round: {
        id: GAME_ID,
        index: 1,
        started_at: "2026-01-01T00:00:00.000Z",
        ends_at: null,
      },
    });
    mockDevice.mockReturnValue(
      stub as unknown as ReturnType<typeof supabaseWithDevice>,
    );

    const { result } = renderHook(() =>
      useRoleAssignment(DEVICE_ID, ROOM_ID, "round_active"),
    );

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.assignment?.timerSeconds).toBeNull();
    expect(result.current.assignment?.endsAt).toBeNull();
  });

  it("exposes seenAt as null when the player has not yet peeked", async () => {
    const stub = makeClientStub({
      ra: { role: "civilian", word: "pizza", seen_at: null },
    });
    mockDevice.mockReturnValue(
      stub as unknown as ReturnType<typeof supabaseWithDevice>,
    );

    const { result } = renderHook(() =>
      useRoleAssignment(DEVICE_ID, ROOM_ID, "round_active"),
    );

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.assignment?.seenAt).toBeNull();
  });

  it("exposes seenAt as the server timestamp when the player has already peeked", async () => {
    const seenTimestamp = "2026-05-01T12:00:00.000Z";
    const stub = makeClientStub({
      ra: { role: "civilian", word: "pizza", seen_at: seenTimestamp },
    });
    mockDevice.mockReturnValue(
      stub as unknown as ReturnType<typeof supabaseWithDevice>,
    );

    const { result } = renderHook(() =>
      useRoleAssignment(DEVICE_ID, ROOM_ID, "round_active"),
    );

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.assignment?.seenAt).toBe(seenTimestamp);
  });
});
