import { z } from "zod";

const trimmedString = (max: number) =>
  z
    .string()
    .transform((v) => v.trim())
    .pipe(z.string().min(1).max(max));

const optionalText = z
  .string()
  .nullish()
  .transform((v) => (v === "" || v == null ? null : v));

export const sketchpadScheduleCreateSchema = z.object({
  name: trimmedString(200),
  notes: optionalText,
  start_date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD")
    .optional(),
  day_count: z.coerce.number().int().min(1).max(90).optional(),
  hours_start: z.coerce.number().int().min(0).max(23).optional(),
  hours_end: z.coerce.number().int().min(1).max(24).optional(),
  slot_minutes: z
    .union([z.literal(15), z.literal(30), z.literal(60)])
    .or(z.coerce.number().refine((n) => n === 15 || n === 30 || n === 60))
    .optional(),
});

export const sketchpadScheduleUpdateSchema = z
  .object({
    name: trimmedString(200).optional(),
    notes: optionalText.optional(),
    start_date: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .optional(),
    day_count: z.coerce.number().int().min(1).max(90).optional(),
    hours_start: z.coerce.number().int().min(0).max(23).optional(),
    hours_end: z.coerce.number().int().min(1).max(24).optional(),
    slot_minutes: z
      .union([z.literal(15), z.literal(30), z.literal(60)])
      .or(z.coerce.number().refine((n) => n === 15 || n === 30 || n === 60))
      .optional(),
  })
  .refine(
    (v) => v.hours_start === undefined || v.hours_end === undefined || v.hours_end > v.hours_start,
    { message: "Day end must be after day start", path: ["hours_end"] },
  );

export const sketchpadRoomCreateSchema = z.object({
  name: trimmedString(100),
  capacity: z.coerce.number().int().min(1).max(10000).nullish(),
});

export const sketchpadRoomUpdateSchema = z.object({
  name: trimmedString(100).optional(),
  capacity: z.coerce.number().int().min(1).max(10000).nullish().optional(),
  position: z.coerce.number().int().min(0).optional(),
});

export const sketchpadSessionCreateSchema = z.object({
  room_id: z.string().uuid().nullish(),
  trainer_name: trimmedString(150),
  class_name: trimmedString(200),
  starts_at: z.string().datetime(),
  ends_at: z.string().datetime(),
  learner_count: z.coerce.number().int().min(0).max(10000).nullish(),
  notes: optionalText,
  color: optionalText,
  group_id: z.string().uuid().nullish(),
});

export const sketchpadSessionUpdateSchema = z.object({
  room_id: z.string().uuid().nullish().optional(),
  trainer_name: trimmedString(150).optional(),
  class_name: trimmedString(200).optional(),
  starts_at: z.string().datetime().optional(),
  ends_at: z.string().datetime().optional(),
  learner_count: z.coerce.number().int().min(0).max(10000).nullish().optional(),
  notes: optionalText.optional(),
  color: optionalText.optional(),
  group_id: z.string().uuid().nullish().optional(),
});

export type SketchpadScheduleCreate = z.infer<typeof sketchpadScheduleCreateSchema>;
export type SketchpadScheduleUpdate = z.infer<typeof sketchpadScheduleUpdateSchema>;
export type SketchpadRoomCreate = z.infer<typeof sketchpadRoomCreateSchema>;
export type SketchpadRoomUpdate = z.infer<typeof sketchpadRoomUpdateSchema>;
export type SketchpadSessionCreate = z.infer<typeof sketchpadSessionCreateSchema>;
export type SketchpadSessionUpdate = z.infer<typeof sketchpadSessionUpdateSchema>;

export type SketchpadSchedule = {
  id: string;
  org_id: string;
  department_id: string;
  name: string;
  notes: string | null;
  start_date: string;
  day_count: number;
  hours_start: number;
  hours_end: number;
  slot_minutes: number;
  deleted_at: string | null;
  created_at: string;
  updated_at: string;
  created_by: string | null;
  updated_by: string | null;
  version: number;
};

export type SketchpadRoom = {
  id: string;
  schedule_id: string;
  org_id: string;
  name: string;
  capacity: number | null;
  position: number;
  created_at: string;
  updated_at: string;
};

export type SketchpadSession = {
  id: string;
  schedule_id: string;
  room_id: string | null;
  org_id: string;
  trainer_name: string;
  class_name: string;
  starts_at: string;
  ends_at: string;
  learner_count: number | null;
  notes: string | null;
  color: string | null;
  group_id: string | null;
  created_at: string;
  updated_at: string;
};
