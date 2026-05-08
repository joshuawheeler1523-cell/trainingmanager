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
      allocation_buckets: {
        Row: {
          color: string;
          created_at: string;
          created_by: string | null;
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
          group_id: string;
          instructor_id: string;
          org_id: string;
        };
        Insert: {
          created_at?: string;
          group_id: string;
          instructor_id: string;
          org_id: string;
        };
        Update: {
          created_at?: string;
          group_id?: string;
          instructor_id?: string;
          org_id?: string;
        };
        Relationships: [
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
          description?: string | null;
          id?: string;
          name?: string;
          org_id?: string;
          updated_at?: string;
          updated_by?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "allocation_groups_org_id_fkey";
            columns: ["org_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
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
      class_instructor_assignments: {
        Row: {
          assigned_offerings: number;
          class_id: string;
          created_at: string;
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
      class_skill_requirements: {
        Row: {
          class_id: string;
          created_at: string;
          created_by: string | null;
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
            foreignKeyName: "classes_org_id_fkey";
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
      education_request_assignments: {
        Row: {
          actual_hours: number | null;
          completed_at: string | null;
          created_at: string;
          created_by: string | null;
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
          from_status?: string | null;
          id?: never;
          occurred_at?: string;
          org_id?: string;
          request_id?: string;
          to_status?: string;
        };
        Relationships: [
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
      individual_allocations: {
        Row: {
          bucket_id: string;
          created_at: string;
          created_by: string | null;
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
          email: string | null;
          full_name: string;
          id: string;
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
          email?: string | null;
          full_name: string;
          id?: string;
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
          email?: string | null;
          full_name?: string;
          id?: string;
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
            foreignKeyName: "instructors_org_id_fkey";
            columns: ["org_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
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
          billing_tier: string | null;
          created_at: string;
          created_by: string | null;
          id: string;
          logo_url: string | null;
          name: string;
          onboarded_at: string | null;
          settings: Json;
          slug: string;
          time_zone: string;
          updated_at: string;
          updated_by: string | null;
          version: number;
        };
        Insert: {
          billing_tier?: string | null;
          created_at?: string;
          created_by?: string | null;
          id?: string;
          logo_url?: string | null;
          name: string;
          onboarded_at?: string | null;
          settings?: Json;
          slug: string;
          time_zone?: string;
          updated_at?: string;
          updated_by?: string | null;
          version?: number;
        };
        Update: {
          billing_tier?: string | null;
          created_at?: string;
          created_by?: string | null;
          id?: string;
          logo_url?: string | null;
          name?: string;
          onboarded_at?: string | null;
          settings?: Json;
          slug?: string;
          time_zone?: string;
          updated_at?: string;
          updated_by?: string | null;
          version?: number;
        };
        Relationships: [];
      };
      project_team_members: {
        Row: {
          allocated_hours: number;
          created_at: string;
          created_by: string | null;
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
          description: string | null;
          end_date: string | null;
          id: string;
          name: string;
          org_id: string;
          priority: string;
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
          description?: string | null;
          end_date?: string | null;
          id?: string;
          name: string;
          org_id: string;
          priority?: string;
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
          description?: string | null;
          end_date?: string | null;
          id?: string;
          name?: string;
          org_id?: string;
          priority?: string;
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
          expires_at?: string | null;
          id?: string;
          is_active?: boolean;
          label?: string | null;
          org_id?: string;
          token?: string;
        };
        Relationships: [
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
          instructor_id: string;
          org_id: string;
          recurring_task_id: string;
          share_percent: number;
        };
        Insert: {
          created_at?: string;
          instructor_id: string;
          org_id: string;
          recurring_task_id: string;
          share_percent?: number;
        };
        Update: {
          created_at?: string;
          instructor_id?: string;
          org_id?: string;
          recurring_task_id?: string;
          share_percent?: number;
        };
        Relationships: [
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
            foreignKeyName: "recurring_tasks_org_id_fkey";
            columns: ["org_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
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
            foreignKeyName: "skills_org_id_fkey";
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
          id?: string;
          org_id?: string;
          project_team_member_id?: string;
          task_id?: string;
          updated_at?: string;
          updated_by?: string | null;
        };
        Relationships: [
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
            foreignKeyName: "task_assignments_task_id_fkey";
            columns: ["task_id"];
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
          description: string | null;
          end_date: string | null;
          estimated_hours: number | null;
          id: string;
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
          description?: string | null;
          end_date?: string | null;
          estimated_hours?: number | null;
          id?: string;
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
          description?: string | null;
          end_date?: string | null;
          estimated_hours?: number | null;
          id?: string;
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
      tra_deliverables: {
        Row: {
          complexity_multiplier: number;
          created_at: string;
          created_by: string | null;
          deliverable_type_id: string;
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
      tras: {
        Row: {
          adjustments_notes: string | null;
          ai_assistant_used: boolean;
          business_justification: string | null;
          converted_to_project_id: string | null;
          created_at: string;
          created_by: string | null;
          description: string | null;
          id: string;
          org_id: string;
          project_name: string;
          requesting_department: string | null;
          stakeholder_email: string | null;
          stakeholder_name: string | null;
          status: string;
          target_audience: string | null;
          total_estimated_hours: number;
          updated_at: string;
          updated_by: string | null;
          urgency: string;
        };
        Insert: {
          adjustments_notes?: string | null;
          ai_assistant_used?: boolean;
          business_justification?: string | null;
          converted_to_project_id?: string | null;
          created_at?: string;
          created_by?: string | null;
          description?: string | null;
          id?: string;
          org_id: string;
          project_name: string;
          requesting_department?: string | null;
          stakeholder_email?: string | null;
          stakeholder_name?: string | null;
          status?: string;
          target_audience?: string | null;
          total_estimated_hours?: number;
          updated_at?: string;
          updated_by?: string | null;
          urgency?: string;
        };
        Update: {
          adjustments_notes?: string | null;
          ai_assistant_used?: boolean;
          business_justification?: string | null;
          converted_to_project_id?: string | null;
          created_at?: string;
          created_by?: string | null;
          description?: string | null;
          id?: string;
          org_id?: string;
          project_name?: string;
          requesting_department?: string | null;
          stakeholder_email?: string | null;
          stakeholder_name?: string | null;
          status?: string;
          target_audience?: string | null;
          total_estimated_hours?: number;
          updated_at?: string;
          updated_by?: string | null;
          urgency?: string;
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
            foreignKeyName: "tras_org_id_fkey";
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
    };
    Functions: {
      apply_standard_triggers: {
        Args: { p_table_name: string };
        Returns: undefined;
      };
      current_user_id: { Args: never; Returns: string };
      effective_allocation: {
        Args: { p_instructor_id: string };
        Returns: {
          bucket_id: string;
          source: string;
          target_percent: number;
        }[];
      };
      frequency_to_annual: { Args: { p_frequency: string }; Returns: number };
      instructor_capacity_forecast: {
        Args: { p_instructor_id: string; p_start: string; p_weeks?: number };
        Returns: {
          projected_hours: number;
          utilization_pct: number;
          week_start: string;
          weekly_capacity: number;
        }[];
      };
      is_org_admin: { Args: { p_org_id: string }; Returns: boolean };
      notify_aging_requests: { Args: never; Returns: undefined };
      notify_expiring_certifications: { Args: never; Returns: undefined };
      proficiency_rank: { Args: { p_proficiency: string }; Returns: number };
      qualified_instructors_for_class: {
        Args: { p_class_id: string };
        Returns: {
          instructor_id: string;
        }[];
      };
      user_org_ids: { Args: never; Returns: string[] };
    };
    Enums: {
      [_ in never]: never;
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
    Enums: {},
  },
} as const;
