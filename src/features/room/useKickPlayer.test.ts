import { renderHook, act } from "@testing-library/react";
import { useKickPlayer } from "./useKickPlayer";

// ─── Module mocks ──────────────────────────────────────────────────────────────

vi.mock("@/lib/supabase", () => ({
  supabaseWithDevice: vi.fn(),
  supabase: {
    channel: vi.fn(() => ({
      subscribe: vi.fn(),
    })),
    removeChannel: vi.fn(),
  },
}));

import { supabaseWithDevice, supabase } from "@/lib/supabase";

const mockDevice = vi.mocked(supabaseWithDevice);
const mockSingleton = supabase as unknown as {
  channel: ReturnType<typeof vi.fn>;
  removeChannel: ReturnType<typeof vi.fn>;
};

// ─── Constants ─────────────────────────────────────────────────────────────────

const DEVICE_ID = "device-uuid-aaaa";
const ROOM_ID = "room-uuid-bbbb";
const PLAYER_ID = "player-uuid-cccc";
const HOST_SECRET_KEY = `quack_host_secret_${ROOM_ID}`;
const FAKE_HOST_SECRET = "fake-raw-secret";

// ─── Stub builder ──────────────────────────────────────────────────────────────

function makeRpcStub({ rpcError = null }: { rpcError?: unknown } = {}) {
  const rpc = vi.fn().mockResolvedValue({ error: rpcError });
  return { rpc };
}

// ─── Setup / teardown ─────────────────────────────────────────────────────────

afterEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
});

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("useKickPlayer", () => {
  it("returns false when no host secret is in localStorage", async () => {
    mockDevice.mockReturnValue(
      makeRpcStub() as unknown as ReturnType<typeof supabaseWithDevice>,
    );
    const { result } = renderHook(() => useKickPlayer());

    let outcome: boolean | undefined;
    await act(async () => {
      outcome = await result.current.kickPlayer({
        deviceId: DEVICE_ID,
        roomId: ROOM_ID,
        playerId: PLAYER_ID,
      });
    });

    expect(outcome).toBe(false);
    const stub = makeRpcStub();
    mockDevice.mockReturnValue(
      stub as unknown as ReturnType<typeof supabaseWithDevice>,
    );
    expect(stub.rpc).not.toHaveBeenCalled();
  });

  it("calls kick_player RPC with hashed secret and correct args", async () => {
    localStorage.setItem(HOST_SECRET_KEY, FAKE_HOST_SECRET);
    const stub = makeRpcStub();
    mockDevice.mockReturnValue(
      stub as unknown as ReturnType<typeof supabaseWithDevice>,
    );

    const { result } = renderHook(() => useKickPlayer());

    await act(async () => {
      await result.current.kickPlayer({
        deviceId: DEVICE_ID,
        roomId: ROOM_ID,
        playerId: PLAYER_ID,
      });
    });

    expect(stub.rpc).toHaveBeenCalledWith(
      "kick_player",
      expect.objectContaining({
        p_room_id: ROOM_ID,
        p_player_id: PLAYER_ID,
        p_host_secret_hash: expect.stringMatching(/^[0-9a-f]{64}$/),
      }),
    );
  });

  it("returns true and broadcasts player_kicked on success", async () => {
    localStorage.setItem(HOST_SECRET_KEY, FAKE_HOST_SECRET);
    mockDevice.mockReturnValue(
      makeRpcStub() as unknown as ReturnType<typeof supabaseWithDevice>,
    );

    const subscribeFn = vi.fn();
    mockSingleton.channel.mockReturnValue({ subscribe: subscribeFn });

    const { result } = renderHook(() => useKickPlayer());

    let outcome: boolean | undefined;
    await act(async () => {
      outcome = await result.current.kickPlayer({
        deviceId: DEVICE_ID,
        roomId: ROOM_ID,
        playerId: PLAYER_ID,
      });
    });

    expect(outcome).toBe(true);
    expect(mockSingleton.channel).toHaveBeenCalledWith(`room:${ROOM_ID}`);
    expect(subscribeFn).toHaveBeenCalled();
  });

  it("returns false when RPC returns an error", async () => {
    localStorage.setItem(HOST_SECRET_KEY, FAKE_HOST_SECRET);
    mockDevice.mockReturnValue(
      makeRpcStub({
        rpcError: { message: "not_host" },
      }) as unknown as ReturnType<typeof supabaseWithDevice>,
    );

    const { result } = renderHook(() => useKickPlayer());

    let outcome: boolean | undefined;
    await act(async () => {
      outcome = await result.current.kickPlayer({
        deviceId: DEVICE_ID,
        roomId: ROOM_ID,
        playerId: PLAYER_ID,
      });
    });

    expect(outcome).toBe(false);
    // No broadcast on failure.
    expect(mockSingleton.channel).not.toHaveBeenCalled();
  });

  it("sets loading true while in-flight and false when done", async () => {
    localStorage.setItem(HOST_SECRET_KEY, FAKE_HOST_SECRET);

    let resolveRpc!: (v: unknown) => void;
    const rpcPromise = new Promise((res) => {
      resolveRpc = res;
    });
    mockDevice.mockReturnValue({
      rpc: vi.fn().mockReturnValue(rpcPromise),
    } as unknown as ReturnType<typeof supabaseWithDevice>);
    mockSingleton.channel.mockReturnValue({ subscribe: vi.fn() });

    const { result } = renderHook(() => useKickPlayer());

    expect(result.current.loading).toBe(false);

    let kickPromise!: Promise<boolean>;
    act(() => {
      kickPromise = result.current.kickPlayer({
        deviceId: DEVICE_ID,
        roomId: ROOM_ID,
        playerId: PLAYER_ID,
      });
    });

    await act(async () => {
      resolveRpc({ error: null });
      await kickPromise;
    });

    expect(result.current.loading).toBe(false);
  });
});
