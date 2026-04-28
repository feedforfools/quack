import { renderHook } from "@testing-library/react";
import { useDeviceId } from "@/features/identity/useDeviceId";

const STORAGE_KEY = "quack_device_id";

describe("useDeviceId", () => {
  beforeEach(() => {
    localStorage.clear();
    // Reset the mock so uuid generation is predictable where needed.
    vi.restoreAllMocks();
  });

  it("mints a UUID on first call and persists it to localStorage", () => {
    const { result } = renderHook(() => useDeviceId());

    const id = result.current;
    expect(id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
    );
    expect(localStorage.getItem(STORAGE_KEY)).toBe(id);
  });

  it("returns the same UUID across re-renders", () => {
    const { result, rerender } = renderHook(() => useDeviceId());
    const first = result.current;
    rerender();
    expect(result.current).toBe(first);
  });

  it("reuses a UUID already stored in localStorage", () => {
    const existing = "550e8400-e29b-41d4-a716-446655440000";
    localStorage.setItem(STORAGE_KEY, existing);

    const { result } = renderHook(() => useDeviceId());
    expect(result.current).toBe(existing);
  });

  it("does not overwrite an existing UUID with a new one on mount", () => {
    const existing = "550e8400-e29b-41d4-a716-446655440000";
    localStorage.setItem(STORAGE_KEY, existing);

    renderHook(() => useDeviceId());
    expect(localStorage.getItem(STORAGE_KEY)).toBe(existing);
  });

  it("each fresh localStorage produces a unique UUID", () => {
    const { result: r1 } = renderHook(() => useDeviceId());
    const id1 = r1.current;

    localStorage.clear();

    const { result: r2 } = renderHook(() => useDeviceId());
    const id2 = r2.current;

    expect(id1).not.toBe(id2);
  });
});
