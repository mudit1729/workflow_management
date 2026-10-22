// "Open raw" for a markdown doc: the text as a blob URL the browser can show in a tab. The
// real daemon serves `GET /api/files/{path}`; the mock has no server, so the page makes the
// URL itself. One blob per distinct text, the oldest dropped after 48.
const KEEP = 48;
const blobs = new Map<string, string>();

export function rawTextUrl(_path: string, text: string): string {
  if (typeof window === "undefined" || typeof Blob === "undefined") return "";
  if (typeof URL === "undefined" || typeof URL.createObjectURL !== "function") return "";
  const known = blobs.get(text);
  if (known) return known;
  const url = URL.createObjectURL(new Blob([text], { type: "text/plain;charset=utf-8" }));
  blobs.set(text, url);
  if (blobs.size > KEEP) {
    const [oldest, old] = blobs.entries().next().value as [string, string];
    blobs.delete(oldest);
    URL.revokeObjectURL(old);
  }
  return url;
}
