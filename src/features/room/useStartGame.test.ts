import { renderHook, act } from "@testing-library/react";
import { useStartGame } from "./useStartGame";

// ─── Module mocks ─────────────────────────────────────────────────────────────

vi.mock("@/lib/supabase", () => ({
  supabaseWithDevice: vi.fn(),
}));

vi.mock("@/lib/words", () => ({
  fetchWordPools: vi.fn(),
  pickWord: vi.fn(),
}));

import { supabaseWithDevice } from "@/lib/supabase";
import { fetchWordPools, pickWord } from "@/lib/words";

const mockDevice = vi.mocked(supabaseWithDevice);
const mockFetchPools = vi.mocked(fetchWordPools);
const mockPickWord = vi.mocked(pickWord);

// ─── Constants ────────────────────────────────────────────────────────────────

const DEVICE_ID = "device-uuid-aaaa";
const ROOM_ID = "room-uuid-bbbb";
const HOST_SECRET_KEY = `quack_host_secret_${ROOM_ID}`;
const FAKE_SECRET = "raw-host-secret-for-test";
const FAKE_WORD = "pizza";

// ─── Stub builders ────────────────────────────────────────────────────────────

function makeClientStub({
  lastRound = null,
  rpcError = null,
}: {
  lastRound?: { index: number } | null;
  rpcError?: unknown;
} = {}) {
  const maybeSingle = vi.fn().mockResolvedValue({ data: lastRound, error: null });
  const limit = vi.fn(() => ({ maybeSingle }));
  const order = vi.fn(() => ({ limit }));
  const select = vi.fn(() => ({ eq: vi.fn(() => ({ order })) }));
  const from = vi.fn(() => ({ select }));
  const rpc = vi.fn().mockResolvedValue({ error: rpcError });
  return { from, rpc };
}

// ─── Setup / teardown ─────────────────────────────────────────────────────────

beforeEach(() => {
  mockFetchPools.mockResolvedValue([
    { version: 1, lang: "en", category: "food", words: [FAKE_WORD] },
  ]);
  mockPickWord.mockReturnValue(FAKE_WORD);
});

afterEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
});

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("useStartGame", () => {
  it("returns false and sets error when no host secret in localStorage", async () => {
    const stub = makeClientStub();
    mockDevice.mockReturnValue(stub as unknown as ReturnType<typeof supabaseWithDevice>);

    const { result } = renderHook(() => useStartGame());

    let ok: boolean | undefined;
    await act(async () => {
      ok = await result.current.startGame({
        deviceId: DEVICE_ID,
        roomId: ROOM_ID,
        language: "en",
        categories: ["food"],
      });
    });

    expect(ok).toBe(false);
    expect(result.current.error).toBe("room.startErrorNotHost");
    expect(stub.rpc).not.toHaveBeenCalled();
  });

  it("calls RPC with correct params and returns true on success", async () => {
    localStorage.setItem(HOST_SECRET_KEY, FAKE_SECRET);
    const stub = makeClientStub({ lastRound: null }); // no previous games → index 1
    mockDevice.mockReturnValue(stub as unknown as ReturnType<typeof supabaseWithDevice>);

    const { result } = renderHook(() => useStartGame());

    let ok: boolean | undefined;
    await act(async () => {
      ok = await result.current.startGame({
        deviceId: DEVICE_ID,
        roomId: ROOM_ID,
        language: "en",
        categories: ["food"],
      });
    });

    expect(ok).toBe(true);
    expect(result.current.error).toBeNull();

    // RPC must be called with p_intended_index = 1 (no prior games).
    expect(stub.rpc).toHaveBeenCalledWith("start_game", {
      p_room_id: ROOM_ID,
      p_host_secret_hash: expect.stringMatching(/^[0-9a-f]{64}$/),
      p_intended_index: 1,
      p_word: FAKE_WORD,
    });
  });

  it("uses next index when a previous game exists", async () => {
    localStorage.setItem(HOST_SECRET_KEY, FAKE_SECRET);
    const stub = makeClientStub({ lastRound: { index: 2 } }); // last game was 2 → next is 3
    mockDevice.mockReturnValue(stub as unknown as ReturnType<typeof supabaseWithDevice>);

    const { result } = renderHook(() => useStartGame());

    await act(async () => {
      await result.current.startGame({
        deviceId: DEVICE_ID,
        roomId: ROOM_ID,
        language: "en",
        categories: ["food"],
      });
    });

    expect(stub.rpc).toHaveBeenCalledWith(
      "start_game",
      expect.objectContaining({ p_intended_index: 3 }),
    );
  });

  it("returns false and sets error when RPC fails", async () => {
    localStorage.setItem(HOST_SECRET_KEY, FAKE_SECRET);
    const stub = makeClientStub({ rpcError: { code: "42501", message: "not host" } });
    mockDevice.mockReturnValue(stub as unknown as ReturnType<typeof supabaseWithDevice>);

    const { result } = renderHook(() => useStartGame());

    let ok: boolean | undefined;
    await act(async () => {
      ok = await result.current.startGame({
        deviceId: DEVICE_ID,
        roomId: ROOM_ID,
        language: "en",
        categories: ["food"],
      });
    });

    expect(ok).toBe(false);
    expect(result.current.error).toBe("room.startErrorGeneric");
  });

  it("does not log the word (privacy constraint)", async () => {
    localStorage.setItem(HOST_SECRET_KEY, FAKE_SECRET);
    const stub = makeClientStub();
    mockDevice.mockReturnValue(stub as unknown as ReturnType<typeof supabaseWithDevice>);

    const logSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);
    const infoSpy = vi.spyOn(console, "info").mockImplementation(() => undefined);

    const { result } = renderHook(() => useStartGame());
    await act(async () => {
      await result.current.startGame({
        deviceId: DEVICE_ID,
        roomId: ROOM_ID,
        language: "en",
        categories: ["food"],
      });
    });

    // The word value itself must not appear in any console output.
    for (const call of [...logSpy.mock.calls, ...infoSpy.mock.calls]) {
      const serialised = JSON.stringify(call);
      expect(serialised).not.toContain(FAKE_WORD);
    }

    logSpy.mockRestore();
    infoSpy.mockRestore();
  });

  it("tracks loading state correctly", async () => {
    localStorage.setItem(HOST_SECRET_KEY, FAKE_SECRET);

    let resolveRpc!: () => void;
    const rpcPromise = new Promise<{ error: null }>((res) => {
      resolveRpc = () => res({ error: null });
    });

    const maybeSingle = vi.fn().mockResolvedValue({ data: null, error: null });
    const limit = vi.fn(() => ({ maybeSingle }));
    const order = vi.fn(() => ({ limit }));
    const select = vi.fn(() => ({ eq: vi.fn(() => ({ order })) }));
    const from = vi.fn(() => ({ select }));
    const rpc = vi.fn().mockReturnValue(rpcPromise);
    mockDevice.mockReturnValue(
      { from, rpc } as unknown as ReturnType<typeof supabaseWithDevice>,
    );

    const { result } = renderHook(() => useStartGame());
    expect(result.current.loading).toBe(false);

    let callPromise: Promise<boolean>;
    act(() => {
      callPromise = result.current.startGame({
        deviceId: DEVICE_ID,
        roomId: ROOM_ID,
        language: "en",
        categories: ["food"],
      });
    });

    // After initiating, loading should be true.
    expect(result.current.loading).toBe(true);

    await act(async () => {
      resolveRpc();
      await callPromise;
    });

    expect(result.current.loading).toBe(false);
  });
});
