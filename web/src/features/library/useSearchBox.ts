// The search box of a page whose filter text lives in the URL (?q=): instant in the field,
// debounced into the URL. A link or the back button that changes ?q= is adopted unless the box
// wrote it itself.
import { useEffect, useRef, useState } from "react";

export function useSearchBox(
  urlQuery: string,
  setUrlQuery: (q: string | undefined) => void,
): { input: string; setInput: (value: string) => void; clear: () => void } {
  const [input, setInput] = useState(urlQuery);
  const written = useRef(urlQuery);
  const setQueryRef = useRef(setUrlQuery);
  setQueryRef.current = setUrlQuery;

  useEffect(() => {
    if (urlQuery !== written.current) {
      written.current = urlQuery;
      setInput(urlQuery);
    }
  }, [urlQuery]);

  useEffect(() => {
    const next = input.trim();
    if (next === written.current) return;
    const t = setTimeout(() => {
      written.current = next;
      setQueryRef.current(next || undefined);
    }, 200);
    return () => clearTimeout(t);
  }, [input]);

  const clear = () => {
    written.current = "";
    setInput("");
    setQueryRef.current(undefined);
  };
  return { input, setInput, clear };
}
