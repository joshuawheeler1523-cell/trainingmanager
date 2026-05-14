// Renders instantly while the authenticated layout fetches data — most
// importantly during org/department switches, where the
// revalidatePath("/", "layout") call invalidates everything and the
// server has to re-render the dashboard with the new tenant's data.
//
// Without this file the user just sees the previous page frozen for a
// second or two; with it, they get a clear "loading" signal immediately.

export default function AuthenticatedLoading() {
  // min-h-[calc(100vh-3.5rem)] fills the viewport below the 3.5rem (h-14)
  // sticky header in AppShell, so the spinner sits visually centered in
  // the content area instead of crammed at the top. `<main>` itself isn't
  // a flex container, so `flex-1` on this child collapses to zero —
  // hence the explicit min-height.
  return (
    <div className="bg-canvas flex min-h-[calc(100vh-3.5rem)] items-center justify-center p-6">
      <div className="flex flex-col items-center gap-3">
        <div
          aria-hidden="true"
          className="h-8 w-8 animate-spin rounded-full border-2 border-current border-t-transparent"
          style={{ color: "var(--primary)" }}
        />
        <p className="text-muted-foreground text-sm">Loading…</p>
      </div>
    </div>
  );
}
