"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { PRESET_LIST, type PresetKey } from "@arbor/shared";
import { createClientOrgAction } from "../../actions";

const fieldClass =
  "border-input bg-background text-foreground w-full rounded-md border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring";

export default function NewClientOrgForm() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [presetKey, setPresetKey] = useState<PresetKey>("hospital_training");

  const handleSubmit = (e: React.SyntheticEvent<HTMLFormElement>) => {
    e.preventDefault();
    startTransition(async () => {
      const result = await createClientOrgAction({
        name,
        slug: slug.trim() === "" ? undefined : slug.trim(),
        presetKey,
      });
      if (result.ok) {
        toast.success(`Client org "${name}" created`);
        router.push("/agency");
      } else {
        toast.error(result.error.message);
      }
    });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <div>
        <label htmlFor="name" className="text-foreground mb-1 block text-sm font-medium">
          Organization name *
        </label>
        <input
          id="name"
          type="text"
          required
          value={name}
          onChange={(e) => {
            setName(e.target.value);
          }}
          placeholder="e.g. Mercy Health Training"
          className={fieldClass}
        />
      </div>

      <div>
        <label htmlFor="slug" className="text-foreground mb-1 block text-sm font-medium">
          Slug (optional)
        </label>
        <input
          id="slug"
          type="text"
          value={slug}
          onChange={(e) => {
            setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "-"));
          }}
          placeholder="auto-generated from name if blank"
          className={fieldClass}
        />
        <p className="text-muted-foreground mt-1 text-xs">
          Lowercase letters, numbers, and hyphens. Must be unique across all of Arbor.
        </p>
      </div>

      <div>
        <label htmlFor="preset" className="text-foreground mb-1 block text-sm font-medium">
          Workspace preset
        </label>
        <select
          id="preset"
          value={presetKey}
          onChange={(e) => {
            setPresetKey(e.target.value as PresetKey);
          }}
          className={fieldClass}
        >
          {PRESET_LIST.map((p) => (
            <option key={p.key} value={p.key}>
              {p.name}
            </option>
          ))}
        </select>
        <p className="text-muted-foreground mt-1 text-xs">
          Determines initial modules enabled + terminology defaults. Manager can change later via
          the org&apos;s workspace identity settings.
        </p>
      </div>

      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={pending || !name.trim()}
          className="bg-primary text-primary-foreground rounded-md px-4 py-2 text-sm font-medium hover:opacity-90 disabled:opacity-50"
        >
          {pending ? "Provisioning…" : "Create client org"}
        </button>
      </div>
    </form>
  );
}
