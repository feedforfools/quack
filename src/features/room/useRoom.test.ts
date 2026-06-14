import { renderHook, act } from "@testing-library/react";
import { useRoom } from "./useRoom";

vi.mock("@/lib/supabase", () => ({
  supabaseWithDevice: vi.fn(),
}));

vi.mock("@/lib/log", () => ({
  log: {
    error: vi.fn(),
    warn: vi.fn(),
  },
}));

import { supabaseWithDevice } from "@/lib/supabase";

const mockClientFactory = vi.mocked(supabaseWithDevice);

async function flushMicrotasks(count = 4) {
  for (let index = 0; index < count; index += 1) {
    await Promise.resolve();
  }
}

type RoomRow = {
  id: string;
  host_player_id: string;
  config: unknown;
  state: "lobby" | "round_active" | "round_ended";
};

/**
 * Builds a Supabase client stub whose `rooms` lookup returns each entry of
 * `results` in turn (the last entry repeats once exhausted), so the
 * reconciliation poll can be driven across multiple fetches.
 */
function makeRoomClient(
  results: Array<{ data: RoomRow | null; error: { message: string } | null }>,
) {
  const queue = [...results];
  const last = results.at(-1) ?? { data: null, error: null };
  const maybeSingle = vi
    .fn()
    .mockImplementation(() => Promise.resolve(queue.shift() ?? last));
  const eq = vi.fn().mockReturnValue({ maybeSingle });
  const select = vi.fn().mockReturnValue({ eq });
  return {
    client: {
      from: vi.fn((table: string) => {
        if (table === "rooms") return { select };
        throw new Error(`Unexpected table: ${table}`);
      }),
    },
    spies: { maybeSingle },
  };
}

const ROOM: RoomRow = {
  id: "room-1",
  host_player_id: "device-1",
  config: { game_type: "imposter" },
  state: "lobby",
};

describe("useRoom", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("populates the room fields and leaves roomMissing false when the row exists", async () => {
    const { client } = makeRoomClient([{ data: ROOM, error: null }]);
    mockClientFactory.mockReturnValue(
      client as unknown as ReturnType<typeof supabaseWithDevice>,
    );

    const { result } = renderHook(() => useRoom("device-1", "ABCD"));

    await act(async () => {
      await flushMicrotasks();
    });

    expect(result.current.roomId).toBe("room-1");
    expect(result.current.isHost).toBe(true);
    expect(result.current.roomMissing).toBe(false);
    expect(result.current.loading).toBe(false);
  });

  it("flags roomMissing when the room row is absent (stale link or purged)", async () => {
    const { client } = makeRoomClient([{ data: null, error: null }]);
    mockClientFactory.mockReturnValue(
      client as unknown as ReturnType<typeof supabaseWithDevice>,
    );

    const { result } = renderHook(() => useRoom("device-1", "ABCD"));

    await act(async () => {
      await flushMicrotasks();
    });

    expect(result.current.roomMissing).toBe(true);
    expect(result.current.roomId).toBeNull();
  });

  it("does NOT flag roomMissing on a transient fetch error", async () => {
    const { client } = makeRoomClient([
      { data: null, error: { message: "network blip" } },
    ]);
    mockClientFactory.mockReturnValue(
      client as unknown as ReturnType<typeof supabaseWithDevice>,
    );

    const { result } = renderHook(() => useRoom("device-1", "ABCD"));

    await act(async () => {
      await flushMicrotasks();
    });

    expect(result.current.roomMissing).toBe(false);
  });

  it("flips roomMissing on the reconciliation poll when a live room is purged", async () => {
    // First fetch finds the room; a later poll finds it gone (inactivity purge).
    const { client, spies } = makeRoomClient([
      { data: ROOM, error: null },
      { data: null, error: null },
    ]);
    mockClientFactory.mockReturnValue(
      client as unknown as ReturnType<typeof supabaseWithDevice>,
    );

    const { result } = renderHook(() => useRoom("device-1", "ABCD"));

    await act(async () => {
      await flushMicrotasks();
    });
    expect(result.current.roomMissing).toBe(false);
    expect(result.current.roomId).toBe("room-1");

    // Advance past the 10 s poll interval — the next fetch sees no row.
    await act(async () => {
      vi.advanceTimersByTime(10_001);
      await flushMicrotasks();
    });

    expect(spies.maybeSingle).toHaveBeenCalledTimes(2);
    expect(result.current.roomMissing).toBe(true);
  });
});
