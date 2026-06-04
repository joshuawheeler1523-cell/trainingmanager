-- =============================================================================
-- Defense-in-depth: the quiz answer key must be unreachable by anon.
-- =============================================================================
-- RLS already blocks it (feedback_link_questions has no anon policy, so anon
-- reads zero rows). The form gets prompts/options key-less via the SECURITY
-- DEFINER feedback_link_context, and scoring happens server-side. Revoke the
-- default Supabase table grant too, so correct_index is unreachable even if RLS
-- were ever relaxed — mirrors the instructor_feedback / _links hardening.
-- =============================================================================

revoke all on public.feedback_link_questions from anon;
