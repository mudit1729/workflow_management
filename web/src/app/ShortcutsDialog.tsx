// "?" — every keyboard shortcut (contract §6), in two columns.
import { Fragment } from "react";
import { Dialog, DialogContent, Kbd } from "@/components/ui";
import { useShell } from "./shell-store";
import { SHORTCUTS, type ShortcutDef, type ShortcutSection } from "./shortcuts";

export function ShortcutsDialog() {
  const open = useShell((s) => s.shortcutsOpen);
  const setOpen = useShell((s) => s.setShortcutsOpen);

  // Two balanced columns: General + Go to, then Board + Issue.
  const columns: ShortcutSection[][] = [SHORTCUTS.slice(0, 2), SHORTCUTS.slice(2)];

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent
        size="lg"
        title="Keyboard shortcuts"
        description="Single keys work anywhere outside a text field."
      >
        <div data-wf="ShortcutsDialog" className="grid gap-x-8 gap-y-6 sm:grid-cols-2">
          {columns.map((sections, i) => (
            <div key={i} className="flex min-w-0 flex-col gap-6">
              {sections.map((section) => (
                <section key={section.title} aria-label={section.title}>
                  <h3 className="mb-1 font-medium text-fg-faint text-xs">{section.title}</h3>
                  <dl className="flex flex-col">
                    {section.items.map((item) => (
                      <ShortcutRow key={`${section.title}-${item.label}`} item={item} />
                    ))}
                  </dl>
                </section>
              ))}
            </div>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function ShortcutRow({ item }: { item: ShortcutDef }) {
  const joiner = item.range ? "–" : "or";
  return (
    <div className="flex min-h-8 items-center justify-between gap-4 border-border border-b py-1 last:border-b-0">
      <dt className="min-w-0 text-fg-muted">{item.label}</dt>
      <dd className="flex shrink-0 items-center gap-1">
        {item.combos.map((combo, i) => (
          <Fragment key={combo}>
            {i > 0 && <span className="px-0.5 text-fg-faint text-xs">{joiner}</span>}
            <Kbd combo={combo} />
          </Fragment>
        ))}
      </dd>
    </div>
  );
}
