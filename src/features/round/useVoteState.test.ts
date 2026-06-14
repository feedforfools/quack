import { renderHook, act } from "@testing-library/react";
import { useVoteState } from "./useVoteState";

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

function makeVoteStateClient(options: {
  gameRows: Array<{
    vote_state: "none" | "requested" | "active" | "resolved";
    vote_request_count: number;
    vote_ends_at: string | null;
  }>;
  myVoteTargetId?: string | null;
  resolveVoteError?: { code: string } | null;
}) {
  const gameRows = [...options.gameRows];
  const finalGameRow = gameRows.at(-1) ?? {
    vote_state: "none" as const,
    vote_request_count: 0,
    vote_ends_at: null,
  };

  const gamesMaybeSingle = vi.fn().mockImplementation(() =>
    Promise.resolve({
      data: gameRows.shift() ?? finalGameRow,
      error: null,
    }),
  );
  const gamesEq = vi.fn().mockReturnValue({ maybeSingle: gamesMaybeSingle });
  const gamesSelect = vi.fn().mockReturnValue({ eq: gamesEq });

  const votesMaybeSingle = vi.fn().mockResolvedValue({
    data:
      options.myVoteTargetId === undefined || options.myVoteTargetId === null
        ? null
        : { target_player_id: options.myVoteTargetId },
    error: null,
  });
  // Chain: .eq(game_id).eq(voter_player_id).eq(round).maybeSingle()
  const votesThirdEq = vi
    .fn()
    .mockReturnValue({ maybeSingle: votesMaybeSingle });
  const votesSecondEq = vi.fn().mockReturnValue({ eq: votesThirdEq });
  const votesFirstEq = vi.fn().mockReturnValue({ eq: votesSecondEq });
  const votesSelect = vi.fn().mockReturnValue({ eq: votesFirstEq });

  const rpc = vi.fn().mockImplementation((fnName: string) => {
    if (fnName === "resolve_vote") {
      return Promise.resolve({ error: options.resolveVoteError ?? null });
    }
    if (fnName === "get_vote_tally") {
      return Promise.resolve({ data: [], error: null });
    }
    throw new Error(`Unexpected RPC: ${fnName}`);
  });

  return {
    client: {
      from: vi.fn((table: string) => {
        if (table === "games") {
          return { select: gamesSelect };
        }
        if (table === "votes") {
          return { select: votesSelect };
        }
        throw new Error(`Unexpected table: ${table}`);
      }),
      rpc,
    },
    spies: {
      gamesMaybeSingle,
      votesMaybeSingle,
      rpc,
    },
  };
}

describe("useVoteState", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("auto-resolves and refetches when an active vote expires in the future", async () => {
    vi.setSystemTime(new Date("2026-05-03T12:00:00.000Z"));
    const { client, spies } = makeVoteStateClient({
      gameRows: [
        {
          vote_state: "active",
          vote_request_count: 2,
          vote_ends_at: "2026-05-03T12:00:01.000Z",
        },
        {
          vote_state: "resolved",
          vote_request_count: 2,
          vote_ends_at: "2026-05-03T12:00:01.000Z",
        },
      ],
    });
    mockClientFactory.mockReturnValue(
      client as unknown as ReturnType<typeof supabaseWithDevice>,
    );

    const { result } = renderHook(() =>
      useVoteState("device-1", "game-1", false),
    );

    await act(async () => {
      await flushMicrotasks();
    });

    expect(result.current.voteState?.state).toBe("active");
    expect(spies.rpc).not.toHaveBeenCalled();

    await act(async () => {
      vi.advanceTimersByTime(1_300);
      await flushMicrotasks();
    });

    expect(spies.rpc).toHaveBeenCalledWith("resolve_vote", {
      p_game_id: "game-1",
    });
    expect(result.current.voteState?.state).toBe("resolved");
    expect(spies.gamesMaybeSingle).toHaveBeenCalledTimes(2);
  });

  it("converges on the new vote_state via the poll when a broadcast was missed", async () => {
    vi.setSystemTime(new Date("2026-05-03T12:00:00.000Z"));
    // Mount sees a pre-vote 'requested' state; the threshold-crossing
    // `vote_state_changed` broadcast never arrives, but a later poll picks up
    // the server's transition to 'active' (the ballot opens without a refresh).
    const { client, spies } = makeVoteStateClient({
      gameRows: [
        {
          vote_state: "requested",
          vote_request_count: 1,
          vote_ends_at: null,
        },
        {
          vote_state: "active",
          vote_request_count: 2,
          vote_ends_at: "2026-05-03T12:05:00.000Z",
        },
      ],
    });
    mockClientFactory.mockReturnValue(
      client as unknown as ReturnType<typeof supabaseWithDevice>,
    );

    const { result } = renderHook(() =>
      useVoteState("device-1", "game-1", false),
    );

    await act(async () => {
      await flushMicrotasks();
    });

    expect(result.current.voteState?.state).toBe("requested");
    expect(spies.gamesMaybeSingle).toHaveBeenCalledTimes(1);

    // Advance past the poll interval — no broadcast, but the hook re-fetches.
    await act(async () => {
      vi.advanceTimersByTime(3_100);
      await flushMicrotasks();
    });

    expect(spies.gamesMaybeSingle).toHaveBeenCalledTimes(2);
    expect(result.current.voteState?.state).toBe("active");
  });

  it("also resolves shortly after mount when the fetched vote is already expired", async () => {
    vi.setSystemTime(new Date("2026-05-03T12:00:00.000Z"));
    const { client, spies } = makeVoteStateClient({
      gameRows: [
        {
          vote_state: "active",
          vote_request_count: 2,
          vote_ends_at: "2026-05-03T11:59:59.000Z",
        },
        {
          vote_state: "resolved",
          vote_request_count: 2,
          vote_ends_at: "2026-05-03T11:59:59.000Z",
        },
      ],
    });
    mockClientFactory.mockReturnValue(
      client as unknown as ReturnType<typeof supabaseWithDevice>,
    );

    const { result } = renderHook(() =>
      useVoteState("device-1", "game-1", false),
    );

    await act(async () => {
      await flushMicrotasks();
    });

    expect(result.current.voteState?.state).toBe("active");

    await act(async () => {
      vi.advanceTimersByTime(300);
      await flushMicrotasks();
    });

    expect(spies.rpc).toHaveBeenCalledWith("resolve_vote", {
      p_game_id: "game-1",
    });
    expect(result.current.voteState?.state).toBe("resolved");
  });
});
