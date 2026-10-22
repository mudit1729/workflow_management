// Text fields. Hairline at rest, accent border and soft ring on focus.
import { Search, X } from "lucide-react";
import { type ComponentProps, type KeyboardEvent, useRef, useState } from "react";
import { cn } from "@/lib/cn";
import { useHotkey } from "@/lib/hooks";
import { Kbd } from "./kbd";

const field = [
  "w-full min-w-0 rounded-md border border-border bg-bg text-base text-fg",
  "placeholder:text-fg-faint",
  "transition-[border-color,box-shadow] duration-100 ease-wf",
  "hover:border-border-strong",
  "focus-visible:border-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus",
  "disabled:cursor-not-allowed disabled:opacity-50",
  "aria-invalid:border-danger aria-invalid:focus-visible:ring-danger/25",
].join(" ");

export function Input({ className, type = "text", ...props }: ComponentProps<"input">) {
  return (
    <input data-wf="Input" type={type} className={cn(field, "h-7 px-2", className)} {...props} />
  );
}

export function Textarea({ className, rows = 3, ...props }: ComponentProps<"textarea">) {
  return (
    <textarea
      data-wf="Textarea"
      rows={rows}
      className={cn(
        field,
        "field-sizing-content max-h-60 min-h-16 resize-none px-2 py-1.5 leading-normal",
        className,
      )}
      {...props}
    />
  );
}

export interface SearchInputProps
  extends Omit<ComponentProps<"input">, "value" | "onChange" | "size" | "type"> {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  /** A hotkey that focuses the field from anywhere, shown as a key cap while empty. */
  shortcut?: "/" | (string & {});
  size?: "sm" | "md";
}

export function SearchInput({
  value,
  onChange,
  placeholder = "Search",
  shortcut,
  size = "md",
  className,
  onKeyDown,
  onFocus,
  onBlur,
  ref,
  ...props
}: SearchInputProps) {
  const inner = useRef<HTMLInputElement | null>(null);
  const [focused, setFocused] = useState(false);

  useHotkey(shortcut ?? "/", () => inner.current?.focus(), { enabled: Boolean(shortcut) });

  const setRefs = (el: HTMLInputElement | null) => {
    inner.current = el;
    if (typeof ref === "function") ref(el);
    else if (ref) ref.current = el;
  };

  const keyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    onKeyDown?.(e);
    if (e.defaultPrevented || e.key !== "Escape") return;
    // First Esc clears, second Esc leaves the field. Neither closes an outer drawer.
    e.stopPropagation();
    if (value) onChange("");
    else inner.current?.blur();
  };

  return (
    <div
      data-wf="SearchInput"
      className={cn("relative flex min-w-0 items-center", size === "sm" ? "h-6" : "h-7", className)}
    >
      <Search
        aria-hidden
        size={14}
        strokeWidth={1.75}
        className="pointer-events-none absolute left-2 text-fg-faint"
      />
      <input
        ref={setRefs}
        type="search"
        value={value}
        placeholder={placeholder}
        aria-label={props["aria-label"] ?? placeholder}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={keyDown}
        onFocus={(e) => {
          setFocused(true);
          onFocus?.(e);
        }}
        onBlur={(e) => {
          setFocused(false);
          onBlur?.(e);
        }}
        className={cn(
          field,
          "h-full pr-7 pl-7 [&::-webkit-search-cancel-button]:appearance-none",
          size === "sm" && "text-sm",
        )}
        {...props}
      />
      {value ? (
        <button
          type="button"
          aria-label="Clear search"
          onClick={() => {
            onChange("");
            inner.current?.focus();
          }}
          className="absolute right-1 flex size-5 items-center justify-center rounded-sm text-fg-faint hover:bg-muted hover:text-fg"
        >
          <X size={12} strokeWidth={2} />
        </button>
      ) : (
        shortcut &&
        !focused && <Kbd combo={shortcut} className="pointer-events-none absolute right-1.5" />
      )}
    </div>
  );
}
