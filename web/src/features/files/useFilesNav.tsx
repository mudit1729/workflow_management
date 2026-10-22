// Navigation to /files. `useGo` in `@/lib/nav` belongs to the data layer, so the Workspace
// files route has its own small hook and link.
import { useNavigate } from "@tanstack/react-router";
import { type MouseEvent, type ReactNode, useMemo } from "react";
import { hrefFor } from "@/lib/nav";
import { type EditIntent, requestFileEdit } from "./intent";

export interface FilesSearch {
  /** Workspace-relative path of the open file, kept exactly as typed. */
  path?: string;
  /** 1-based line to scroll to and flash when the file opens (a source tag, a glossary term). */
  line?: number;
}

/** An href for /files, hash-router aware. */
export function filesHref(path?: string, line?: number): string {
  if (!path) return hrefFor("/files");
  const at = line ? `&line=${line}` : "";
  return hrefFor(`/files?path=${encodeURIComponent(path)}${at}`);
}

type Navigate = (o: { to: string; search?: unknown; replace?: boolean }) => Promise<void>;

export function useFilesNav() {
  const navigate = useNavigate() as unknown as Navigate;
  return useMemo(() => {
    const open = (path?: string, opts: { replace?: boolean; line?: number } = {}) =>
      navigate({
        to: "/files",
        search: path ? (opts.line ? { path, line: opts.line } : { path }) : {},
        replace: opts.replace,
      });
    return {
      open,
      /** Open `path` and start its editor. */
      edit: (path: string, intent: Omit<EditIntent, "path"> = {}) => {
        requestFileEdit({ path, ...intent });
        return open(path);
      },
    };
  }, [navigate]);
}

interface FilesLinkProps {
  path?: string;
  /** Open the file scrolled to this line. */
  line?: number;
  className?: string;
  title?: string;
  "aria-label"?: string;
  children: ReactNode;
  onNavigate?: () => void;
}

/** A real link to /files (middle-click and copy-link work) that navigates without a reload. */
export function FilesLink({
  path,
  line,
  className,
  title,
  "aria-label": ariaLabel,
  children,
  onNavigate,
}: FilesLinkProps) {
  const nav = useFilesNav();
  const onClick = (e: MouseEvent<HTMLAnchorElement>) => {
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) {
      return;
    }
    e.preventDefault();
    onNavigate?.();
    void nav.open(path, { line });
  };
  return (
    <a
      data-wf="FilesLink"
      href={filesHref(path, line)}
      onClick={onClick}
      className={className}
      title={title}
      aria-label={ariaLabel}
    >
      {children}
    </a>
  );
}
