import { useEffect, useRef, useState } from "react";
import { getMockControls } from "@/app/mock-controls";
import { Button, Switch } from "@/components/ui";
import { ArchifyCard, DiagramDialog } from "@/features/diagram";
import type { Diagram } from "@/gen/types";
import { useIssue, useSnapshot } from "@/lib/api";
import { entry, type KitEntry, Row, V } from "../kit-ui";
import { ISSUE } from "./data";

const SRC = "src/features/diagram";

/** The diagrams of the mock world, as the data layer serves them (archify unavailable). */
function useDiagrams() {
  const rich = useIssue(ISSUE.rich).data?.diagrams ?? [];
  const broken = useIssue(ISSUE.invalidDiagram).data?.diagrams ?? [];
  const base: Diagram | undefined = rich.find((d) => d.id === "live-board-architecture") ?? rich[0];
  const flow: Diagram | undefined = rich.find((d) => d.id === "sse-delivery-flow");
  const invalid: Diagram | undefined = broken.find((d) => d.errors.length > 0) ?? broken[0];
  return { base, flow, invalid };
}

/**
 * Ready and rendering need archify to be available. The mock ships with it off, so the kit
 * turns it on while one of its diagram sections is open, and puts it back when they close.
 * Counted, because StrictMode (and two sections) mount this more than once.
 */
let holders = 0;
let wasOff = false;

function useArchifyOn() {
  const archify = useSnapshot().data?.config.archify;
  const latest = useRef(archify);
  latest.current = archify;
  useEffect(() => {
    const c = getMockControls();
    if (!c) return;
    if (holders === 0) wasOff = latest.current === "unavailable";
    holders += 1;
    if (wasOff) c.setArchifyAvailable(true);
    return () => {
      holders -= 1;
      if (holders === 0 && wasOff) c.setArchifyAvailable(false);
    };
  }, []);
}

function ArchifySwitch() {
  const archify = useSnapshot().data?.config.archify;
  const controls = getMockControls();
  useArchifyOn();
  return (
    <span className="flex items-center gap-2 text-fg-muted text-sm">
      <Switch
        checked={archify !== "unavailable"}
        disabled={!controls}
        onCheckedChange={(on) => controls?.setArchifyAvailable(on)}
        aria-label="Archify available"
      />
      Archify available (mock server)
    </span>
  );
}

function ArchifyCardBody() {
  const { base, invalid } = useDiagrams();
  if (!base || !invalid) return null;
  return (
    <>
      <V
        fill
        label="mock switch"
        note="Ready and rendering need it on; Unavailable shows with it off."
      >
        <ArchifySwitch />
      </V>
      <V label="rendering" width={560}>
        <ArchifyCard diagram={{ ...base, status: "rendering" }} />
      </V>
      <V label="ready · stand-in preview page" width={560}>
        <ArchifyCard diagram={{ ...base, status: "ready" }} />
      </V>
      <V label="ready · compact" width={560}>
        <ArchifyCard diagram={{ ...base, status: "ready" }} compact />
      </V>
      <V label="invalid · errors with JSON paths, source, Copy for agent" width={560}>
        <ArchifyCard diagram={invalid} />
      </V>
      <V label="unavailable · source and the wf doctor hint" width={560}>
        <ArchifyCard diagram={{ ...base, status: "unavailable" }} />
      </V>
    </>
  );
}

function DialogDemo({ diagram, label }: { diagram: Diagram; label: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button variant="secondary" size="sm" onClick={() => setOpen(true)}>
        {label}
      </Button>
      <DiagramDialog diagram={diagram} open={open} onOpenChange={setOpen} />
    </>
  );
}

function DiagramDialogBody() {
  const { base, invalid } = useDiagrams();
  useArchifyOn();
  if (!base || !invalid) return null;
  return (
    <V
      label="open full size"
      note="A full-size dialog: header with title, type and source line, Copy JSON."
    >
      <Row>
        <DialogDemo diagram={{ ...base, status: "ready" }} label="Ready diagram" />
        <DialogDemo diagram={{ ...base, status: "unavailable" }} label="Unavailable" />
        <DialogDemo diagram={invalid} label="Invalid" />
      </Row>
    </V>
  );
}

export const diagramEntries: KitEntry[] = [
  entry(
    "Diagrams",
    "ArchifyCard",
    `${SRC}/ArchifyCard.tsx`,
    "Architecture and flow diagrams live in the goal and the plan as archify blocks; the card renders them in place, and when one cannot render it shows why and gives the source to fix.",
    ArchifyCardBody,
  ),
  entry(
    "Diagrams",
    "DiagramDialog",
    `${SRC}/DiagramDialog.tsx`,
    "A diagram is only readable at size, so the dialog opens it full screen with its source location and a copy of the JSON.",
    DiagramDialogBody,
  ),
];
