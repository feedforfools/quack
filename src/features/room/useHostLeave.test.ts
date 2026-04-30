import { renderHook, act } from "@testing-library/react";
import { useHostLeave } from "./useHostLeave";

// ─── Module mocks ─────────────────────────────────────────────────────────────

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

// ─── Constants ────────────────────────────────────────────────────────────────

const DEVICE_ID = "device-uuid-aaaa";
const ROOM_ID = "room-uuid-bbbb";
const SUCCESSOR_ID = "successor-uuid-cccc";
const HOST_SECRET_KEY = `quack_host_secret_${ROOM_ID}`;
const FAKE_HOST_SECRET = "fake-raw-secret";

// ─── Stub builders ────────────────────────────────────────────────────────────

function makeRpcStub({ rpcError = null }: { rpcError?: unknown } = {}) {
  const rpc = vi.fn().mockResolvedValue({ error: rpcError });
  return { rpc };
}

// ─── Setup / teardown ─────────────────────────────────────────────────────────

afterEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
});

// ─── handOver ─────────────────────────────────────────────────────────────────

describe("useHostLeave — handOver", () => {
  it("returns false when no host secret is in localStorage", async () => {
    mockDevice.mockReturnValue(
      makeRpcStub() as unknown as ReturnType<typeof supabaseWithDevice>,
    );
    const { result } = renderHook(() => useHostLeave());

    let outcome: boolean | undefined;
    await act(async () => {
      outcome = await result.current.handOver({
        deviceId: DEVICE_ID,
        roomId: ROOM_ID,
        successorId: SUCCESSOR_ID,
      });
    });

    expect(outcome).toBe(false);
    expect(mockDevice).not.toHaveBeenCalled();
  });

  it("returns false when the transfer_host RPC returns an error", async () => {
    localStorage.setItem(HOST_SECRET_KEY, FAKE_HOST_SECRET);
    mockDevice.mockReturnValue(
      makeRpcStub({ rpcError: { message: "42501" } }) as unknown as ReturnType<
        typeof supabaseWithDevice
      >,
    );
    const { result } = renderHook(() => useHostLeave());

    let outcome: boolean | undefined;
    await act(async () => {
      outcome = await result.current.handOver({
        deviceId: DEVICE_ID,
        roomId: ROOM_ID,
        successorId: SUCCESSOR_ID,
      });
    });

    expect(outcome).toBe(false);
    // Host secret should remain in localStorage (not removed on failure).
    expect(localStorage.getItem(HOST_SECRET_KEY)).toBe(FAKE_HOST_SECRET);
  });

  it("returns true on success and removes own host secret from localStorage", async () => {
    localStorage.setItem(HOST_SECRET_KEY, FAKE_HOST_SECRET);
    mockDevice.mockReturnValue(
      makeRpcStub() as unknown as ReturnType<typeof supabaseWithDevice>,
    );
    const { result } = renderHook(() => useHostLeave());

    let outcome: boolean | undefined;
    await act(async () => {
      outcome = await result.current.handOver({
        deviceId: DEVICE_ID,
        roomId: ROOM_ID,
        successorId: SUCCESSOR_ID,
      });
    });

    expect(outcome).toBe(true);
    expect(localStorage.getItem(HOST_SECRET_KEY)).toBeNull();
  });

  it("calls transfer_host RPC with correct room and successor IDs", async () => {
    localStorage.setItem(HOST_SECRET_KEY, FAKE_HOST_SECRET);
    const stub = makeRpcStub();
    mockDevice.mockReturnValue(
      stub as unknown as ReturnType<typeof supabaseWithDevice>,
    );
    const { result } = renderHook(() => useHostLeave());

    await act(async () => {
      await result.current.handOver({
        deviceId: DEVICE_ID,
        roomId: ROOM_ID,
        successorId: SUCCESSOR_ID,
      });
    });

    expect(mockDevice).toHaveBeenCalledWith(DEVICE_ID);
    const rpcArgs = stub.rpc.mock.calls[0] as [string, Record<string, string>];
    expect(rpcArgs[0]).toBe("transfer_host");
    expect(rpcArgs[1].p_room_id).toBe(ROOM_ID);
    expect(rpcArgs[1].p_successor_id).toBe(SUCCESSOR_ID);
    // Hash values should be 64-char hex strings (SHA-256).
    expect(rpcArgs[1].p_host_secret_hash).toMatch(/^[0-9a-f]{64}$/);
    expect(rpcArgs[1].p_new_secret_hash).toMatch(/^[0-9a-f]{64}$/);
    // Current and new hashes must differ (new secret is freshly generated).
    expect(rpcArgs[1].p_host_secret_hash).not.toBe(rpcArgs[1].p_new_secret_hash);
  });

  it("starts a broadcast channel on the room after a successful handover", async () => {
    localStorage.setItem(HOST_SECRET_KEY, FAKE_HOST_SECRET);
    mockDevice.mockReturnValue(
      makeRpcStub() as unknown as ReturnType<typeof supabaseWithDevice>,
    );
    const { result } = renderHook(() => useHostLeave());

    await act(async () => {
      await result.current.handOver({
        deviceId: DEVICE_ID,
        roomId: ROOM_ID,
        successorId: SUCCESSOR_ID,
      });
    });

    expect(mockSingleton.channel).toHaveBeenCalledWith(`room:${ROOM_ID}`);
  });

  it("resets loading to false after completion", async () => {
    localStorage.setItem(HOST_SECRET_KEY, FAKE_HOST_SECRET);
    mockDevice.mockReturnValue(
      makeRpcStub() as unknown as ReturnType<typeof supabaseWithDevice>,
    );
    const { result } = renderHook(() => useHostLeave());

    await act(async () => {
      await result.current.handOver({
        deviceId: DEVICE_ID,
        roomId: ROOM_ID,
        successorId: SUCCESSOR_ID,
      });
    });

    expect(result.current.loading).toBe(false);
  });
});

// ─── endRoom ──────────────────────────────────────────────────────────────────

describe("useHostLeave — endRoom", () => {
  it("returns false when no host secret is in localStorage", async () => {
    mockDevice.mockReturnValue(
      makeRpcStub() as unknown as ReturnType<typeof supabaseWithDevice>,
    );
    const { result } = renderHook(() => useHostLeave());

    let outcome: boolean | undefined;
    await act(async () => {
      outcome = await result.current.endRoom({ deviceId: DEVICE_ID, roomId: ROOM_ID });
    });

    expect(outcome).toBe(false);
    expect(mockDevice).not.toHaveBeenCalled();
  });

  it("returns false when the end_room_as_host RPC returns an error", async () => {
    localStorage.setItem(HOST_SECRET_KEY, FAKE_HOST_SECRET);
    mockDevice.mockReturnValue(
      makeRpcStub({ rpcError: { message: "42501" } }) as unknown as ReturnType<
        typeof supabaseWithDevice
      >,
    );
    const { result } = renderHook(() => useHostLeave());

    let outcome: boolean | undefined;
    await act(async () => {
      outcome = await result.current.endRoom({ deviceId: DEVICE_ID, roomId: ROOM_ID });
    });

    expect(outcome).toBe(false);
    expect(localStorage.getItem(HOST_SECRET_KEY)).toBe(FAKE_HOST_SECRET);
  });

  it("returns true on success and removes own host secret from localStorage", async () => {
    localStorage.setItem(HOST_SECRET_KEY, FAKE_HOST_SECRET);
    mockDevice.mockReturnValue(
      makeRpcStub() as unknown as ReturnType<typeof supabaseWithDevice>,
    );
    const { result } = renderHook(() => useHostLeave());

    let outcome: boolean | undefined;
    await act(async () => {
      outcome = await result.current.endRoom({ deviceId: DEVICE_ID, roomId: ROOM_ID });
    });

    expect(outcome).toBe(true);
    expect(localStorage.getItem(HOST_SECRET_KEY)).toBeNull();
  });

  it("calls end_room_as_host RPC with correct params", async () => {
    localStorage.setItem(HOST_SECRET_KEY, FAKE_HOST_SECRET);
    const stub = makeRpcStub();
    mockDevice.mockReturnValue(
      stub as unknown as ReturnType<typeof supabaseWithDevice>,
    );
    const { result } = renderHook(() => useHostLeave());

    await act(async () => {
      await result.current.endRoom({ deviceId: DEVICE_ID, roomId: ROOM_ID });
    });

    expect(mockDevice).toHaveBeenCalledWith(DEVICE_ID);
    const rpcArgs = stub.rpc.mock.calls[0] as [string, Record<string, string>];
    expect(rpcArgs[0]).toBe("end_room_as_host");
    expect(rpcArgs[1].p_room_id).toBe(ROOM_ID);
    expect(rpcArgs[1].p_host_secret_hash).toMatch(/^[0-9a-f]{64}$/);
  });

  it("resets loading to false after completion", async () => {
    localStorage.setItem(HOST_SECRET_KEY, FAKE_HOST_SECRET);
    mockDevice.mockReturnValue(
      makeRpcStub() as unknown as ReturnType<typeof supabaseWithDevice>,
    );
    const { result } = renderHook(() => useHostLeave());

    await act(async () => {
      await result.current.endRoom({ deviceId: DEVICE_ID, roomId: ROOM_ID });
    });

    expect(result.current.loading).toBe(false);
  });
});
