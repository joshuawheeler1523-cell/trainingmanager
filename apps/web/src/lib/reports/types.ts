// Local alias for "the typed Supabase client we use in app code". Kept here
// so each report-query module doesn't have to repeat the long type.

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";

export type TypedSupabase = SupabaseClient<Database>;
