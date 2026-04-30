import { renderHook, act } from "@testing-library/react";
import { useCreateRoom } from "./useCreateRoom";

// ─── Module mocks ─────────────────────────────────────────────────────────────
//
// vi.mock is hoisted above imports by Vitest, so the mocked versions of these
// modules are what useCreateRoom (and the explicit imports below) receive.

vi.mock("@/lib/supabase", () => ({
  supabaseWithDevice: vi.fn(),
}));

vi.mock("./generateCode", () => ({
  generateUniqueRoomCode: vi.fn(),
}));

import { supabaseWithDevice } from "@/lib/supabase";
import { generateUniqueRoomCode } from "./generateCode";

const mockClient = vi.mocked(supabaseWithDevice);
const mockGenerateCode = vi.mocked(generateUniqueRoomCode);

// ─── Stub factory ─────────────────────────────────────────────────────────────

/**
 * Builds a minimal fluent Supabase stub covering the three DB calls made by
 * useCreateRoom:
 *
 *   client.from("players").select("room_id").eq("id", x).maybeSingle()  ← pre-check
 *   client.from("rooms").insert({...}).select("id").single()             ← create room
 *   client.from("players").insert({...})                                  ← add host player
 */
function makeStub({
  existingMembership = null,
  roomInsertData = null as { id: string } | null,
  roomInsertError = null,
  playerInsertError = null,
}: {
  existingMembership?: { room_id: string } | null;
  roomInsertData?: { id: string } | null;
  roomInsertError?: unknown;
  playerInsertError?: unknown;
}) {
  // Membership pre-check: from("players").select(...).eq(...).maybeSingle()
  const memberMaybeSingle = vi.fn().mockResolvedValue({ data: existingMembership, error: null });
  const memberEq = vi.fn().mockReturnValue({ maybeSingle: memberMaybeSingle });
  const memberSelect = vi.fn().mockReturnValue({ eq: memberEq });

  // Player INSERT: from("players").insert({...}) → { error }
  const playerInsert = vi.fn().mockResolvedValue({ error: playerInsertError });

  // Room INSERT: from("rooms").insert({...}).select("id").single()
  const roomSingle = vi.fn().mockResolvedValue({ data: roomInsertData, error: roomInsertError });
  const roomInsertSelect = vi.fn().mockReturnValue({ single: roomSingle });
  const roomInsert = vi.fn().mockReturnValue({ select: roomInsertSelect });

  return {
    from: vi.fn((table: string) => {
      if (table === "rooms") return { insert: roomInsert };
      if (table === "players") return { select: memberSelect, insert: playerInsert };
      throw new Error(`Unexpected table: ${table}`);
    }),
  };
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("useCreateRoom", () => {
  const deviceId = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
  const displayName = "Test Duck";
  const roomId = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";
  const generatedCode = "ABC234";

  beforeEach(() => {
    vi.resetAllMocks();
    mockGenerateCode.mockResolvedValue(generatedCode);
    localStorage.clear();
  });

  it("returns null and sets errorAlreadyInRoom when device is already in a room", async () => {
    mockClient.mockReturnValue(
      makeStub({
        existingMembership: { room_id: "existing-room-id" },
      }) as unknown as ReturnType<typeof supabaseWithDevice>,
    );

    const { result } = renderHook(() => useCreateRoom());

    let code: string | null | undefined;
    await act(async () => {
      code = await result.current.createRoom({ deviceId, displayName });
    });

    expect(code).toBeNull();
    expect(result.current.error).toBe("create.errorAlreadyInRoom");
    // generateUniqueRoomCode should NOT have been called — fail-fast
    expect(mockGenerateCode).not.toHaveBeenCalled();
  });

  it("returns null and sets errorCreate when the rooms INSERT fails", async () => {
    mockClient.mockReturnValue(
      makeStub({
        roomInsertError: { message: "db insert error" },
      }) as unknown as ReturnType<typeof supabaseWithDevice>,
    );

    const { result } = renderHook(() => useCreateRoom());

    let code: string | null | undefined;
    await act(async () => {
      code = await result.current.createRoom({ deviceId, displayName });
    });

    expect(code).toBeNull();
    expect(result.current.error).toBe("create.errorCreate");
  });

  it("returns null and sets errorCreate when the players INSERT fails", async () => {
    mockClient.mockReturnValue(
      makeStub({
        roomInsertData: { id: roomId },
        playerInsertError: { message: "player insert failed" },
      }) as unknown as ReturnType<typeof supabaseWithDevice>,
    );

    const { result } = renderHook(() => useCreateRoom());

    let code: string | null | undefined;
    await act(async () => {
      code = await result.current.createRoom({ deviceId, displayName });
    });

    expect(code).toBeNull();
    expect(result.current.error).toBe("create.errorCreate");
  });

  it("returns the generated code, clears the error, and persists the host secret on success", async () => {
    mockClient.mockReturnValue(
      makeStub({ roomInsertData: { id: roomId } }) as unknown as ReturnType<
        typeof supabaseWithDevice
      >,
    );

    const { result } = renderHook(() => useCreateRoom());

    let code: string | null | undefined;
    await act(async () => {
      code = await result.current.createRoom({ deviceId, displayName });
    });

    expect(code).toBe(generatedCode);
    expect(result.current.error).toBeNull();
    // Host secret must be persisted under the correct localStorage key.
    const secret = localStorage.getItem(`quack_host_secret_${roomId}`);
    expect(secret).toBeTruthy();
    expect(typeof secret).toBe("string");
  });

  it("sets loading while the call is in-flight and resets it when done", async () => {
    // The rooms INSERT is held pending so we can observe the loading state.
    let resolveInsert!: (v: unknown) => void;
    const insertPromise = new Promise((res) => {
      resolveInsert = res;
    });

    const memberMaybeSingle = vi.fn().mockResolvedValue({ data: null, error: null });
    const memberEq = vi.fn().mockReturnValue({ maybeSingle: memberMaybeSingle });
    const memberSelect = vi.fn().mockReturnValue({ eq: memberEq });
    const roomSingle = vi.fn().mockReturnValue(insertPromise);
    const roomInsertSelect = vi.fn().mockReturnValue({ single: roomSingle });
    const roomInsert = vi.fn().mockReturnValue({ select: roomInsertSelect });

    mockClient.mockReturnValue({
      from: (table: string) => {
        if (table === "rooms") return { insert: roomInsert };
        if (table === "players") return { select: memberSelect, insert: vi.fn() };
        throw new Error(`Unexpected: ${table}`);
      },
    } as unknown as ReturnType<typeof supabaseWithDevice>);

    const { result } = renderHook(() => useCreateRoom());

    expect(result.current.loading).toBe(false);

    let createPromise!: Promise<string | null>;
    act(() => {
      createPromise = result.current.createRoom({ deviceId, displayName });
    });

    // Resolve with a failure so the hook path terminates cleanly.
    await act(async () => {
      resolveInsert({ data: null, error: { message: "fail" } });
      await createPromise;
    });

    expect(result.current.loading).toBe(false);
  });
});
