"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { toast } from "sonner";
import { ArrowLeftIcon, Cog6ToothIcon, PlusIcon, TrashIcon } from "@heroicons/react/20/solid";
import type { SketchpadRoom, SketchpadSchedule, SketchpadSession } from "@arbor/shared";
import { createRoom, deleteRoom, updateRoom, updateSchedule } from "../actions";

type Props = {
  schedule: SketchpadSchedule;
  rooms: SketchpadRoom[];
  sessions: SketchpadSession[];
};

const fieldClass =
  "border-input bg-background text-foreground rounded-md border px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-ring";

export default function SketchpadEditor({ schedule, rooms, sessions }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [showSettings, setShowSettings] = useState(false);
  const [newRoomName, setNewRoomName] = useState("");

  function renameSchedule(newName: string) {
    const trimmed = newName.trim();
    if (!trimmed || trimmed === schedule.name) return;
    startTransition(async () => {
      const result = await updateSchedule(schedule.id, { name: trimmed });
      if (!result.ok) toast.error(result.error.message);
      router.refresh();
    });
  }

  function patchSchedule(patch: Record<string, unknown>) {
    startTransition(async () => {
      const result = await updateSchedule(schedule.id, patch);
      if (!result.ok) toast.error(result.error.message);
      router.refresh();
    });
  }

  function handleAddRoom() {
    const name = newRoomName.trim();
    if (!name) return;
    startTransition(async () => {
      const result = await createRoom(schedule.id, { name });
      if (result.ok) {
        setNewRoomName("");
        router.refresh();
      } else {
        toast.error(result.error.message);
      }
    });
  }

  function handleDeleteRoom(id: string, name: string) {
    if (!confirm(`Delete room "${name}"? Sessions assigned to it will move to Unassigned.`)) return;
    startTransition(async () => {
      const result = await deleteRoom(id, schedule.id);
      if (!result.ok) toast.error(result.error.message);
      router.refresh();
    });
  }

  function handleRenameRoom(id: string, newName: string) {
    startTransition(async () => {
      const result = await updateRoom(id, schedule.id, { name: newName.trim() });
      if (!result.ok) toast.error(result.error.message);
      router.refresh();
    });
  }

  const unassignedCount = sessions.filter((s) => !s.room_id).length;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <Link
            href="/sketchpad"
            className="text-muted-foreground hover:text-foreground mb-1 inline-flex items-center gap-1 text-xs"
          >
            <ArrowLeftIcon className="h-3.5 w-3.5" />
            All sketches
          </Link>
          <input
            defaultValue={schedule.name}
            onBlur={(e) => {
              renameSchedule(e.target.value);
            }}
            disabled={pending}
            className="text-foreground focus:ring-ring -mx-1 w-full rounded bg-transparent px-1 text-xl font-semibold focus:outline-none focus:ring-2"
          />
          <p className="text-muted-foreground mt-1 text-xs">
            {schedule.start_date} · {schedule.day_count.toString()} day
            {schedule.day_count === 1 ? "" : "s"} · {schedule.hours_start.toString()}:00–
            {schedule.hours_end.toString()}:00 · {schedule.slot_minutes.toString()}-min slots ·{" "}
            {rooms.length.toString()} room{rooms.length === 1 ? "" : "s"} ·{" "}
            {sessions.length.toString()} session{sessions.length === 1 ? "" : "s"}
            {unassignedCount > 0 && ` (${unassignedCount.toString()} unassigned)`}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => {
              setShowSettings((v) => !v);
            }}
            className="border-border bg-background hover:bg-surface inline-flex items-center gap-1 rounded-md border px-3 py-1.5 text-xs font-medium"
          >
            <Cog6ToothIcon className="h-3.5 w-3.5" />
            Settings
          </button>
          <button
            type="button"
            disabled
            title="Export coming in the next phase"
            className="border-border bg-background inline-flex cursor-not-allowed items-center gap-1 rounded-md border px-3 py-1.5 text-xs font-medium opacity-50"
          >
            Export
          </button>
        </div>
      </div>

      {showSettings && (
        <div className="border-border bg-background grid grid-cols-2 gap-3 rounded-lg border p-3 md:grid-cols-4">
          <SettingField
            label="Start date"
            type="date"
            defaultValue={schedule.start_date}
            disabled={pending}
            onCommit={(v) => {
              patchSchedule({ start_date: v });
            }}
          />
          <SettingField
            label="Days"
            type="number"
            min={1}
            max={14}
            defaultValue={schedule.day_count.toString()}
            disabled={pending}
            onCommit={(v) => {
              patchSchedule({ day_count: Number(v) });
            }}
          />
          <SettingField
            label="Day start (24h)"
            type="number"
            min={0}
            max={23}
            defaultValue={schedule.hours_start.toString()}
            disabled={pending}
            onCommit={(v) => {
              patchSchedule({ hours_start: Number(v) });
            }}
          />
          <SettingField
            label="Day end (24h)"
            type="number"
            min={1}
            max={24}
            defaultValue={schedule.hours_end.toString()}
            disabled={pending}
            onCommit={(v) => {
              patchSchedule({ hours_end: Number(v) });
            }}
          />
          <div className="col-span-2">
            <label
              htmlFor="slot-minutes"
              className="text-muted-foreground mb-1 block text-xs font-medium uppercase tracking-wide"
            >
              Slot size
            </label>
            <select
              id="slot-minutes"
              defaultValue={schedule.slot_minutes.toString()}
              disabled={pending}
              onChange={(e) => {
                patchSchedule({ slot_minutes: Number(e.target.value) });
              }}
              className={fieldClass + " w-full"}
            >
              <option value="15">15 minutes</option>
              <option value="30">30 minutes</option>
              <option value="60">60 minutes</option>
            </select>
          </div>
          <div className="col-span-2 md:col-span-4">
            <label
              htmlFor="notes"
              className="text-muted-foreground mb-1 block text-xs font-medium uppercase tracking-wide"
            >
              Notes
            </label>
            <textarea
              id="notes"
              defaultValue={schedule.notes ?? ""}
              disabled={pending}
              rows={2}
              onBlur={(e) => {
                patchSchedule({ notes: e.target.value });
              }}
              className={fieldClass + " w-full"}
            />
          </div>
        </div>
      )}

      <div className="border-border bg-background rounded-lg border p-3">
        <div className="mb-2 flex items-baseline justify-between">
          <h2 className="text-foreground text-sm font-semibold">Rooms</h2>
          <p className="text-muted-foreground text-[11px]">
            Sessions will drag-drop across rooms in the next build phase.
          </p>
        </div>
        {rooms.length === 0 ? (
          <p className="text-muted-foreground text-xs italic">
            No rooms yet. Add at least one so you can assign sessions to it.
          </p>
        ) : (
          <ul className="divide-border divide-y">
            {rooms.map((r) => (
              <li key={r.id} className="flex items-center gap-2 py-1.5">
                <input
                  defaultValue={r.name}
                  disabled={pending}
                  onBlur={(e) => {
                    const v = e.target.value.trim();
                    if (v && v !== r.name) handleRenameRoom(r.id, v);
                  }}
                  className={fieldClass + " flex-1"}
                />
                <button
                  type="button"
                  disabled={pending}
                  onClick={() => {
                    handleDeleteRoom(r.id, r.name);
                  }}
                  aria-label={`Delete ${r.name}`}
                  className="text-muted-foreground hover:text-destructive rounded p-1 disabled:opacity-50"
                >
                  <TrashIcon className="h-4 w-4" />
                </button>
              </li>
            ))}
          </ul>
        )}
        <div className="mt-2 flex items-end gap-2">
          <input
            value={newRoomName}
            onChange={(e) => {
              setNewRoomName(e.target.value);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                handleAddRoom();
              }
            }}
            placeholder="Room name (e.g., Sim Lab A)"
            className={fieldClass + " flex-1"}
            disabled={pending}
          />
          <button
            type="button"
            disabled={pending || !newRoomName.trim()}
            onClick={handleAddRoom}
            className="bg-primary text-primary-foreground hover:bg-primary/90 inline-flex items-center gap-1 rounded-md px-3 py-1.5 text-sm font-medium disabled:opacity-50"
          >
            <PlusIcon className="h-4 w-4" />
            Add room
          </button>
        </div>
      </div>

      <div className="border-border bg-surface/40 rounded-lg border border-dashed p-6 text-center">
        <p className="text-foreground text-sm font-medium">Grid editor coming in the next build</p>
        <p className="text-muted-foreground mt-1 text-xs">
          Phase 1 ships the schema + list view + settings + rooms. Phase 2 (next PR) wires up the
          calendar grid with drag-drop, quick-add bar, live conflict highlighting, autosave, and
          undo/redo. Phase 3 adds the Excel + PDF export and smart-paste.
        </p>
      </div>
    </div>
  );
}

function SettingField({
  label,
  type,
  defaultValue,
  disabled,
  onCommit,
  min,
  max,
}: {
  label: string;
  type: "date" | "number";
  defaultValue: string;
  disabled: boolean;
  onCommit: (v: string) => void;
  min?: number;
  max?: number;
}) {
  const id = `settings-${label.toLowerCase().replace(/\s+/g, "-")}`;
  return (
    <div>
      <label
        htmlFor={id}
        className="text-muted-foreground mb-1 block text-xs font-medium uppercase tracking-wide"
      >
        {label}
      </label>
      <input
        id={id}
        type={type}
        defaultValue={defaultValue}
        disabled={disabled}
        min={min}
        max={max}
        onBlur={(e) => {
          if (e.target.value && e.target.value !== defaultValue) onCommit(e.target.value);
        }}
        className={fieldClass + " w-full tabular-nums"}
      />
    </div>
  );
}
