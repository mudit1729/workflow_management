// The TOML line editor: each call is a minimal change to the text, comments and key order stay,
// and the result is still the TOML a real parser reads.
import { parse } from "smol-toml";
import { describe, expect, test } from "vitest";
import { lineDiff, shippedFiles } from "./test-support";
import {
  listTomlTables,
  readTomlTable,
  removeTomlKey,
  removeTomlTable,
  setTomlKey,
} from "./toml-edit";

const FILE = `wf_format = 1

[workspace]
name = "wf"   # the display name
id_prefix = "wf"

# Leases last this long.
[leases]
minutes = 60

# S09 is off: the board says "card".
[lint]
disable = ["S09"]
severity = {}

[server]
port = 7777
author = "shruti"
`;

const diff = (a: string, b: string) => lineDiff(a, b);

describe("setTomlKey", () => {
  test("changes the value of one key and nothing else", () => {
    const out = setTomlKey(FILE, "leases", "minutes", 120);
    expect(diff(FILE, out)).toEqual({ removed: ["minutes = 60"], added: ["minutes = 120"] });
  });

  test("keeps the spacing, the quote style and the trailing comment of the line", () => {
    const out = setTomlKey(FILE, "workspace", "name", "acme");
    expect(diff(FILE, out)).toEqual({
      removed: ['name = "wf"   # the display name'],
      added: ['name = "acme"   # the display name'],
    });
    const single = "[a]\nx   =   'one'  # note\n";
    expect(setTomlKey(single, "a", "x", "two")).toBe("[a]\nx   =   'two'  # note\n");
    // A value a literal string cannot hold falls back to a basic string.
    expect(setTomlKey(single, "a", "x", "it's")).toBe('[a]\nx   =   "it\'s"  # note\n');
  });

  test("replaces a value that spans lines", () => {
    const text = `[lint]\ndisable = [\n  "S09", # why\n  "Q013",\n]\nother = 1\n`;
    expect(setTomlKey(text, "lint", "disable", "none")).toBe(
      `[lint]\ndisable = "none"\nother = 1\n`,
    );
  });

  test("adds a key after the last key of its table", () => {
    const out = setTomlKey(FILE, "leases", "grace", 5);
    expect(diff(FILE, out)).toEqual({ removed: [], added: ["grace = 5"] });
    expect(out).toContain("minutes = 60\ngrace = 5\n\n# S09");
  });

  test("adds a key to a table with no key yet, right under its header", () => {
    const text = "[a]\n\n[b]\ny = 1\n";
    expect(setTomlKey(text, "a", "x", true)).toBe("[a]\nx = true\n\n[b]\ny = 1\n");
  });

  test("adds a table at the end after one blank line, with an optional comment", () => {
    const out = setTomlKey(FILE, "flow.plan", "skill", "ws:acme-planning");
    expect(out).toBe(`${FILE}\n[flow.plan]\nskill = "ws:acme-planning"\n`);
    const noted = setTomlKey(FILE, "flow.plan", "max_tasks", 8, { comment: ["The skills flow."] });
    expect(noted).toBe(`${FILE}\n# The skills flow.\n[flow.plan]\nmax_tasks = 8\n`);
    // A file that already ends with a blank line, or with no line break, gets exactly one separator.
    expect(setTomlKey("a = 1\n\n", "t", "k", 1)).toBe("a = 1\n\n[t]\nk = 1\n");
    expect(setTomlKey("a = 1", "t", "k", 1)).toBe("a = 1\n\n[t]\nk = 1\n");
    expect(setTomlKey("", "t", "k", "v")).toBe('[t]\nk = "v"\n');
  });

  test("a second key of a table added in the same file lands in that table", () => {
    const one = setTomlKey(FILE, "flow.do", "finish", "review");
    const two = setTomlKey(one, "flow.do", "commit", "none");
    expect(two).toBe(`${FILE}\n[flow.do]\nfinish = "review"\ncommit = "none"\n`);
  });

  test("a table whose name is a prefix of another is not confused with it", () => {
    const text = '[flow]\na = 1\n\n[flow.plan]\nskill = "x"\n';
    expect(setTomlKey(text, "flow", "b", 2)).toBe(
      '[flow]\na = 1\nb = 2\n\n[flow.plan]\nskill = "x"\n',
    );
    expect(setTomlKey(text, "flow.plan", "n", 3)).toBe(`${text}n = 3\n`);
  });

  test("new strings are quoted like the strings of the file", () => {
    const single = "[a]\nx = 'one'\n\n[b]\ny = 1\n";
    expect(setTomlKey(single, "b", "z", "two")).toBe("[a]\nx = 'one'\n\n[b]\ny = 1\nz = 'two'\n");
    expect(setTomlKey(single, "c", "z", "two")).toBe(
      "[a]\nx = 'one'\n\n[b]\ny = 1\n\n[c]\nz = 'two'\n",
    );
    const double = '[a]\nx = "one"\n';
    expect(setTomlKey(double, "c", "z", 'tw"o')).toBe('[a]\nx = "one"\n\n[c]\nz = "tw\\"o"\n');
  });

  test("escapes what a string cannot hold", () => {
    const out = setTomlKey("", "t", "k", 'a "b" \\ c\nd');
    expect(out).toBe('[t]\nk = "a \\"b\\" \\\\ c\\nd"\n');
    expect((parse(out) as { t: { k: string } }).t.k).toBe('a "b" \\ c\nd');
  });

  test("keeps CRLF line endings and a missing final line break", () => {
    const crlf = "[a]\r\nx = 1\r\n";
    expect(setTomlKey(crlf, "a", "x", 2)).toBe("[a]\r\nx = 2\r\n");
    expect(setTomlKey(crlf, "b", "y", 1)).toBe("[a]\r\nx = 1\r\n\r\n[b]\r\ny = 1\r\n");
    expect(setTomlKey("[a]\nx = 1", "a", "x", 2)).toBe("[a]\nx = 2");
  });

  test("a file that mixes line endings keeps each of its lines as it was", () => {
    const mixed = "[a]\r\nx = 1\ny = 2\r\n[b]\nz = 3\n";
    expect(setTomlKey(mixed, "a", "x", 5)).toBe("[a]\r\nx = 5\ny = 2\r\n[b]\nz = 3\n");
    expect(setTomlKey(mixed, "a", "y", 5)).toBe("[a]\r\nx = 1\ny = 5\r\n[b]\nz = 3\n");
    // A new line ends like the line above it.
    expect(setTomlKey(mixed, "a", "w", 9)).toBe("[a]\r\nx = 1\ny = 2\r\nw = 9\r\n[b]\nz = 3\n");
    expect(setTomlKey(mixed, "b", "w", 9)).toBe("[a]\r\nx = 1\ny = 2\r\n[b]\nz = 3\nw = 9\n");
    expect(setTomlKey(mixed, "c", "k", 1)).toBe(`${mixed}\n[c]\nk = 1\n`);
    expect(removeTomlKey(mixed, "a", "x")).toBe("[a]\r\ny = 2\r\n[b]\nz = 3\n");
    expect(removeTomlTable(mixed, "b")).toBe("[a]\r\nx = 1\ny = 2\r\n");
  });

  test("sets a top-level key", () => {
    expect(setTomlKey(FILE, "", "wf_format", 2).split("\n")[0]).toBe("wf_format = 2");
    expect(setTomlKey("[a]\nx = 1\n", "", "top", 1)).toBe("top = 1\n\n[a]\nx = 1\n");
  });

  test("leaves an [[array]] table alone", () => {
    const text = '[[team]]\nalias = "p"\n\n[[team]]\nalias = "q"\n';
    expect(setTomlKey(text, "team", "alias", "z")).toBe(`${text}\n[team]\nalias = "z"\n`);
  });

  test("the shipped workflow.toml changes by one line", () => {
    const text = shippedFiles()["workflow.toml"] as string;
    const out = setTomlKey(text, "leases", "minutes", 30);
    expect(diff(text, out)).toEqual({ removed: ["minutes = 60"], added: ["minutes = 30"] });
    expect((parse(out) as { leases: { minutes: number } }).leases.minutes).toBe(30);
  });
});

describe("removeTomlKey", () => {
  test("removes the line of a key", () => {
    const out = removeTomlKey(FILE, "server", "port");
    expect(diff(FILE, out)).toEqual({ removed: ["port = 7777"], added: [] });
  });

  test("removes every line of a value that spans lines, and keeps a comment above the key", () => {
    const text = `[lint]\n# why\ndisable = [\n  "S09",\n]\nseverity = {}\n`;
    expect(removeTomlKey(text, "lint", "disable")).toBe(`[lint]\n# why\nseverity = {}\n`);
  });

  test("keeps the table when the last key goes", () => {
    expect(removeTomlKey("[a]\nx = 1\n\n[b]\n", "a", "x")).toBe("[a]\n\n[b]\n");
  });

  test("changes nothing when the key or the table is missing", () => {
    expect(removeTomlKey(FILE, "server", "nope")).toBe(FILE);
    expect(removeTomlKey(FILE, "nope", "port")).toBe(FILE);
  });
});

describe("removeTomlTable", () => {
  test("removes a table in the middle, its comment and the blank line after it", () => {
    const out = removeTomlTable(FILE, "leases");
    expect(out).toBe(FILE.replace("# Leases last this long.\n[leases]\nminutes = 60\n\n", ""));
  });

  test("keeps the comment that belongs to the next table", () => {
    const out = removeTomlTable(FILE, "leases");
    expect(out).toContain('# S09 is off: the board says "card".\n[lint]');
  });

  test("removing the table that was added last gives back the file", () => {
    const added = setTomlKey(FILE, "flow.plan", "skill", "ws:x", { comment: ["A note."] });
    expect(removeTomlTable(added, "flow.plan")).toBe(FILE);
    const two = setTomlKey(added, "flow.do", "finish", "review");
    expect(removeTomlTable(removeTomlTable(two, "flow.do"), "flow.plan")).toBe(FILE);
  });

  test("removes a table by its own name, not the tables below it, unless deep", () => {
    const text = '[flow]\na = 1\n\n[flow.plan]\nskill = "x"\n\n[other]\nb = 2\n';
    expect(removeTomlTable(text, "flow")).toBe('[flow.plan]\nskill = "x"\n\n[other]\nb = 2\n');
    expect(removeTomlTable(text, "flow", { deep: true })).toBe("[other]\nb = 2\n");
  });

  test("changes nothing when the table is missing", () => {
    expect(removeTomlTable(FILE, "flow.plan")).toBe(FILE);
  });

  test("a multi-line value that looks like a header does not end the table", () => {
    const text = '[a]\nx = [\n  "p",\n]\n[b]\ny = 1\n';
    expect(removeTomlTable(text, "a")).toBe("[b]\ny = 1\n");
  });
});

describe("readTomlTable", () => {
  test("reads the scalar keys of a table", () => {
    const text = `[flow.plan]\nskill = "ws:x" # note\nmax_tasks = 8\nrequired = true\nlist = ["a"]\nratio = 1.5\n`;
    expect(readTomlTable(text, "flow.plan")).toEqual({
      skill: "ws:x",
      max_tasks: 8,
      required: true,
      ratio: 1.5,
    });
  });

  test("is undefined for a table the file does not have, and the top level always exists", () => {
    expect(readTomlTable(FILE, "flow.plan")).toBeUndefined();
    expect(readTomlTable(FILE, "")).toEqual({ wf_format: 1 });
    expect(readTomlTable("", "")).toEqual({});
    expect(readTomlTable("[a]\n", "a")).toEqual({});
  });

  test("agrees with a TOML parser on every scalar of the shipped workflow.toml", () => {
    const text = shippedFiles()["workflow.toml"] as string;
    const data = parse(text) as Record<string, Record<string, unknown>>;
    for (const table of ["workspace", "leases", "staleness", "context", "server"]) {
      expect(readTomlTable(text, table)).toEqual(data[table]);
    }
  });

  test("reads quoted strings with escapes and literal strings", () => {
    const text = `[t]\na = "x\\ty\\u00e9"\nb = 'c:\\d'\nc = ""\nd = ''\n`;
    expect(readTomlTable(text, "t")).toEqual({ a: "x\ty\u00e9", b: "c:\\d", c: "", d: "" });
    expect(parse(text)).toEqual({ t: readTomlTable(text, "t") });
  });
});

describe("a round trip with the TOML parser", () => {
  test("every edit leaves a file the parser reads as the edit says", () => {
    let text = FILE;
    text = setTomlKey(text, "flow.plan", "skill", "ws:acme-planning");
    text = setTomlKey(text, "flow.plan", "max_tasks", 5);
    text = setTomlKey(text, "flow.custom.security-check", "after", "do");
    text = setTomlKey(text, "flow.custom.security-check", "skill", "platform:checking-security");
    text = setTomlKey(text, "flow.custom.security-check", "required", true);
    text = setTomlKey(text, "flow.custom.security-check", "order", 1);
    text = setTomlKey(text, "leases", "minutes", 90);
    const data = parse(text) as Record<string, unknown>;
    expect(data.flow).toEqual({
      plan: { skill: "ws:acme-planning", max_tasks: 5 },
      custom: {
        "security-check": {
          after: "do",
          skill: "platform:checking-security",
          required: true,
          order: 1,
        },
      },
    });
    expect((data.leases as { minutes: number }).minutes).toBe(90);
    expect(listTomlTables(text)).toEqual([
      "workspace",
      "leases",
      "lint",
      "server",
      "flow.plan",
      "flow.custom.security-check",
    ]);
    // Everything the edits did not name is still there, in order, with its comments.
    for (const line of FILE.split("\n").filter((l) => l !== "" && !l.includes("minutes")))
      expect(text).toContain(line);
    const back = removeTomlTable(removeTomlTable(text, "flow.custom.security-check"), "flow.plan");
    expect(back).toBe(setTomlKey(FILE, "leases", "minutes", 90));
  });
});

describe("a random run of edits", () => {
  // A small model of the file: the keys of the tables the edits touch. After every edit the text
  // must parse as the model says, and the lines the edits never touch must still be there.
  const TABLES = ["", "flow.plan", "flow.custom.a", "flow.custom.b", "context", "extra"];
  const KEYS = ["skill", "after", "label", "order", "required", "max_tasks"];
  const VALUES: (string | number | boolean)[] = [
    "ws:x",
    'a "quoted" one',
    "it's",
    "",
    1,
    42,
    true,
    false,
  ];

  function rng(seed: number) {
    let x = seed;
    return () => {
      x = (x * 1664525 + 1013904223) % 4294967296;
      return x / 4294967296;
    };
  }

  test("the text parses as the model, and untouched content stays", () => {
    const untouched = [
      "# kept comment",
      'name = "kept"',
      "[kept]",
      "list = [1, 2,",
      "  3]",
      'note = "also kept" # tail',
    ];
    const base = `${untouched.slice(0, 2).join("\n")}\n\n${untouched.slice(2).join("\n")}\n`;
    for (let seed = 1; seed <= 40; seed++) {
      const next = rng(seed);
      const pick = <T>(list: readonly T[]) => list[Math.floor(next() * list.length)] as T;
      let text = base;
      const model: Record<string, Record<string, string | number | boolean>> = {};
      for (let step = 0; step < 30; step++) {
        const table = pick(TABLES);
        const roll = next();
        if (roll < 0.6) {
          const key = pick(KEYS);
          const value = pick(VALUES);
          text = setTomlKey(text, table, key, value);
          model[table] = { ...model[table], [key]: value };
        } else if (roll < 0.85) {
          const key = pick(KEYS);
          text = removeTomlKey(text, table, key);
          if (model[table]) delete model[table][key];
        } else if (table !== "") {
          text = removeTomlTable(text, table);
          delete model[table];
        }
        const data = parse(text) as Record<string, unknown>;
        const at = (name: string): Record<string, unknown> => {
          let node: unknown = name === "" ? data : data;
          if (name !== "")
            for (const part of name.split("."))
              node = (node as Record<string, unknown> | undefined)?.[part];
          return (node ?? {}) as Record<string, unknown>;
        };
        for (const name of TABLES) {
          const read =
            name === ""
              ? Object.fromEntries(
                  Object.entries(data).filter(([, v]) => typeof v !== "object" || v === null),
                )
              : at(name);
          const want = model[name] ?? {};
          // The top level also holds the file's own key `name`.
          const got =
            name === ""
              ? Object.fromEntries(Object.entries(read).filter(([k]) => k !== "name"))
              : read;
          expect(got, `seed ${seed} step ${step} table "${name}"`).toEqual(want);
        }
        for (const line of untouched) expect(text, `seed ${seed} step ${step}`).toContain(line);
      }
    }
  });
});
