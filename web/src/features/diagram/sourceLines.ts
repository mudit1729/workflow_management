// Where a JSON path sits in the pretty-printed source, so errors can point at their lines.
import type { DiagramError } from "@/gen/types";

/** 1-based line on which each JSON path ("nodes[8].label") starts. */
export function jsonPathLines(source: string): Map<string, number> {
  const lines = new Map<string, number>();
  let i = 0;
  let line = 1;

  const skipSpace = () => {
    while (i < source.length && /\s/.test(source[i])) {
      if (source[i] === "\n") line++;
      i++;
    }
  };
  const readString = () => {
    let j = i + 1;
    while (j < source.length && source[j] !== '"') j += source[j] === "\\" ? 2 : 1;
    const text = source.slice(i + 1, j);
    i = j + 1;
    return text;
  };
  const readValue = (path: string) => {
    skipSpace();
    lines.set(path, line);
    const c = source[i];
    if (c === "{") {
      i++;
      skipSpace();
      if (source[i] === "}") {
        i++;
        return;
      }
      for (;;) {
        skipSpace();
        const key = readString();
        skipSpace();
        i++; // the colon
        readValue(path ? `${path}.${key}` : key);
        skipSpace();
        if (source[i] === ",") {
          i++;
          continue;
        }
        i++; // the closing brace
        return;
      }
    } else if (c === "[") {
      i++;
      skipSpace();
      if (source[i] === "]") {
        i++;
        return;
      }
      for (let n = 0; ; n++) {
        readValue(`${path}[${n}]`);
        skipSpace();
        if (source[i] === ",") {
          i++;
          continue;
        }
        i++; // the closing bracket
        return;
      }
    } else if (c === '"') {
      readString();
    } else {
      while (i < source.length && !/[,\]}\s]/.test(source[i])) i++;
    }
  };

  try {
    readValue("");
  } catch {
    // Malformed source: keep what was found.
  }
  return lines;
}

/** The errors in the order of the source, those without a line last, each with its line. */
export function orderedErrors(
  source: string,
  errors: DiagramError[],
): { errors: DiagramError[]; lines: (number | undefined)[] } {
  const lines = errorLines(source, errors);
  const order = errors
    .map((_, i) => i)
    .sort(
      (a, b) =>
        (lines[a] ?? Number.POSITIVE_INFINITY) - (lines[b] ?? Number.POSITIVE_INFINITY) || a - b,
    );
  return { errors: order.map((i) => errors[i]), lines: order.map((i) => lines[i]) };
}

/**
 * The line of each error. A missing property has no line of its own, so the error points at
 * the object that lacks it ("nodes[8].label" → the line of "nodes[8]").
 */
export function errorLines(source: string, errors: DiagramError[]): (number | undefined)[] {
  const lines = jsonPathLines(source);
  return errors.map((error) => {
    // "$" is the whole document: its first line.
    let path = error.path === "$" ? "" : error.path;
    for (;;) {
      const line = lines.get(path);
      if (line) return line;
      const parent = path.replace(/(\.[^.[\]]+|\[\d+\])$/, "");
      // A path that does not shorten has no parent left (a malformed one): stop, do not spin.
      if (parent === path) return undefined;
      path = parent;
    }
  });
}
