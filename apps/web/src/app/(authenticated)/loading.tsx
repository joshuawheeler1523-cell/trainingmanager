// Renders instantly while the authenticated layout fetches data — most
// importantly during org/department switches, where the
// revalidatePath("/", "layout") call invalidates everything and the
// server has to re-render the dashboard with the new tenant's data.
//
// Without this file the user just sees the previous page frozen for a
// second or two; with it, they get a clear "loading" signal immediately.

export default function AuthenticatedLoading() {
  return (
    <div className="bg-canvas flex flex-1 items-center justify-center">
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
