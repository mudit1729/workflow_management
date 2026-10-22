import { describe, expect, it } from "vitest";
import { validateBoardSearch, validateLibrarySearch } from "./search";

describe("search validators", () => {
  it("keeps the board filter text exactly as typed, spaces included", () => {
    expect(validateBoardSearch({ q: "live bo" }).q).toBe("live bo");
    expect(validateBoardSearch({ q: "live " }).q).toBe("live ");
    expect(validateBoardSearch({ q: " live" }).q).toBe(" live");
  });

  it("treats whitespace-only text as no filter", () => {
    expect(validateBoardSearch({ q: "   " }).q).toBeUndefined();
    expect(validateBoardSearch({ q: "" }).q).toBeUndefined();
    expect(validateBoardSearch({}).q).toBeUndefined();
  });

  it("accepts a number the URL parser produced for ?q=42", () => {
    expect(validateBoardSearch({ q: 42 }).q).toBe("42");
    expect(validateLibrarySearch({ q: 42 }).q).toBe("42");
  });

  it("keeps the library search text untrimmed too", () => {
    expect(validateLibrarySearch({ q: "use when " }).q).toBe("use when ");
    expect(validateLibrarySearch({ q: "  " }).q).toBeUndefined();
  });

  it("still normalizes the other board params", () => {
    expect(validateBoardSearch({ author: "@codex", swim: "sideways", show: "cancelled" })).toEqual({
      group: undefined,
      swim: undefined,
      author: "codex",
      q: undefined,
      show: "cancelled",
    });
  });
});
