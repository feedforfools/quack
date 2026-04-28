import { renderHook, act } from "@testing-library/react";
import { useDisplayName, DISPLAY_NAME_MAX_LENGTH } from "./useDisplayName";

const STORAGE_KEY = "quack_display_name";

describe("useDisplayName", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });

  it("returns null when no name is stored", () => {
    const { result } = renderHook(() => useDisplayName());
    expect(result.current.displayName).toBeNull();
    expect(result.current.hasDisplayName).toBe(false);
  });

  it("returns a stored name on mount", () => {
    localStorage.setItem(STORAGE_KEY, "Duck McQuack");
    const { result } = renderHook(() => useDisplayName());
    expect(result.current.displayName).toBe("Duck McQuack");
    expect(result.current.hasDisplayName).toBe(true);
  });

  it("persists a name to localStorage on setDisplayName", () => {
    const { result } = renderHook(() => useDisplayName());
    act(() => {
      result.current.setDisplayName("Mallard");
    });
    expect(result.current.displayName).toBe("Mallard");
    expect(localStorage.getItem(STORAGE_KEY)).toBe("Mallard");
  });

  it("trims whitespace before persisting", () => {
    const { result } = renderHook(() => useDisplayName());
    act(() => {
      result.current.setDisplayName("  Quacker  ");
    });
    expect(result.current.displayName).toBe("Quacker");
    expect(localStorage.getItem(STORAGE_KEY)).toBe("Quacker");
  });

  it("ignores empty strings after trimming", () => {
    const { result } = renderHook(() => useDisplayName());
    act(() => {
      result.current.setDisplayName("   ");
    });
    expect(result.current.displayName).toBeNull();
    expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
  });

  it(`truncates names longer than ${DISPLAY_NAME_MAX_LENGTH} characters`, () => {
    const long = "A".repeat(DISPLAY_NAME_MAX_LENGTH + 10);
    const { result } = renderHook(() => useDisplayName());
    act(() => {
      result.current.setDisplayName(long);
    });
    expect(result.current.displayName).toHaveLength(DISPLAY_NAME_MAX_LENGTH);
  });

  it("clears the name from state and localStorage", () => {
    localStorage.setItem(STORAGE_KEY, "Duck McQuack");
    const { result } = renderHook(() => useDisplayName());
    act(() => {
      result.current.clearDisplayName();
    });
    expect(result.current.displayName).toBeNull();
    expect(result.current.hasDisplayName).toBe(false);
    expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
  });

  it("updates state reactively when setDisplayName is called after initial render", () => {
    const { result } = renderHook(() => useDisplayName());
    expect(result.current.displayName).toBeNull();
    act(() => {
      result.current.setDisplayName("NewName");
    });
    expect(result.current.displayName).toBe("NewName");
    act(() => {
      result.current.setDisplayName("UpdatedName");
    });
    expect(result.current.displayName).toBe("UpdatedName");
  });
});
