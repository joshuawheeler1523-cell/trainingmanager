"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { setFeatureFlag, updateOrgSettings } from "../actions";

export type SettingsInitial = {
  name: string;
  time_zone: string;
  logo_url: string;
  brand_color: string;
  default_working_hours_per_week: number;
  cert_expiry_warning_days: number;
  request_aging_days: number;
  flags: Record<string, boolean>;
};

const FEATURE_FLAGS = [
  {
    key: "ai_estimation",
    label: "AI estimation (Work Intake)",
    description:
      "Enables the AI Assistant panel on work intake wizards. Requires ANTHROPIC_API_KEY + tra-suggest edge function.",
  },
  {
    key: "public_share",
    label: "Public share links",
    description: "Allows org members to generate read-only public project links.",
  },
];

const fieldClass =
  "border-input bg-background text-foreground w-full rounded-md border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring";

export default function SettingsForm({ initial }: { initial: SettingsInitial }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const [name, setName] = useState(initial.name);
  const [timeZone, setTimeZone] = useState(initial.time_zone);
  const [logoUrl, setLogoUrl] = useState(initial.logo_url);
  const [brandColor, setBrandColor] = useState(initial.brand_color || "#2563eb");
  const [hoursPerWeek, setHoursPerWeek] = useState(initial.default_working_hours_per_week);
  const [certWarning, setCertWarning] = useState(initial.cert_expiry_warning_days);
  const [requestAging, setRequestAging] = useState(initial.request_aging_days);

  function handleSaveProfile() {
    startTransition(async () => {
      const result = await updateOrgSettings({
        name,
        time_zone: timeZone,
        logo_url: logoUrl,
        brand_color: brandColor,
        default_working_hours_per_week: hoursPerWeek,
        cert_expiry_warning_days: certWarning,
        request_aging_days: requestAging,
      });
      if (result.ok) {
        toast.success("Settings saved");
        router.refresh();
      } else {
        toast.error(result.error.message);
      }
    });
  }

  function handleToggleFlag(key: string, enabled: boolean) {
    startTransition(async () => {
      const result = await setFeatureFlag({ key, enabled });
      if (result.ok) {
        toast.success(`${key}: ${enabled ? "enabled" : "disabled"}`);
        router.refresh();
      } else {
        toast.error(result.error.message);
      }
    });
  }

  return (
    <div className="max-w-2xl space-y-8">
      {/* Profile */}
      <Section
        title="Profile"
        description="Display name, branding, and time zone for capacity calculations."
      >
        <Field label="Organization name">
          <input
            value={name}
            onChange={(e) => {
              setName(e.target.value);
            }}
            className={fieldClass}
          />
        </Field>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <Field label="Time zone">
            <input
              value={timeZone}
              onChange={(e) => {
                setTimeZone(e.target.value);
              }}
              placeholder="America/New_York"
              className={fieldClass}
            />
          </Field>
          <Field label="Brand color (hex)">
            <input
              value={brandColor}
              onChange={(e) => {
                setBrandColor(e.target.value);
              }}
              placeholder="#2563eb"
              className={fieldClass}
            />
          </Field>
        </div>
        <Field label="Logo URL">
          <input
            value={logoUrl}
            onChange={(e) => {
              setLogoUrl(e.target.value);
            }}
            placeholder="https://… (PNG or SVG)"
            className={fieldClass}
          />
        </Field>
        <Field label="Default working hours per week">
          <input
            type="number"
            min={1}
            max={80}
            value={hoursPerWeek}
            onChange={(e) => {
              setHoursPerWeek(Number(e.target.value));
            }}
            className={fieldClass + " tabular-nums"}
          />
        </Field>
      </Section>

      {/* Notifications */}
      <Section
        title="Notification thresholds"
        description="When the platform proactively pings the relevant people."
      >
        <Field label="Certification expiry warning (days)">
          <input
            type="number"
            min={1}
            max={365}
            value={certWarning}
            onChange={(e) => {
              setCertWarning(Number(e.target.value));
            }}
            className={fieldClass + " tabular-nums"}
          />
        </Field>
        <Field label="Education request aging threshold (days)">
          <input
            type="number"
            min={1}
            max={60}
            value={requestAging}
            onChange={(e) => {
              setRequestAging(Number(e.target.value));
            }}
            className={fieldClass + " tabular-nums"}
          />
        </Field>
      </Section>

      <div className="flex justify-end">
        <button
          type="button"
          disabled={pending}
          onClick={handleSaveProfile}
          className="bg-primary text-primary-foreground hover:bg-primary/90 inline-flex items-center gap-1 rounded-md px-3 py-1.5 text-sm font-medium disabled:opacity-50"
        >
          {pending ? "Saving…" : "Save changes"}
        </button>
      </div>

      {/* Feature flags */}
      <Section
        title="Feature flags"
        description="Toggle optional features. Changes apply immediately for everyone in the org."
      >
        <div className="border-border divide-border divide-y rounded-md border">
          {FEATURE_FLAGS.map((f) => {
            const enabled = !!initial.flags[f.key];
            return (
              <div key={f.key} className="flex items-start justify-between gap-3 px-3 py-3">
                <div>
                  <p className="text-foreground text-sm font-medium">{f.label}</p>
                  <p className="text-muted-foreground text-xs">{f.description}</p>
                </div>
                <button
                  type="button"
                  disabled={pending}
                  onClick={() => {
                    handleToggleFlag(f.key, !enabled);
                  }}
                  className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors disabled:opacity-50 ${
                    enabled ? "bg-primary" : "bg-surface"
                  }`}
                  aria-label={`Toggle ${f.label}`}
                >
                  <span
                    className={`bg-background inline-block h-4 w-4 rounded-full transition-transform ${
                      enabled ? "translate-x-4" : "translate-x-0.5"
                    }`}
                  />
                </button>
              </div>
            );
          })}
        </div>
      </Section>
    </div>
  );
}

function Section({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-3">
      <div>
        <h2 className="text-foreground text-base font-semibold">{title}</h2>
        <p className="text-muted-foreground text-xs">{description}</p>
      </div>
      <div className="space-y-3">{children}</div>
    </section>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-foreground mb-1 text-xs font-medium">{label}</p>
      {children}
    </div>
  );
}
