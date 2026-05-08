-- Phase 9.2 — Support tickets + thread messages.
--
-- Tickets are user-scoped: a member opens a ticket, an org admin (and
-- in a real product, the platform support team) replies, the user can
-- reply back, and the thread closes when status flips to resolved/closed.
-- For MVP we treat "admin" replies as anyone with `org_admin` role in
-- the ticket's org. A separate platform-support role can layer in later.

-- ── support_tickets ─────────────────────────────────────────────────────────

create table public.support_tickets (
  id              uuid          not null default gen_random_uuid() primary key,
  org_id          uuid          not null references public.organizations(id) on delete cascade,
  user_id         uuid          not null references auth.users(id) on delete set null,
  subject         text          not null,
  description     text          not null,
  category        text          not null default 'how_to'
                    check (category in ('bug','how_to','feature_request','account_billing')),
  priority        text          not null default 'medium'
                    check (priority in ('low','medium','high','urgent')),
  status          text          not null default 'open'
                    check (status in ('open','pending','resolved','closed')),
  -- Last-update tracking lets the list view show "1 new reply" without an
  -- expensive count(*) per row.
  last_message_at timestamptz   not null default now(),
  last_message_by text          not null default 'user'
                    check (last_message_by in ('user','admin')),
  unread_for_user boolean       not null default false,
  unread_for_admin boolean      not null default true,
  created_at      timestamptz   not null default now(),
  updated_at      timestamptz   not null default now(),
  created_by      uuid          references auth.users(id) on delete set null,
  updated_by      uuid          references auth.users(id) on delete set null,
  version         integer       not null default 1
);

create index on public.support_tickets (org_id, user_id, status);
create index on public.support_tickets (org_id, status, last_message_at desc);
create index on public.support_tickets (user_id, last_message_at desc);

alter table public.support_tickets enable row level security;

-- A user sees their own tickets; an org admin sees every ticket in their org.
create policy "support_tickets_select" on public.support_tickets
  for select using (
    user_id = auth.uid()
    or (org_id in (select public.user_org_ids()) and public.is_org_admin(org_id))
  );

-- A user inserts their own ticket; org_id must be one they're a member of.
create policy "support_tickets_insert_own" on public.support_tickets
  for insert with check (
    user_id = auth.uid()
    and org_id in (select public.user_org_ids())
  );

-- Owner can update their own ticket (close it, mark read); admin can update
-- any ticket in their org (status, mark-read flags).
create policy "support_tickets_update" on public.support_tickets
  for update using (
    user_id = auth.uid()
    or (org_id in (select public.user_org_ids()) and public.is_org_admin(org_id))
  )
  with check (
    user_id = auth.uid()
    or (org_id in (select public.user_org_ids()) and public.is_org_admin(org_id))
  );

select public.apply_standard_triggers('support_tickets');

create trigger set_actor_audit_fields
  before insert or update on public.support_tickets
  for each row execute function public.set_actor_audit_fields();

create trigger bump_version
  before update on public.support_tickets
  for each row execute function public.bump_version();

-- ── support_ticket_messages ────────────────────────────────────────────────

create table public.support_ticket_messages (
  id          uuid          not null default gen_random_uuid() primary key,
  org_id      uuid          not null references public.organizations(id) on delete cascade,
  ticket_id   uuid          not null references public.support_tickets(id) on delete cascade,
  -- 'user' = end-user reply, 'admin' = org admin reply.
  author_kind text          not null check (author_kind in ('user','admin')),
  author_id   uuid          references auth.users(id) on delete set null,
  body        text          not null,
  created_at  timestamptz   not null default now()
);

create index on public.support_ticket_messages (ticket_id, created_at);
create index on public.support_ticket_messages (org_id);

alter table public.support_ticket_messages enable row level security;

-- Visible iff the parent ticket is.
create policy "ticket_messages_select" on public.support_ticket_messages
  for select using (
    exists (
      select 1 from public.support_tickets t
      where t.id = ticket_id
        and (
          t.user_id = auth.uid()
          or (t.org_id in (select public.user_org_ids()) and public.is_org_admin(t.org_id))
        )
    )
  );

-- Insert: only on a ticket the caller can see, and author_kind has to match
-- their role on this ticket (owner → 'user', admin → 'admin'). Enforced via
-- a check sub-query.
create policy "ticket_messages_insert" on public.support_ticket_messages
  for insert with check (
    exists (
      select 1 from public.support_tickets t
      where t.id = ticket_id
        and (
          (author_kind = 'user' and t.user_id = auth.uid())
          or (author_kind = 'admin' and public.is_org_admin(t.org_id))
        )
    )
  );

-- ── trigger: bump ticket meta on new message ───────────────────────────────
-- Each new message updates last_message_at + flips the unread flag for the
-- *other* party. The list view reads these flags to render "1 new reply".

create or replace function public.support_ticket_message_after_insert()
  returns trigger
  language plpgsql security definer
  set search_path = ''
as $$
begin
  update public.support_tickets
    set last_message_at  = new.created_at,
        last_message_by  = new.author_kind,
        unread_for_user  = case when new.author_kind = 'admin' then true else false end,
        unread_for_admin = case when new.author_kind = 'user'  then true else false end,
        -- Re-opening: a user reply on a resolved/closed ticket bumps it back
        -- to 'open' so admins notice.
        status           = case
          when new.author_kind = 'user' and status in ('resolved','closed') then 'open'
          else status
        end
    where id = new.ticket_id;
  return new;
end;
$$;

create trigger support_ticket_message_after_insert
  after insert on public.support_ticket_messages
  for each row execute function public.support_ticket_message_after_insert();

-- ── notifications: convenience helpers ─────────────────────────────────────
-- The notifications table itself ships in Phase 1.x. These are additive.

-- Mark every notification for the current user as read in one round-trip.
-- Returns the count of rows updated.
create or replace function public.mark_all_notifications_read()
  returns integer
  language plpgsql security definer
  set search_path = ''
as $$
declare
  v_count integer;
begin
  update public.notifications
    set read_at = now()
    where recipient_id = auth.uid()
      and read_at is null;
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

grant execute on function public.mark_all_notifications_read() to authenticated;

-- Mark a single notification read; returns 1 on success, 0 on no-match.
create or replace function public.mark_notification_read(p_id uuid)
  returns integer
  language plpgsql security definer
  set search_path = ''
as $$
declare
  v_count integer;
begin
  update public.notifications
    set read_at = now()
    where id = p_id
      and recipient_id = auth.uid()
      and read_at is null;
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

grant execute on function public.mark_notification_read(uuid) to authenticated;
