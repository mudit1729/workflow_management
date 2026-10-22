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

/**
 * The line of each error. A missing property has no line of its own, so the error points at
 * the object that lacks it ("nodes[8].label" → the line of "nodes[8]").
 */
export function errorLines(source: string, errors: DiagramError[]): (number | undefined)[] {
  const lines = jsonPathLines(source);
  return errors.map((error) => {
    let path = error.path;
    while (path) {
      const line = lines.get(path);
      if (line) return line;
      path = path.replace(/(\.[^.[\]]+|\[\d+\])$/, "");
    }
    return undefined;
  });
}
