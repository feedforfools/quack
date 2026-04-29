import { renderHook, act } from "@testing-library/react";
import { useJoinRoom, normaliseCode } from "./useJoinRoom";

// ─── Module mock ─────────────────────────────────────────────────────────────
//
// We mock the entire @/lib/supabase barrel so that supabaseWithDevice returns
// a hand-crafted stub instead of a real client. vi.mock is hoisted to the top
// of the compiled output by Vitest, so the import below gets the mocked version.

vi.mock("@/lib/supabase", () => ({
  supabaseWithDevice: vi.fn(),
}));

// Import after mock declaration — receives the mocked module.
import { supabaseWithDevice } from "@/lib/supabase";

const mockClient = vi.mocked(supabaseWithDevice);

// ─── Helpers ─────────────────────────────────────────────────────────────────

interface RoomRow { id: string; state: string }

/**
 * Builds a minimal fluent Supabase stub.
 *
 *   client.from("rooms").select(...).eq(...).maybeSingle()
 *   client.from("players").upsert(...)
 */
function makeStub({
  roomData,
  roomError = null,
  playerError = null,
}: {
  roomData: RoomRow | null;
  roomError?: unknown;
  playerError?: unknown;
}) {
  const maybeSingle = vi.fn().mockResolvedValue({ data: roomData, error: roomError });
  const roomEq = vi.fn().mockReturnValue({ maybeSingle });
  const roomSelect = vi.fn().mockReturnValue({ eq: roomEq });

  const upsert = vi.fn().mockResolvedValue({ error: playerError });
  const playerFrom = { upsert };

  return {
    from: vi.fn((table: string) => {
      if (table === "rooms") return { select: roomSelect };
      if (table === "players") return playerFrom;
      throw new Error(`Unexpected table: ${table}`);
    }),
  };
}

// ─── normaliseCode ───────────────────────────────────────────────────────────

describe("normaliseCode", () => {
  it("uppercases letters", () => {
    expect(normaliseCode("abcdef")).toBe("ABCDEF");
  });

  it("strips hyphens, spaces, and other non-alphabet characters", () => {
    expect(normaliseCode("AB-CD EF")).toBe("ABCDEF");
  });

  it("strips digits 0 and 1 (outside the 2-9 range)", () => {
    // 0 and 1 are not in [A-Z2-9] so they are stripped; letters O and I are kept
    expect(normaliseCode("AB0O1I")).toBe("ABOI");
  });

  it("truncates to 6 characters", () => {
    expect(normaliseCode("ABCDEFGHIJ")).toBe("ABCDEF");
  });

  it("returns an already-normalised code unchanged", () => {
    expect(normaliseCode("ABC234")).toBe("ABC234");
  });
});

// ─── useJoinRoom ─────────────────────────────────────────────────────────────

describe("useJoinRoom", () => {
  const deviceId = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
  const displayName = "Test Duck";
  const roomId = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";
  const validCode = "ABC234"; // 6 chars, all in alphabet

  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("returns null and sets errorNotFound when code is too short after normalising", async () => {
    const { result } = renderHook(() => useJoinRoom());

    let returnedCode: string | null | undefined;
    await act(async () => {
      returnedCode = await result.current.joinRoom({
        deviceId,
        displayName,
        code: "AB", // too short
      });
    });

    expect(returnedCode).toBeNull();
    expect(result.current.error).toBe("join.errorNotFound");
    expect(mockClient).not.toHaveBeenCalled();
  });

  it("returns null and sets errorNotFound when room is not in the DB", async () => {
    mockClient.mockReturnValue(
      makeStub({ roomData: null }) as unknown as ReturnType<typeof supabaseWithDevice>,
    );

    const { result } = renderHook(() => useJoinRoom());

    let returnedCode: string | null | undefined;
    await act(async () => {
      returnedCode = await result.current.joinRoom({
        deviceId,
        displayName,
        code: validCode,
      });
    });

    expect(returnedCode).toBeNull();
    expect(result.current.error).toBe("join.errorNotFound");
  });

  it("returns null and sets errorJoin when the room SELECT returns a DB error", async () => {
    mockClient.mockReturnValue(
      makeStub({
        roomData: null,
        roomError: { message: "db error" },
      }) as unknown as ReturnType<typeof supabaseWithDevice>,
    );

    const { result } = renderHook(() => useJoinRoom());

    let returnedCode: string | null | undefined;
    await act(async () => {
      returnedCode = await result.current.joinRoom({
        deviceId,
        displayName,
        code: validCode,
      });
    });

    expect(returnedCode).toBeNull();
    expect(result.current.error).toBe("join.errorJoin");
  });

  it("returns null and sets errorJoin when the players upsert fails", async () => {
    mockClient.mockReturnValue(
      makeStub({
        roomData: { id: roomId, state: "lobby" },
        playerError: { message: "upsert error" },
      }) as unknown as ReturnType<typeof supabaseWithDevice>,
    );

    const { result } = renderHook(() => useJoinRoom());

    let returnedCode: string | null | undefined;
    await act(async () => {
      returnedCode = await result.current.joinRoom({
        deviceId,
        displayName,
        code: validCode,
      });
    });

    expect(returnedCode).toBeNull();
    expect(result.current.error).toBe("join.errorJoin");
  });

  it("returns the normalised code and clears error on success", async () => {
    mockClient.mockReturnValue(
      makeStub({ roomData: { id: roomId, state: "lobby" } }) as unknown as ReturnType<
        typeof supabaseWithDevice
      >,
    );

    const { result } = renderHook(() => useJoinRoom());

    let returnedCode: string | null | undefined;
    await act(async () => {
      returnedCode = await result.current.joinRoom({
        deviceId,
        displayName,
        code: validCode,
      });
    });

    expect(returnedCode).toBe(validCode);
    expect(result.current.error).toBeNull();
  });

  it("normalises a mixed-case code with dashes before looking it up", async () => {
    const stub = makeStub({ roomData: { id: roomId, state: "lobby" } });
    mockClient.mockReturnValue(stub as unknown as ReturnType<typeof supabaseWithDevice>);

    const { result } = renderHook(() => useJoinRoom());

    await act(async () => {
      await result.current.joinRoom({
        deviceId,
        displayName,
        code: "abc-234",
      });
    });

    // Verify the eq() was called with the normalised code
    const fromCall = stub.from.mock.calls.find(([t]) => t === "rooms");
    expect(fromCall).toBeDefined();
    // .select().eq(field, value) — retrieve the eq mock from the select chain
    const selectResult = stub.from("rooms") as { select: ReturnType<typeof vi.fn> };
    const eqSpy = selectResult.select().eq as ReturnType<typeof vi.fn>;
    expect(eqSpy).toHaveBeenCalledWith("code", "ABC234");
  });

  it("sets loading to true while the call is in-flight and false when done", async () => {
    let resolveRooms!: (v: unknown) => void;
    const roomPromise = new Promise((res) => {
      resolveRooms = res;
    });

    const maybeSingle = vi.fn().mockReturnValue(roomPromise);
    const roomEq = vi.fn().mockReturnValue({ maybeSingle });
    const roomSelect = vi.fn().mockReturnValue({ eq: roomEq });
    mockClient.mockReturnValue({
      from: (table: string) => {
        if (table === "rooms") return { select: roomSelect };
        return { upsert: vi.fn().mockResolvedValue({ error: null }) };
      },
    } as unknown as ReturnType<typeof supabaseWithDevice>);

    const { result } = renderHook(() => useJoinRoom());

    expect(result.current.loading).toBe(false);

    let joinPromise!: Promise<string | null>;
    act(() => {
      joinPromise = result.current.joinRoom({ deviceId, displayName, code: validCode });
    });

    // Resolve the in-flight request
    await act(async () => {
      resolveRooms({ data: null, error: null });
      await joinPromise;
    });

    expect(result.current.loading).toBe(false);
  });
});
