"use client";

import { useState, useTransition, useRef } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import { setAgencyLogoAction, updateAgencyBrandingAction } from "./actions";

const fieldClass =
  "border-input bg-background text-foreground w-full rounded-md border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring";

const labelClass = "text-foreground mb-1 block text-sm font-medium";

type Initial = {
  logoUrl: string | null;
  primaryColor: string;
  secondaryColor: string;
  accentColor: string;
  emailFromName: string;
  emailFromAddress: string;
};

export default function BrandingForm({
  agencyId,
  initial,
}: {
  agencyId: string;
  initial: Initial;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const [logoUrl, setLogoUrl] = useState<string | null>(initial.logoUrl);
  const [primaryColor, setPrimaryColor] = useState(initial.primaryColor);
  const [secondaryColor, setSecondaryColor] = useState(initial.secondaryColor);
  const [accentColor, setAccentColor] = useState(initial.accentColor);
  const [emailFromName, setEmailFromName] = useState(initial.emailFromName);
  const [emailFromAddress, setEmailFromAddress] = useState(initial.emailFromAddress);

  const handleLogoUpload = async (file: File) => {
    if (!file.type.startsWith("image/")) {
      toast.error("Logo must be an image (PNG, JPG, or SVG)");
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      toast.error("Logo must be smaller than 2MB");
      return;
    }
    setUploading(true);
    try {
      const supabase = createClient();
      const ext = file.name.split(".").pop()?.toLowerCase() ?? "png";
      const path = `${agencyId}/logo-${Date.now().toString()}.${ext}`;
      const { error: uploadErr } = await supabase.storage
        .from("agency-branding")
        .upload(path, file, { cacheControl: "3600", upsert: false });
      if (uploadErr) {
        toast.error(`Upload failed: ${uploadErr.message}`);
        return;
      }
      const {
        data: { publicUrl },
      } = supabase.storage.from("agency-branding").getPublicUrl(path);
      const result = await setAgencyLogoAction({ logoUrl: publicUrl });
      if (result.ok) {
        setLogoUrl(publicUrl);
        toast.success("Logo updated");
        router.refresh();
      } else {
        toast.error(result.error.message);
      }
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const handleRemoveLogo = () => {
    startTransition(async () => {
      const result = await setAgencyLogoAction({ logoUrl: null });
      if (result.ok) {
        setLogoUrl(null);
        toast.success("Logo removed");
        router.refresh();
      } else {
        toast.error(result.error.message);
      }
    });
  };

  const handleSubmit = (e: React.SyntheticEvent<HTMLFormElement>) => {
    e.preventDefault();
    startTransition(async () => {
      const result = await updateAgencyBrandingAction({
        primaryColor,
        secondaryColor,
        accentColor,
        emailFromName,
        emailFromAddress,
      });
      if (result.ok) {
        toast.success("Branding saved");
        router.refresh();
      } else {
        toast.error(result.error.message);
      }
    });
  };

  return (
    <div className="space-y-8">
      {/* Logo */}
      <section className="border-border bg-background space-y-3 rounded-xl border p-5">
        <div>
          <h2 className="text-foreground text-base font-bold">Logo</h2>
          <p className="text-muted-foreground mt-0.5 text-xs">
            Shown in the agency console header and generated invoice PDFs. PNG, JPG, or SVG up to
            2MB.
          </p>
        </div>
        <div className="flex items-center gap-6">
          <div className="border-border bg-surface flex h-24 w-48 items-center justify-center overflow-hidden rounded-md border">
            {logoUrl ? (
              <Image
                src={logoUrl}
                alt="Agency logo"
                width={192}
                height={96}
                className="max-h-full max-w-full object-contain"
                unoptimized
              />
            ) : (
              <span className="text-muted-foreground text-xs italic">No logo uploaded</span>
            )}
          </div>
          <div className="flex flex-col gap-2">
            <input
              ref={fileRef}
              type="file"
              accept="image/png,image/jpeg,image/svg+xml"
              disabled={uploading}
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) {
                  void handleLogoUpload(file);
                }
              }}
              className="text-foreground file:bg-primary file:text-primary-foreground text-sm file:mr-3 file:cursor-pointer file:rounded file:border-0 file:px-3 file:py-1.5 file:text-xs file:font-medium file:hover:opacity-90"
            />
            {logoUrl && (
              <button
                type="button"
                onClick={handleRemoveLogo}
                disabled={pending}
                className="text-muted-foreground hover:text-foreground self-start text-xs underline"
              >
                Remove logo
              </button>
            )}
          </div>
        </div>
      </section>

      <form
        onSubmit={handleSubmit}
        className="border-border bg-background space-y-5 rounded-xl border p-5"
      >
        <div>
          <h2 className="text-foreground text-base font-bold">Brand colors</h2>
          <p className="text-muted-foreground mt-0.5 text-xs">
            Hex format (#rrggbb). Leave blank to fall back to Arbor defaults.
          </p>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <ColorField
            id="primary"
            label="Primary"
            value={primaryColor}
            onChange={setPrimaryColor}
            placeholder="#2563eb"
          />
          <ColorField
            id="secondary"
            label="Secondary"
            value={secondaryColor}
            onChange={setSecondaryColor}
            placeholder="#64748b"
          />
          <ColorField
            id="accent"
            label="Accent"
            value={accentColor}
            onChange={setAccentColor}
            placeholder="#10b981"
          />
        </div>

        <hr className="border-border" />

        <div>
          <h2 className="text-foreground text-base font-bold">Email identity</h2>
          <p className="text-muted-foreground mt-0.5 text-xs">
            Outbound email from-address for invitations and notifications. Domain must be verified
            in your Resend account; otherwise email falls back to Arbor&apos;s default sender.
          </p>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="email-from-name" className={labelClass}>
              From name
            </label>
            <input
              id="email-from-name"
              type="text"
              value={emailFromName}
              onChange={(e) => {
                setEmailFromName(e.target.value);
              }}
              placeholder="Mercy Health Training"
              maxLength={120}
              className={fieldClass}
            />
          </div>
          <div>
            <label htmlFor="email-from-address" className={labelClass}>
              From address
            </label>
            <input
              id="email-from-address"
              type="email"
              value={emailFromAddress}
              onChange={(e) => {
                setEmailFromAddress(e.target.value);
              }}
              placeholder="invitations@mercy-health.com"
              className={fieldClass}
            />
          </div>
        </div>

        <div>
          <button
            type="submit"
            disabled={pending}
            className="bg-primary text-primary-foreground rounded-md px-4 py-2 text-sm font-medium hover:opacity-90 disabled:opacity-50"
          >
            {pending ? "Saving…" : "Save branding"}
          </button>
        </div>
      </form>
    </div>
  );
}

function ColorField({
  id,
  label,
  value,
  onChange,
  placeholder,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
}) {
  // The native <input type="color"> only accepts #rrggbb hex; mirror it with a
  // text input so users can clear the field (color inputs always have a value).
  const isValidHex = /^#[0-9a-fA-F]{6}$/.test(value);
  return (
    <div>
      <label htmlFor={id} className={labelClass}>
        {label}
      </label>
      <div className="flex items-center gap-2">
        <input
          type="color"
          aria-label={`${label} color picker`}
          value={isValidHex ? value : placeholder || "#000000"}
          onChange={(e) => {
            onChange(e.target.value);
          }}
          className="border-input h-9 w-12 cursor-pointer rounded border"
        />
        <input
          id={id}
          type="text"
          value={value}
          onChange={(e) => {
            onChange(e.target.value);
          }}
          placeholder={placeholder}
          maxLength={7}
          className={fieldClass}
        />
      </div>
    </div>
  );
}
