/**
 * Unit tests for the drag-lid RoleReveal card sub-component (E3-T5 / E3-T6).
 *
 * Tests the observable behaviour from the player's point of view:
 *  - Arrival haptic fires on mount.
 *  - Lid is aria-pressed=false by default (not peeking).
 *  - Space / Enter hold enters peek mode (aria-pressed=true).
 *  - Releasing the key exits peek mode (aria-pressed=false).
 *  - Peek haptic fires on first peek.
 *  - onFirstPeek callback is invoked exactly once across multiple peeks.
 *  - onPeekChange is called with true on peek start, false on peek end.
 *  - Works correctly for both civilian and imposter assignments.
 */
import { render, screen, fireEvent } from "@testing-library/react";
import { I18nextProvider } from "react-i18next";
import { i18n } from "@/lib/i18n";
import { RoleReveal } from "./RoleReveal";
import type { RoleAssignment } from "./useRoleAssignment";

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const civilianAssignment: RoleAssignment = {
  gameId: "round-uuid-1",
  roundIndex: 0,
  role: "civilian",
  word: "pizza",
  endsAt: null,
  timerSeconds: null,
  seenAt: null,
};

const imposterAssignment: RoleAssignment = {
  gameId: "round-uuid-2",
  roundIndex: 1,
  role: "imposter",
  word: null,
  endsAt: null,
  timerSeconds: null,
  seenAt: null,
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function renderReveal(
  assignment: RoleAssignment = civilianAssignment,
  props: Partial<React.ComponentProps<typeof RoleReveal>> = {},
) {
  return render(
    <I18nextProvider i18n={i18n}>
      <div>
        <RoleReveal assignment={assignment} {...props} />
      </div>
    </I18nextProvider>,
  );
}

/** Finds the draggable lid button by its role + aria-label pattern. */
function getLid() {
  return screen.getByRole("button", { name: /hold|drag|peek|tieni|trascina/i });
}

// ─── Setup ────────────────────────────────────────────────────────────────────

beforeEach(() => {
  Object.defineProperty(navigator, "vibrate", {
    configurable: true,
    writable: true,
    value: vi.fn().mockReturnValue(true),
  });
});

afterEach(() => {
  vi.restoreAllMocks();
});

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("RoleReveal (drag-lid card)", () => {
  it("fires 60 ms arrival haptic on mount", () => {
    renderReveal();
    expect(navigator.vibrate).toHaveBeenCalledWith(60);
  });

  it("lid is not in peek mode by default (aria-pressed false)", () => {
    renderReveal();
    expect(getLid()).toHaveAttribute("aria-pressed", "false");
  });

  it("enters peek mode when Space is pressed and held", () => {
    renderReveal();
    fireEvent.keyDown(getLid(), { key: " " });
    expect(getLid()).toHaveAttribute("aria-pressed", "true");
  });

  it("enters peek mode when Enter is pressed and held", () => {
    renderReveal();
    fireEvent.keyDown(getLid(), { key: "Enter" });
    expect(getLid()).toHaveAttribute("aria-pressed", "true");
  });

  it("exits peek mode when Space is released", () => {
    renderReveal();
    const lid = getLid();
    fireEvent.keyDown(lid, { key: " " });
    fireEvent.keyUp(lid, { key: " " });
    expect(lid).toHaveAttribute("aria-pressed", "false");
  });

  it("fires 25 ms peek haptic on first peek", () => {
    renderReveal();
    fireEvent.keyDown(getLid(), { key: " " });
    expect(navigator.vibrate).toHaveBeenCalledWith(25);
  });

  it("does not fire peek haptic again on subsequent peeks", () => {
    renderReveal();
    const lid = getLid();
    fireEvent.keyDown(lid, { key: " " });
    fireEvent.keyUp(lid, { key: " " });
    fireEvent.keyDown(lid, { key: " " });
    fireEvent.keyUp(lid, { key: " " });
    const peekCalls = (
      navigator.vibrate as ReturnType<typeof vi.fn>
    ).mock.calls.filter(([ms]) => ms === 25);
    expect(peekCalls).toHaveLength(1);
  });

  it("calls onFirstPeek exactly once across multiple peeks", () => {
    const onFirstPeek = vi.fn();
    renderReveal(civilianAssignment, { onFirstPeek });
    const lid = getLid();
    fireEvent.keyDown(lid, { key: " " });
    fireEvent.keyUp(lid, { key: " " });
    fireEvent.keyDown(lid, { key: " " });
    fireEvent.keyUp(lid, { key: " " });
    expect(onFirstPeek).toHaveBeenCalledTimes(1);
  });

  it("calls onPeekChange(true) when peek begins and onPeekChange(false) when it ends", () => {
    const onPeekChange = vi.fn();
    renderReveal(civilianAssignment, { onPeekChange });
    const lid = getLid();
    fireEvent.keyDown(lid, { key: " " });
    expect(onPeekChange).toHaveBeenCalledWith(true);
    fireEvent.keyUp(lid, { key: " " });
    expect(onPeekChange).toHaveBeenCalledWith(false);
  });

  it("works correctly for an imposter assignment", () => {
    renderReveal(imposterAssignment);
    expect(getLid()).toHaveAttribute("aria-pressed", "false");
    fireEvent.keyDown(getLid(), { key: " " });
    expect(getLid()).toHaveAttribute("aria-pressed", "true");
  });

  it("does not call onFirstPeek on first peek when initialHasPeeked is true (reload case)", () => {
    const onFirstPeek = vi.fn();
    renderReveal(civilianAssignment, { onFirstPeek, initialHasPeeked: true });
    const lid = getLid();
    // Simulate peek — should NOT invoke onFirstPeek since the player already peeked.
    fireEvent.keyDown(lid, { key: " " });
    fireEvent.keyUp(lid, { key: " " });
    expect(onFirstPeek).not.toHaveBeenCalled();
  });

  it("calls onFirstPeek on first peek when initialHasPeeked is false (fresh load)", () => {
    const onFirstPeek = vi.fn();
    renderReveal(civilianAssignment, { onFirstPeek, initialHasPeeked: false });
    const lid = getLid();
    fireEvent.keyDown(lid, { key: " " });
    expect(onFirstPeek).toHaveBeenCalledTimes(1);
  });
});
