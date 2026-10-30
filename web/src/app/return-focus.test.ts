// Giving focus back when the palette or the shortcuts list closes. The logic is plain objects:
// the test environment has no DOM, so elements are stand-ins with `isConnected` and `focus`.
import { describe, expect, test } from "vitest";
import { createReturnFocus, type Focusable } from "./return-focus";

function element(isConnected = true) {
  const focused: unknown[] = [];
  const el: Focusable & { focused: unknown[] } = {
    isConnected,
    focused,
    focus: (options) => void focused.push(options),
  };
  return el;
}

function close(state: ReturnType<typeof createReturnFocus>) {
  let prevented = false;
  state.onCloseAutoFocus({ preventDefault: () => (prevented = true) });
  return prevented;
}

describe("createReturnFocus", () => {
  test("gives focus back to what had it when the overlay opened, without scrolling", () => {
    const card = element();
    const state = createReturnFocus();
    state.remember(card);
    expect(close(state)).toBe(true);
    expect(card.focused).toEqual([{ preventScroll: true }]);
  });

  test("leaves Radix's default alone when nothing had focus", () => {
    const state = createReturnFocus();
    state.remember(null);
    expect(close(state)).toBe(false);
  });

  test("leaves it alone when the opener is gone (the page changed behind the overlay)", () => {
    const gone = element(false);
    const state = createReturnFocus();
    state.remember(gone);
    expect(close(state)).toBe(false);
    expect(gone.focused).toEqual([]);
  });

  test("does not take focus back after the overlay sent the person somewhere", () => {
    const card = element();
    const state = createReturnFocus();
    state.remember(card);
    state.release();
    expect(close(state)).toBe(false);
    expect(card.focused).toEqual([]);
  });

  test("starts over each time it opens", () => {
    const first = element();
    const second = element();
    const state = createReturnFocus();
    state.remember(first);
    state.release();
    close(state);
    state.remember(second);
    expect(close(state)).toBe(true);
    expect(second.focused).toHaveLength(1);
    expect(first.focused).toEqual([]);
  });

  test("gives focus back once, not on every close", () => {
    const card = element();
    const state = createReturnFocus();
    state.remember(card);
    close(state);
    expect(close(state)).toBe(false);
    expect(card.focused).toHaveLength(1);
  });
});
