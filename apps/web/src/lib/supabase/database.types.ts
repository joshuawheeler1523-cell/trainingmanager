export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5";
  };
  public: {
    Tables: {
      ad_hoc_tasks: {
        Row: {
          bucket_id: string | null;
          completed_at: string | null;
          created_at: string;
          created_by: string | null;
          department_id: string;
          description: string | null;
          due_date: string | null;
          hours: number;
          id: string;
          instructor_id: string | null;
          name: string;
          org_id: string;
          status: string;
          updated_at: string;
          updated_by: string | null;
        };
        Insert: {
          bucket_id?: string | null;
          completed_at?: string | null;
          created_at?: string;
          created_by?: string | null;
          department_id: string;
          description?: string | null;
          due_date?: string | null;
          hours: number;
          id?: string;
          instructor_id?: string | null;
          name: string;
          org_id: string;
          status?: string;
          updated_at?: string;
          updated_by?: string | null;
        };
        Update: {
          bucket_id?: string | null;
          completed_at?: string | null;
          created_at?: string;
          created_by?: string | null;
          department_id?: string;
          description?: string | null;
          due_date?: string | null;
          hours?: number;
          id?: string;
          instructor_id?: string | null;
          name?: string;
          org_id?: string;
          status?: string;
          updated_at?: string;
          updated_by?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "ad_hoc_tasks_bucket_id_fkey";
            columns: ["bucket_id"];
            isOneToOne: false;
            referencedRelation: "allocation_buckets";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "ad_hoc_tasks_department_id_fkey";
            columns: ["department_id"];
            isOneToOne: false;
            referencedRelation: "departments";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "ad_hoc_tasks_instructor_id_fkey";
            columns: ["instructor_id"];
            isOneToOne: false;
            referencedRelation: "instructors";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "ad_hoc_tasks_instructor_id_fkey";
            columns: ["instructor_id"];
            isOneToOne: false;
            referencedRelation: "v_instructor_capacity";
            referencedColumns: ["instructor_id"];
          },
          {
            foreignKeyName: "ad_hoc_tasks_org_id_fkey";
            columns: ["org_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
        ];
      };
      agencies: {
        Row: {
          accent_color: string | null;
          billing_address: string | null;
          billing_email: string | null;
          created_at: string;
          created_by: string | null;
          custom_domain: string | null;
          custom_domain_pending: string | null;
          custom_domain_pending_at: string | null;
          custom_domain_verification_token: string | null;
          custom_domain_verified_at: string | null;
          default_revenue_share_pct: number;
          email_from_address: string | null;
          email_from_name: string | null;
          favicon_url: string | null;
          id: string;
          logo_url: string | null;
          name: string;
          payment_terms_days: number;
          primary_color: string | null;
          secondary_color: string | null;
          slug: string;
          suspended_at: string | null;
          suspended_reason: string | null;
          updated_at: string;
          updated_by: string | null;
          version: number;
        };
        Insert: {
          accent_color?: string | null;
          billing_address?: string | null;
          billing_email?: string | null;
          created_at?: string;
          created_by?: string | null;
          custom_domain?: string | null;
          custom_domain_pending?: string | null;
          custom_domain_pending_at?: string | null;
          custom_domain_verification_token?: string | null;
          custom_domain_verified_at?: string | null;
          default_revenue_share_pct?: number;
          email_from_address?: string | null;
          email_from_name?: string | null;
          favicon_url?: string | null;
          id?: string;
          logo_url?: string | null;
          name: string;
          payment_terms_days?: number;
          primary_color?: string | null;
          secondary_color?: string | null;
          slug: string;
          suspended_at?: string | null;
          suspended_reason?: string | null;
          updated_at?: string;
          updated_by?: string | null;
          version?: number;
        };
        Update: {
          accent_color?: string | null;
          billing_address?: string | null;
          billing_email?: string | null;
          created_at?: string;
          created_by?: string | null;
          custom_domain?: string | null;
          custom_domain_pending?: string | null;
          custom_domain_pending_at?: string | null;
          custom_domain_verification_token?: string | null;
          custom_domain_verified_at?: string | null;
          default_revenue_share_pct?: number;
          email_from_address?: string | null;
          email_from_name?: string | null;
          favicon_url?: string | null;
          id?: string;
          logo_url?: string | null;
          name?: string;
          payment_terms_days?: number;
          primary_color?: string | null;
          secondary_color?: string | null;
          slug?: string;
          suspended_at?: string | null;
          suspended_reason?: string | null;
          updated_at?: string;
          updated_by?: string | null;
          version?: number;
        };
        Relationships: [];
      };
      agency_memberships: {
        Row: {
          accepted_at: string | null;
          agency_id: string;
          created_at: string;
          id: string;
          invited_at: string | null;
          role: string;
          updated_at: string;
          user_id: string;
        };
        Insert: {
          accepted_at?: string | null;
          agency_id: string;
          created_at?: string;
          id?: string;
          invited_at?: string | null;
          role?: string;
          updated_at?: string;
          user_id: string;
        };
        Update: {
          accepted_at?: string | null;
          agency_id?: string;
          created_at?: string;
          id?: string;
          invited_at?: string | null;
          role?: string;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "agency_memberships_agency_id_fkey";
            columns: ["agency_id"];
            isOneToOne: false;
            referencedRelation: "agencies";
            referencedColumns: ["id"];
          },
        ];
      };
      agency_signup_attempts: {
        Row: {
          agency_slug: string;
          created_at: string;
          email: string;
          id: string;
          ip: string | null;
          succeeded: boolean;
        };
        Insert: {
          agency_slug: string;
          created_at?: string;
          email: string;
          id?: string;
          ip?: string | null;
          succeeded?: boolean;
        };
        Update: {
          agency_slug?: string;
          created_at?: string;
          email?: string;
          id?: string;
          ip?: string | null;
          succeeded?: boolean;
        };
        Relationships: [];
      };
      allocation_buckets: {
        Row: {
          color: string;
          created_at: string;
          created_by: string | null;
          department_id: string;
          description: string | null;
          display_order: number;
          id: string;
          is_archived: boolean;
          name: string;
          org_id: string;
          updated_at: string;
          updated_by: string | null;
        };
        Insert: {
          color?: string;
          created_at?: string;
          created_by?: string | null;
          department_id: string;
          description?: string | null;
          display_order?: number;
          id?: string;
          is_archived?: boolean;
          name: string;
          org_id: string;
          updated_at?: string;
          updated_by?: string | null;
        };
        Update: {
          color?: string;
          created_at?: string;
          created_by?: string | null;
          department_id?: string;
          description?: string | null;
          display_order?: number;
          id?: string;
          is_archived?: boolean;
          name?: string;
          org_id?: string;
          updated_at?: string;
          updated_by?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "allocation_buckets_department_id_fkey";
            columns: ["department_id"];
            isOneToOne: false;
            referencedRelation: "departments";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "allocation_buckets_org_id_fkey";
            columns: ["org_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
        ];
      };
      allocation_group_members: {
        Row: {
          created_at: string;
          department_id: string;
          group_id: string;
          instructor_id: string;
          org_id: string;
        };
        Insert: {
          created_at?: string;
          department_id: string;
          group_id: string;
          instructor_id: string;
          org_id: string;
        };
        Update: {
          created_at?: string;
          department_id?: string;
          group_id?: string;
          instructor_id?: string;
          org_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "allocation_group_members_department_id_fkey";
            columns: ["department_id"];
            isOneToOne: false;
            referencedRelation: "departments";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "allocation_group_members_group_id_fkey";
            columns: ["group_id"];
            isOneToOne: false;
            referencedRelation: "allocation_groups";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "allocation_group_members_instructor_id_fkey";
            columns: ["instructor_id"];
            isOneToOne: false;
            referencedRelation: "instructors";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "allocation_group_members_instructor_id_fkey";
            columns: ["instructor_id"];
            isOneToOne: false;
            referencedRelation: "v_instructor_capacity";
            referencedColumns: ["instructor_id"];
          },
          {
            foreignKeyName: "allocation_group_members_org_id_fkey";
            columns: ["org_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
        ];
      };
      allocation_groups: {
        Row: {
          created_at: string;
          created_by: string | null;
          department_id: string;
          description: string | null;
          id: string;
          name: string;
          org_id: string;
          updated_at: string;
          updated_by: string | null;
        };
        Insert: {
          created_at?: string;
          created_by?: string | null;
          department_id: string;
          description?: string | null;
          id?: string;
          name: string;
          org_id: string;
          updated_at?: string;
          updated_by?: string | null;
        };
        Update: {
          created_at?: string;
          created_by?: string | null;
          department_id?: string;
          description?: string | null;
          id?: string;
          name?: string;
          org_id?: string;
          updated_at?: string;
          updated_by?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "allocation_groups_department_id_fkey";
            columns: ["department_id"];
            isOneToOne: false;
            referencedRelation: "departments";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "allocation_groups_org_id_fkey";
            columns: ["org_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
        ];
      };
      api_keys: {
        Row: {
          created_at: string;
          created_by: string | null;
          id: string;
          key_hash: string;
          key_prefix: string;
          last_used_at: string | null;
          name: string;
          org_id: string;
          revoked_at: string | null;
          scopes: string[];
        };
        Insert: {
          created_at?: string;
          created_by?: string | null;
          id?: string;
          key_hash: string;
          key_prefix: string;
          last_used_at?: string | null;
          name: string;
          org_id: string;
          revoked_at?: string | null;
          scopes?: string[];
        };
        Update: {
          created_at?: string;
          created_by?: string | null;
          id?: string;
          key_hash?: string;
          key_prefix?: string;
          last_used_at?: string | null;
          name?: string;
          org_id?: string;
          revoked_at?: string | null;
          scopes?: string[];
        };
        Relationships: [
          {
            foreignKeyName: "api_keys_org_id_fkey";
            columns: ["org_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
        ];
      };
      arbor_invoices: {
        Row: {
          agency_id: string;
          created_at: string;
          created_by: string | null;
          due_at: string;
          id: string;
          invoice_number: string;
          issued_at: string;
          line_items: Json;
          notes: string | null;
          paid_amount_cents: number | null;
          paid_at: string | null;
          paid_method: Database["public"]["Enums"]["payment_method"] | null;
          paid_reference: string | null;
          payment_provider: string;
          period_end: string;
          period_start: string;
          status: Database["public"]["Enums"]["invoice_status"];
          total_cents: number;
          updated_at: string;
          updated_by: string | null;
        };
        Insert: {
          agency_id: string;
          created_at?: string;
          created_by?: string | null;
          due_at: string;
          id?: string;
          invoice_number: string;
          issued_at?: string;
          line_items?: Json;
          notes?: string | null;
          paid_amount_cents?: number | null;
          paid_at?: string | null;
          paid_method?: Database["public"]["Enums"]["payment_method"] | null;
          paid_reference?: string | null;
          payment_provider?: string;
          period_end: string;
          period_start: string;
          status?: Database["public"]["Enums"]["invoice_status"];
          total_cents: number;
          updated_at?: string;
          updated_by?: string | null;
        };
        Update: {
          agency_id?: string;
          created_at?: string;
          created_by?: string | null;
          due_at?: string;
          id?: string;
          invoice_number?: string;
          issued_at?: string;
          line_items?: Json;
          notes?: string | null;
          paid_amount_cents?: number | null;
          paid_at?: string | null;
          paid_method?: Database["public"]["Enums"]["payment_method"] | null;
          paid_reference?: string | null;
          payment_provider?: string;
          period_end?: string;
          period_start?: string;
          status?: Database["public"]["Enums"]["invoice_status"];
          total_cents?: number;
          updated_at?: string;
          updated_by?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "arbor_invoices_agency_id_fkey";
            columns: ["agency_id"];
            isOneToOne: false;
            referencedRelation: "agencies";
            referencedColumns: ["id"];
          },
        ];
      };
      audit_log: {
        Row: {
          actor_id: string | null;
          changed_fields: string[] | null;
          id: number;
          new_values: Json | null;
          occurred_at: string;
          old_values: Json | null;
          operation: string;
          org_id: string;
          record_id: string;
          table_name: string;
        };
        Insert: {
          actor_id?: string | null;
          changed_fields?: string[] | null;
          id?: never;
          new_values?: Json | null;
          occurred_at?: string;
          old_values?: Json | null;
          operation: string;
          org_id: string;
          record_id: string;
          table_name: string;
        };
        Update: {
          actor_id?: string | null;
          changed_fields?: string[] | null;
          id?: never;
          new_values?: Json | null;
          occurred_at?: string;
          old_values?: Json | null;
          operation?: string;
          org_id?: string;
          record_id?: string;
          table_name?: string;
        };
        Relationships: [];
      };
      baa_requests: {
        Row: {
          created_at: string;
          effective_date: string | null;
          id: string;
          notes: string | null;
          org_id: string;
          requested_at: string;
          requested_by: string | null;
          signed_at: string | null;
          signed_pdf_path: string | null;
          signer_email: string | null;
          signer_name: string | null;
          signer_title: string | null;
          status: string;
          updated_at: string;
        };
        Insert: {
          created_at?: string;
          effective_date?: string | null;
          id?: string;
          notes?: string | null;
          org_id: string;
          requested_at?: string;
          requested_by?: string | null;
          signed_at?: string | null;
          signed_pdf_path?: string | null;
          signer_email?: string | null;
          signer_name?: string | null;
          signer_title?: string | null;
          status?: string;
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          effective_date?: string | null;
          id?: string;
          notes?: string | null;
          org_id?: string;
          requested_at?: string;
          requested_by?: string | null;
          signed_at?: string | null;
          signed_pdf_path?: string | null;
          signer_email?: string | null;
          signer_name?: string | null;
          signer_title?: string | null;
          status?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "baa_requests_org_id_fkey";
            columns: ["org_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
        ];
      };
      class_instructor_assignments: {
        Row: {
          assigned_offerings: number;
          class_id: string;
          created_at: string;
          department_id: string;
          id: string;
          instructor_id: string;
          org_id: string;
          role: string;
          updated_at: string;
        };
        Insert: {
          assigned_offerings?: number;
          class_id: string;
          created_at?: string;
          department_id: string;
          id?: string;
          instructor_id: string;
          org_id: string;
          role?: string;
          updated_at?: string;
        };
        Update: {
          assigned_offerings?: number;
          class_id?: string;
          created_at?: string;
          department_id?: string;
          id?: string;
          instructor_id?: string;
          org_id?: string;
          role?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "class_instructor_assignments_class_id_fkey";
            columns: ["class_id"];
            isOneToOne: false;
            referencedRelation: "classes";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "class_instructor_assignments_class_id_fkey";
            columns: ["class_id"];
            isOneToOne: false;
            referencedRelation: "classes_with_hours";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "class_instructor_assignments_department_id_fkey";
            columns: ["department_id"];
            isOneToOne: false;
            referencedRelation: "departments";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "class_instructor_assignments_instructor_id_fkey";
            columns: ["instructor_id"];
            isOneToOne: false;
            referencedRelation: "instructors";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "class_instructor_assignments_instructor_id_fkey";
            columns: ["instructor_id"];
            isOneToOne: false;
            referencedRelation: "v_instructor_capacity";
            referencedColumns: ["instructor_id"];
          },
          {
            foreignKeyName: "class_instructor_assignments_org_id_fkey";
            columns: ["org_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
        ];
      };
      class_roadmap_steps: {
        Row: {
          class_id: string;
          competency: string;
          created_at: string;
          department_id: string;
          duration_minutes: number;
          id: string;
          modality: string;
          notes: string | null;
          org_id: string;
          position: number;
          updated_at: string;
        };
        Insert: {
          class_id: string;
          competency: string;
          created_at?: string;
          department_id: string;
          duration_minutes: number;
          id?: string;
          modality: string;
          notes?: string | null;
          org_id: string;
          position?: number;
          updated_at?: string;
        };
        Update: {
          class_id?: string;
          competency?: string;
          created_at?: string;
          department_id?: string;
          duration_minutes?: number;
          id?: string;
          modality?: string;
          notes?: string | null;
          org_id?: string;
          position?: number;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "class_roadmap_steps_class_id_fkey";
            columns: ["class_id"];
            isOneToOne: false;
            referencedRelation: "classes";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "class_roadmap_steps_class_id_fkey";
            columns: ["class_id"];
            isOneToOne: false;
            referencedRelation: "classes_with_hours";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "class_roadmap_steps_department_id_fkey";
            columns: ["department_id"];
            isOneToOne: false;
            referencedRelation: "departments";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "class_roadmap_steps_org_id_fkey";
            columns: ["org_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
        ];
      };
      class_skill_requirements: {
        Row: {
          class_id: string;
          created_at: string;
          created_by: string | null;
          department_id: string;
          id: string;
          min_proficiency: string;
          org_id: string;
          requirement: string;
          skill_id: string;
          updated_at: string;
          updated_by: string | null;
        };
        Insert: {
          class_id: string;
          created_at?: string;
          created_by?: string | null;
          department_id: string;
          id?: string;
          min_proficiency: string;
          org_id: string;
          requirement?: string;
          skill_id: string;
          updated_at?: string;
          updated_by?: string | null;
        };
        Update: {
          class_id?: string;
          created_at?: string;
          created_by?: string | null;
          department_id?: string;
          id?: string;
          min_proficiency?: string;
          org_id?: string;
          requirement?: string;
          skill_id?: string;
          updated_at?: string;
          updated_by?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "class_skill_requirements_class_id_fkey";
            columns: ["class_id"];
            isOneToOne: false;
            referencedRelation: "classes";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "class_skill_requirements_class_id_fkey";
            columns: ["class_id"];
            isOneToOne: false;
            referencedRelation: "classes_with_hours";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "class_skill_requirements_department_id_fkey";
            columns: ["department_id"];
            isOneToOne: false;
            referencedRelation: "departments";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "class_skill_requirements_org_id_fkey";
            columns: ["org_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "class_skill_requirements_skill_id_fkey";
            columns: ["skill_id"];
            isOneToOne: false;
            referencedRelation: "skills";
            referencedColumns: ["id"];
          },
        ];
      };
      classes: {
        Row: {
          allocation_bucket_id: string | null;
          created_at: string;
          created_by: string | null;
          custom_day_hours: number[] | null;
          deleted_at: string | null;
          department_id: string;
          description: string | null;
          hours_per_day: number | null;
          id: string;
          is_multi_day: boolean;
          logistics_hours_per_offering: number;
          name: string;
          offerings_per_year: number;
          org_id: string;
          prep_hours_per_offering: number;
          status: string;
          total_days: number;
          updated_at: string;
          updated_by: string | null;
          version: number;
        };
        Insert: {
          allocation_bucket_id?: string | null;
          created_at?: string;
          created_by?: string | null;
          custom_day_hours?: number[] | null;
          deleted_at?: string | null;
          department_id: string;
          description?: string | null;
          hours_per_day?: number | null;
          id?: string;
          is_multi_day?: boolean;
          logistics_hours_per_offering?: number;
          name: string;
          offerings_per_year?: number;
          org_id: string;
          prep_hours_per_offering?: number;
          status?: string;
          total_days?: number;
          updated_at?: string;
          updated_by?: string | null;
          version?: number;
        };
        Update: {
          allocation_bucket_id?: string | null;
          created_at?: string;
          created_by?: string | null;
          custom_day_hours?: number[] | null;
          deleted_at?: string | null;
          department_id?: string;
          description?: string | null;
          hours_per_day?: number | null;
          id?: string;
          is_multi_day?: boolean;
          logistics_hours_per_offering?: number;
          name?: string;
          offerings_per_year?: number;
          org_id?: string;
          prep_hours_per_offering?: number;
          status?: string;
          total_days?: number;
          updated_at?: string;
          updated_by?: string | null;
          version?: number;
        };
        Relationships: [
          {
            foreignKeyName: "classes_allocation_bucket_id_fkey";
            columns: ["allocation_bucket_id"];
            isOneToOne: false;
            referencedRelation: "allocation_buckets";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "classes_department_id_fkey";
            columns: ["department_id"];
            isOneToOne: false;
            referencedRelation: "departments";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "classes_org_id_fkey";
            columns: ["org_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
        ];
      };
      client_contracts: {
        Row: {
          agency_id: string;
          annual_contract_value_cents: number;
          contract_end: string | null;
          contract_start: string;
          created_at: string;
          created_by: string | null;
          id: string;
          notes: string | null;
          org_id: string;
          pricing_tier: Database["public"]["Enums"]["contract_pricing_tier"];
          revenue_share_pct: number | null;
          status: Database["public"]["Enums"]["contract_status"];
          updated_at: string;
          updated_by: string | null;
          version: number;
        };
        Insert: {
          agency_id: string;
          annual_contract_value_cents: number;
          contract_end?: string | null;
          contract_start: string;
          created_at?: string;
          created_by?: string | null;
          id?: string;
          notes?: string | null;
          org_id: string;
          pricing_tier: Database["public"]["Enums"]["contract_pricing_tier"];
          revenue_share_pct?: number | null;
          status?: Database["public"]["Enums"]["contract_status"];
          updated_at?: string;
          updated_by?: string | null;
          version?: number;
        };
        Update: {
          agency_id?: string;
          annual_contract_value_cents?: number;
          contract_end?: string | null;
          contract_start?: string;
          created_at?: string;
          created_by?: string | null;
          id?: string;
          notes?: string | null;
          org_id?: string;
          pricing_tier?: Database["public"]["Enums"]["contract_pricing_tier"];
          revenue_share_pct?: number | null;
          status?: Database["public"]["Enums"]["contract_status"];
          updated_at?: string;
          updated_by?: string | null;
          version?: number;
        };
        Relationships: [
          {
            foreignKeyName: "client_contracts_agency_id_fkey";
            columns: ["agency_id"];
            isOneToOne: false;
            referencedRelation: "agencies";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "client_contracts_org_id_fkey";
            columns: ["org_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
        ];
      };
      cookie_consents: {
        Row: {
          analytics: boolean;
          consented_at: string;
          id: string;
          ip: string | null;
          marketing: boolean;
          necessary: boolean;
          session_id: string | null;
          source: string;
          user_agent: string | null;
          user_id: string | null;
        };
        Insert: {
          analytics?: boolean;
          consented_at?: string;
          id?: string;
          ip?: string | null;
          marketing?: boolean;
          necessary?: boolean;
          session_id?: string | null;
          source?: string;
          user_agent?: string | null;
          user_id?: string | null;
        };
        Update: {
          analytics?: boolean;
          consented_at?: string;
          id?: string;
          ip?: string | null;
          marketing?: boolean;
          necessary?: boolean;
          session_id?: string | null;
          source?: string;
          user_agent?: string | null;
          user_id?: string | null;
        };
        Relationships: [];
      };
      data_exports: {
        Row: {
          completed_at: string | null;
          error_message: string | null;
          id: string;
          org_id: string;
          requested_at: string;
          requested_by: string | null;
          row_count: number | null;
          size_bytes: number | null;
          status: string;
          storage_path: string | null;
          table_count: number | null;
        };
        Insert: {
          completed_at?: string | null;
          error_message?: string | null;
          id?: string;
          org_id: string;
          requested_at?: string;
          requested_by?: string | null;
          row_count?: number | null;
          size_bytes?: number | null;
          status?: string;
          storage_path?: string | null;
          table_count?: number | null;
        };
        Update: {
          completed_at?: string | null;
          error_message?: string | null;
          id?: string;
          org_id?: string;
          requested_at?: string;
          requested_by?: string | null;
          row_count?: number | null;
          size_bytes?: number | null;
          status?: string;
          storage_path?: string | null;
          table_count?: number | null;
        };
        Relationships: [
          {
            foreignKeyName: "data_exports_org_id_fkey";
            columns: ["org_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
        ];
      };
      deliverable_types: {
        Row: {
          created_at: string;
          created_by: string | null;
          description: string | null;
          dev_to_seat_ratio: number;
          id: string;
          is_archived: boolean;
          is_built_in: boolean;
          name: string;
          org_id: string | null;
          updated_at: string;
          updated_by: string | null;
        };
        Insert: {
          created_at?: string;
          created_by?: string | null;
          description?: string | null;
          dev_to_seat_ratio: number;
          id?: string;
          is_archived?: boolean;
          is_built_in?: boolean;
          name: string;
          org_id?: string | null;
          updated_at?: string;
          updated_by?: string | null;
        };
        Update: {
          created_at?: string;
          created_by?: string | null;
          description?: string | null;
          dev_to_seat_ratio?: number;
          id?: string;
          is_archived?: boolean;
          is_built_in?: boolean;
          name?: string;
          org_id?: string | null;
          updated_at?: string;
          updated_by?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "deliverable_types_org_id_fkey";
            columns: ["org_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
        ];
      };
      department_memberships: {
        Row: {
          accepted_at: string | null;
          created_at: string;
          department_id: string;
          id: string;
          role: string;
          user_id: string;
        };
        Insert: {
          accepted_at?: string | null;
          created_at?: string;
          department_id: string;
          id?: string;
          role?: string;
          user_id: string;
        };
        Update: {
          accepted_at?: string | null;
          created_at?: string;
          department_id?: string;
          id?: string;
          role?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "department_memberships_department_id_fkey";
            columns: ["department_id"];
            isOneToOne: false;
            referencedRelation: "departments";
            referencedColumns: ["id"];
          },
        ];
      };
      departments: {
        Row: {
          created_at: string;
          description: string | null;
          id: string;
          name: string;
          org_id: string;
          slug: string;
          updated_at: string;
        };
        Insert: {
          created_at?: string;
          description?: string | null;
          id?: string;
          name: string;
          org_id: string;
          slug: string;
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          description?: string | null;
          id?: string;
          name?: string;
          org_id?: string;
          slug?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "departments_org_id_fkey";
            columns: ["org_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
        ];
      };
      dependencies: {
        Row: {
          created_at: string;
          created_by: string | null;
          dep_type: string;
          department_id: string;
          description: string | null;
          id: string;
          name: string;
          org_id: string;
          owner: string | null;
          project_id: string;
          resolved_at: string | null;
          sort_order: number;
          status: string;
          target_resolution_date: string | null;
          updated_at: string;
          updated_by: string | null;
          version: number;
        };
        Insert: {
          created_at?: string;
          created_by?: string | null;
          dep_type?: string;
          department_id: string;
          description?: string | null;
          id?: string;
          name: string;
          org_id: string;
          owner?: string | null;
          project_id: string;
          resolved_at?: string | null;
          sort_order?: number;
          status?: string;
          target_resolution_date?: string | null;
          updated_at?: string;
          updated_by?: string | null;
          version?: number;
        };
        Update: {
          created_at?: string;
          created_by?: string | null;
          dep_type?: string;
          department_id?: string;
          description?: string | null;
          id?: string;
          name?: string;
          org_id?: string;
          owner?: string | null;
          project_id?: string;
          resolved_at?: string | null;
          sort_order?: number;
          status?: string;
          target_resolution_date?: string | null;
          updated_at?: string;
          updated_by?: string | null;
          version?: number;
        };
        Relationships: [
          {
            foreignKeyName: "dependencies_department_id_fkey";
            columns: ["department_id"];
            isOneToOne: false;
            referencedRelation: "departments";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "dependencies_org_id_fkey";
            columns: ["org_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "dependencies_project_id_fkey";
            columns: ["project_id"];
            isOneToOne: false;
            referencedRelation: "projects";
            referencedColumns: ["id"];
          },
        ];
      };
      education_request_assignments: {
        Row: {
          actual_hours: number | null;
          completed_at: string | null;
          created_at: string;
          created_by: string | null;
          department_id: string;
          estimated_hours: number;
          id: string;
          instructor_id: string;
          org_id: string;
          request_id: string;
          started_at: string | null;
          updated_at: string;
          updated_by: string | null;
        };
        Insert: {
          actual_hours?: number | null;
          completed_at?: string | null;
          created_at?: string;
          created_by?: string | null;
          department_id: string;
          estimated_hours: number;
          id?: string;
          instructor_id: string;
          org_id: string;
          request_id: string;
          started_at?: string | null;
          updated_at?: string;
          updated_by?: string | null;
        };
        Update: {
          actual_hours?: number | null;
          completed_at?: string | null;
          created_at?: string;
          created_by?: string | null;
          department_id?: string;
          estimated_hours?: number;
          id?: string;
          instructor_id?: string;
          org_id?: string;
          request_id?: string;
          started_at?: string | null;
          updated_at?: string;
          updated_by?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "education_request_assignments_department_id_fkey";
            columns: ["department_id"];
            isOneToOne: false;
            referencedRelation: "departments";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "education_request_assignments_instructor_id_fkey";
            columns: ["instructor_id"];
            isOneToOne: false;
            referencedRelation: "instructors";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "education_request_assignments_instructor_id_fkey";
            columns: ["instructor_id"];
            isOneToOne: false;
            referencedRelation: "v_instructor_capacity";
            referencedColumns: ["instructor_id"];
          },
          {
            foreignKeyName: "education_request_assignments_org_id_fkey";
            columns: ["org_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "education_request_assignments_request_id_fkey";
            columns: ["request_id"];
            isOneToOne: false;
            referencedRelation: "education_requests";
            referencedColumns: ["id"];
          },
        ];
      };
      education_request_history: {
        Row: {
          actor_id: string | null;
          comment: string | null;
          department_id: string;
          from_status: string | null;
          id: number;
          occurred_at: string;
          org_id: string;
          request_id: string;
          to_status: string;
        };
        Insert: {
          actor_id?: string | null;
          comment?: string | null;
          department_id: string;
          from_status?: string | null;
          id?: never;
          occurred_at?: string;
          org_id: string;
          request_id: string;
          to_status: string;
        };
        Update: {
          actor_id?: string | null;
          comment?: string | null;
          department_id?: string;
          from_status?: string | null;
          id?: never;
          occurred_at?: string;
          org_id?: string;
          request_id?: string;
          to_status?: string;
        };
        Relationships: [
          {
            foreignKeyName: "education_request_history_department_id_fkey";
            columns: ["department_id"];
            isOneToOne: false;
            referencedRelation: "departments";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "education_request_history_org_id_fkey";
            columns: ["org_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "education_request_history_request_id_fkey";
            columns: ["request_id"];
            isOneToOne: false;
            referencedRelation: "education_requests";
            referencedColumns: ["id"];
          },
        ];
      };
      education_requests: {
        Row: {
          business_justification: string | null;
          created_at: string;
          created_by: string | null;
          deleted_at: string | null;
          department_id: string;
          id: string;
          linked_project_id: string | null;
          linked_tra_id: string | null;
          org_id: string;
          public_form_token: string | null;
          requested_by_department: string | null;
          requested_by_email: string | null;
          requested_by_name: string;
          review_notes: string | null;
          status: string;
          submitted_via: string;
          target_audience: string | null;
          target_completion_date: string | null;
          title: string;
          updated_at: string;
          updated_by: string | null;
          urgency: string;
        };
        Insert: {
          business_justification?: string | null;
          created_at?: string;
          created_by?: string | null;
          deleted_at?: string | null;
          department_id: string;
          id?: string;
          linked_project_id?: string | null;
          linked_tra_id?: string | null;
          org_id: string;
          public_form_token?: string | null;
          requested_by_department?: string | null;
          requested_by_email?: string | null;
          requested_by_name: string;
          review_notes?: string | null;
          status?: string;
          submitted_via?: string;
          target_audience?: string | null;
          target_completion_date?: string | null;
          title: string;
          updated_at?: string;
          updated_by?: string | null;
          urgency?: string;
        };
        Update: {
          business_justification?: string | null;
          created_at?: string;
          created_by?: string | null;
          deleted_at?: string | null;
          department_id?: string;
          id?: string;
          linked_project_id?: string | null;
          linked_tra_id?: string | null;
          org_id?: string;
          public_form_token?: string | null;
          requested_by_department?: string | null;
          requested_by_email?: string | null;
          requested_by_name?: string;
          review_notes?: string | null;
          status?: string;
          submitted_via?: string;
          target_audience?: string | null;
          target_completion_date?: string | null;
          title?: string;
          updated_at?: string;
          updated_by?: string | null;
          urgency?: string;
        };
        Relationships: [
          {
            foreignKeyName: "education_requests_department_id_fkey";
            columns: ["department_id"];
            isOneToOne: false;
            referencedRelation: "departments";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "education_requests_linked_project_id_fkey";
            columns: ["linked_project_id"];
            isOneToOne: false;
            referencedRelation: "projects";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "education_requests_linked_tra_id_fkey";
            columns: ["linked_tra_id"];
            isOneToOne: false;
            referencedRelation: "tras";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "education_requests_org_id_fkey";
            columns: ["org_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "education_requests_public_form_token_fkey";
            columns: ["public_form_token"];
            isOneToOne: false;
            referencedRelation: "public_intake_links";
            referencedColumns: ["token"];
          },
        ];
      };
      feature_flags: {
        Row: {
          created_at: string;
          enabled: boolean;
          id: string;
          key: string;
          org_id: string | null;
          updated_at: string;
          value: Json | null;
        };
        Insert: {
          created_at?: string;
          enabled?: boolean;
          id?: string;
          key: string;
          org_id?: string | null;
          updated_at?: string;
          value?: Json | null;
        };
        Update: {
          created_at?: string;
          enabled?: boolean;
          id?: string;
          key?: string;
          org_id?: string | null;
          updated_at?: string;
          value?: Json | null;
        };
        Relationships: [
          {
            foreignKeyName: "feature_flags_org_id_fkey";
            columns: ["org_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
        ];
      };
      global_allocations: {
        Row: {
          bucket_id: string;
          created_at: string;
          created_by: string | null;
          department_id: string;
          id: string;
          org_id: string;
          target_percent: number;
          updated_at: string;
          updated_by: string | null;
        };
        Insert: {
          bucket_id: string;
          created_at?: string;
          created_by?: string | null;
          department_id: string;
          id?: string;
          org_id: string;
          target_percent: number;
          updated_at?: string;
          updated_by?: string | null;
        };
        Update: {
          bucket_id?: string;
          created_at?: string;
          created_by?: string | null;
          department_id?: string;
          id?: string;
          org_id?: string;
          target_percent?: number;
          updated_at?: string;
          updated_by?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "global_allocations_bucket_id_fkey";
            columns: ["bucket_id"];
            isOneToOne: false;
            referencedRelation: "allocation_buckets";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "global_allocations_department_id_fkey";
            columns: ["department_id"];
            isOneToOne: false;
            referencedRelation: "departments";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "global_allocations_org_id_fkey";
            columns: ["org_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
        ];
      };
      group_allocations: {
        Row: {
          bucket_id: string;
          created_at: string;
          created_by: string | null;
          department_id: string;
          group_id: string;
          id: string;
          org_id: string;
          target_percent: number;
          updated_at: string;
          updated_by: string | null;
        };
        Insert: {
          bucket_id: string;
          created_at?: string;
          created_by?: string | null;
          department_id: string;
          group_id: string;
          id?: string;
          org_id: string;
          target_percent: number;
          updated_at?: string;
          updated_by?: string | null;
        };
        Update: {
          bucket_id?: string;
          created_at?: string;
          created_by?: string | null;
          department_id?: string;
          group_id?: string;
          id?: string;
          org_id?: string;
          target_percent?: number;
          updated_at?: string;
          updated_by?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "group_allocations_bucket_id_fkey";
            columns: ["bucket_id"];
            isOneToOne: false;
            referencedRelation: "allocation_buckets";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "group_allocations_department_id_fkey";
            columns: ["department_id"];
            isOneToOne: false;
            referencedRelation: "departments";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "group_allocations_group_id_fkey";
            columns: ["group_id"];
            isOneToOne: false;
            referencedRelation: "allocation_groups";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "group_allocations_org_id_fkey";
            columns: ["org_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
        ];
      };
      impl_class_prerequisites: {
        Row: {
          created_at: string;
          created_by: string | null;
          department_id: string;
          id: string;
          impl_class_id: string;
          org_id: string;
          prerequisite_id: string;
        };
        Insert: {
          created_at?: string;
          created_by?: string | null;
          department_id: string;
          id?: string;
          impl_class_id: string;
          org_id: string;
          prerequisite_id: string;
        };
        Update: {
          created_at?: string;
          created_by?: string | null;
          department_id?: string;
          id?: string;
          impl_class_id?: string;
          org_id?: string;
          prerequisite_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "impl_class_prerequisites_department_id_fkey";
            columns: ["department_id"];
            isOneToOne: false;
            referencedRelation: "departments";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "impl_class_prerequisites_impl_class_id_fkey";
            columns: ["impl_class_id"];
            isOneToOne: false;
            referencedRelation: "impl_classes";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "impl_class_prerequisites_org_id_fkey";
            columns: ["org_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "impl_class_prerequisites_prerequisite_id_fkey";
            columns: ["prerequisite_id"];
            isOneToOne: false;
            referencedRelation: "impl_classes";
            referencedColumns: ["id"];
          },
        ];
      };
      impl_class_trainers: {
        Row: {
          created_at: string;
          created_by: string | null;
          department_id: string;
          id: string;
          impl_class_id: string;
          impl_trainer_id: string;
          org_id: string;
        };
        Insert: {
          created_at?: string;
          created_by?: string | null;
          department_id: string;
          id?: string;
          impl_class_id: string;
          impl_trainer_id: string;
          org_id: string;
        };
        Update: {
          created_at?: string;
          created_by?: string | null;
          department_id?: string;
          id?: string;
          impl_class_id?: string;
          impl_trainer_id?: string;
          org_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "impl_class_trainers_department_id_fkey";
            columns: ["department_id"];
            isOneToOne: false;
            referencedRelation: "departments";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "impl_class_trainers_impl_class_id_fkey";
            columns: ["impl_class_id"];
            isOneToOne: false;
            referencedRelation: "impl_classes";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "impl_class_trainers_impl_trainer_id_fkey";
            columns: ["impl_trainer_id"];
            isOneToOne: false;
            referencedRelation: "impl_trainers";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "impl_class_trainers_org_id_fkey";
            columns: ["org_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
        ];
      };
      impl_classes: {
        Row: {
          created_at: string;
          created_by: string | null;
          department_id: string;
          description: string | null;
          expected_learners_per_session: number;
          hours_per_session: number;
          id: string;
          implementation_id: string;
          module_id: string | null;
          name: string;
          org_id: string;
          required_equipment_notes: string | null;
          required_equipment_tags: string[];
          sort_order: number;
          total_people_to_train: number;
          updated_at: string;
          updated_by: string | null;
        };
        Insert: {
          created_at?: string;
          created_by?: string | null;
          department_id: string;
          description?: string | null;
          expected_learners_per_session: number;
          hours_per_session: number;
          id?: string;
          implementation_id: string;
          module_id?: string | null;
          name: string;
          org_id: string;
          required_equipment_notes?: string | null;
          required_equipment_tags?: string[];
          sort_order?: number;
          total_people_to_train?: number;
          updated_at?: string;
          updated_by?: string | null;
        };
        Update: {
          created_at?: string;
          created_by?: string | null;
          department_id?: string;
          description?: string | null;
          expected_learners_per_session?: number;
          hours_per_session?: number;
          id?: string;
          implementation_id?: string;
          module_id?: string | null;
          name?: string;
          org_id?: string;
          required_equipment_notes?: string | null;
          required_equipment_tags?: string[];
          sort_order?: number;
          total_people_to_train?: number;
          updated_at?: string;
          updated_by?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "impl_classes_department_id_fkey";
            columns: ["department_id"];
            isOneToOne: false;
            referencedRelation: "departments";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "impl_classes_implementation_id_fkey";
            columns: ["implementation_id"];
            isOneToOne: false;
            referencedRelation: "implementations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "impl_classes_module_id_fkey";
            columns: ["module_id"];
            isOneToOne: false;
            referencedRelation: "impl_modules";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "impl_classes_org_id_fkey";
            columns: ["org_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
        ];
      };
      impl_modules: {
        Row: {
          created_at: string;
          created_by: string | null;
          department_id: string;
          description: string | null;
          id: string;
          implementation_id: string;
          name: string;
          org_id: string;
          sort_order: number;
          updated_at: string;
          updated_by: string | null;
        };
        Insert: {
          created_at?: string;
          created_by?: string | null;
          department_id: string;
          description?: string | null;
          id?: string;
          implementation_id: string;
          name: string;
          org_id: string;
          sort_order?: number;
          updated_at?: string;
          updated_by?: string | null;
        };
        Update: {
          created_at?: string;
          created_by?: string | null;
          department_id?: string;
          description?: string | null;
          id?: string;
          implementation_id?: string;
          name?: string;
          org_id?: string;
          sort_order?: number;
          updated_at?: string;
          updated_by?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "impl_modules_department_id_fkey";
            columns: ["department_id"];
            isOneToOne: false;
            referencedRelation: "departments";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "impl_modules_implementation_id_fkey";
            columns: ["implementation_id"];
            isOneToOne: false;
            referencedRelation: "implementations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "impl_modules_org_id_fkey";
            columns: ["org_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
        ];
      };
      impl_rooms: {
        Row: {
          available_days_of_week: number[];
          available_hours_per_day: number;
          created_at: string;
          created_by: string | null;
          department_id: string;
          equipment_notes: string | null;
          equipment_tags: string[];
          id: string;
          implementation_id: string;
          location: string | null;
          name: string;
          org_id: string;
          seat_capacity: number;
          sort_order: number;
          start_hour_local: number;
          timezone: string | null;
          updated_at: string;
          updated_by: string | null;
        };
        Insert: {
          available_days_of_week?: number[];
          available_hours_per_day?: number;
          created_at?: string;
          created_by?: string | null;
          department_id: string;
          equipment_notes?: string | null;
          equipment_tags?: string[];
          id?: string;
          implementation_id: string;
          location?: string | null;
          name: string;
          org_id: string;
          seat_capacity: number;
          sort_order?: number;
          start_hour_local?: number;
          timezone?: string | null;
          updated_at?: string;
          updated_by?: string | null;
        };
        Update: {
          available_days_of_week?: number[];
          available_hours_per_day?: number;
          created_at?: string;
          created_by?: string | null;
          department_id?: string;
          equipment_notes?: string | null;
          equipment_tags?: string[];
          id?: string;
          implementation_id?: string;
          location?: string | null;
          name?: string;
          org_id?: string;
          seat_capacity?: number;
          sort_order?: number;
          start_hour_local?: number;
          timezone?: string | null;
          updated_at?: string;
          updated_by?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "impl_rooms_department_id_fkey";
            columns: ["department_id"];
            isOneToOne: false;
            referencedRelation: "departments";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "impl_rooms_implementation_id_fkey";
            columns: ["implementation_id"];
            isOneToOne: false;
            referencedRelation: "implementations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "impl_rooms_org_id_fkey";
            columns: ["org_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
        ];
      };
      impl_sessions: {
        Row: {
          conflict_reason: string | null;
          conflict_status: string;
          created_at: string;
          created_by: string | null;
          department_id: string;
          id: string;
          impl_class_id: string;
          impl_room_id: string | null;
          impl_trainer_id: string | null;
          implementation_id: string;
          learners_count: number;
          notes: string | null;
          org_id: string;
          scheduled_end: string;
          scheduled_start: string;
          status: string;
          updated_at: string;
          updated_by: string | null;
        };
        Insert: {
          conflict_reason?: string | null;
          conflict_status?: string;
          created_at?: string;
          created_by?: string | null;
          department_id: string;
          id?: string;
          impl_class_id: string;
          impl_room_id?: string | null;
          impl_trainer_id?: string | null;
          implementation_id: string;
          learners_count?: number;
          notes?: string | null;
          org_id: string;
          scheduled_end: string;
          scheduled_start: string;
          status?: string;
          updated_at?: string;
          updated_by?: string | null;
        };
        Update: {
          conflict_reason?: string | null;
          conflict_status?: string;
          created_at?: string;
          created_by?: string | null;
          department_id?: string;
          id?: string;
          impl_class_id?: string;
          impl_room_id?: string | null;
          impl_trainer_id?: string | null;
          implementation_id?: string;
          learners_count?: number;
          notes?: string | null;
          org_id?: string;
          scheduled_end?: string;
          scheduled_start?: string;
          status?: string;
          updated_at?: string;
          updated_by?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "impl_sessions_department_id_fkey";
            columns: ["department_id"];
            isOneToOne: false;
            referencedRelation: "departments";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "impl_sessions_impl_class_id_fkey";
            columns: ["impl_class_id"];
            isOneToOne: false;
            referencedRelation: "impl_classes";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "impl_sessions_impl_room_id_fkey";
            columns: ["impl_room_id"];
            isOneToOne: false;
            referencedRelation: "impl_rooms";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "impl_sessions_impl_trainer_id_fkey";
            columns: ["impl_trainer_id"];
            isOneToOne: false;
            referencedRelation: "impl_trainers";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "impl_sessions_implementation_id_fkey";
            columns: ["implementation_id"];
            isOneToOne: false;
            referencedRelation: "implementations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "impl_sessions_org_id_fkey";
            columns: ["org_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
        ];
      };
      impl_trainer_unavailability: {
        Row: {
          created_at: string;
          department_id: string;
          ends_at: string;
          id: string;
          impl_trainer_id: string;
          org_id: string;
          reason: string | null;
          starts_at: string;
          updated_at: string;
        };
        Insert: {
          created_at?: string;
          department_id: string;
          ends_at: string;
          id?: string;
          impl_trainer_id: string;
          org_id: string;
          reason?: string | null;
          starts_at: string;
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          department_id?: string;
          ends_at?: string;
          id?: string;
          impl_trainer_id?: string;
          org_id?: string;
          reason?: string | null;
          starts_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "impl_trainer_unavailability_department_id_fkey";
            columns: ["department_id"];
            isOneToOne: false;
            referencedRelation: "departments";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "impl_trainer_unavailability_impl_trainer_id_fkey";
            columns: ["impl_trainer_id"];
            isOneToOne: false;
            referencedRelation: "impl_trainers";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "impl_trainer_unavailability_org_id_fkey";
            columns: ["org_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
        ];
      };
      impl_trainers: {
        Row: {
          availability_hours_per_week: number;
          created_at: string;
          created_by: string | null;
          department_id: string;
          email: string | null;
          id: string;
          implementation_id: string;
          instructor_id: string | null;
          max_concurrent_sessions: number;
          name: string;
          org_id: string;
          sort_order: number;
          updated_at: string;
          updated_by: string | null;
        };
        Insert: {
          availability_hours_per_week: number;
          created_at?: string;
          created_by?: string | null;
          department_id: string;
          email?: string | null;
          id?: string;
          implementation_id: string;
          instructor_id?: string | null;
          max_concurrent_sessions?: number;
          name: string;
          org_id: string;
          sort_order?: number;
          updated_at?: string;
          updated_by?: string | null;
        };
        Update: {
          availability_hours_per_week?: number;
          created_at?: string;
          created_by?: string | null;
          department_id?: string;
          email?: string | null;
          id?: string;
          implementation_id?: string;
          instructor_id?: string | null;
          max_concurrent_sessions?: number;
          name?: string;
          org_id?: string;
          sort_order?: number;
          updated_at?: string;
          updated_by?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "impl_trainers_department_id_fkey";
            columns: ["department_id"];
            isOneToOne: false;
            referencedRelation: "departments";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "impl_trainers_implementation_id_fkey";
            columns: ["implementation_id"];
            isOneToOne: false;
            referencedRelation: "implementations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "impl_trainers_instructor_id_fkey";
            columns: ["instructor_id"];
            isOneToOne: false;
            referencedRelation: "instructors";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "impl_trainers_instructor_id_fkey";
            columns: ["instructor_id"];
            isOneToOne: false;
            referencedRelation: "v_instructor_capacity";
            referencedColumns: ["instructor_id"];
          },
          {
            foreignKeyName: "impl_trainers_org_id_fkey";
            columns: ["org_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
        ];
      };
      implementations: {
        Row: {
          business_hours_end_local: number;
          business_hours_start_local: number;
          created_at: string;
          created_by: string | null;
          current_step: number;
          deleted_at: string | null;
          department_id: string;
          description: string | null;
          go_live_buffer_days: number;
          go_live_date: string | null;
          id: string;
          linked_project_id: string | null;
          linked_tra_id: string | null;
          lunch_break_length_minutes: number;
          lunch_break_start_minutes: number;
          name: string;
          org_id: string;
          status: string;
          updated_at: string;
          updated_by: string | null;
          version: number;
          window_end_date: string | null;
          window_start_date: string | null;
        };
        Insert: {
          business_hours_end_local?: number;
          business_hours_start_local?: number;
          created_at?: string;
          created_by?: string | null;
          current_step?: number;
          deleted_at?: string | null;
          department_id: string;
          description?: string | null;
          go_live_buffer_days?: number;
          go_live_date?: string | null;
          id?: string;
          linked_project_id?: string | null;
          linked_tra_id?: string | null;
          lunch_break_length_minutes?: number;
          lunch_break_start_minutes?: number;
          name: string;
          org_id: string;
          status?: string;
          updated_at?: string;
          updated_by?: string | null;
          version?: number;
          window_end_date?: string | null;
          window_start_date?: string | null;
        };
        Update: {
          business_hours_end_local?: number;
          business_hours_start_local?: number;
          created_at?: string;
          created_by?: string | null;
          current_step?: number;
          deleted_at?: string | null;
          department_id?: string;
          description?: string | null;
          go_live_buffer_days?: number;
          go_live_date?: string | null;
          id?: string;
          linked_project_id?: string | null;
          linked_tra_id?: string | null;
          lunch_break_length_minutes?: number;
          lunch_break_start_minutes?: number;
          name?: string;
          org_id?: string;
          status?: string;
          updated_at?: string;
          updated_by?: string | null;
          version?: number;
          window_end_date?: string | null;
          window_start_date?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "implementations_department_id_fkey";
            columns: ["department_id"];
            isOneToOne: false;
            referencedRelation: "departments";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "implementations_linked_project_id_fkey";
            columns: ["linked_project_id"];
            isOneToOne: false;
            referencedRelation: "projects";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "implementations_linked_tra_id_fkey";
            columns: ["linked_tra_id"];
            isOneToOne: false;
            referencedRelation: "tras";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "implementations_org_id_fkey";
            columns: ["org_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
        ];
      };
      individual_allocations: {
        Row: {
          bucket_id: string;
          created_at: string;
          created_by: string | null;
          department_id: string;
          id: string;
          instructor_id: string;
          org_id: string;
          target_percent: number;
          updated_at: string;
          updated_by: string | null;
        };
        Insert: {
          bucket_id: string;
          created_at?: string;
          created_by?: string | null;
          department_id: string;
          id?: string;
          instructor_id: string;
          org_id: string;
          target_percent: number;
          updated_at?: string;
          updated_by?: string | null;
        };
        Update: {
          bucket_id?: string;
          created_at?: string;
          created_by?: string | null;
          department_id?: string;
          id?: string;
          instructor_id?: string;
          org_id?: string;
          target_percent?: number;
          updated_at?: string;
          updated_by?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "individual_allocations_bucket_id_fkey";
            columns: ["bucket_id"];
            isOneToOne: false;
            referencedRelation: "allocation_buckets";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "individual_allocations_department_id_fkey";
            columns: ["department_id"];
            isOneToOne: false;
            referencedRelation: "departments";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "individual_allocations_instructor_id_fkey";
            columns: ["instructor_id"];
            isOneToOne: false;
            referencedRelation: "instructors";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "individual_allocations_instructor_id_fkey";
            columns: ["instructor_id"];
            isOneToOne: false;
            referencedRelation: "v_instructor_capacity";
            referencedColumns: ["instructor_id"];
          },
          {
            foreignKeyName: "individual_allocations_org_id_fkey";
            columns: ["org_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
        ];
      };
      instructor_skills: {
        Row: {
          certificate_url: string | null;
          certified_at: string | null;
          created_at: string;
          created_by: string | null;
          department_id: string;
          expires_at: string | null;
          id: string;
          instructor_id: string;
          is_certified: boolean;
          notes: string | null;
          org_id: string;
          proficiency: string;
          skill_id: string;
          updated_at: string;
          updated_by: string | null;
        };
        Insert: {
          certificate_url?: string | null;
          certified_at?: string | null;
          created_at?: string;
          created_by?: string | null;
          department_id: string;
          expires_at?: string | null;
          id?: string;
          instructor_id: string;
          is_certified?: boolean;
          notes?: string | null;
          org_id: string;
          proficiency: string;
          skill_id: string;
          updated_at?: string;
          updated_by?: string | null;
        };
        Update: {
          certificate_url?: string | null;
          certified_at?: string | null;
          created_at?: string;
          created_by?: string | null;
          department_id?: string;
          expires_at?: string | null;
          id?: string;
          instructor_id?: string;
          is_certified?: boolean;
          notes?: string | null;
          org_id?: string;
          proficiency?: string;
          skill_id?: string;
          updated_at?: string;
          updated_by?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "instructor_skills_department_id_fkey";
            columns: ["department_id"];
            isOneToOne: false;
            referencedRelation: "departments";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "instructor_skills_instructor_id_fkey";
            columns: ["instructor_id"];
            isOneToOne: false;
            referencedRelation: "instructors";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "instructor_skills_instructor_id_fkey";
            columns: ["instructor_id"];
            isOneToOne: false;
            referencedRelation: "v_instructor_capacity";
            referencedColumns: ["instructor_id"];
          },
          {
            foreignKeyName: "instructor_skills_org_id_fkey";
            columns: ["org_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "instructor_skills_skill_id_fkey";
            columns: ["skill_id"];
            isOneToOne: false;
            referencedRelation: "skills";
            referencedColumns: ["id"];
          },
        ];
      };
      instructors: {
        Row: {
          annual_hours: number;
          created_at: string;
          created_by: string | null;
          deleted_at: string | null;
          department: string | null;
          department_id: string;
          email: string | null;
          full_name: string;
          id: string;
          is_external: boolean;
          job_title: string | null;
          location: string | null;
          notes: string | null;
          org_id: string;
          phone: string | null;
          start_date: string | null;
          status: string;
          updated_at: string;
          updated_by: string | null;
          user_id: string | null;
          version: number;
        };
        Insert: {
          annual_hours?: number;
          created_at?: string;
          created_by?: string | null;
          deleted_at?: string | null;
          department?: string | null;
          department_id: string;
          email?: string | null;
          full_name: string;
          id?: string;
          is_external?: boolean;
          job_title?: string | null;
          location?: string | null;
          notes?: string | null;
          org_id: string;
          phone?: string | null;
          start_date?: string | null;
          status?: string;
          updated_at?: string;
          updated_by?: string | null;
          user_id?: string | null;
          version?: number;
        };
        Update: {
          annual_hours?: number;
          created_at?: string;
          created_by?: string | null;
          deleted_at?: string | null;
          department?: string | null;
          department_id?: string;
          email?: string | null;
          full_name?: string;
          id?: string;
          is_external?: boolean;
          job_title?: string | null;
          location?: string | null;
          notes?: string | null;
          org_id?: string;
          phone?: string | null;
          start_date?: string | null;
          status?: string;
          updated_at?: string;
          updated_by?: string | null;
          user_id?: string | null;
          version?: number;
        };
        Relationships: [
          {
            foreignKeyName: "instructors_department_id_fkey";
            columns: ["department_id"];
            isOneToOne: false;
            referencedRelation: "departments";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "instructors_org_id_fkey";
            columns: ["org_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
        ];
      };
      legal_acceptances: {
        Row: {
          accepted_at: string;
          context: string;
          document_key: string;
          email: string | null;
          id: string;
          ip: string | null;
          metadata: Json | null;
          user_agent: string | null;
          user_id: string | null;
          version: string;
        };
        Insert: {
          accepted_at?: string;
          context?: string;
          document_key: string;
          email?: string | null;
          id?: string;
          ip?: string | null;
          metadata?: Json | null;
          user_agent?: string | null;
          user_id?: string | null;
          version: string;
        };
        Update: {
          accepted_at?: string;
          context?: string;
          document_key?: string;
          email?: string | null;
          id?: string;
          ip?: string | null;
          metadata?: Json | null;
          user_agent?: string | null;
          user_id?: string | null;
          version?: string;
        };
        Relationships: [];
      };
      milestones: {
        Row: {
          completed_at: string | null;
          created_at: string;
          created_by: string | null;
          department_id: string;
          description: string | null;
          due_date: string;
          id: string;
          is_complete: boolean;
          name: string;
          org_id: string;
          project_id: string;
          sort_order: number;
          updated_at: string;
          updated_by: string | null;
          version: number;
        };
        Insert: {
          completed_at?: string | null;
          created_at?: string;
          created_by?: string | null;
          department_id: string;
          description?: string | null;
          due_date: string;
          id?: string;
          is_complete?: boolean;
          name: string;
          org_id: string;
          project_id: string;
          sort_order?: number;
          updated_at?: string;
          updated_by?: string | null;
          version?: number;
        };
        Update: {
          completed_at?: string | null;
          created_at?: string;
          created_by?: string | null;
          department_id?: string;
          description?: string | null;
          due_date?: string;
          id?: string;
          is_complete?: boolean;
          name?: string;
          org_id?: string;
          project_id?: string;
          sort_order?: number;
          updated_at?: string;
          updated_by?: string | null;
          version?: number;
        };
        Relationships: [
          {
            foreignKeyName: "milestones_department_id_fkey";
            columns: ["department_id"];
            isOneToOne: false;
            referencedRelation: "departments";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "milestones_org_id_fkey";
            columns: ["org_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "milestones_project_id_fkey";
            columns: ["project_id"];
            isOneToOne: false;
            referencedRelation: "projects";
            referencedColumns: ["id"];
          },
        ];
      };
      notifications: {
        Row: {
          body: string | null;
          created_at: string;
          id: string;
          kind: string;
          link: string | null;
          org_id: string;
          read_at: string | null;
          recipient_id: string;
          title: string;
        };
        Insert: {
          body?: string | null;
          created_at?: string;
          id?: string;
          kind: string;
          link?: string | null;
          org_id: string;
          read_at?: string | null;
          recipient_id: string;
          title: string;
        };
        Update: {
          body?: string | null;
          created_at?: string;
          id?: string;
          kind?: string;
          link?: string | null;
          org_id?: string;
          read_at?: string | null;
          recipient_id?: string;
          title?: string;
        };
        Relationships: [
          {
            foreignKeyName: "notifications_org_id_fkey";
            columns: ["org_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
        ];
      };
      one_on_one_action_items: {
        Row: {
          category: string;
          created_at: string;
          department_id: string;
          description: string;
          due_by: string | null;
          id: string;
          one_on_one_id: string;
          org_id: string;
          owner: string;
          resolved_at: string | null;
          resolved_in_one_on_one_id: string | null;
          status: string;
          updated_at: string;
        };
        Insert: {
          category: string;
          created_at?: string;
          department_id: string;
          description: string;
          due_by?: string | null;
          id?: string;
          one_on_one_id: string;
          org_id: string;
          owner: string;
          resolved_at?: string | null;
          resolved_in_one_on_one_id?: string | null;
          status?: string;
          updated_at?: string;
        };
        Update: {
          category?: string;
          created_at?: string;
          department_id?: string;
          description?: string;
          due_by?: string | null;
          id?: string;
          one_on_one_id?: string;
          org_id?: string;
          owner?: string;
          resolved_at?: string | null;
          resolved_in_one_on_one_id?: string | null;
          status?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "one_on_one_action_items_department_id_fkey";
            columns: ["department_id"];
            isOneToOne: false;
            referencedRelation: "departments";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "one_on_one_action_items_one_on_one_id_fkey";
            columns: ["one_on_one_id"];
            isOneToOne: false;
            referencedRelation: "one_on_ones";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "one_on_one_action_items_org_id_fkey";
            columns: ["org_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "one_on_one_action_items_resolved_in_one_on_one_id_fkey";
            columns: ["resolved_in_one_on_one_id"];
            isOneToOne: false;
            referencedRelation: "one_on_ones";
            referencedColumns: ["id"];
          },
        ];
      };
      one_on_one_workload_changes: {
        Row: {
          actor_id: string | null;
          after_value: Json | null;
          before_value: Json | null;
          change_kind: string;
          created_at: string;
          department_id: string;
          id: string;
          one_on_one_id: string;
          org_id: string;
          rationale_category: string | null;
          source_id: string;
          source_kind: string;
        };
        Insert: {
          actor_id?: string | null;
          after_value?: Json | null;
          before_value?: Json | null;
          change_kind: string;
          created_at?: string;
          department_id: string;
          id?: string;
          one_on_one_id: string;
          org_id: string;
          rationale_category?: string | null;
          source_id: string;
          source_kind: string;
        };
        Update: {
          actor_id?: string | null;
          after_value?: Json | null;
          before_value?: Json | null;
          change_kind?: string;
          created_at?: string;
          department_id?: string;
          id?: string;
          one_on_one_id?: string;
          org_id?: string;
          rationale_category?: string | null;
          source_id?: string;
          source_kind?: string;
        };
        Relationships: [
          {
            foreignKeyName: "one_on_one_workload_changes_department_id_fkey";
            columns: ["department_id"];
            isOneToOne: false;
            referencedRelation: "departments";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "one_on_one_workload_changes_one_on_one_id_fkey";
            columns: ["one_on_one_id"];
            isOneToOne: false;
            referencedRelation: "one_on_ones";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "one_on_one_workload_changes_org_id_fkey";
            columns: ["org_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
        ];
      };
      one_on_ones: {
        Row: {
          completed_at: string | null;
          concerns: string[];
          created_at: string;
          created_by: string | null;
          deleted_at: string | null;
          department_id: string;
          id: string;
          instructor_id: string;
          manager_id: string;
          org_id: string;
          scheduled_for: string;
          sentiment: string | null;
          snapshot_at: string | null;
          snapshot_total_hours: number | null;
          snapshot_utilization_pct: number | null;
          topics: string[];
          updated_at: string;
          updated_by: string | null;
          version: number;
        };
        Insert: {
          completed_at?: string | null;
          concerns?: string[];
          created_at?: string;
          created_by?: string | null;
          deleted_at?: string | null;
          department_id: string;
          id?: string;
          instructor_id: string;
          manager_id: string;
          org_id: string;
          scheduled_for?: string;
          sentiment?: string | null;
          snapshot_at?: string | null;
          snapshot_total_hours?: number | null;
          snapshot_utilization_pct?: number | null;
          topics?: string[];
          updated_at?: string;
          updated_by?: string | null;
          version?: number;
        };
        Update: {
          completed_at?: string | null;
          concerns?: string[];
          created_at?: string;
          created_by?: string | null;
          deleted_at?: string | null;
          department_id?: string;
          id?: string;
          instructor_id?: string;
          manager_id?: string;
          org_id?: string;
          scheduled_for?: string;
          sentiment?: string | null;
          snapshot_at?: string | null;
          snapshot_total_hours?: number | null;
          snapshot_utilization_pct?: number | null;
          topics?: string[];
          updated_at?: string;
          updated_by?: string | null;
          version?: number;
        };
        Relationships: [
          {
            foreignKeyName: "one_on_ones_department_id_fkey";
            columns: ["department_id"];
            isOneToOne: false;
            referencedRelation: "departments";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "one_on_ones_instructor_id_fkey";
            columns: ["instructor_id"];
            isOneToOne: false;
            referencedRelation: "instructors";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "one_on_ones_instructor_id_fkey";
            columns: ["instructor_id"];
            isOneToOne: false;
            referencedRelation: "v_instructor_capacity";
            referencedColumns: ["instructor_id"];
          },
          {
            foreignKeyName: "one_on_ones_org_id_fkey";
            columns: ["org_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
        ];
      };
      org_invitations: {
        Row: {
          accepted_at: string | null;
          created_at: string;
          created_by: string | null;
          email: string;
          expires_at: string;
          id: string;
          org_id: string;
          role: string;
          token: string;
          visibility: string;
        };
        Insert: {
          accepted_at?: string | null;
          created_at?: string;
          created_by?: string | null;
          email: string;
          expires_at?: string;
          id?: string;
          org_id: string;
          role?: string;
          token?: string;
          visibility?: string;
        };
        Update: {
          accepted_at?: string | null;
          created_at?: string;
          created_by?: string | null;
          email?: string;
          expires_at?: string;
          id?: string;
          org_id?: string;
          role?: string;
          token?: string;
          visibility?: string;
        };
        Relationships: [
          {
            foreignKeyName: "org_invitations_org_id_fkey";
            columns: ["org_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
        ];
      };
      org_memberships: {
        Row: {
          accepted_at: string | null;
          created_at: string;
          display_name: string | null;
          id: string;
          invited_at: string | null;
          org_id: string;
          role: string;
          updated_at: string;
          user_id: string;
          visibility: string;
        };
        Insert: {
          accepted_at?: string | null;
          created_at?: string;
          display_name?: string | null;
          id?: string;
          invited_at?: string | null;
          org_id: string;
          role?: string;
          updated_at?: string;
          user_id: string;
          visibility?: string;
        };
        Update: {
          accepted_at?: string | null;
          created_at?: string;
          display_name?: string | null;
          id?: string;
          invited_at?: string | null;
          org_id?: string;
          role?: string;
          updated_at?: string;
          user_id?: string;
          visibility?: string;
        };
        Relationships: [
          {
            foreignKeyName: "org_memberships_org_id_fkey";
            columns: ["org_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
        ];
      };
      organizations: {
        Row: {
          agency_id: string | null;
          audit_log_retention_days: number | null;
          billing_tier: string | null;
          created_at: string;
          created_by: string | null;
          entity_labels: Json;
          id: string;
          logo_url: string | null;
          name: string;
          onboarded_at: string | null;
          preset_key: Database["public"]["Enums"]["workspace_preset_key"];
          role_labels: Json;
          settings: Json;
          slug: string;
          suspended_at: string | null;
          suspended_reason: string | null;
          time_zone: string;
          updated_at: string;
          updated_by: string | null;
          version: number;
        };
        Insert: {
          agency_id?: string | null;
          audit_log_retention_days?: number | null;
          billing_tier?: string | null;
          created_at?: string;
          created_by?: string | null;
          entity_labels?: Json;
          id?: string;
          logo_url?: string | null;
          name: string;
          onboarded_at?: string | null;
          preset_key?: Database["public"]["Enums"]["workspace_preset_key"];
          role_labels?: Json;
          settings?: Json;
          slug: string;
          suspended_at?: string | null;
          suspended_reason?: string | null;
          time_zone?: string;
          updated_at?: string;
          updated_by?: string | null;
          version?: number;
        };
        Update: {
          agency_id?: string | null;
          audit_log_retention_days?: number | null;
          billing_tier?: string | null;
          created_at?: string;
          created_by?: string | null;
          entity_labels?: Json;
          id?: string;
          logo_url?: string | null;
          name?: string;
          onboarded_at?: string | null;
          preset_key?: Database["public"]["Enums"]["workspace_preset_key"];
          role_labels?: Json;
          settings?: Json;
          slug?: string;
          suspended_at?: string | null;
          suspended_reason?: string | null;
          time_zone?: string;
          updated_at?: string;
          updated_by?: string | null;
          version?: number;
        };
        Relationships: [
          {
            foreignKeyName: "organizations_agency_id_fkey";
            columns: ["agency_id"];
            isOneToOne: false;
            referencedRelation: "agencies";
            referencedColumns: ["id"];
          },
        ];
      };
      project_team_members: {
        Row: {
          allocated_hours: number;
          created_at: string;
          created_by: string | null;
          department_id: string;
          id: string;
          instructor_id: string;
          org_id: string;
          project_id: string;
          role: string;
          updated_at: string;
          updated_by: string | null;
          version: number;
        };
        Insert: {
          allocated_hours?: number;
          created_at?: string;
          created_by?: string | null;
          department_id: string;
          id?: string;
          instructor_id: string;
          org_id: string;
          project_id: string;
          role?: string;
          updated_at?: string;
          updated_by?: string | null;
          version?: number;
        };
        Update: {
          allocated_hours?: number;
          created_at?: string;
          created_by?: string | null;
          department_id?: string;
          id?: string;
          instructor_id?: string;
          org_id?: string;
          project_id?: string;
          role?: string;
          updated_at?: string;
          updated_by?: string | null;
          version?: number;
        };
        Relationships: [
          {
            foreignKeyName: "project_team_members_department_id_fkey";
            columns: ["department_id"];
            isOneToOne: false;
            referencedRelation: "departments";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "project_team_members_instructor_id_fkey";
            columns: ["instructor_id"];
            isOneToOne: false;
            referencedRelation: "instructors";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "project_team_members_instructor_id_fkey";
            columns: ["instructor_id"];
            isOneToOne: false;
            referencedRelation: "v_instructor_capacity";
            referencedColumns: ["instructor_id"];
          },
          {
            foreignKeyName: "project_team_members_org_id_fkey";
            columns: ["org_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "project_team_members_project_id_fkey";
            columns: ["project_id"];
            isOneToOne: false;
            referencedRelation: "projects";
            referencedColumns: ["id"];
          },
        ];
      };
      projects: {
        Row: {
          bucket_id: string | null;
          created_at: string;
          created_by: string | null;
          deleted_at: string | null;
          department_id: string;
          description: string | null;
          end_date: string | null;
          id: string;
          name: string;
          org_id: string;
          priority: string;
          public_share_token: string | null;
          source_tra_id: string | null;
          start_date: string | null;
          status: string;
          total_estimated_hours: number | null;
          updated_at: string;
          updated_by: string | null;
          version: number;
        };
        Insert: {
          bucket_id?: string | null;
          created_at?: string;
          created_by?: string | null;
          deleted_at?: string | null;
          department_id: string;
          description?: string | null;
          end_date?: string | null;
          id?: string;
          name: string;
          org_id: string;
          priority?: string;
          public_share_token?: string | null;
          source_tra_id?: string | null;
          start_date?: string | null;
          status?: string;
          total_estimated_hours?: number | null;
          updated_at?: string;
          updated_by?: string | null;
          version?: number;
        };
        Update: {
          bucket_id?: string | null;
          created_at?: string;
          created_by?: string | null;
          deleted_at?: string | null;
          department_id?: string;
          description?: string | null;
          end_date?: string | null;
          id?: string;
          name?: string;
          org_id?: string;
          priority?: string;
          public_share_token?: string | null;
          source_tra_id?: string | null;
          start_date?: string | null;
          status?: string;
          total_estimated_hours?: number | null;
          updated_at?: string;
          updated_by?: string | null;
          version?: number;
        };
        Relationships: [
          {
            foreignKeyName: "projects_bucket_id_fkey";
            columns: ["bucket_id"];
            isOneToOne: false;
            referencedRelation: "allocation_buckets";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "projects_department_id_fkey";
            columns: ["department_id"];
            isOneToOne: false;
            referencedRelation: "departments";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "projects_org_id_fkey";
            columns: ["org_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "projects_source_tra_id_fkey";
            columns: ["source_tra_id"];
            isOneToOne: false;
            referencedRelation: "tras";
            referencedColumns: ["id"];
          },
        ];
      };
      public_intake_links: {
        Row: {
          created_at: string;
          created_by: string | null;
          department_id: string;
          expires_at: string | null;
          id: string;
          is_active: boolean;
          label: string | null;
          org_id: string;
          token: string;
        };
        Insert: {
          created_at?: string;
          created_by?: string | null;
          department_id: string;
          expires_at?: string | null;
          id?: string;
          is_active?: boolean;
          label?: string | null;
          org_id: string;
          token?: string;
        };
        Update: {
          created_at?: string;
          created_by?: string | null;
          department_id?: string;
          expires_at?: string | null;
          id?: string;
          is_active?: boolean;
          label?: string | null;
          org_id?: string;
          token?: string;
        };
        Relationships: [
          {
            foreignKeyName: "public_intake_links_department_id_fkey";
            columns: ["department_id"];
            isOneToOne: false;
            referencedRelation: "departments";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "public_intake_links_org_id_fkey";
            columns: ["org_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
        ];
      };
      recurring_task_assignments: {
        Row: {
          created_at: string;
          department_id: string;
          instructor_id: string;
          org_id: string;
          recurring_task_id: string;
          share_percent: number;
        };
        Insert: {
          created_at?: string;
          department_id: string;
          instructor_id: string;
          org_id: string;
          recurring_task_id: string;
          share_percent?: number;
        };
        Update: {
          created_at?: string;
          department_id?: string;
          instructor_id?: string;
          org_id?: string;
          recurring_task_id?: string;
          share_percent?: number;
        };
        Relationships: [
          {
            foreignKeyName: "recurring_task_assignments_department_id_fkey";
            columns: ["department_id"];
            isOneToOne: false;
            referencedRelation: "departments";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "recurring_task_assignments_instructor_id_fkey";
            columns: ["instructor_id"];
            isOneToOne: false;
            referencedRelation: "instructors";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "recurring_task_assignments_instructor_id_fkey";
            columns: ["instructor_id"];
            isOneToOne: false;
            referencedRelation: "v_instructor_capacity";
            referencedColumns: ["instructor_id"];
          },
          {
            foreignKeyName: "recurring_task_assignments_org_id_fkey";
            columns: ["org_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "recurring_task_assignments_recurring_task_id_fkey";
            columns: ["recurring_task_id"];
            isOneToOne: false;
            referencedRelation: "recurring_tasks";
            referencedColumns: ["id"];
          },
        ];
      };
      recurring_tasks: {
        Row: {
          bucket_id: string | null;
          created_at: string;
          created_by: string | null;
          deleted_at: string | null;
          department_id: string;
          description: string | null;
          frequency: string;
          hours_per_occurrence: number;
          id: string;
          name: string;
          occurrences_per_year: number | null;
          org_id: string;
          status: string;
          updated_at: string;
          updated_by: string | null;
        };
        Insert: {
          bucket_id?: string | null;
          created_at?: string;
          created_by?: string | null;
          deleted_at?: string | null;
          department_id: string;
          description?: string | null;
          frequency: string;
          hours_per_occurrence: number;
          id?: string;
          name: string;
          occurrences_per_year?: number | null;
          org_id: string;
          status?: string;
          updated_at?: string;
          updated_by?: string | null;
        };
        Update: {
          bucket_id?: string | null;
          created_at?: string;
          created_by?: string | null;
          deleted_at?: string | null;
          department_id?: string;
          description?: string | null;
          frequency?: string;
          hours_per_occurrence?: number;
          id?: string;
          name?: string;
          occurrences_per_year?: number | null;
          org_id?: string;
          status?: string;
          updated_at?: string;
          updated_by?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "recurring_tasks_bucket_id_fkey";
            columns: ["bucket_id"];
            isOneToOne: false;
            referencedRelation: "allocation_buckets";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "recurring_tasks_department_id_fkey";
            columns: ["department_id"];
            isOneToOne: false;
            referencedRelation: "departments";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "recurring_tasks_org_id_fkey";
            columns: ["org_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
        ];
      };
      report_runs: {
        Row: {
          department_id: string;
          duration_ms: number | null;
          filters: Json;
          format: string;
          id: string;
          org_id: string;
          ran_at: string;
          ran_by: string | null;
          row_count: number | null;
          saved_report_id: string | null;
          slug: string;
        };
        Insert: {
          department_id: string;
          duration_ms?: number | null;
          filters?: Json;
          format: string;
          id?: string;
          org_id: string;
          ran_at?: string;
          ran_by?: string | null;
          row_count?: number | null;
          saved_report_id?: string | null;
          slug: string;
        };
        Update: {
          department_id?: string;
          duration_ms?: number | null;
          filters?: Json;
          format?: string;
          id?: string;
          org_id?: string;
          ran_at?: string;
          ran_by?: string | null;
          row_count?: number | null;
          saved_report_id?: string | null;
          slug?: string;
        };
        Relationships: [
          {
            foreignKeyName: "report_runs_department_id_fkey";
            columns: ["department_id"];
            isOneToOne: false;
            referencedRelation: "departments";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "report_runs_org_id_fkey";
            columns: ["org_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "report_runs_saved_report_id_fkey";
            columns: ["saved_report_id"];
            isOneToOne: false;
            referencedRelation: "saved_reports";
            referencedColumns: ["id"];
          },
        ];
      };
      saved_reports: {
        Row: {
          created_at: string;
          created_by: string | null;
          department_id: string;
          description: string | null;
          filters: Json;
          id: string;
          last_run_at: string | null;
          name: string;
          org_id: string;
          org_visibility: boolean;
          schedule_cron: string | null;
          slug: string;
          updated_at: string;
          updated_by: string | null;
          version: number;
        };
        Insert: {
          created_at?: string;
          created_by?: string | null;
          department_id: string;
          description?: string | null;
          filters?: Json;
          id?: string;
          last_run_at?: string | null;
          name: string;
          org_id: string;
          org_visibility?: boolean;
          schedule_cron?: string | null;
          slug: string;
          updated_at?: string;
          updated_by?: string | null;
          version?: number;
        };
        Update: {
          created_at?: string;
          created_by?: string | null;
          department_id?: string;
          description?: string | null;
          filters?: Json;
          id?: string;
          last_run_at?: string | null;
          name?: string;
          org_id?: string;
          org_visibility?: boolean;
          schedule_cron?: string | null;
          slug?: string;
          updated_at?: string;
          updated_by?: string | null;
          version?: number;
        };
        Relationships: [
          {
            foreignKeyName: "saved_reports_department_id_fkey";
            columns: ["department_id"];
            isOneToOne: false;
            referencedRelation: "departments";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "saved_reports_org_id_fkey";
            columns: ["org_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
        ];
      };
      sketchpad_rooms: {
        Row: {
          capacity: number | null;
          created_at: string;
          id: string;
          name: string;
          org_id: string;
          position: number;
          schedule_id: string;
          updated_at: string;
        };
        Insert: {
          capacity?: number | null;
          created_at?: string;
          id?: string;
          name: string;
          org_id: string;
          position?: number;
          schedule_id: string;
          updated_at?: string;
        };
        Update: {
          capacity?: number | null;
          created_at?: string;
          id?: string;
          name?: string;
          org_id?: string;
          position?: number;
          schedule_id?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "sketchpad_rooms_org_id_fkey";
            columns: ["org_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "sketchpad_rooms_schedule_id_fkey";
            columns: ["schedule_id"];
            isOneToOne: false;
            referencedRelation: "sketchpad_schedules";
            referencedColumns: ["id"];
          },
        ];
      };
      sketchpad_schedules: {
        Row: {
          created_at: string;
          created_by: string | null;
          day_count: number;
          deleted_at: string | null;
          department_id: string;
          hours_end: number;
          hours_start: number;
          id: string;
          name: string;
          notes: string | null;
          org_id: string;
          slot_minutes: number;
          start_date: string;
          updated_at: string;
          updated_by: string | null;
          version: number;
        };
        Insert: {
          created_at?: string;
          created_by?: string | null;
          day_count?: number;
          deleted_at?: string | null;
          department_id: string;
          hours_end?: number;
          hours_start?: number;
          id?: string;
          name: string;
          notes?: string | null;
          org_id: string;
          slot_minutes?: number;
          start_date?: string;
          updated_at?: string;
          updated_by?: string | null;
          version?: number;
        };
        Update: {
          created_at?: string;
          created_by?: string | null;
          day_count?: number;
          deleted_at?: string | null;
          department_id?: string;
          hours_end?: number;
          hours_start?: number;
          id?: string;
          name?: string;
          notes?: string | null;
          org_id?: string;
          slot_minutes?: number;
          start_date?: string;
          updated_at?: string;
          updated_by?: string | null;
          version?: number;
        };
        Relationships: [
          {
            foreignKeyName: "sketchpad_schedules_department_id_fkey";
            columns: ["department_id"];
            isOneToOne: false;
            referencedRelation: "departments";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "sketchpad_schedules_org_id_fkey";
            columns: ["org_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
        ];
      };
      sketchpad_sessions: {
        Row: {
          class_name: string;
          color: string | null;
          created_at: string;
          ends_at: string;
          group_id: string | null;
          id: string;
          learner_count: number | null;
          notes: string | null;
          org_id: string;
          room_id: string | null;
          schedule_id: string;
          starts_at: string;
          trainer_name: string;
          updated_at: string;
        };
        Insert: {
          class_name: string;
          color?: string | null;
          created_at?: string;
          ends_at: string;
          group_id?: string | null;
          id?: string;
          learner_count?: number | null;
          notes?: string | null;
          org_id: string;
          room_id?: string | null;
          schedule_id: string;
          starts_at: string;
          trainer_name: string;
          updated_at?: string;
        };
        Update: {
          class_name?: string;
          color?: string | null;
          created_at?: string;
          ends_at?: string;
          group_id?: string | null;
          id?: string;
          learner_count?: number | null;
          notes?: string | null;
          org_id?: string;
          room_id?: string | null;
          schedule_id?: string;
          starts_at?: string;
          trainer_name?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "sketchpad_sessions_org_id_fkey";
            columns: ["org_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "sketchpad_sessions_room_id_fkey";
            columns: ["room_id"];
            isOneToOne: false;
            referencedRelation: "sketchpad_rooms";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "sketchpad_sessions_schedule_id_fkey";
            columns: ["schedule_id"];
            isOneToOne: false;
            referencedRelation: "sketchpad_schedules";
            referencedColumns: ["id"];
          },
        ];
      };
      skills: {
        Row: {
          category: string | null;
          certifying_authority: string | null;
          created_at: string;
          created_by: string | null;
          department_id: string;
          description: string | null;
          id: string;
          is_archived: boolean;
          is_certification: boolean;
          name: string;
          org_id: string;
          updated_at: string;
          updated_by: string | null;
        };
        Insert: {
          category?: string | null;
          certifying_authority?: string | null;
          created_at?: string;
          created_by?: string | null;
          department_id: string;
          description?: string | null;
          id?: string;
          is_archived?: boolean;
          is_certification?: boolean;
          name: string;
          org_id: string;
          updated_at?: string;
          updated_by?: string | null;
        };
        Update: {
          category?: string | null;
          certifying_authority?: string | null;
          created_at?: string;
          created_by?: string | null;
          department_id?: string;
          description?: string | null;
          id?: string;
          is_archived?: boolean;
          is_certification?: boolean;
          name?: string;
          org_id?: string;
          updated_at?: string;
          updated_by?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "skills_department_id_fkey";
            columns: ["department_id"];
            isOneToOne: false;
            referencedRelation: "departments";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "skills_org_id_fkey";
            columns: ["org_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
        ];
      };
      sso_configs: {
        Row: {
          created_at: string;
          created_by: string | null;
          display_name: string | null;
          email_domain: string;
          enabled: boolean;
          id: string;
          org_id: string;
          supabase_provider_id: string | null;
          updated_at: string;
        };
        Insert: {
          created_at?: string;
          created_by?: string | null;
          display_name?: string | null;
          email_domain: string;
          enabled?: boolean;
          id?: string;
          org_id: string;
          supabase_provider_id?: string | null;
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          created_by?: string | null;
          display_name?: string | null;
          email_domain?: string;
          enabled?: boolean;
          id?: string;
          org_id?: string;
          supabase_provider_id?: string | null;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "sso_configs_org_id_fkey";
            columns: ["org_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
        ];
      };
      status_incident_updates: {
        Row: {
          body: string;
          created_at: string;
          created_by: string | null;
          id: string;
          incident_id: string;
          status: string;
        };
        Insert: {
          body: string;
          created_at?: string;
          created_by?: string | null;
          id?: string;
          incident_id: string;
          status: string;
        };
        Update: {
          body?: string;
          created_at?: string;
          created_by?: string | null;
          id?: string;
          incident_id?: string;
          status?: string;
        };
        Relationships: [
          {
            foreignKeyName: "status_incident_updates_incident_id_fkey";
            columns: ["incident_id"];
            isOneToOne: false;
            referencedRelation: "status_incidents";
            referencedColumns: ["id"];
          },
        ];
      };
      status_incidents: {
        Row: {
          body: string | null;
          created_at: string;
          created_by: string | null;
          id: string;
          resolved_at: string | null;
          severity: string;
          started_at: string;
          status: string;
          title: string;
          updated_at: string;
        };
        Insert: {
          body?: string | null;
          created_at?: string;
          created_by?: string | null;
          id?: string;
          resolved_at?: string | null;
          severity?: string;
          started_at?: string;
          status?: string;
          title: string;
          updated_at?: string;
        };
        Update: {
          body?: string | null;
          created_at?: string;
          created_by?: string | null;
          id?: string;
          resolved_at?: string | null;
          severity?: string;
          started_at?: string;
          status?: string;
          title?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      support_ticket_messages: {
        Row: {
          author_id: string | null;
          author_kind: string;
          body: string;
          created_at: string;
          id: string;
          org_id: string;
          ticket_id: string;
        };
        Insert: {
          author_id?: string | null;
          author_kind: string;
          body: string;
          created_at?: string;
          id?: string;
          org_id: string;
          ticket_id: string;
        };
        Update: {
          author_id?: string | null;
          author_kind?: string;
          body?: string;
          created_at?: string;
          id?: string;
          org_id?: string;
          ticket_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "support_ticket_messages_org_id_fkey";
            columns: ["org_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "support_ticket_messages_ticket_id_fkey";
            columns: ["ticket_id"];
            isOneToOne: false;
            referencedRelation: "support_tickets";
            referencedColumns: ["id"];
          },
        ];
      };
      support_tickets: {
        Row: {
          category: string;
          created_at: string;
          created_by: string | null;
          description: string;
          id: string;
          last_message_at: string;
          last_message_by: string;
          org_id: string;
          priority: string;
          status: string;
          subject: string;
          unread_for_admin: boolean;
          unread_for_user: boolean;
          updated_at: string;
          updated_by: string | null;
          user_id: string;
          version: number;
        };
        Insert: {
          category?: string;
          created_at?: string;
          created_by?: string | null;
          description: string;
          id?: string;
          last_message_at?: string;
          last_message_by?: string;
          org_id: string;
          priority?: string;
          status?: string;
          subject: string;
          unread_for_admin?: boolean;
          unread_for_user?: boolean;
          updated_at?: string;
          updated_by?: string | null;
          user_id: string;
          version?: number;
        };
        Update: {
          category?: string;
          created_at?: string;
          created_by?: string | null;
          description?: string;
          id?: string;
          last_message_at?: string;
          last_message_by?: string;
          org_id?: string;
          priority?: string;
          status?: string;
          subject?: string;
          unread_for_admin?: boolean;
          unread_for_user?: boolean;
          updated_at?: string;
          updated_by?: string | null;
          user_id?: string;
          version?: number;
        };
        Relationships: [
          {
            foreignKeyName: "support_tickets_org_id_fkey";
            columns: ["org_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
        ];
      };
      task_action_items: {
        Row: {
          assigned_to_team_member_id: string | null;
          completed_at: string | null;
          created_at: string;
          created_by: string | null;
          department_id: string;
          description: string;
          due_date: string | null;
          id: string;
          is_complete: boolean;
          org_id: string;
          sort_order: number;
          task_id: string;
          updated_at: string;
          updated_by: string | null;
          version: number;
        };
        Insert: {
          assigned_to_team_member_id?: string | null;
          completed_at?: string | null;
          created_at?: string;
          created_by?: string | null;
          department_id: string;
          description: string;
          due_date?: string | null;
          id?: string;
          is_complete?: boolean;
          org_id: string;
          sort_order?: number;
          task_id: string;
          updated_at?: string;
          updated_by?: string | null;
          version?: number;
        };
        Update: {
          assigned_to_team_member_id?: string | null;
          completed_at?: string | null;
          created_at?: string;
          created_by?: string | null;
          department_id?: string;
          description?: string;
          due_date?: string | null;
          id?: string;
          is_complete?: boolean;
          org_id?: string;
          sort_order?: number;
          task_id?: string;
          updated_at?: string;
          updated_by?: string | null;
          version?: number;
        };
        Relationships: [
          {
            foreignKeyName: "task_action_items_assigned_to_team_member_id_fkey";
            columns: ["assigned_to_team_member_id"];
            isOneToOne: false;
            referencedRelation: "project_team_members";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "task_action_items_assigned_to_team_member_id_fkey";
            columns: ["assigned_to_team_member_id"];
            isOneToOne: false;
            referencedRelation: "v_public_project_team";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "task_action_items_department_id_fkey";
            columns: ["department_id"];
            isOneToOne: false;
            referencedRelation: "departments";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "task_action_items_org_id_fkey";
            columns: ["org_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "task_action_items_task_id_fkey";
            columns: ["task_id"];
            isOneToOne: false;
            referencedRelation: "tasks";
            referencedColumns: ["id"];
          },
        ];
      };
      task_assignments: {
        Row: {
          allocated_hours: number;
          created_at: string;
          created_by: string | null;
          department_id: string;
          id: string;
          org_id: string;
          project_team_member_id: string;
          task_id: string;
          updated_at: string;
          updated_by: string | null;
        };
        Insert: {
          allocated_hours?: number;
          created_at?: string;
          created_by?: string | null;
          department_id: string;
          id?: string;
          org_id: string;
          project_team_member_id: string;
          task_id: string;
          updated_at?: string;
          updated_by?: string | null;
        };
        Update: {
          allocated_hours?: number;
          created_at?: string;
          created_by?: string | null;
          department_id?: string;
          id?: string;
          org_id?: string;
          project_team_member_id?: string;
          task_id?: string;
          updated_at?: string;
          updated_by?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "task_assignments_department_id_fkey";
            columns: ["department_id"];
            isOneToOne: false;
            referencedRelation: "departments";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "task_assignments_org_id_fkey";
            columns: ["org_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "task_assignments_project_team_member_id_fkey";
            columns: ["project_team_member_id"];
            isOneToOne: false;
            referencedRelation: "project_team_members";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "task_assignments_project_team_member_id_fkey";
            columns: ["project_team_member_id"];
            isOneToOne: false;
            referencedRelation: "v_public_project_team";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "task_assignments_task_id_fkey";
            columns: ["task_id"];
            isOneToOne: false;
            referencedRelation: "tasks";
            referencedColumns: ["id"];
          },
        ];
      };
      task_dependencies: {
        Row: {
          created_at: string;
          created_by: string | null;
          dep_type: string;
          department_id: string;
          id: string;
          lag_days: number;
          org_id: string;
          predecessor_id: string;
          successor_id: string;
          updated_at: string;
          updated_by: string | null;
        };
        Insert: {
          created_at?: string;
          created_by?: string | null;
          dep_type?: string;
          department_id: string;
          id?: string;
          lag_days?: number;
          org_id: string;
          predecessor_id: string;
          successor_id: string;
          updated_at?: string;
          updated_by?: string | null;
        };
        Update: {
          created_at?: string;
          created_by?: string | null;
          dep_type?: string;
          department_id?: string;
          id?: string;
          lag_days?: number;
          org_id?: string;
          predecessor_id?: string;
          successor_id?: string;
          updated_at?: string;
          updated_by?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "task_dependencies_department_id_fkey";
            columns: ["department_id"];
            isOneToOne: false;
            referencedRelation: "departments";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "task_dependencies_org_id_fkey";
            columns: ["org_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "task_dependencies_predecessor_id_fkey";
            columns: ["predecessor_id"];
            isOneToOne: false;
            referencedRelation: "tasks";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "task_dependencies_successor_id_fkey";
            columns: ["successor_id"];
            isOneToOne: false;
            referencedRelation: "tasks";
            referencedColumns: ["id"];
          },
        ];
      };
      tasks: {
        Row: {
          actual_hours: number | null;
          created_at: string;
          created_by: string | null;
          department_id: string;
          description: string | null;
          end_date: string | null;
          estimated_hours: number | null;
          id: string;
          milestone_id: string | null;
          name: string;
          org_id: string;
          percent_complete: number;
          priority: string;
          project_id: string;
          sort_order: number;
          start_date: string | null;
          status: string;
          updated_at: string;
          updated_by: string | null;
          version: number;
        };
        Insert: {
          actual_hours?: number | null;
          created_at?: string;
          created_by?: string | null;
          department_id: string;
          description?: string | null;
          end_date?: string | null;
          estimated_hours?: number | null;
          id?: string;
          milestone_id?: string | null;
          name: string;
          org_id: string;
          percent_complete?: number;
          priority?: string;
          project_id: string;
          sort_order?: number;
          start_date?: string | null;
          status?: string;
          updated_at?: string;
          updated_by?: string | null;
          version?: number;
        };
        Update: {
          actual_hours?: number | null;
          created_at?: string;
          created_by?: string | null;
          department_id?: string;
          description?: string | null;
          end_date?: string | null;
          estimated_hours?: number | null;
          id?: string;
          milestone_id?: string | null;
          name?: string;
          org_id?: string;
          percent_complete?: number;
          priority?: string;
          project_id?: string;
          sort_order?: number;
          start_date?: string | null;
          status?: string;
          updated_at?: string;
          updated_by?: string | null;
          version?: number;
        };
        Relationships: [
          {
            foreignKeyName: "tasks_department_id_fkey";
            columns: ["department_id"];
            isOneToOne: false;
            referencedRelation: "departments";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "tasks_milestone_id_fkey";
            columns: ["milestone_id"];
            isOneToOne: false;
            referencedRelation: "milestones";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "tasks_org_id_fkey";
            columns: ["org_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "tasks_project_id_fkey";
            columns: ["project_id"];
            isOneToOne: false;
            referencedRelation: "projects";
            referencedColumns: ["id"];
          },
        ];
      };
      tra_approvals: {
        Row: {
          approval_type: string;
          created_at: string;
          department_id: string;
          id: string;
          name: string | null;
          org_id: string;
          signed_at: string | null;
          tra_id: string;
          updated_at: string;
        };
        Insert: {
          approval_type: string;
          created_at?: string;
          department_id: string;
          id?: string;
          name?: string | null;
          org_id: string;
          signed_at?: string | null;
          tra_id: string;
          updated_at?: string;
        };
        Update: {
          approval_type?: string;
          created_at?: string;
          department_id?: string;
          id?: string;
          name?: string | null;
          org_id?: string;
          signed_at?: string | null;
          tra_id?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "tra_approvals_department_id_fkey";
            columns: ["department_id"];
            isOneToOne: false;
            referencedRelation: "departments";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "tra_approvals_org_id_fkey";
            columns: ["org_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "tra_approvals_tra_id_fkey";
            columns: ["tra_id"];
            isOneToOne: false;
            referencedRelation: "tras";
            referencedColumns: ["id"];
          },
        ];
      };
      tra_audience_roles: {
        Row: {
          created_at: string;
          department_id: string;
          headcount: number | null;
          id: string;
          org_id: string;
          position: number;
          role: string | null;
          tra_id: string;
          updated_at: string;
        };
        Insert: {
          created_at?: string;
          department_id: string;
          headcount?: number | null;
          id?: string;
          org_id: string;
          position?: number;
          role?: string | null;
          tra_id: string;
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          department_id?: string;
          headcount?: number | null;
          id?: string;
          org_id?: string;
          position?: number;
          role?: string | null;
          tra_id?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "tra_audience_roles_department_id_fkey";
            columns: ["department_id"];
            isOneToOne: false;
            referencedRelation: "departments";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "tra_audience_roles_org_id_fkey";
            columns: ["org_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "tra_audience_roles_tra_id_fkey";
            columns: ["tra_id"];
            isOneToOne: false;
            referencedRelation: "tras";
            referencedColumns: ["id"];
          },
        ];
      };
      tra_deliverables: {
        Row: {
          complexity_multiplier: number;
          created_at: string;
          created_by: string | null;
          deliverable_type_id: string;
          department_id: string;
          estimated_hours: number;
          id: string;
          name: string;
          notes: string | null;
          org_id: string;
          quantity: number;
          seat_time_hours: number;
          tra_id: string;
          updated_at: string;
          updated_by: string | null;
        };
        Insert: {
          complexity_multiplier?: number;
          created_at?: string;
          created_by?: string | null;
          deliverable_type_id: string;
          department_id: string;
          estimated_hours?: number;
          id?: string;
          name: string;
          notes?: string | null;
          org_id: string;
          quantity?: number;
          seat_time_hours: number;
          tra_id: string;
          updated_at?: string;
          updated_by?: string | null;
        };
        Update: {
          complexity_multiplier?: number;
          created_at?: string;
          created_by?: string | null;
          deliverable_type_id?: string;
          department_id?: string;
          estimated_hours?: number;
          id?: string;
          name?: string;
          notes?: string | null;
          org_id?: string;
          quantity?: number;
          seat_time_hours?: number;
          tra_id?: string;
          updated_at?: string;
          updated_by?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "tra_deliverables_deliverable_type_id_fkey";
            columns: ["deliverable_type_id"];
            isOneToOne: false;
            referencedRelation: "deliverable_types";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "tra_deliverables_department_id_fkey";
            columns: ["department_id"];
            isOneToOne: false;
            referencedRelation: "departments";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "tra_deliverables_org_id_fkey";
            columns: ["org_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "tra_deliverables_tra_id_fkey";
            columns: ["tra_id"];
            isOneToOne: false;
            referencedRelation: "tras";
            referencedColumns: ["id"];
          },
        ];
      };
      tra_evaluation_plan: {
        Row: {
          created_at: string;
          department_id: string;
          id: string;
          kirkpatrick_level: number;
          measurement_method: string | null;
          org_id: string;
          tra_id: string;
          updated_at: string;
        };
        Insert: {
          created_at?: string;
          department_id: string;
          id?: string;
          kirkpatrick_level: number;
          measurement_method?: string | null;
          org_id: string;
          tra_id: string;
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          department_id?: string;
          id?: string;
          kirkpatrick_level?: number;
          measurement_method?: string | null;
          org_id?: string;
          tra_id?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "tra_evaluation_plan_department_id_fkey";
            columns: ["department_id"];
            isOneToOne: false;
            referencedRelation: "departments";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "tra_evaluation_plan_org_id_fkey";
            columns: ["org_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "tra_evaluation_plan_tra_id_fkey";
            columns: ["tra_id"];
            isOneToOne: false;
            referencedRelation: "tras";
            referencedColumns: ["id"];
          },
        ];
      };
      tra_kpis: {
        Row: {
          baseline: string | null;
          created_at: string;
          department_id: string;
          id: string;
          metric: string | null;
          org_id: string;
          position: number;
          target: string | null;
          tra_id: string;
          updated_at: string;
        };
        Insert: {
          baseline?: string | null;
          created_at?: string;
          department_id: string;
          id?: string;
          metric?: string | null;
          org_id: string;
          position?: number;
          target?: string | null;
          tra_id: string;
          updated_at?: string;
        };
        Update: {
          baseline?: string | null;
          created_at?: string;
          department_id?: string;
          id?: string;
          metric?: string | null;
          org_id?: string;
          position?: number;
          target?: string | null;
          tra_id?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "tra_kpis_department_id_fkey";
            columns: ["department_id"];
            isOneToOne: false;
            referencedRelation: "departments";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "tra_kpis_org_id_fkey";
            columns: ["org_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "tra_kpis_tra_id_fkey";
            columns: ["tra_id"];
            isOneToOne: false;
            referencedRelation: "tras";
            referencedColumns: ["id"];
          },
        ];
      };
      tra_objectives: {
        Row: {
          created_at: string;
          department_id: string;
          id: string;
          org_id: string;
          position: number;
          text: string | null;
          tra_id: string;
          updated_at: string;
        };
        Insert: {
          created_at?: string;
          department_id: string;
          id?: string;
          org_id: string;
          position?: number;
          text?: string | null;
          tra_id: string;
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          department_id?: string;
          id?: string;
          org_id?: string;
          position?: number;
          text?: string | null;
          tra_id?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "tra_objectives_department_id_fkey";
            columns: ["department_id"];
            isOneToOne: false;
            referencedRelation: "departments";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "tra_objectives_org_id_fkey";
            columns: ["org_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "tra_objectives_tra_id_fkey";
            columns: ["tra_id"];
            isOneToOne: false;
            referencedRelation: "tras";
            referencedColumns: ["id"];
          },
        ];
      };
      tra_smes: {
        Row: {
          availability_hours: number | null;
          created_at: string;
          department_id: string;
          email: string | null;
          id: string;
          name: string | null;
          org_id: string;
          position: number;
          tra_id: string;
          updated_at: string;
        };
        Insert: {
          availability_hours?: number | null;
          created_at?: string;
          department_id: string;
          email?: string | null;
          id?: string;
          name?: string | null;
          org_id: string;
          position?: number;
          tra_id: string;
          updated_at?: string;
        };
        Update: {
          availability_hours?: number | null;
          created_at?: string;
          department_id?: string;
          email?: string | null;
          id?: string;
          name?: string | null;
          org_id?: string;
          position?: number;
          tra_id?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "tra_smes_department_id_fkey";
            columns: ["department_id"];
            isOneToOne: false;
            referencedRelation: "departments";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "tra_smes_org_id_fkey";
            columns: ["org_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "tra_smes_tra_id_fkey";
            columns: ["tra_id"];
            isOneToOne: false;
            referencedRelation: "tras";
            referencedColumns: ["id"];
          },
        ];
      };
      tra_stakeholders: {
        Row: {
          created_at: string;
          decision_rights: string | null;
          department_id: string;
          email: string | null;
          id: string;
          name: string | null;
          org_id: string;
          position: number;
          role: string | null;
          tra_id: string;
          updated_at: string;
        };
        Insert: {
          created_at?: string;
          decision_rights?: string | null;
          department_id: string;
          email?: string | null;
          id?: string;
          name?: string | null;
          org_id: string;
          position?: number;
          role?: string | null;
          tra_id: string;
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          decision_rights?: string | null;
          department_id?: string;
          email?: string | null;
          id?: string;
          name?: string | null;
          org_id?: string;
          position?: number;
          role?: string | null;
          tra_id?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "tra_stakeholders_department_id_fkey";
            columns: ["department_id"];
            isOneToOne: false;
            referencedRelation: "departments";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "tra_stakeholders_org_id_fkey";
            columns: ["org_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "tra_stakeholders_tra_id_fkey";
            columns: ["tra_id"];
            isOneToOne: false;
            referencedRelation: "tras";
            referencedColumns: ["id"];
          },
        ];
      };
      tra_success_criteria: {
        Row: {
          checkpoint: string;
          created_at: string;
          criteria: string | null;
          department_id: string;
          id: string;
          measurement_owner: string | null;
          org_id: string;
          tra_id: string;
          updated_at: string;
        };
        Insert: {
          checkpoint: string;
          created_at?: string;
          criteria?: string | null;
          department_id: string;
          id?: string;
          measurement_owner?: string | null;
          org_id: string;
          tra_id: string;
          updated_at?: string;
        };
        Update: {
          checkpoint?: string;
          created_at?: string;
          criteria?: string | null;
          department_id?: string;
          id?: string;
          measurement_owner?: string | null;
          org_id?: string;
          tra_id?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "tra_success_criteria_department_id_fkey";
            columns: ["department_id"];
            isOneToOne: false;
            referencedRelation: "departments";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "tra_success_criteria_org_id_fkey";
            columns: ["org_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "tra_success_criteria_tra_id_fkey";
            columns: ["tra_id"];
            isOneToOne: false;
            referencedRelation: "tras";
            referencedColumns: ["id"];
          },
        ];
      };
      tras: {
        Row: {
          accessibility_needs: string | null;
          adjustments_notes: string | null;
          ai_assistant_used: boolean;
          archived_at: string | null;
          assessment_approaches: string[];
          audience_languages: string[];
          audience_locations: string[];
          budget_range: string | null;
          business_problem: string | null;
          constraints_notes: string | null;
          content_owner: string | null;
          converted_to_project_id: string | null;
          cost_of_inaction: string | null;
          created_at: string;
          created_by: string | null;
          current_behavior: string | null;
          delivery_cadence: string | null;
          department_id: string;
          desired_behavior: string | null;
          estimated_seat_time_hours: number | null;
          executive_sponsor: string | null;
          existing_content: string | null;
          feedback_mechanism: string | null;
          funding_source: string | null;
          id: string;
          localization_needs: string | null;
          needed_by_date: string | null;
          needed_by_driver: string | null;
          org_id: string;
          pilot_group: string | null;
          prerequisite_knowledge: string | null;
          prior_attempts: string | null;
          priority: string | null;
          project_name: string;
          recommended_modalities: string[];
          reinforcement_plan: string | null;
          requesting_department: string | null;
          requestor_department: string | null;
          requestor_name: string | null;
          requestor_role: string | null;
          review_cadence: string | null;
          root_cause_answer: string | null;
          root_cause_justification: string | null;
          status: string;
          submitted_at: string | null;
          tech_access: string | null;
          technology_requirements: string | null;
          total_estimated_hours: number;
          updated_at: string;
          updated_by: string | null;
          wcag_target: string | null;
        };
        Insert: {
          accessibility_needs?: string | null;
          adjustments_notes?: string | null;
          ai_assistant_used?: boolean;
          archived_at?: string | null;
          assessment_approaches?: string[];
          audience_languages?: string[];
          audience_locations?: string[];
          budget_range?: string | null;
          business_problem?: string | null;
          constraints_notes?: string | null;
          content_owner?: string | null;
          converted_to_project_id?: string | null;
          cost_of_inaction?: string | null;
          created_at?: string;
          created_by?: string | null;
          current_behavior?: string | null;
          delivery_cadence?: string | null;
          department_id: string;
          desired_behavior?: string | null;
          estimated_seat_time_hours?: number | null;
          executive_sponsor?: string | null;
          existing_content?: string | null;
          feedback_mechanism?: string | null;
          funding_source?: string | null;
          id?: string;
          localization_needs?: string | null;
          needed_by_date?: string | null;
          needed_by_driver?: string | null;
          org_id: string;
          pilot_group?: string | null;
          prerequisite_knowledge?: string | null;
          prior_attempts?: string | null;
          priority?: string | null;
          project_name: string;
          recommended_modalities?: string[];
          reinforcement_plan?: string | null;
          requesting_department?: string | null;
          requestor_department?: string | null;
          requestor_name?: string | null;
          requestor_role?: string | null;
          review_cadence?: string | null;
          root_cause_answer?: string | null;
          root_cause_justification?: string | null;
          status?: string;
          submitted_at?: string | null;
          tech_access?: string | null;
          technology_requirements?: string | null;
          total_estimated_hours?: number;
          updated_at?: string;
          updated_by?: string | null;
          wcag_target?: string | null;
        };
        Update: {
          accessibility_needs?: string | null;
          adjustments_notes?: string | null;
          ai_assistant_used?: boolean;
          archived_at?: string | null;
          assessment_approaches?: string[];
          audience_languages?: string[];
          audience_locations?: string[];
          budget_range?: string | null;
          business_problem?: string | null;
          constraints_notes?: string | null;
          content_owner?: string | null;
          converted_to_project_id?: string | null;
          cost_of_inaction?: string | null;
          created_at?: string;
          created_by?: string | null;
          current_behavior?: string | null;
          delivery_cadence?: string | null;
          department_id?: string;
          desired_behavior?: string | null;
          estimated_seat_time_hours?: number | null;
          executive_sponsor?: string | null;
          existing_content?: string | null;
          feedback_mechanism?: string | null;
          funding_source?: string | null;
          id?: string;
          localization_needs?: string | null;
          needed_by_date?: string | null;
          needed_by_driver?: string | null;
          org_id?: string;
          pilot_group?: string | null;
          prerequisite_knowledge?: string | null;
          prior_attempts?: string | null;
          priority?: string | null;
          project_name?: string;
          recommended_modalities?: string[];
          reinforcement_plan?: string | null;
          requesting_department?: string | null;
          requestor_department?: string | null;
          requestor_name?: string | null;
          requestor_role?: string | null;
          review_cadence?: string | null;
          root_cause_answer?: string | null;
          root_cause_justification?: string | null;
          status?: string;
          submitted_at?: string | null;
          tech_access?: string | null;
          technology_requirements?: string | null;
          total_estimated_hours?: number;
          updated_at?: string;
          updated_by?: string | null;
          wcag_target?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "tras_converted_to_project_id_fkey";
            columns: ["converted_to_project_id"];
            isOneToOne: false;
            referencedRelation: "projects";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "tras_department_id_fkey";
            columns: ["department_id"];
            isOneToOne: false;
            referencedRelation: "departments";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "tras_org_id_fkey";
            columns: ["org_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
        ];
      };
      webhook_deliveries: {
        Row: {
          attempts: number;
          created_at: string;
          delivered_at: string | null;
          endpoint_id: string;
          event_type: string;
          id: string;
          next_attempt_at: string | null;
          org_id: string;
          payload: Json;
          response_body: string | null;
          response_code: number | null;
          status: string;
        };
        Insert: {
          attempts?: number;
          created_at?: string;
          delivered_at?: string | null;
          endpoint_id: string;
          event_type: string;
          id?: string;
          next_attempt_at?: string | null;
          org_id: string;
          payload: Json;
          response_body?: string | null;
          response_code?: number | null;
          status?: string;
        };
        Update: {
          attempts?: number;
          created_at?: string;
          delivered_at?: string | null;
          endpoint_id?: string;
          event_type?: string;
          id?: string;
          next_attempt_at?: string | null;
          org_id?: string;
          payload?: Json;
          response_body?: string | null;
          response_code?: number | null;
          status?: string;
        };
        Relationships: [
          {
            foreignKeyName: "webhook_deliveries_endpoint_id_fkey";
            columns: ["endpoint_id"];
            isOneToOne: false;
            referencedRelation: "webhook_endpoints";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "webhook_deliveries_org_id_fkey";
            columns: ["org_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
        ];
      };
      webhook_endpoints: {
        Row: {
          created_at: string;
          created_by: string | null;
          description: string | null;
          enabled: boolean;
          events: string[];
          id: string;
          org_id: string;
          signing_secret: string;
          updated_at: string;
          url: string;
        };
        Insert: {
          created_at?: string;
          created_by?: string | null;
          description?: string | null;
          enabled?: boolean;
          events?: string[];
          id?: string;
          org_id: string;
          signing_secret: string;
          updated_at?: string;
          url: string;
        };
        Update: {
          created_at?: string;
          created_by?: string | null;
          description?: string | null;
          enabled?: boolean;
          events?: string[];
          id?: string;
          org_id?: string;
          signing_secret?: string;
          updated_at?: string;
          url?: string;
        };
        Relationships: [
          {
            foreignKeyName: "webhook_endpoints_org_id_fkey";
            columns: ["org_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
        ];
      };
    };
    Views: {
      classes_with_hours: {
        Row: {
          allocation_bucket_id: string | null;
          annual_class_hours: number | null;
          created_at: string | null;
          created_by: string | null;
          custom_day_hours: number[] | null;
          deleted_at: string | null;
          description: string | null;
          hours_per_day: number | null;
          id: string | null;
          instruction_hours_per_offering: number | null;
          is_multi_day: boolean | null;
          logistics_hours_per_offering: number | null;
          name: string | null;
          offerings_per_year: number | null;
          org_id: string | null;
          prep_hours_per_offering: number | null;
          status: string | null;
          total_days: number | null;
          total_hours_per_offering: number | null;
          updated_at: string | null;
          updated_by: string | null;
          version: number | null;
        };
        Insert: {
          allocation_bucket_id?: string | null;
          annual_class_hours?: never;
          created_at?: string | null;
          created_by?: string | null;
          custom_day_hours?: number[] | null;
          deleted_at?: string | null;
          description?: string | null;
          hours_per_day?: number | null;
          id?: string | null;
          instruction_hours_per_offering?: never;
          is_multi_day?: boolean | null;
          logistics_hours_per_offering?: number | null;
          name?: string | null;
          offerings_per_year?: number | null;
          org_id?: string | null;
          prep_hours_per_offering?: number | null;
          status?: string | null;
          total_days?: number | null;
          total_hours_per_offering?: never;
          updated_at?: string | null;
          updated_by?: string | null;
          version?: number | null;
        };
        Update: {
          allocation_bucket_id?: string | null;
          annual_class_hours?: never;
          created_at?: string | null;
          created_by?: string | null;
          custom_day_hours?: number[] | null;
          deleted_at?: string | null;
          description?: string | null;
          hours_per_day?: number | null;
          id?: string | null;
          instruction_hours_per_offering?: never;
          is_multi_day?: boolean | null;
          logistics_hours_per_offering?: number | null;
          name?: string | null;
          offerings_per_year?: number | null;
          org_id?: string | null;
          prep_hours_per_offering?: number | null;
          status?: string | null;
          total_days?: number | null;
          total_hours_per_offering?: never;
          updated_at?: string | null;
          updated_by?: string | null;
          version?: number | null;
        };
        Relationships: [
          {
            foreignKeyName: "classes_allocation_bucket_id_fkey";
            columns: ["allocation_bucket_id"];
            isOneToOne: false;
            referencedRelation: "allocation_buckets";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "classes_org_id_fkey";
            columns: ["org_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
        ];
      };
      v_bucket_consumption: {
        Row: {
          bucket_id: string | null;
          consumed_hours: number | null;
          org_id: string | null;
        };
        Relationships: [];
      };
      v_instructor_capacity: {
        Row: {
          annual_hours: number | null;
          assigned_hours: number | null;
          full_name: string | null;
          instructor_id: string | null;
          org_id: string | null;
          utilization_pct: number | null;
          utilization_status: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "instructors_org_id_fkey";
            columns: ["org_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
        ];
      };
      v_instructor_workload: {
        Row: {
          annual_hours: number | null;
          bucket_id: string | null;
          instructor_id: string | null;
          org_id: string | null;
          quantity: number | null;
          source: string | null;
          source_id: string | null;
          source_label: string | null;
        };
        Relationships: [];
      };
      v_public_project_team: {
        Row: {
          allocated_hours: number | null;
          id: string | null;
          instructor_name: string | null;
          project_id: string | null;
          role: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "project_team_members_project_id_fkey";
            columns: ["project_id"];
            isOneToOne: false;
            referencedRelation: "projects";
            referencedColumns: ["id"];
          },
        ];
      };
    };
    Functions: {
      accept_invitation: { Args: { p_token: string }; Returns: string };
      agency_org_ids: { Args: { p_agency_id: string }; Returns: string[] };
      apply_standard_triggers: {
        Args: { p_table_name: string };
        Returns: undefined;
      };
      apply_workspace_preset: {
        Args: {
          p_entity_labels?: Json;
          p_module_flags: Json;
          p_org_id: string;
          p_overwrite_labels?: boolean;
          p_preset_key: Database["public"]["Enums"]["workspace_preset_key"];
          p_role_labels?: Json;
        };
        Returns: undefined;
      };
      calculate_period_rev_share: {
        Args: {
          p_agency_id: string;
          p_period_end: string;
          p_period_start: string;
        };
        Returns: {
          annual_value_cents: number;
          contract_id: string;
          effective_share_pct: number;
          org_id: string;
          org_name: string;
          period_share_cents: number;
          pricing_tier: Database["public"]["Enums"]["contract_pricing_tier"];
        }[];
      };
      current_agency_id: { Args: never; Returns: string };
      current_instructor_id: { Args: { p_org_id: string }; Returns: string };
      current_user_id: { Args: never; Returns: string };
      default_department_for_org: {
        Args: { p_org_id: string };
        Returns: string;
      };
      effective_allocation: {
        Args: { p_instructor_id: string };
        Returns: {
          bucket_id: string;
          source: string;
          target_percent: number;
        }[];
      };
      expire_stale_pending_domains: {
        Args: { p_max_age_hours?: number };
        Returns: {
          agency_id: string;
          expired_domain: string;
        }[];
      };
      frequency_to_annual: { Args: { p_frequency: string }; Returns: number };
      generate_implementation_schedule: {
        Args: { p_dry_run?: boolean; p_implementation_id: string };
        Returns: Json;
      };
      generate_monthly_invoices_for_period: {
        Args: { p_period_end: string; p_period_start: string };
        Returns: {
          agency_id: string;
          invoice_id: string;
          invoice_number: string;
          line_count: number;
          skip_reason: string;
          skipped: boolean;
          total_cents: number;
        }[];
      };
      get_pg_share_token: { Args: never; Returns: string };
      has_agency_role: {
        Args: { p_agency_id: string; p_roles: string[] };
        Returns: boolean;
      };
      has_any_role: {
        Args: { p_org_id: string; p_roles: string[] };
        Returns: boolean;
      };
      impl_class_prereq_earliest: {
        Args: { p_class_id: string };
        Returns: string;
      };
      import_tasks: {
        Args: {
          p_delete_ids: string[];
          p_inserts: Json;
          p_project_id: string;
          p_updates: Json;
        };
        Returns: Json;
      };
      instructor_capacity_forecast: {
        Args: { p_instructor_id: string; p_start: string; p_weeks?: number };
        Returns: {
          projected_hours: number;
          utilization_pct: number;
          week_start: string;
          weekly_capacity: number;
        }[];
      };
      is_agency_admin: { Args: { p_agency_id: string }; Returns: boolean };
      is_agency_member: { Args: { p_agency_id: string }; Returns: boolean };
      is_department_admin: {
        Args: { p_department_id: string };
        Returns: boolean;
      };
      is_instructor: { Args: { p_org_id: string }; Returns: boolean };
      is_manager: { Args: { p_org_id: string }; Returns: boolean };
      is_viewer: { Args: { p_org_id: string }; Returns: boolean };
      lookup_agency_by_domain: {
        Args: { p_host: string };
        Returns: {
          id: string;
          name: string;
          slug: string;
        }[];
      };
      lookup_invitation_by_token: {
        Args: { p_token: string };
        Returns: {
          accepted_at: string;
          email: string;
          expires_at: string;
          invitation_id: string;
          org_id: string;
          org_name: string;
          role: string;
          visibility: string;
        }[];
      };
      lookup_sso_for_email_domain: {
        Args: { p_domain: string };
        Returns: {
          display_name: string;
          provider_id: string;
        }[];
      };
      mark_all_notifications_read: { Args: never; Returns: number };
      mark_notification_read: { Args: { p_id: string }; Returns: number };
      next_invoice_number: { Args: never; Returns: string };
      notify_aging_requests: { Args: never; Returns: undefined };
      notify_expiring_certifications: { Args: never; Returns: undefined };
      proficiency_rank: { Args: { p_proficiency: string }; Returns: number };
      purge_expired_audit_logs: {
        Args: { p_default_retention_days?: number };
        Returns: {
          deleted_count: number;
          org_id: string;
        }[];
      };
      purge_old_data_exports: {
        Args: { p_max_age_days?: number };
        Returns: {
          export_id: string;
          org_id: string;
          storage_path: string;
        }[];
      };
      qualified_instructors_for_class: {
        Args: { p_class_id: string };
        Returns: {
          instructor_id: string;
        }[];
      };
      qualified_instructors_for_org: {
        Args: { p_org_id: string };
        Returns: {
          class_id: string;
          instructor_id: string;
        }[];
      };
      set_share_token: { Args: { p_token: string }; Returns: undefined };
      user_department_ids: { Args: never; Returns: string[] };
      user_org_ids: { Args: never; Returns: string[] };
      user_role_in_org: { Args: { p_org_id: string }; Returns: string };
    };
    Enums: {
      contract_pricing_tier: "small" | "medium" | "large" | "enterprise";
      contract_status: "trial" | "active" | "expired" | "cancelled";
      invoice_status: "draft" | "sent" | "paid" | "overdue" | "void" | "cancelled";
      payment_method: "check" | "wire" | "ach" | "zelle" | "paypal" | "other";
      workspace_preset_key:
        | "hospital_training"
        | "corporate_ld"
        | "emr_analyst"
        | "clinical_informatics"
        | "software_engineering"
        | "consulting"
        | "creative_agency"
        | "custom";
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">;

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">];

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R;
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] & DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R;
      }
      ? R
      : never
    : never;

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I;
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I;
      }
      ? I
      : never
    : never;

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U;
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U;
      }
      ? U
      : never
    : never;

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never;

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never;

export const Constants = {
  public: {
    Enums: {
      contract_pricing_tier: ["small", "medium", "large", "enterprise"],
      contract_status: ["trial", "active", "expired", "cancelled"],
      invoice_status: ["draft", "sent", "paid", "overdue", "void", "cancelled"],
      payment_method: ["check", "wire", "ach", "zelle", "paypal", "other"],
      workspace_preset_key: [
        "hospital_training",
        "corporate_ld",
        "emr_analyst",
        "clinical_informatics",
        "software_engineering",
        "consulting",
        "creative_agency",
        "custom",
      ],
    },
  },
} as const;
