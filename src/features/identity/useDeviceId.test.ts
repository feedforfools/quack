import { renderHook, act } from "@testing-library/react";
import { useDeviceId } from "@/features/identity/useDeviceId";

const STORAGE_KEY = "quack_device_id";

// ── Supabase client mock ───────────────────────────────────────────────────
// We stub the module so no network call is ever made in tests.  The mock
// exposes a jest spy so individual tests can assert call counts and simulate
// errors.

const mockRpc = vi.fn().mockResolvedValue({ data: null, error: null });

vi.mock("@/lib/supabase/client", () => ({
  supabase: {
    rpc: (...args: unknown[]) => mockRpc(...args),
  },
}));

// ─────────────────────────────────────────────────────────────────────────────

describe("useDeviceId", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
    // Reset the RPC mock between tests (restoreAllMocks resets spy state but
    // not module-level vi.fn(); reset manually).
    mockRpc.mockReset();
    mockRpc.mockResolvedValue({ data: null, error: null });
  });

  // ── Original behaviour ──────────────────────────────────────────────────

  it("mints a UUID on first call and persists it to localStorage", async () => {
    const { result } = renderHook(() => useDeviceId());

    const id = result.current;
    expect(id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
    );
    expect(localStorage.getItem(STORAGE_KEY)).toBe(id);
  });

  it("returns the same UUID across re-renders", async () => {
    const { result, rerender } = renderHook(() => useDeviceId());
    const first = result.current;
    rerender();
    expect(result.current).toBe(first);
  });

  it("reuses a UUID already stored in localStorage", async () => {
    const existing = "550e8400-e29b-41d4-a716-446655440000";
    localStorage.setItem(STORAGE_KEY, existing);

    const { result } = renderHook(() => useDeviceId());
    expect(result.current).toBe(existing);
  });

  it("does not overwrite an existing UUID with a new one on mount", async () => {
    const existing = "550e8400-e29b-41d4-a716-446655440000";
    localStorage.setItem(STORAGE_KEY, existing);

    renderHook(() => useDeviceId());
    expect(localStorage.getItem(STORAGE_KEY)).toBe(existing);
  });

  it("each fresh localStorage produces a unique UUID", async () => {
    const { result: r1 } = renderHook(() => useDeviceId());
    const id1 = r1.current;

    localStorage.clear();

    const { result: r2 } = renderHook(() => useDeviceId());
    const id2 = r2.current;

    expect(id1).not.toBe(id2);
  });

  // ── Analytics ping behaviour ────────────────────────────────────────────

  it("fires bump_metric exactly once on a fresh mint", async () => {
    await act(async () => {
      renderHook(() => useDeviceId());
    });

    expect(mockRpc).toHaveBeenCalledTimes(1);
    expect(mockRpc).toHaveBeenCalledWith("bump_metric", {
      p_metric: "new_devices",
    });
  });

  it("does NOT fire bump_metric when a cached id exists", async () => {
    localStorage.setItem(STORAGE_KEY, "550e8400-e29b-41d4-a716-446655440000");

    await act(async () => {
      renderHook(() => useDeviceId());
    });

    expect(mockRpc).not.toHaveBeenCalled();
  });

  it("still returns the id even when the RPC fails", async () => {
    mockRpc.mockResolvedValue({
      data: null,
      error: { message: "network error" },
    });

    const { result } = renderHook(() => useDeviceId());
    // Allow the effect (and its async .then) to flush.
    await act(async () => {});

    expect(result.current).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
    );
  });

  it("still returns the id even when the RPC throws", async () => {
    mockRpc.mockRejectedValue(new Error("fetch failed"));

    const { result } = renderHook(() => useDeviceId());
    // Allow the effect (and its async .catch) to flush.
    await act(async () => {});

    expect(result.current).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
    );
  });

  it("fires bump_metric only once across multiple re-renders", async () => {
    const { rerender } = await act(async () => renderHook(() => useDeviceId()));

    rerender();
    rerender();

    // Allow any pending microtasks to flush.
    await act(async () => {});

    expect(mockRpc).toHaveBeenCalledTimes(1);
  });
});
