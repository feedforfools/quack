import { renderHook, act } from "@testing-library/react";
import { useEndGame } from "./useEndGame";

// ─── Module mocks ─────────────────────────────────────────────────────────────

vi.mock("@/lib/supabase", () => ({
  supabaseWithDevice: vi.fn(),
}));

import { supabaseWithDevice } from "@/lib/supabase";

const mockDevice = vi.mocked(supabaseWithDevice);

// ─── Constants ────────────────────────────────────────────────────────────────

const DEVICE_ID = "device-uuid-aaaa";
const ROOM_ID = "room-uuid-bbbb";
const HOST_SECRET_KEY = `quack_host_secret_${ROOM_ID}`;
const FAKE_SECRET = "raw-host-secret-for-test";

// ─── Stub builder ─────────────────────────────────────────────────────────────

function makeClientStub({ rpcError = null }: { rpcError?: unknown } = {}) {
  const rpc = vi.fn().mockResolvedValue({ error: rpcError });
  return { rpc };
}

// ─── Setup / teardown ─────────────────────────────────────────────────────────

afterEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
});

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("useEndGame", () => {
  it("returns loading false and error null initially", () => {
    const stub = makeClientStub();
    mockDevice.mockReturnValue(stub as unknown as ReturnType<typeof supabaseWithDevice>);

    const { result } = renderHook(() => useEndGame());

    expect(result.current.loading).toBe(false);
    expect(result.current.error).toBeNull();
  });

  it("returns false and sets error when no host secret in localStorage", async () => {
    const stub = makeClientStub();
    mockDevice.mockReturnValue(stub as unknown as ReturnType<typeof supabaseWithDevice>);

    const { result } = renderHook(() => useEndGame());

    let ok: boolean | undefined;
    await act(async () => {
      ok = await result.current.endGame({ deviceId: DEVICE_ID, roomId: ROOM_ID });
    });

    expect(ok).toBe(false);
    expect(result.current.error).toBe("room.endGameError");
    expect(stub.rpc).not.toHaveBeenCalled();
  });

  it("calls end_game RPC with correct params and returns true on success", async () => {
    localStorage.setItem(HOST_SECRET_KEY, FAKE_SECRET);
    const stub = makeClientStub();
    mockDevice.mockReturnValue(stub as unknown as ReturnType<typeof supabaseWithDevice>);

    const { result } = renderHook(() => useEndGame());

    let ok: boolean | undefined;
    await act(async () => {
      ok = await result.current.endGame({ deviceId: DEVICE_ID, roomId: ROOM_ID });
    });

    expect(ok).toBe(true);
    expect(result.current.error).toBeNull();
    expect(stub.rpc).toHaveBeenCalledWith("end_game", {
      p_room_id: ROOM_ID,
      p_host_secret_hash: expect.stringMatching(/^[0-9a-f]{64}$/),
    });
  });

  it("returns false and sets error when RPC fails", async () => {
    localStorage.setItem(HOST_SECRET_KEY, FAKE_SECRET);
    const stub = makeClientStub({
      rpcError: { code: "42501", message: "caller is not the host" },
    });
    mockDevice.mockReturnValue(stub as unknown as ReturnType<typeof supabaseWithDevice>);

    const { result } = renderHook(() => useEndGame());

    let ok: boolean | undefined;
    await act(async () => {
      ok = await result.current.endGame({ deviceId: DEVICE_ID, roomId: ROOM_ID });
    });

    expect(ok).toBe(false);
    expect(result.current.error).toBe("room.endGameError");
  });

  it("resets loading to false after completion", async () => {
    localStorage.setItem(HOST_SECRET_KEY, FAKE_SECRET);
    const stub = makeClientStub();
    mockDevice.mockReturnValue(stub as unknown as ReturnType<typeof supabaseWithDevice>);

    const { result } = renderHook(() => useEndGame());

    await act(async () => {
      await result.current.endGame({ deviceId: DEVICE_ID, roomId: ROOM_ID });
    });

    expect(result.current.loading).toBe(false);
  });
});
