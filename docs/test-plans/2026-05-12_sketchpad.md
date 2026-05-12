# Schedule Sketchpad — test plan

For the full Sketchpad build (PRs #25, #26, #27). Walks the surface
end-to-end. The Sketchpad is intentionally disconnected from
Instructors / Implementations / Capacity, so this plan does NOT
verify cross-feature consequences — there shouldn't be any.

## Setup

1. As a manager (or any org member — RLS is permissive on the
   sketchpad), navigate to **Tools → Schedule Sketchpad** in the
   sidebar.
2. Empty list. Type `EMR Cutover Test` into the new-sketch box,
   press Enter → you should land on `/sketchpad/<id>`.

## 1. List view + CRUD

- [ ] After creating, navigate back to `/sketchpad`. The row shows
      the name, the window (`YYYY-MM-DD · 5d · 7:00–19:00`),
      `0` rooms, `0` sessions, "just now" updated.
- [ ] Hover the row's right-side icons: Open / Duplicate / Delete.
- [ ] Click Duplicate. A new row "EMR Cutover Test (copy)" appears.
- [ ] Click Delete on the copy, confirm. Row disappears.

## 2. Editor — settings & rooms

- [ ] Open the sketch. Header shows name (editable on blur), window
      description, and Help / Paste / Settings / Export buttons.
- [ ] Open **Settings**. Confirm Start date, Days, Day start, Day
      end, Slot size, Notes all commit on blur / change.
- [ ] In Settings → Rooms section, add three rooms: `Room A`,
      `Room B`, `Sim Lab`. Each addition refreshes the list and
      becomes pickable in the quick-add Room dropdown.
- [ ] Rename a room (blur). Delete a room (confirm). Recreate it
      so the rest of the test plan has three rooms.
- [ ] Close Settings.

## 3. Day tabs + quick-add

- [ ] Day-tab strip shows the configured days (`Mon … Fri` by
      default). Click each one — selectedDay updates, grid clears
      between days, per-tab count badge stays accurate.
- [ ] Quick-add row: type `Smith` (Trainer), `EMR Provider`
      (Class), leave Min=60, Time=09:00, Room=`Room A`. Hit
      Enter inside the Class field. Block appears immediately at
      09:00 in Room A.
- [ ] **Rapid-fire**: notice Class clears but Trainer / Min /
      Time / Room persist. Type `EMR Manager` in Class, Enter →
      two sessions for Smith. Continue chaining.
- [ ] **Trainer autocomplete**: clear the Trainer field, start
      typing `Sm`. The browser autocomplete dropdown (datalist)
      surfaces `Smith`. Pick it.

## 4. Drag-drop + resize

- [ ] Drag a session in time (vertically). Lands where dropped
      with no snap-back. "No flicker" is the success criterion.
- [ ] Drag the same session across to a different room column.
      `room_id` updates on the DB row (check the row in psql or
      reload the page → block is in the new room).
- [ ] Drag the bottom edge to extend the session to 2h. Duration
      reflects on hover tooltip and in the side drawer.
- [ ] Drag a session before 7:00 (the configured day start). Block
      picks up the slate-500 border (out-of-hours). Hover tooltip
      explains.

## 5. Conflict highlighting

- [ ] Add a second session for `Smith` that overlaps the first.
      Both blocks pick up a rose-600 border. Hover tooltip:
      "Trainer 'Smith' also in 'EMR Provider' at 09:00".
- [ ] Move one of those sessions to a different trainer name in
      the side drawer → border clears.
- [ ] Add two sessions in the same room with overlapping time but
      different trainers. Amber-500 border for room overlap.
- [ ] Move a session ACROSS days (open drawer, change date isn't
      exposed in v1 — instead drag in time on the destination day
      tab after switching). Verify trainer conflicts across days
      still highlight on the visible day.

## 6. Unassigned strip

- [ ] Quick-add a session with Room=`— Unassigned —`. Block
      appears in the "Unassigned (N)" strip above the grid.
- [ ] Pick a room from the inline pill dropdown → block jumps
      into the grid at the quick-add time slot on the current day.
- [ ] Quick-add another Unassigned. This time click the pill
      itself → side drawer opens for editing.

## 7. Smart paste

- [ ] Click the **Paste** button. Modal opens. Format/example
      block shows your real room names.
- [ ] Paste the example block from the modal — or this:

      ```
      Smith, EMR Provider, 09:00, 2h, Room A
      Park, Op Reports, 11:00, 60min, Room B
      Lee, Sim, 13:00, 90, Sim Lab
      ```

- [ ] Click Import. Toast: "Imported 3 sessions." Modal closes.
      Three new blocks appear on the currently-selected day.
- [ ] Re-open Paste. Try a row with a room name that doesn't
      exist: `Smith, EMR Provider, 09:00, 60, Bogus Room`.
      Import → row imports as Unassigned, warning banner appears.
- [ ] Try a malformed row: `just one column`. Error banner shows
      "Line 1: need at least Trainer, Class, Start, Duration".
- [ ] Try a TSV variant (tabs instead of commas) pasted from
      Excel — should parse the same way.
- [ ] Try `9:30 AM`, `1.5h`, `90min`, `60` — all parse as
      expected (start time and duration both have multiple
      accepted formats).

## 8. Excel export

- [ ] Click **Export → Excel — by day**. File downloads as
      `<name>-sketch.xlsx`. Open it: one sheet per day, time on
      rows, rooms as columns, each cell = `Trainer — Class` (or
      empty).
- [ ] Open **Excel — by session**. Single "Sessions" sheet with
      Day / Date / Start / End / Duration / Trainer / Class /
      Room / Learners / Notes columns. Rows in ascending starts_at
      order.
- [ ] Confirm filenames are reasonable (slugified from sketch
      name). Special characters in the name don't break the file.

## 9. Print / PDF

- [ ] Click **Export → Print / save as PDF**. Browser print
      dialog opens. The current day's grid is the body of the
      print preview. Save as PDF works.

## 10. Keyboard shortcuts

- [ ] Click somewhere outside an input. Press `N` → focus jumps
      to the quick-add Trainer field.
- [ ] Open the side drawer. Press `Esc` → drawer closes.
- [ ] Open the Paste modal. Press `Esc` → modal closes.
- [ ] Open Export. Press `Esc` → menu closes.
- [ ] Press `?` → Help overlay opens. Press `Esc` → closes.

## 11. Permissions

- [ ] As an instructor or viewer in the same org: navigate to
      `/sketchpad`. Confirm you only see sketches you created
      yourself.
- [ ] Create your own sketch. Add a room and a session.
- [ ] Switch back to a manager account. Confirm BOTH the
      manager-owned and the instructor-owned sketches are visible.

## 12. Regressions

- [ ] Open `/training-planner` — list view unchanged, schedule
      view unchanged, no externals showing where they shouldn't.
- [ ] Open `/instructors` — no external trainers (from the
      previous feature) appearing.
- [ ] Reports / Dashboard / Allocations — unchanged.
