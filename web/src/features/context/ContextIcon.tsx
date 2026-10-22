// One 14 px glyph per kind of context: the library kind for a library item, a scale for a
// decision, an open book for a glossary term, a page for a file.
import { BookA, FileText } from "lucide-react";
import { KindIcon } from "@/components/common";
import type { ContextKind } from "./links";
import type { ContextItem } from "./types";

export function ContextIcon({
  item,
  size = 14,
  className,
}: {
  item: Pick<ContextItem, "kind" | "libKind">;
  size?: number;
  className?: string;
}) {
  return <KindGlyph kind={item.kind} libKind={item.libKind} size={size} className={className} />;
}

export function KindGlyph({
  kind,
  libKind,
  size = 14,
  className,
}: {
  kind: ContextKind;
  libKind?: ContextItem["libKind"];
  size?: number;
  className?: string;
}) {
  switch (kind) {
    case "library":
      return <KindIcon kind={libKind ?? "pattern"} size={size} className={className} />;
    case "entry":
      return <KindIcon kind="decision" size={size} className={className} />;
    case "term":
      return <BookA aria-hidden size={size} strokeWidth={1.75} className={className} />;
    case "file":
      return <FileText aria-hidden size={size} strokeWidth={1.75} className={className} />;
  }
}
