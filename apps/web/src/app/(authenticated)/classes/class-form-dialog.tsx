"use client";

import { useState } from "react";
import { useForm, useFieldArray, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as Dialog from "@radix-ui/react-dialog";
import { toast } from "sonner";
import { PlusIcon, TrashIcon } from "@heroicons/react/20/solid";
import { classInputSchema } from "@arbor/shared";
import type { Class, ClassInput, ClassModule, Instructor } from "@arbor/shared";
import { useLabel } from "@/components/labels";
import { createClass, updateClass, assignInstructorToClass } from "./actions";
import { createClassModule } from "./modules/actions";
import { ReadOnlyBanner, useFormReadOnly } from "@/components/auth/read-only-context";

// Frequency presets that auto-fill offerings_per_year. Numbers reflect
// typical hospital education planning (50 working weeks/yr, 12 months,
// etc.). "Custom" leaves the field as-is.
type FrequencyPreset =
  | "weekly"
  | "biweekly"
  | "monthly"
  | "quarterly"
  | "twice_yearly"
  | "yearly"
  | "custom";
const FREQUENCY_OPTIONS: { value: FrequencyPreset; label: string; offerings: number | null }[] = [
  { value: "weekly", label: "Weekly (50/yr)", offerings: 50 },
  { value: "biweekly", label: "Bi-weekly (26/yr)", offerings: 26 },
  { value: "monthly", label: "Monthly (12/yr)", offerings: 12 },
  { value: "quarterly", label: "Quarterly (4/yr)", offerings: 4 },
  { value: "twice_yearly", label: "Twice a year (2/yr)", offerings: 2 },
  { value: "yearly", label: "Yearly (1/yr)", offerings: 1 },
  { value: "custom", label: "Custom", offerings: null },
];
function frequencyForOfferings(n: number): FrequencyPreset {
  return FREQUENCY_OPTIONS.find((o) => o.offerings === n)?.value ?? "custom";
}

type CreateProps = {
  mode: "create";
  trigger: React.ReactNode;
  instructors: Instructor[];
  modules: ClassModule[];
  onSuccess?: (c: Class) => void;
};
type EditProps = {
  mode: "edit";
  cls: Class;
  modules: ClassModule[];
  trigger: React.ReactNode;
  onSuccess?: (c: Class) => void;
};
type Props = CreateProps | EditProps;

// STEPS labels are computed inside the component now so the third step's
// label can carry the org's terminology override (Instructors → Analysts etc).
type Step = 0 | 1 | 2;

function Label({ htmlFor, children }: { htmlFor: string; children: React.ReactNode }) {
  return (
    <label htmlFor={htmlFor} className="text-foreground mb-1 block text-sm font-medium">
      {children}
    </label>
  );
}
function FieldError({ message }: { message: string | undefined }) {
  if (!message) return null;
  return <p className="text-destructive mt-1 text-xs">{message}</p>;
}
function inputCls(error?: boolean) {
  return `w-full rounded-md border px-3 py-2 text-sm text-foreground bg-background focus:outline-none focus:ring-2 focus:ring-ring ${error ? "border-destructive" : "border-input"}`;
}

type AssignmentDraft = {
  instructorId: string;
  role: "eligible" | "primary" | "backup";
  offerings: number;
};

function ModuleField({
  control,
  setValue,
  modules,
}: {
  control: ReturnType<typeof useForm<ClassInput>>["control"];
  setValue: ReturnType<typeof useForm<ClassInput>>["setValue"];
  modules: ClassModule[];
}) {
  const selected = useWatch({ control, name: "module_id" }) ?? "";
  const [list, setList] = useState(modules);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [saving, setSaving] = useState(false);

  async function handleCreate() {
    const name = newName.trim();
    if (!name) return;
    setSaving(true);
    const result = await createClassModule({ name });
    setSaving(false);
    if (!result.ok) {
      toast.error(result.error.message);
      return;
    }
    setList((l) => [...l, result.data].sort((a, b) => a.name.localeCompare(b.name)));
    setValue("module_id", result.data.id, { shouldDirty: true });
    setNewName("");
    setCreating(false);
  }

  return (
    <div>
      <Label htmlFor="module_id">Module</Label>
      {creating ? (
        <div className="flex gap-2">
          <input
            autoFocus
            value={newName}
            onChange={(e) => {
              setNewName(e.target.value);
            }}
            placeholder="New module name…"
            className={inputCls()}
          />
          <button
            type="button"
            disabled={saving || !newName.trim()}
            onClick={() => {
              void handleCreate();
            }}
            className="bg-primary text-primary-foreground shrink-0 rounded-md px-3 py-2 text-sm font-medium hover:opacity-90 disabled:opacity-50"
          >
            {saving ? "Adding…" : "Add"}
          </button>
          <button
            type="button"
            onClick={() => {
              setCreating(false);
              setNewName("");
            }}
            className="border-border text-foreground hover:bg-surface shrink-0 rounded-md border px-3 py-2 text-sm font-medium"
          >
            Cancel
          </button>
        </div>
      ) : (
        <select
          id="module_id"
          value={selected}
          onChange={(e) => {
            if (e.target.value === "__new__") {
              setCreating(true);
              return;
            }
            setValue("module_id", e.target.value, { shouldDirty: true });
          }}
          className={inputCls()}
        >
          <option value="">No module</option>
          {list.map((m) => (
            <option key={m.id} value={m.id}>
              {m.name}
            </option>
          ))}
          <option value="__new__">+ New module…</option>
        </select>
      )}
      <p className="text-muted-foreground mt-1 text-xs">
        Optional. Group related classes (e.g. an onboarding track) under a module.
      </p>
    </div>
  );
}

function StepBasic({
  register,
  control,
  setValue,
  errors,
  modules,
}: {
  register: ReturnType<typeof useForm<ClassInput>>["register"];
  control: ReturnType<typeof useForm<ClassInput>>["control"];
  setValue: ReturnType<typeof useForm<ClassInput>>["setValue"];
  errors: Record<string, { message?: string } | undefined>;
  modules: ClassModule[];
}) {
  return (
    <div className="space-y-4">
      <div>
        <Label htmlFor="name">Class name *</Label>
        <input
          id="name"
          {...register("name")}
          className={inputCls(!!errors["name"])}
          placeholder="BLS Certification"
        />
        <FieldError message={errors["name"]?.message} />
      </div>
      <div>
        <Label htmlFor="description">Description</Label>
        <textarea
          id="description"
          rows={3}
          {...register("description")}
          className={inputCls()}
          placeholder="Optional description…"
        />
      </div>
      <ModuleField control={control} setValue={setValue} modules={modules} />
      <div>
        <Label htmlFor="status">Status</Label>
        <select id="status" {...register("status")} className={inputCls()}>
          <option value="active">Active</option>
          <option value="archived">Archived</option>
        </select>
      </div>
    </div>
  );
}

function StepTime({
  control,
  register,
  setValue,
  errors,
}: {
  control: ReturnType<typeof useForm<ClassInput>>["control"];
  register: ReturnType<typeof useForm<ClassInput>>["register"];
  setValue: ReturnType<typeof useForm<ClassInput>>["setValue"];
  errors: Record<string, { message?: string } | undefined>;
}) {
  const isMultiDay = useWatch({ control, name: "is_multi_day" });
  const totalDays = useWatch({ control, name: "total_days" });
  const customEnabled = useWatch({ control, name: "custom_day_hours" });
  const offeringsValue = useWatch({ control, name: "offerings_per_year" });
  const frequency = frequencyForOfferings(offeringsValue || 0);

  const { fields, replace } = useFieldArray({ control, name: "custom_day_hours" as never });

  function onCustomToggle(checked: boolean) {
    if (checked) {
      replace(Array.from({ length: Math.max(1, totalDays) }, () => 0));
    } else {
      replace([] as never[]);
    }
  }

  const useCustom = Array.isArray(customEnabled) && customEnabled.length > 0;

  return (
    <div className="space-y-4">
      {/* Multi-day toggle */}
      <label className="flex cursor-pointer items-center gap-3">
        <input
          type="checkbox"
          {...register("is_multi_day")}
          className="border-border h-4 w-4 rounded"
        />
        <span className="text-foreground text-sm font-medium">Multi-day class</span>
      </label>

      {isMultiDay && (
        <div>
          <Label htmlFor="total_days">Number of days *</Label>
          <input
            id="total_days"
            type="number"
            min={2}
            {...register("total_days")}
            className={inputCls(!!errors["total_days"])}
          />
          <FieldError message={errors["total_days"]?.message} />
        </div>
      )}

      {/* Hours */}
      {!useCustom && (
        <div>
          <Label htmlFor="hours_per_day">{isMultiDay ? "Hours per day (uniform)" : "Hours"}</Label>
          <input
            id="hours_per_day"
            type="number"
            step="0.5"
            min={0}
            {...register("hours_per_day")}
            className={inputCls()}
          />
        </div>
      )}

      {isMultiDay && (
        <label className="flex cursor-pointer items-center gap-3">
          <input
            type="checkbox"
            checked={useCustom}
            onChange={(e) => {
              onCustomToggle(e.target.checked);
            }}
            className="border-border h-4 w-4 rounded"
          />
          <span className="text-foreground text-sm">Specify different hours for each day</span>
        </label>
      )}

      {useCustom && fields.length > 0 && (
        <div className="space-y-2">
          <p className="text-muted-foreground text-xs font-medium">Hours per day</p>
          {fields.map((field, i) => (
            <div key={field.id} className="flex items-center gap-2">
              <span className="text-muted-foreground w-14 text-xs">Day {i + 1}</span>
              <input
                type="number"
                step="0.5"
                min={0}
                {...register(`custom_day_hours.${String(i)}` as never)}
                className="border-input bg-background text-foreground focus:ring-ring w-24 rounded-md border px-2 py-1.5 text-sm focus:outline-none focus:ring-2"
              />
            </div>
          ))}
          <FieldError message={errors["custom_day_hours"]?.message} />
        </div>
      )}

      {/* Frequency presets — pick one to auto-fill offerings/year, or
          override the number directly to switch to "Custom". */}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label htmlFor="frequency">How often is this class offered?</Label>
          <select
            id="frequency"
            value={frequency}
            onChange={(e) => {
              const next = e.target.value as FrequencyPreset;
              const preset = FREQUENCY_OPTIONS.find((o) => o.value === next);
              if (preset?.offerings != null) {
                setValue("offerings_per_year", preset.offerings, { shouldDirty: true });
              }
            }}
            className={inputCls()}
          >
            {FREQUENCY_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <Label htmlFor="offerings_per_year">Offerings/year</Label>
          <input
            id="offerings_per_year"
            type="number"
            min={0}
            {...register("offerings_per_year")}
            className={inputCls()}
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label htmlFor="prep_hours_per_offering">Prep hrs / offering</Label>
          <input
            id="prep_hours_per_offering"
            type="number"
            step="0.5"
            min={0}
            {...register("prep_hours_per_offering")}
            className={inputCls()}
          />
        </div>
        <div>
          <Label htmlFor="logistics_hours_per_offering">Logistics hrs / offering</Label>
          <input
            id="logistics_hours_per_offering"
            type="number"
            step="0.5"
            min={0}
            {...register("logistics_hours_per_offering")}
            className={inputCls()}
          />
        </div>
      </div>
    </div>
  );
}

function StepInstructors({
  instructors,
  assignments,
  setAssignments,
}: {
  instructors: Instructor[];
  assignments: AssignmentDraft[];
  setAssignments: (a: AssignmentDraft[]) => void;
}) {
  const [selectedId, setSelectedId] = useState("");
  const instructorLower = useLabel("entity.instructor", { lower: true });

  const assignedIds = new Set(assignments.map((a) => a.instructorId));
  const available = instructors.filter((i) => !assignedIds.has(i.id));

  function add() {
    if (!selectedId) return;
    setAssignments([...assignments, { instructorId: selectedId, role: "eligible", offerings: 0 }]);
    setSelectedId("");
  }

  function update(idx: number, patch: Partial<AssignmentDraft>) {
    setAssignments(assignments.map((a, i) => (i === idx ? { ...a, ...patch } : a)));
  }

  function remove(idx: number) {
    setAssignments(assignments.filter((_, i) => i !== idx));
  }

  return (
    <div className="space-y-4">
      <p className="text-muted-foreground text-xs">
        Optional. You can also assign instructors from the class detail page.
      </p>

      {assignments.length > 0 && (
        <div className="border-border overflow-hidden rounded-lg border">
          <table className="w-full text-sm">
            <thead className="border-border bg-surface border-b">
              <tr>
                <th className="text-muted-foreground px-3 py-2 text-left text-xs font-medium">
                  Instructor
                </th>
                <th className="text-muted-foreground px-3 py-2 text-left text-xs font-medium">
                  Role
                </th>
                <th className="text-muted-foreground px-3 py-2 text-left text-xs font-medium">
                  Offerings
                </th>
                <th className="w-8 px-3 py-2" />
              </tr>
            </thead>
            <tbody className="divide-border divide-y">
              {assignments.map((a, i) => {
                const instructor = instructors.find((x) => x.id === a.instructorId);
                return (
                  <tr key={a.instructorId}>
                    <td className="text-foreground px-3 py-2 text-xs">
                      {instructor?.full_name ?? a.instructorId}
                    </td>
                    <td className="px-3 py-2">
                      <select
                        value={a.role}
                        onChange={(e) => {
                          update(i, { role: e.target.value as AssignmentDraft["role"] });
                        }}
                        className="border-input bg-background text-foreground rounded border px-2 py-1 text-xs"
                      >
                        <option value="eligible">Eligible</option>
                        <option value="primary">Primary</option>
                        <option value="backup">Backup</option>
                      </select>
                    </td>
                    <td className="px-3 py-2">
                      <input
                        type="number"
                        min={0}
                        value={a.offerings}
                        onChange={(e) => {
                          update(i, { offerings: Number(e.target.value) });
                        }}
                        className="border-input bg-background text-foreground w-16 rounded border px-2 py-1 text-xs"
                      />
                    </td>
                    <td className="px-3 py-2">
                      <button
                        type="button"
                        onClick={() => {
                          remove(i);
                        }}
                        className="text-muted-foreground hover:text-destructive"
                      >
                        <TrashIcon className="h-3.5 w-3.5" />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {available.length > 0 && (
        <div className="flex gap-2">
          <select
            value={selectedId}
            onChange={(e) => {
              setSelectedId(e.target.value);
            }}
            className="border-input bg-background text-foreground focus:ring-ring flex-1 rounded-md border px-3 py-1.5 text-sm focus:outline-none focus:ring-2"
          >
            <option value="">Select {instructorLower}…</option>
            {available.map((i) => (
              <option key={i.id} value={i.id}>
                {i.full_name}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={add}
            disabled={!selectedId}
            className="bg-primary text-primary-foreground flex items-center gap-1 rounded-md px-3 py-1.5 text-sm font-medium hover:opacity-90 disabled:opacity-50"
          >
            <PlusIcon className="h-4 w-4" />
            Add
          </button>
        </div>
      )}
    </div>
  );
}

export default function ClassFormDialog(props: Props) {
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<Step>(0);
  const [assignments, setAssignments] = useState<AssignmentDraft[]>([]);
  const isEdit = props.mode === "edit";
  const instructorPlural = useLabel("entity.instructor", { plural: true });

  const defaultValues: Partial<ClassInput> = isEdit
    ? {
        name: props.cls.name,
        description: props.cls.description ?? "",
        allocation_bucket_id: props.cls.allocation_bucket_id ?? "",
        module_id: props.cls.module_id ?? "",
        is_multi_day: props.cls.is_multi_day,
        total_days: props.cls.total_days,
        ...(props.cls.hours_per_day != null ? { hours_per_day: props.cls.hours_per_day } : {}),
        ...(props.cls.custom_day_hours != null
          ? { custom_day_hours: props.cls.custom_day_hours }
          : {}),
        offerings_per_year: props.cls.offerings_per_year,
        prep_hours_per_offering: props.cls.prep_hours_per_offering,
        logistics_hours_per_offering: props.cls.logistics_hours_per_offering,
        status: props.cls.status,
      }
    : {
        name: "",
        description: "",
        module_id: "",
        is_multi_day: false,
        total_days: 1,
        offerings_per_year: 0,
        prep_hours_per_offering: 0,
        logistics_hours_per_offering: 0,
        status: "active",
      };

  const {
    register,
    control,
    setValue,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<ClassInput>({
    resolver: zodResolver(classInputSchema),
    defaultValues,
  });

  const readOnly = useFormReadOnly();

  function closeReset() {
    setOpen(false);
    setStep(0);
    setAssignments([]);
    reset();
  }

  async function onSubmit(data: ClassInput) {
    if (step < 1) {
      setStep((s) => (s + 1) as Step);
      return;
    }
    if (step === 1 && !isEdit) {
      setStep(2);
      return;
    }

    const result = isEdit ? await updateClass(props.cls.id, data) : await createClass(data);

    if (!result.ok) {
      toast.error(result.error.message);
      return;
    }

    // Assign instructors if any were added (create mode only)
    if (!isEdit && assignments.length > 0) {
      await Promise.all(
        assignments.map((a) =>
          assignInstructorToClass(result.data.id, {
            instructor_id: a.instructorId,
            role: a.role,
            assigned_offerings: a.offerings,
          }),
        ),
      );
    }

    toast.success(isEdit ? "Class updated" : "Class created");
    closeReset();
    props.onSuccess?.(result.data);
  }

  const STEPS = ["Basic info", "Time settings", instructorPlural] as const;
  const stepTitle = isEdit ? "Edit class" : STEPS[step];

  return (
    <Dialog.Root
      open={open}
      onOpenChange={(v) => {
        if (!v) closeReset();
        else setOpen(true);
      }}
    >
      <Dialog.Trigger asChild>{props.trigger}</Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 fixed inset-0 z-50 bg-black/40" />
        <Dialog.Content className="border-border bg-background data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95 fixed left-1/2 top-1/2 z-50 max-h-[90vh] w-full max-w-lg -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-xl border p-6 shadow-xl">
          <div className="mb-4 flex items-center justify-between">
            <Dialog.Title className="text-foreground text-base font-semibold">
              {stepTitle}
            </Dialog.Title>
            {!isEdit && (
              <span className="text-muted-foreground text-xs">
                Step {step + 1} of {STEPS.length}
              </span>
            )}
          </div>

          <ReadOnlyBanner />

          {/* Step indicators */}
          {!isEdit && (
            <div className="mb-5 flex gap-1.5">
              {STEPS.map((s, i) => (
                <div
                  key={s}
                  className={`h-1 flex-1 rounded-full transition-colors ${i <= step ? "bg-primary" : "bg-border"}`}
                />
              ))}
            </div>
          )}

          <form
            onSubmit={(e) => {
              void handleSubmit(onSubmit)(e);
            }}
            className="space-y-4"
          >
            {(isEdit || step === 0) && (
              <StepBasic
                register={register}
                control={control}
                setValue={setValue}
                errors={errors}
                modules={props.modules}
              />
            )}
            {(isEdit || step === 1) && (
              <StepTime control={control} register={register} setValue={setValue} errors={errors} />
            )}
            {!isEdit && step === 2 && (
              <StepInstructors
                instructors={props.instructors}
                assignments={assignments}
                setAssignments={setAssignments}
              />
            )}

            <div className="flex justify-between gap-3 pt-2">
              <div>
                {step > 0 && !isEdit && (
                  <button
                    type="button"
                    onClick={() => {
                      setStep((s) => (s - 1) as Step);
                    }}
                    className="border-border text-foreground hover:bg-surface rounded-md border px-4 py-2 text-sm font-medium"
                  >
                    Back
                  </button>
                )}
              </div>
              <div className="flex gap-2">
                <Dialog.Close asChild>
                  <button
                    type="button"
                    className="border-border text-foreground hover:bg-surface rounded-md border px-4 py-2 text-sm font-medium"
                  >
                    Cancel
                  </button>
                </Dialog.Close>
                {!readOnly && (
                  <button
                    type="submit"
                    disabled={isSubmitting}
                    className="bg-primary text-primary-foreground rounded-md px-4 py-2 text-sm font-medium hover:opacity-90 disabled:opacity-50"
                  >
                    {isSubmitting
                      ? "Saving…"
                      : isEdit
                        ? "Save changes"
                        : step < 2
                          ? "Next"
                          : "Create class"}
                  </button>
                )}
              </div>
            </div>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
