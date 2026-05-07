import Link from "next/link";

export default function NotFound() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 text-center">
      <p className="text-muted-foreground text-sm font-medium uppercase tracking-widest">404</p>
      <h1 className="text-foreground text-2xl font-semibold">Page not found</h1>
      <p className="text-muted-foreground max-w-sm text-sm">
        The page you&apos;re looking for doesn&apos;t exist or has been moved.
      </p>
      <Link
        href="/"
        className="bg-primary text-primary-foreground mt-2 rounded-md px-4 py-2 text-sm font-medium hover:opacity-90"
      >
        Go home
      </Link>
    </div>
  );
}
