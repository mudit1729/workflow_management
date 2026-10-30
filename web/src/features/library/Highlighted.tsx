// Text with the matching words marked. `marks` are character ranges (`LibraryPassage.marks`).
import { Fragment } from "react";

export function Highlighted({
  text,
  marks,
}: {
  text: string;
  marks: readonly (readonly [number, number])[];
}) {
  const parts: { text: string; hit: boolean }[] = [];
  let at = 0;
  for (const [from, to] of [...marks].sort((a, b) => a[0] - b[0])) {
    if (from < at || to <= from) continue;
    if (from > at) parts.push({ text: text.slice(at, from), hit: false });
    parts.push({ text: text.slice(from, to), hit: true });
    at = to;
  }
  if (at < text.length) parts.push({ text: text.slice(at), hit: false });
  return (
    <>
      {parts.map((p, i) =>
        p.hit ? (
          <mark key={i} className="rounded-sm bg-accent-subtle px-px text-fg">
            {p.text}
          </mark>
        ) : (
          <Fragment key={i}>{p.text}</Fragment>
        ),
      )}
    </>
  );
}
