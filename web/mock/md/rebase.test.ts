// (g) Rebasing: the files hold absolute times from RECORDED_AT; the loader shifts them by the
// age of the recording, so the board reads the same on any day.
import { describe, expect, test } from "vitest";
import { toDate, tsMs } from "../time";
import { loadWorkspace } from "./index";
import {
  rebaseWorkspace,
  shiftDate,
  shiftDays,
  shiftSinceRecording,
  shiftTimestamp,
} from "./rebase";
import { RECORDED_AT } from "./recorded-at";
import { diskFiles } from "./test-support";

const MIN = 60_000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;
const RECORDED = Date.parse(RECORDED_AT);

describe("shiftTimestamp", () => {
  test("keeps the offset and the minute precision", () => {
    expect(shiftTimestamp("2026-10-22T14:05+05:30", 90 * MIN)).toBe("2026-10-22T15:35+05:30");
    expect(shiftTimestamp("2026-10-22T14:05+05:30", -14 * HOUR - 5 * MIN)).toBe(
      "2026-10-22T00:00+05:30",
    );
  });

  test("carries over days, months and years", () => {
    expect(shiftTimestamp("2026-10-31T23:30+05:30", HOUR)).toBe("2026-11-01T00:30+05:30");
    expect(shiftTimestamp("2026-12-31T23:59+05:30", MIN)).toBe("2027-01-01T00:00+05:30");
    expect(shiftTimestamp("2026-03-01T00:10+05:30", -20 * MIN)).toBe("2026-02-28T23:50+05:30");
    expect(shiftTimestamp("2028-02-28T12:00+05:30", DAY)).toBe("2028-02-29T12:00+05:30");
  });

  test("keeps seconds, fractions and other offsets", () => {
    expect(shiftTimestamp("2026-10-22T14:05:09+05:30", 61 * 1000 + 59 * MIN)).toBe(
      "2026-10-22T15:05:09+05:30",
    );
    expect(shiftTimestamp("2026-10-22T14:05:09.250Z", DAY)).toBe("2026-10-23T14:05:09.250Z");
    expect(shiftTimestamp("2026-10-22T14:05-08:00", 2 * HOUR)).toBe("2026-10-22T16:05-08:00");
  });

  test("rounds the shift to whole minutes", () => {
    expect(shiftTimestamp("2026-10-22T14:05+05:30", 29_000)).toBe("2026-10-22T14:05+05:30");
    expect(shiftTimestamp("2026-10-22T14:05+05:30", 31_000)).toBe("2026-10-22T14:06+05:30");
  });

  test("leaves anything that is not a timestamp alone", () => {
    expect(shiftTimestamp("2026-10-22", DAY)).toBe("2026-10-22");
    expect(shiftTimestamp("soon", DAY)).toBe("soon");
  });
});

describe("shiftDate and shiftDays", () => {
  test("a date moves by whole days", () => {
    expect(shiftDate("2026-10-30", 3)).toBe("2026-11-02");
    expect(shiftDate("2026-03-01", -1)).toBe("2026-02-28");
    expect(shiftDate("nope", 3)).toBe("nope");
  });

  test("the day count follows the local calendar of the recording", () => {
    // recorded at 16:27 +05:30 → local midnight is 7 h 33 min later
    const rec = "2026-10-22T16:27+05:30";
    expect(shiftDays(0, rec)).toBe(0);
    expect(shiftDays(7 * HOUR, rec)).toBe(0);
    expect(shiftDays(7 * HOUR + 33 * MIN, rec)).toBe(1);
    expect(shiftDays(3 * DAY, rec)).toBe(3);
    expect(shiftDays(3 * DAY + 3 * HOUR, rec)).toBe(3);
    expect(shiftDays(3 * DAY + 9 * HOUR, rec)).toBe(4);
    expect(shiftDays(-HOUR, rec)).toBe(0);
    expect(shiftDays(-17 * HOUR, rec)).toBe(-1);
  });
});

describe("rebaseWorkspace", () => {
  const files = {
    "issues/a/goal.md":
      '---\nid: wf-aaaaa\ndue: 2026-10-30\ncreated: 2026-10-19T09:12+05:30\nlease_until: 2026-10-22T17:00+05:30\n---\n\n## Context\n\nDue 2026-10-30. Seen at 2026-10-22T14:05+05:30.\n\n```json\n{ "at": "2026-10-22T14:05+05:30", "due": "2026-10-30" }\n```\n',
    "library/patterns/x.md":
      "---\nid: lib-aaaaa\ncreated: 2026-10-21\nlast_reviewed: 2026-10-21\nreview_after: 2027-04-19\nsuperseded_by: lib-bbbbb\n---\n\n## Rule\n\nReview after 2027-04-19.\n",
    "issues/a/changes.md":
      "# Changes\n\n## 2026-10-22T14:05+05:30 @codex — Did it {#C-aaaaa}\n- evidence: run at 2026-10-22T14:00+05:30\n\nBody.\n",
  };

  test("shifts every timestamp anywhere in the text, code blocks included", () => {
    const out = rebaseWorkspace(files, 2 * DAY + 3 * HOUR, { recordedAt: RECORDED_AT });
    expect(out["issues/a/goal.md"]).toContain("created: 2026-10-21T12:12+05:30");
    expect(out["issues/a/goal.md"]).toContain("lease_until: 2026-10-24T20:00+05:30");
    expect(out["issues/a/goal.md"]).toContain("Seen at 2026-10-24T17:05+05:30.");
    expect(out["issues/a/goal.md"]).toContain('{ "at": "2026-10-24T17:05+05:30"');
    expect(out["issues/a/changes.md"]).toContain("## 2026-10-24T17:05+05:30 @codex");
    expect(out["issues/a/changes.md"]).toContain("run at 2026-10-24T17:00+05:30");
  });

  test("shifts date fields of the frontmatter by whole days and leaves prose dates alone", () => {
    const out = rebaseWorkspace(files, 2 * DAY + 3 * HOUR, { recordedAt: RECORDED_AT });
    expect(out["issues/a/goal.md"]).toContain("due: 2026-11-01\n");
    expect(out["issues/a/goal.md"]).toContain("Due 2026-10-30.");
    expect(out["issues/a/goal.md"]).toContain('"due": "2026-10-30"');
    expect(out["library/patterns/x.md"]).toContain("created: 2026-10-23\n");
    expect(out["library/patterns/x.md"]).toContain("last_reviewed: 2026-10-23\n");
    expect(out["library/patterns/x.md"]).toContain("review_after: 2027-04-21\n");
    expect(out["library/patterns/x.md"]).toContain("Review after 2027-04-19.");
    expect(out["library/patterns/x.md"]).toContain("superseded_by: lib-bbbbb");
  });

  test("a shift across local midnight moves the dates one more day", () => {
    const rec = "2026-10-22T16:27+05:30";
    const same = rebaseWorkspace(files, 2 * DAY + 3 * HOUR, { recordedAt: rec });
    const later = rebaseWorkspace(files, 2 * DAY + 9 * HOUR, { recordedAt: rec });
    expect(same["issues/a/goal.md"]).toContain("due: 2026-11-01\n");
    expect(later["issues/a/goal.md"]).toContain("due: 2026-11-02\n");
  });

  test("quoted date values keep their quotes", () => {
    const out = rebaseWorkspace({ "a.md": '---\ndue: "2026-10-30"\n---\n' }, DAY, {
      recordedAt: RECORDED_AT,
    });
    expect(out["a.md"]).toBe('---\ndue: "2026-10-31"\n---\n');
  });

  test("shifting forward and back gives the files again", () => {
    const seed = diskFiles();
    const there = rebaseWorkspace(seed, 12 * DAY + 5 * HOUR + 17 * MIN);
    expect(there["issues/wf/web/live-board-updates/goal.md"]).not.toBe(
      seed["issues/wf/web/live-board-updates/goal.md"],
    );
    // The date fields move by calendar days, so going back by the same shift is exact only when
    // both legs cross the same number of midnights. A whole number of days always does.
    const back = rebaseWorkspace(rebaseWorkspace(seed, 9 * DAY), -9 * DAY);
    expect(back).toEqual(seed);
  });

  test("a zero shift changes nothing", () => {
    const seed = diskFiles();
    expect(rebaseWorkspace(seed, 0)).toEqual(seed);
  });

  test("shiftSinceRecording is now minus RECORDED_AT", () => {
    expect(shiftSinceRecording(RECORDED + 5 * MIN)).toBe(5 * MIN);
    expect(shiftSinceRecording(RECORDED)).toBe(0);
  });
});

describe("a rebased workspace reads the same on any day", () => {
  const seed = diskFiles();

  for (const [label, age] of [
    ["the next day", DAY + 40 * MIN],
    ["a week later", 7 * DAY + 3 * HOUR + 17 * MIN],
    ["after midnight, three weeks later", 21 * DAY + 11 * HOUR],
  ] as const) {
    test(`${label}: leases stay live, ages and due dates stay put`, () => {
      const now = RECORDED + age;
      const before = loadWorkspace(seed, { now: RECORDED });
      const after = loadWorkspace(rebaseWorkspace(seed, shiftSinceRecording(now)), { now });
      const a = before.world.issues.find((i) => i.goal.id === "wf-3k9x2");
      const b = after.world.issues.find((i) => i.goal.id === "wf-3k9x2");
      // The coordinator lease is as far ahead of now as it was of the recording.
      expect(tsMs(b?.goal.lease_until as string) - now).toBe(
        tsMs(a?.goal.lease_until as string) - RECORDED,
      );
      // The newest entry is as old as it was.
      const newest = (x: typeof a) =>
        x?.changes.map((c) => tsMs(c.ts)).sort((p, q) => q - p)[0] as number;
      expect(now - newest(b)).toBe(RECORDED - newest(a));
      // The due date is the same number of local days ahead.
      const days = (due: string, from: number) =>
        (Date.parse(due) - Date.parse(toDate(from))) / DAY;
      expect(days(b?.goal.due as string, now)).toBe(days(a?.goal.due as string, RECORDED));
    });
  }
});
