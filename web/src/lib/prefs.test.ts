// Prefs stored by an older build load without the keys that are gone.
import { describe, expect, test } from "vitest";
import { usePrefs, withoutRetired } from "./prefs";

describe("withoutRetired", () => {
  test("drops planView and keeps the rest", () => {
    expect(withoutRetired({ planView: "lanes", theme: "dark", foldedColumns: ["done"] })).toEqual({
      theme: "dark",
      foldedColumns: ["done"],
    });
  });

  test("tolerates a missing or malformed value", () => {
    expect(withoutRetired(undefined)).toEqual({});
    expect(withoutRetired(null)).toEqual({});
    expect(withoutRetired("lanes")).toEqual({});
  });
});

describe("usePrefs", () => {
  test("has no plan view or lane prefs", () => {
    const keys = Object.keys(usePrefs.getState());
    expect(keys).not.toContain("planView");
    expect(keys).not.toContain("setPlanView");
    expect(keys.filter((k) => /lane|swim/i.test(k))).toEqual([]);
  });
});
