"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { recordCookieConsentAction } from "@/app/legal/actions";

const CONSENT_COOKIE = "arbor.cookie-consent";
const SESSION_KEY = "arbor.consent-session";

type Choices = { analytics: boolean; marketing: boolean };

/**
 * GDPR / CCPA cookie consent banner. Renders nothing once the user has
 * made a choice — choice is persisted in localStorage + a server-side
 * cookie_consents row keyed by an anonymous session id.
 *
 * Mounted once in apps/web/src/app/layout.tsx. Lives outside any auth
 * gate so it shows on /login + /agency-signup + marketing pages.
 */
export default function CookieBanner() {
  const [shown, setShown] = useState(false);
  const [showCustomize, setShowCustomize] = useState(false);
  const [choices, setChoices] = useState<Choices>({ analytics: false, marketing: false });

  useEffect(() => {
    // Only show if no choice has been recorded yet on this device.
    if (typeof window === "undefined") return;
    const cookie = document.cookie.split("; ").find((c) => c.startsWith(`${CONSENT_COOKIE}=`));
    if (!cookie) setShown(true);
  }, []);

  const persist = async (next: Choices) => {
    let sessionId = localStorage.getItem(SESSION_KEY);
    if (!sessionId) {
      sessionId = crypto.randomUUID();
      localStorage.setItem(SESSION_KEY, sessionId);
    }
    // 13-month cookie per CNIL/EDPB guidance for consent re-prompt cadence.
    const value = JSON.stringify(next);
    document.cookie = `${CONSENT_COOKIE}=${encodeURIComponent(
      value,
    )}; path=/; max-age=${(60 * 60 * 24 * 395).toString()}; SameSite=Lax`;
    await recordCookieConsentAction({
      necessary: true,
      analytics: next.analytics,
      marketing: next.marketing,
      sessionId,
      source: "banner",
    });
    setShown(false);
  };

  if (!shown) return null;

  return (
    <div className="fixed inset-x-0 bottom-0 z-50 px-4 pb-4">
      <div className="border-border bg-background mx-auto max-w-3xl rounded-xl border p-5 shadow-lg">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between sm:gap-6">
          <div className="flex-1 text-sm">
            <p className="text-foreground font-semibold">Cookies on Arbor</p>
            <p className="text-muted-foreground mt-1 text-xs">
              We use strictly necessary cookies to keep you signed in and remember your active
              organization. With your consent we&apos;d also like to use cookies for analytics so we
              can improve the product. See our{" "}
              <Link href="/legal/cookies" className="text-primary underline">
                Cookie Policy
              </Link>{" "}
              for details.
            </p>
          </div>
          <div className="flex flex-col gap-2 sm:items-end">
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => {
                  void persist({ analytics: false, marketing: false });
                }}
                className="border-border text-foreground hover:bg-surface rounded-md border px-3 py-1.5 text-xs font-medium"
              >
                Reject non-essential
              </button>
              <button
                type="button"
                onClick={() => {
                  void persist({ analytics: true, marketing: false });
                }}
                className="bg-primary text-primary-foreground rounded-md px-3 py-1.5 text-xs font-medium hover:opacity-90"
              >
                Accept all
              </button>
            </div>
            <button
              type="button"
              onClick={() => {
                setShowCustomize((v) => !v);
              }}
              className="text-muted-foreground hover:text-foreground text-xs underline"
            >
              {showCustomize ? "Hide options" : "Customize"}
            </button>
          </div>
        </div>

        {showCustomize && (
          <div className="border-border mt-4 space-y-2 border-t pt-4 text-sm">
            <label className="flex items-start gap-3">
              <input type="checkbox" checked disabled className="mt-1 h-4 w-4" />
              <div>
                <p className="text-foreground font-medium">Strictly necessary</p>
                <p className="text-muted-foreground text-xs">
                  Required for sign-in and basic operation. Cannot be disabled.
                </p>
              </div>
            </label>
            <label className="flex items-start gap-3">
              <input
                type="checkbox"
                checked={choices.analytics}
                onChange={(e) => {
                  setChoices((c) => ({ ...c, analytics: e.target.checked }));
                }}
                className="mt-1 h-4 w-4"
              />
              <div>
                <p className="text-foreground font-medium">Analytics</p>
                <p className="text-muted-foreground text-xs">
                  Helps us understand which features get used so we can improve them.
                </p>
              </div>
            </label>
            <button
              type="button"
              onClick={() => {
                void persist(choices);
              }}
              className="bg-primary text-primary-foreground mt-2 rounded-md px-3 py-1.5 text-xs font-medium hover:opacity-90"
            >
              Save preferences
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
