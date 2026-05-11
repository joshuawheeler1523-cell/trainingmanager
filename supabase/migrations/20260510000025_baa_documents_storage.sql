-- =============================================================================
-- Arbor super-admin: storage bucket for signed BAA PDFs
-- =============================================================================
-- Private bucket. Arbor admins upload countersigned PDFs; managers of
-- the matching org can read their own. Path convention: {org_id}/{baa_id}.pdf

insert into storage.buckets (id, name, public, allowed_mime_types, file_size_limit)
  values ('baa-documents', 'baa-documents', false, array['application/pdf'], 10485760)
  on conflict (id) do nothing;

create policy baa_documents_manager_read
  on storage.objects for select
  to authenticated
  using (
    bucket_id = 'baa-documents'
    and public.is_manager((storage.foldername(name))[1]::uuid)
  );

-- Inserts/updates/deletes happen via the admin client only (Arbor admin
-- server actions). No client-side write policy.
