import { renderHook, act } from "@testing-library/react";
import { useLeaveRoom } from "./useLeaveRoom";

// ─── Module mock ─────────────────────────────────────────────────────────────

vi.mock("@/lib/supabase", () => {
  const mockSend = vi.fn().mockResolvedValue({});
  const mockSubscribe = vi.fn().mockImplementation((cb: (status: string) => void) => {
    cb("SUBSCRIBED");
    return { send: mockSend };
  });
  const mockChannel = vi.fn().mockReturnValue({ subscribe: mockSubscribe, send: mockSend });
  const mockRemoveChannel = vi.fn().mockResolvedValue({});
  return {
    supabaseWithDevice: vi.fn(),
    supabase: { channel: mockChannel, removeChannel: mockRemoveChannel },
  };
});

import { supabaseWithDevice } from "@/lib/supabase";

const mockClient = vi.mocked(supabaseWithDevice);

// ─── Stub builder ─────────────────────────────────────────────────────────────

/**
 * Builds a stub for:
 *   client.from("players").delete().eq("id", ...).eq("room_id", ...)
 */
function makeStub({ deleteError = null }: { deleteError?: unknown } = {}) {
  const secondEq = vi.fn().mockResolvedValue({ error: deleteError });
  const firstEq = vi.fn().mockReturnValue({ eq: secondEq });
  const del = vi.fn().mockReturnValue({ eq: firstEq });

  return {
    from: vi.fn().mockReturnValue({ delete: del }),
  };
}

// ─── Tests ────────────────────────────────────────────────────────────────────

const DEVICE_ID = "device-uuid-1234";
const ROOM_ID = "room-uuid-5678";

describe("useLeaveRoom", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("returns loading=false and leaveRoom callback initially", () => {
    mockClient.mockReturnValue(makeStub() as unknown as ReturnType<typeof supabaseWithDevice>);
    const { result } = renderHook(() => useLeaveRoom());
    expect(result.current.loading).toBe(false);
    expect(typeof result.current.leaveRoom).toBe("function");
  });

  it("returns true on a successful delete", async () => {
    mockClient.mockReturnValue(makeStub() as unknown as ReturnType<typeof supabaseWithDevice>);
    const { result } = renderHook(() => useLeaveRoom());

    let outcome: boolean | undefined;
    await act(async () => {
      outcome = await result.current.leaveRoom({ deviceId: DEVICE_ID, roomId: ROOM_ID });
    });

    expect(outcome).toBe(true);
    expect(result.current.loading).toBe(false);
  });

  it("passes deviceId and roomId as filter values to the Supabase client", async () => {
    const stub = makeStub();
    mockClient.mockReturnValue(stub as unknown as ReturnType<typeof supabaseWithDevice>);
    const { result } = renderHook(() => useLeaveRoom());

    await act(async () => {
      await result.current.leaveRoom({ deviceId: DEVICE_ID, roomId: ROOM_ID });
    });

    // Verify the correct table was targeted.
    expect(stub.from).toHaveBeenCalledWith("players");
    // Verify the first .eq filter targeted id = deviceId.
    const firstEq = stub.from.mock.results[0]?.value.delete.mock.results[0]?.value.eq;
    expect(firstEq).toHaveBeenCalledWith("id", DEVICE_ID);
    // Verify the second .eq filter targeted room_id = roomId.
    const secondEq = firstEq?.mock.results[0]?.value.eq;
    expect(secondEq).toHaveBeenCalledWith("room_id", ROOM_ID);
  });

  it("returns false when Supabase returns an error", async () => {
    mockClient.mockReturnValue(
      makeStub({ deleteError: { message: "RLS violation" } }) as unknown as ReturnType<
        typeof supabaseWithDevice
      >,
    );
    const { result } = renderHook(() => useLeaveRoom());

    let outcome: boolean | undefined;
    await act(async () => {
      outcome = await result.current.leaveRoom({ deviceId: DEVICE_ID, roomId: ROOM_ID });
    });

    expect(outcome).toBe(false);
    expect(result.current.loading).toBe(false);
  });

  it("sets loading=true during the delete and resets to false afterwards", async () => {
    let resolveDelete!: (value: { error: null }) => void;
    const pendingPromise = new Promise<{ error: null }>((res) => {
      resolveDelete = res;
    });

    const secondEq = vi.fn().mockReturnValue(pendingPromise);
    const firstEq = vi.fn().mockReturnValue({ eq: secondEq });
    const del = vi.fn().mockReturnValue({ eq: firstEq });
    const stub = { from: vi.fn().mockReturnValue({ delete: del }) };
    mockClient.mockReturnValue(stub as unknown as ReturnType<typeof supabaseWithDevice>);

    const { result } = renderHook(() => useLeaveRoom());

    // Kick off the async call without awaiting.
    let callPromise!: Promise<boolean>;
    act(() => {
      callPromise = result.current.leaveRoom({ deviceId: DEVICE_ID, roomId: ROOM_ID });
    });

    // At this point loading should be true.
    expect(result.current.loading).toBe(true);

    // Resolve the pending Supabase call.
    await act(async () => {
      resolveDelete({ error: null });
      await callPromise;
    });

    expect(result.current.loading).toBe(false);
  });
});
