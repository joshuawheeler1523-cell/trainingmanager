-- Enable RLS
alter table public.organizations enable row level security;
alter table public.organization_members enable row level security;
alter table public.audit_logs enable row level security;

-- Helper: is the current user a member of this org?
create function public.is_org_member(org_id uuid)
returns boolean
language sql
security definer
stable
as $$
  select exists (
    select 1 from public.organization_members
    where organization_members.org_id = $1
      and organization_members.user_id = auth.uid()
  );
$$;

-- Helper: does the current user have at least admin role in this org?
create function public.is_org_admin(org_id uuid)
returns boolean
language sql
security definer
stable
as $$
  select exists (
    select 1 from public.organization_members
    where organization_members.org_id = $1
      and organization_members.user_id = auth.uid()
      and role in ('owner', 'admin')
  );
$$;

-- Organizations: members can read their orgs
create policy "org members can view org"
  on public.organizations for select
  using (public.is_org_member(id));

-- Organization members: members can see who else is in their orgs
create policy "org members can view members"
  on public.organization_members for select
  using (public.is_org_member(org_id));

-- Org owners/admins can insert members
create policy "org admins can add members"
  on public.organization_members for insert
  with check (public.is_org_admin(org_id));

-- Org owners/admins can update member roles
create policy "org admins can update members"
  on public.organization_members for update
  using (public.is_org_admin(org_id));

-- Org owners/admins can remove members
create policy "org admins can delete members"
  on public.organization_members for delete
  using (public.is_org_admin(org_id));

-- Audit logs: org members can read, admins can insert
create policy "org members can view audit logs"
  on public.audit_logs for select
  using (public.is_org_member(org_id));

create policy "org members can insert audit logs"
  on public.audit_logs for insert
  with check (public.is_org_member(org_id));
