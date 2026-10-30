// The split screen's "Start in" control: Backlog and Planned as two buttons, Backlog first.
// (The test environment has no DOM, so the control renders to markup.)
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { StartIn } from "./steps/SplitStep";

const html = (value: "backlog" | "planned") =>
  renderToStaticMarkup(<StartIn value={value} onChange={() => {}} />);

describe("StartIn", () => {
  it("offers Backlog and Planned as buttons in one labelled group", () => {
    const out = html("backlog");
    expect(out).toContain('aria-label="Where the issues start"');
    expect(out.indexOf("Backlog")).toBeGreaterThan(-1);
    expect(out.indexOf("Planned")).toBeGreaterThan(out.indexOf("Backlog"));
    expect(out).toContain('data-wf="SplitStart"');
  });

  it("marks the pick and says what it means", () => {
    expect(html("backlog")).toContain("Not scheduled yet");
    expect(html("planned")).toContain("Scheduled, ready to start");
    expect(html("planned")).not.toContain("Not scheduled yet");
  });
});
