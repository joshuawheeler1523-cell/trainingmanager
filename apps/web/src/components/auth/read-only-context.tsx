"use client";

import { createContext, useContext, type ReactNode } from "react";
import { useOrgIdentity } from "@/components/labels";

const ReadOnlyContext = createContext<boolean>(false);

/**
 * Wraps a form region to indicate that the caller is read-only (currently
 * means: caller has the viewer role). Form components can read this with
 * `useFormReadOnly()` and disable inputs/buttons accordingly.
 *
 * Defaults to: viewers are read-only, everyone else can interact. The
 * `force` prop lets a parent override (e.g. archived TRA → everyone is
 * read-only regardless of role).
 */
export function FormReadOnlyContext({ children, force }: { children: ReactNode; force?: boolean }) {
  const { role } = useOrgIdentity();
  const readOnly = force ?? role === "viewer";
  return <ReadOnlyContext.Provider value={readOnly}>{children}</ReadOnlyContext.Provider>;
}

/** Returns true when the form should disable inputs/buttons. */
export function useFormReadOnly(): boolean {
  return useContext(ReadOnlyContext);
}

/**
 * Banner shown above a form when in read-only mode. Use inside a
 * FormReadOnlyContext to make the read-only state visible to the user.
 */
export function ReadOnlyBanner() {
  const readOnly = useFormReadOnly();
  if (!readOnly) return null;
  return (
    <div
      role="status"
      className="border-border bg-surface text-muted-foreground mb-4 rounded-md border px-4 py-2 text-sm"
    >
      View-only access. Ask a manager to make changes.
    </div>
  );
}
