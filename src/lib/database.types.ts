export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  graphql_public: {
    Tables: {
      [_ in never]: never
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      graphql: {
        Args: {
          extensions?: Json
          operationName?: string
          query?: string
          variables?: Json
        }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  public: {
    Tables: {
      academic_years: {
        Row: {
          id: string
          is_current: boolean
          name: string
          start_year: number
        }
        Insert: {
          id?: string
          is_current?: boolean
          name: string
          start_year: number
        }
        Update: {
          id?: string
          is_current?: boolean
          name?: string
          start_year?: number
        }
        Relationships: []
      }
      access_log: {
        Row: {
          email: string
          event: string
          id: number
          occurred_at: string
          provider: string | null
          user_id: string | null
        }
        Insert: {
          email: string
          event: string
          id?: never
          occurred_at?: string
          provider?: string | null
          user_id?: string | null
        }
        Update: {
          email?: string
          event?: string
          id?: never
          occurred_at?: string
          provider?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      allowed_email_domains: {
        Row: {
          created_at: string
          domain: string
        }
        Insert: {
          created_at?: string
          domain: string
        }
        Update: {
          created_at?: string
          domain?: string
        }
        Relationships: []
      }
      bootstrap_coordinators: {
        Row: {
          created_at: string
          email: string
          note: string | null
        }
        Insert: {
          created_at?: string
          email: string
          note?: string | null
        }
        Update: {
          created_at?: string
          email?: string
          note?: string | null
        }
        Relationships: []
      }
      buildings: {
        Row: {
          code: string
          id: string
          name: string | null
        }
        Insert: {
          code: string
          id?: string
          name?: string | null
        }
        Update: {
          code?: string
          id?: string
          name?: string | null
        }
        Relationships: []
      }
      courses: {
        Row: {
          code: string | null
          created_at: string
          credits_max: number
          credits_min: number
          id: string
          is_active: boolean
          level: Database["public"]["Enums"]["course_level"]
          notes: string | null
          number: number
          prereq_text: string | null
          subject: string
          title: string
          updated_at: string
        }
        Insert: {
          code?: string | null
          created_at?: string
          credits_max?: number
          credits_min?: number
          id?: string
          is_active?: boolean
          level: Database["public"]["Enums"]["course_level"]
          notes?: string | null
          number: number
          prereq_text?: string | null
          subject?: string
          title: string
          updated_at?: string
        }
        Update: {
          code?: string | null
          created_at?: string
          credits_max?: number
          credits_min?: number
          id?: string
          is_active?: boolean
          level?: Database["public"]["Enums"]["course_level"]
          notes?: string | null
          number?: number
          prereq_text?: string | null
          subject?: string
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      instructor_qualifications: {
        Row: {
          course_id: string
          id: string
          instructor_id: string
          source: Database["public"]["Enums"]["qualification_source"]
        }
        Insert: {
          course_id: string
          id?: string
          instructor_id: string
          source?: Database["public"]["Enums"]["qualification_source"]
        }
        Update: {
          course_id?: string
          id?: string
          instructor_id?: string
          source?: Database["public"]["Enums"]["qualification_source"]
        }
        Relationships: [
          {
            foreignKeyName: "instructor_qualifications_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: false
            referencedRelation: "courses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "instructor_qualifications_instructor_id_fkey"
            columns: ["instructor_id"]
            isOneToOne: false
            referencedRelation: "instructor_load_targets"
            referencedColumns: ["instructor_id"]
          },
          {
            foreignKeyName: "instructor_qualifications_instructor_id_fkey"
            columns: ["instructor_id"]
            isOneToOne: false
            referencedRelation: "instructors"
            referencedColumns: ["id"]
          },
        ]
      }
      instructors: {
        Row: {
          base_annual_courses: number | null
          category: Database["public"]["Enums"]["instructor_category"]
          created_at: string
          email: string | null
          first_name: string | null
          full_name: string
          id: string
          is_active: boolean
          last_name: string | null
          max_courses_per_quarter: number | null
          notes: string | null
          rank: string | null
          updated_at: string
        }
        Insert: {
          base_annual_courses?: number | null
          category?: Database["public"]["Enums"]["instructor_category"]
          created_at?: string
          email?: string | null
          first_name?: string | null
          full_name: string
          id?: string
          is_active?: boolean
          last_name?: string | null
          max_courses_per_quarter?: number | null
          notes?: string | null
          rank?: string | null
          updated_at?: string
        }
        Update: {
          base_annual_courses?: number | null
          category?: Database["public"]["Enums"]["instructor_category"]
          created_at?: string
          email?: string | null
          first_name?: string | null
          full_name?: string
          id?: string
          is_active?: boolean
          last_name?: string | null
          max_courses_per_quarter?: number | null
          notes?: string | null
          rank?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      preference_courses: {
        Row: {
          course_id: string
          id: string
          note: string | null
          rank: number | null
          submission_id: string
          tier: Database["public"]["Enums"]["pref_tier"]
        }
        Insert: {
          course_id: string
          id?: string
          note?: string | null
          rank?: number | null
          submission_id: string
          tier: Database["public"]["Enums"]["pref_tier"]
        }
        Update: {
          course_id?: string
          id?: string
          note?: string | null
          rank?: number | null
          submission_id?: string
          tier?: Database["public"]["Enums"]["pref_tier"]
        }
        Relationships: [
          {
            foreignKeyName: "preference_courses_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: false
            referencedRelation: "courses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "preference_courses_submission_id_fkey"
            columns: ["submission_id"]
            isOneToOne: false
            referencedRelation: "preference_submissions"
            referencedColumns: ["id"]
          },
        ]
      }
      preference_cycles: {
        Row: {
          academic_year_id: string
          closes_at: string | null
          created_at: string
          id: string
          instructions: string | null
          name: string
          opens_at: string | null
          status: Database["public"]["Enums"]["cycle_status"]
          updated_at: string
        }
        Insert: {
          academic_year_id: string
          closes_at?: string | null
          created_at?: string
          id?: string
          instructions?: string | null
          name: string
          opens_at?: string | null
          status?: Database["public"]["Enums"]["cycle_status"]
          updated_at?: string
        }
        Update: {
          academic_year_id?: string
          closes_at?: string | null
          created_at?: string
          id?: string
          instructions?: string | null
          name?: string
          opens_at?: string | null
          status?: Database["public"]["Enums"]["cycle_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "preference_cycles_academic_year_id_fkey"
            columns: ["academic_year_id"]
            isOneToOne: false
            referencedRelation: "academic_years"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "preference_cycles_academic_year_id_fkey"
            columns: ["academic_year_id"]
            isOneToOne: false
            referencedRelation: "instructor_load_targets"
            referencedColumns: ["academic_year_id"]
          },
        ]
      }
      preference_submissions: {
        Row: {
          blocked_days: number[]
          blocked_time_slot_ids: string[]
          created_at: string
          cycle_id: string
          id: string
          instructor_id: string
          max_new_preps: number | null
          modality_prefs: Database["public"]["Enums"]["modality"][]
          note_to_coordinator: string | null
          preferred_days: number[]
          preferred_times: Database["public"]["Enums"]["time_of_day"][]
          prefers_repeat_prep: boolean | null
          status: Database["public"]["Enums"]["submission_status"]
          submitted_at: string | null
          updated_at: string
          wants_back_to_back: boolean | null
        }
        Insert: {
          blocked_days?: number[]
          blocked_time_slot_ids?: string[]
          created_at?: string
          cycle_id: string
          id?: string
          instructor_id: string
          max_new_preps?: number | null
          modality_prefs?: Database["public"]["Enums"]["modality"][]
          note_to_coordinator?: string | null
          preferred_days?: number[]
          preferred_times?: Database["public"]["Enums"]["time_of_day"][]
          prefers_repeat_prep?: boolean | null
          status?: Database["public"]["Enums"]["submission_status"]
          submitted_at?: string | null
          updated_at?: string
          wants_back_to_back?: boolean | null
        }
        Update: {
          blocked_days?: number[]
          blocked_time_slot_ids?: string[]
          created_at?: string
          cycle_id?: string
          id?: string
          instructor_id?: string
          max_new_preps?: number | null
          modality_prefs?: Database["public"]["Enums"]["modality"][]
          note_to_coordinator?: string | null
          preferred_days?: number[]
          preferred_times?: Database["public"]["Enums"]["time_of_day"][]
          prefers_repeat_prep?: boolean | null
          status?: Database["public"]["Enums"]["submission_status"]
          submitted_at?: string | null
          updated_at?: string
          wants_back_to_back?: boolean | null
        }
        Relationships: [
          {
            foreignKeyName: "preference_submissions_cycle_id_fkey"
            columns: ["cycle_id"]
            isOneToOne: false
            referencedRelation: "preference_cycles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "preference_submissions_instructor_id_fkey"
            columns: ["instructor_id"]
            isOneToOne: false
            referencedRelation: "instructor_load_targets"
            referencedColumns: ["instructor_id"]
          },
          {
            foreignKeyName: "preference_submissions_instructor_id_fkey"
            columns: ["instructor_id"]
            isOneToOne: false
            referencedRelation: "instructors"
            referencedColumns: ["id"]
          },
        ]
      }
      preference_terms: {
        Row: {
          available: boolean
          desired_course_count: number | null
          id: string
          leave_reason: string | null
          submission_id: string
          term_id: string
        }
        Insert: {
          available?: boolean
          desired_course_count?: number | null
          id?: string
          leave_reason?: string | null
          submission_id: string
          term_id: string
        }
        Update: {
          available?: boolean
          desired_course_count?: number | null
          id?: string
          leave_reason?: string | null
          submission_id?: string
          term_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "preference_terms_submission_id_fkey"
            columns: ["submission_id"]
            isOneToOne: false
            referencedRelation: "preference_submissions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "preference_terms_term_id_fkey"
            columns: ["term_id"]
            isOneToOne: false
            referencedRelation: "terms"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          created_at: string
          email: string
          full_name: string | null
          id: string
          instructor_id: string | null
          role: Database["public"]["Enums"]["user_role"]
          updated_at: string
        }
        Insert: {
          created_at?: string
          email: string
          full_name?: string | null
          id: string
          instructor_id?: string | null
          role?: Database["public"]["Enums"]["user_role"]
          updated_at?: string
        }
        Update: {
          created_at?: string
          email?: string
          full_name?: string | null
          id?: string
          instructor_id?: string | null
          role?: Database["public"]["Enums"]["user_role"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "profiles_instructor_id_fkey"
            columns: ["instructor_id"]
            isOneToOne: true
            referencedRelation: "instructor_load_targets"
            referencedColumns: ["instructor_id"]
          },
          {
            foreignKeyName: "profiles_instructor_id_fkey"
            columns: ["instructor_id"]
            isOneToOne: true
            referencedRelation: "instructors"
            referencedColumns: ["id"]
          },
        ]
      }
      rooms: {
        Row: {
          building_id: string
          capacity: number | null
          id: string
          label: string | null
          room_number: string
        }
        Insert: {
          building_id: string
          capacity?: number | null
          id?: string
          label?: string | null
          room_number: string
        }
        Update: {
          building_id?: string
          capacity?: number | null
          id?: string
          label?: string | null
          room_number?: string
        }
        Relationships: [
          {
            foreignKeyName: "rooms_building_id_fkey"
            columns: ["building_id"]
            isOneToOne: false
            referencedRelation: "buildings"
            referencedColumns: ["id"]
          },
        ]
      }
      scenario_changes: {
        Row: {
          action: Database["public"]["Enums"]["change_action"]
          actor_email: string | null
          actor_id: string | null
          detail: Json
          id: number
          occurred_at: string
          scenario_id: string
          section_id: string | null
          summary: string
          undoes_id: number | null
          undone_at: string | null
          undone_by: string | null
        }
        Insert: {
          action: Database["public"]["Enums"]["change_action"]
          actor_email?: string | null
          actor_id?: string | null
          detail?: Json
          id?: number
          occurred_at?: string
          scenario_id: string
          section_id?: string | null
          summary: string
          undoes_id?: number | null
          undone_at?: string | null
          undone_by?: string | null
        }
        Update: {
          action?: Database["public"]["Enums"]["change_action"]
          actor_email?: string | null
          actor_id?: string | null
          detail?: Json
          id?: number
          occurred_at?: string
          scenario_id?: string
          section_id?: string | null
          summary?: string
          undoes_id?: number | null
          undone_at?: string | null
          undone_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "scenario_changes_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "scenario_changes_scenario_id_fkey"
            columns: ["scenario_id"]
            isOneToOne: false
            referencedRelation: "scenarios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "scenario_changes_section_id_fkey"
            columns: ["section_id"]
            isOneToOne: false
            referencedRelation: "section_meetings"
            referencedColumns: ["section_id"]
          },
          {
            foreignKeyName: "scenario_changes_section_id_fkey"
            columns: ["section_id"]
            isOneToOne: false
            referencedRelation: "sections"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "scenario_changes_undoes_id_fkey"
            columns: ["undoes_id"]
            isOneToOne: false
            referencedRelation: "scenario_changes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "scenario_changes_undone_by_fkey"
            columns: ["undone_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      scenarios: {
        Row: {
          academic_year_id: string
          created_at: string
          created_by: string | null
          description: string | null
          id: string
          is_locked: boolean
          name: string
          status: Database["public"]["Enums"]["scenario_status"]
          updated_at: string
        }
        Insert: {
          academic_year_id: string
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          is_locked?: boolean
          name: string
          status?: Database["public"]["Enums"]["scenario_status"]
          updated_at?: string
        }
        Update: {
          academic_year_id?: string
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          is_locked?: boolean
          name?: string
          status?: Database["public"]["Enums"]["scenario_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "scenarios_academic_year_id_fkey"
            columns: ["academic_year_id"]
            isOneToOne: false
            referencedRelation: "academic_years"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "scenarios_academic_year_id_fkey"
            columns: ["academic_year_id"]
            isOneToOne: false
            referencedRelation: "instructor_load_targets"
            referencedColumns: ["academic_year_id"]
          },
          {
            foreignKeyName: "scenarios_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      section_instructors: {
        Row: {
          created_at: string
          id: string
          instructor_id: string
          is_primary: boolean
          section_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          instructor_id: string
          is_primary?: boolean
          section_id: string
        }
        Update: {
          created_at?: string
          id?: string
          instructor_id?: string
          is_primary?: boolean
          section_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "section_instructors_instructor_id_fkey"
            columns: ["instructor_id"]
            isOneToOne: false
            referencedRelation: "instructor_load_targets"
            referencedColumns: ["instructor_id"]
          },
          {
            foreignKeyName: "section_instructors_instructor_id_fkey"
            columns: ["instructor_id"]
            isOneToOne: false
            referencedRelation: "instructors"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "section_instructors_section_id_fkey"
            columns: ["section_id"]
            isOneToOne: false
            referencedRelation: "section_meetings"
            referencedColumns: ["section_id"]
          },
          {
            foreignKeyName: "section_instructors_section_id_fkey"
            columns: ["section_id"]
            isOneToOne: false
            referencedRelation: "sections"
            referencedColumns: ["id"]
          },
        ]
      }
      sections: {
        Row: {
          course_id: string
          created_at: string
          credits: number | null
          custom_days: number[] | null
          custom_end: string | null
          custom_start: string | null
          enrollment_cap: number | null
          id: string
          is_arranged: boolean
          modality: Database["public"]["Enums"]["modality"]
          notes: string | null
          room_id: string | null
          scenario_id: string
          section_letter: string
          sln: string | null
          status: Database["public"]["Enums"]["section_status"]
          term_id: string
          time_slot_id: string | null
          updated_at: string
        }
        Insert: {
          course_id: string
          created_at?: string
          credits?: number | null
          custom_days?: number[] | null
          custom_end?: string | null
          custom_start?: string | null
          enrollment_cap?: number | null
          id?: string
          is_arranged?: boolean
          modality?: Database["public"]["Enums"]["modality"]
          notes?: string | null
          room_id?: string | null
          scenario_id: string
          section_letter: string
          sln?: string | null
          status?: Database["public"]["Enums"]["section_status"]
          term_id: string
          time_slot_id?: string | null
          updated_at?: string
        }
        Update: {
          course_id?: string
          created_at?: string
          credits?: number | null
          custom_days?: number[] | null
          custom_end?: string | null
          custom_start?: string | null
          enrollment_cap?: number | null
          id?: string
          is_arranged?: boolean
          modality?: Database["public"]["Enums"]["modality"]
          notes?: string | null
          room_id?: string | null
          scenario_id?: string
          section_letter?: string
          sln?: string | null
          status?: Database["public"]["Enums"]["section_status"]
          term_id?: string
          time_slot_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "sections_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: false
            referencedRelation: "courses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sections_room_id_fkey"
            columns: ["room_id"]
            isOneToOne: false
            referencedRelation: "rooms"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sections_scenario_id_fkey"
            columns: ["scenario_id"]
            isOneToOne: false
            referencedRelation: "scenarios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sections_term_id_fkey"
            columns: ["term_id"]
            isOneToOne: false
            referencedRelation: "terms"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sections_time_slot_id_fkey"
            columns: ["time_slot_id"]
            isOneToOne: false
            referencedRelation: "time_slots"
            referencedColumns: ["id"]
          },
        ]
      }
      teaching_history: {
        Row: {
          academic_year: string
          course_code_raw: string
          course_id: string | null
          days: number[] | null
          end_time: string | null
          enrollment: number | null
          enrollment_cap: number | null
          id: string
          instructor_id: string | null
          instructor_name_raw: string
          modality: Database["public"]["Enums"]["modality"] | null
          quarter: Database["public"]["Enums"]["quarter"]
          room_label: string | null
          section_letter: string | null
          sln: string | null
          start_time: string | null
        }
        Insert: {
          academic_year: string
          course_code_raw: string
          course_id?: string | null
          days?: number[] | null
          end_time?: string | null
          enrollment?: number | null
          enrollment_cap?: number | null
          id?: string
          instructor_id?: string | null
          instructor_name_raw: string
          modality?: Database["public"]["Enums"]["modality"] | null
          quarter: Database["public"]["Enums"]["quarter"]
          room_label?: string | null
          section_letter?: string | null
          sln?: string | null
          start_time?: string | null
        }
        Update: {
          academic_year?: string
          course_code_raw?: string
          course_id?: string | null
          days?: number[] | null
          end_time?: string | null
          enrollment?: number | null
          enrollment_cap?: number | null
          id?: string
          instructor_id?: string | null
          instructor_name_raw?: string
          modality?: Database["public"]["Enums"]["modality"] | null
          quarter?: Database["public"]["Enums"]["quarter"]
          room_label?: string | null
          section_letter?: string | null
          sln?: string | null
          start_time?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "teaching_history_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: false
            referencedRelation: "courses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "teaching_history_instructor_id_fkey"
            columns: ["instructor_id"]
            isOneToOne: false
            referencedRelation: "instructor_load_targets"
            referencedColumns: ["instructor_id"]
          },
          {
            foreignKeyName: "teaching_history_instructor_id_fkey"
            columns: ["instructor_id"]
            isOneToOne: false
            referencedRelation: "instructors"
            referencedColumns: ["id"]
          },
        ]
      }
      teaching_releases: {
        Row: {
          academic_year_id: string | null
          courses: number
          created_at: string
          created_by: string | null
          id: string
          instructor_id: string
          reason: string
          updated_at: string
        }
        Insert: {
          academic_year_id?: string | null
          courses: number
          created_at?: string
          created_by?: string | null
          id?: string
          instructor_id: string
          reason: string
          updated_at?: string
        }
        Update: {
          academic_year_id?: string | null
          courses?: number
          created_at?: string
          created_by?: string | null
          id?: string
          instructor_id?: string
          reason?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "teaching_releases_academic_year_id_fkey"
            columns: ["academic_year_id"]
            isOneToOne: false
            referencedRelation: "academic_years"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "teaching_releases_academic_year_id_fkey"
            columns: ["academic_year_id"]
            isOneToOne: false
            referencedRelation: "instructor_load_targets"
            referencedColumns: ["academic_year_id"]
          },
          {
            foreignKeyName: "teaching_releases_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "teaching_releases_instructor_id_fkey"
            columns: ["instructor_id"]
            isOneToOne: false
            referencedRelation: "instructor_load_targets"
            referencedColumns: ["instructor_id"]
          },
          {
            foreignKeyName: "teaching_releases_instructor_id_fkey"
            columns: ["instructor_id"]
            isOneToOne: false
            referencedRelation: "instructors"
            referencedColumns: ["id"]
          },
        ]
      }
      terms: {
        Row: {
          academic_year_id: string
          id: string
          quarter: Database["public"]["Enums"]["quarter"]
          sort_order: number
        }
        Insert: {
          academic_year_id: string
          id?: string
          quarter: Database["public"]["Enums"]["quarter"]
          sort_order?: number
        }
        Update: {
          academic_year_id?: string
          id?: string
          quarter?: Database["public"]["Enums"]["quarter"]
          sort_order?: number
        }
        Relationships: [
          {
            foreignKeyName: "terms_academic_year_id_fkey"
            columns: ["academic_year_id"]
            isOneToOne: false
            referencedRelation: "academic_years"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "terms_academic_year_id_fkey"
            columns: ["academic_year_id"]
            isOneToOne: false
            referencedRelation: "instructor_load_targets"
            referencedColumns: ["academic_year_id"]
          },
        ]
      }
      time_slots: {
        Row: {
          day_pattern: string
          days: number[]
          end_time: string
          id: string
          is_active: boolean
          is_standard: boolean
          label: string
          sort_order: number
          start_time: string
        }
        Insert: {
          day_pattern: string
          days: number[]
          end_time: string
          id?: string
          is_active?: boolean
          is_standard?: boolean
          label: string
          sort_order?: number
          start_time: string
        }
        Update: {
          day_pattern?: string
          days?: number[]
          end_time?: string
          id?: string
          is_active?: boolean
          is_standard?: boolean
          label?: string
          sort_order?: number
          start_time?: string
        }
        Relationships: []
      }
    }
    Views: {
      access_summary: {
        Row: {
          email: string | null
          first_seen: string | null
          full_name: string | null
          last_seen: string | null
          role: Database["public"]["Enums"]["user_role"] | null
          visits: number | null
        }
        Relationships: []
      }
      instructor_load_targets: {
        Row: {
          academic_year: string | null
          academic_year_id: string | null
          base_annual_courses: number | null
          category: Database["public"]["Enums"]["instructor_category"] | null
          effective_target: number | null
          full_name: string | null
          instructor_id: string | null
          released_courses: number | null
        }
        Relationships: []
      }
      section_meetings: {
        Row: {
          course_id: string | null
          days: number[] | null
          end_time: string | null
          scenario_id: string | null
          section_id: string | null
          start_time: string | null
          term_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "sections_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: false
            referencedRelation: "courses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sections_scenario_id_fkey"
            columns: ["scenario_id"]
            isOneToOne: false
            referencedRelation: "scenarios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sections_term_id_fkey"
            columns: ["term_id"]
            isOneToOne: false
            referencedRelation: "terms"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      auth_role: {
        Args: never
        Returns: Database["public"]["Enums"]["user_role"]
      }
      change_actor: {
        Args: never
        Returns: {
          email: string
          id: string
        }[]
      }
      cycle_is_open: { Args: { p_cycle_id: string }; Returns: boolean }
      is_coordinator: { Args: never; Returns: boolean }
      my_instructor_id: { Args: never; Returns: string }
      undo_change: { Args: { p_change_id: number }; Returns: string }
      undo_changes: { Args: { p_ids: number[] }; Returns: number }
      undoing_change_id: { Args: never; Returns: number }
    }
    Enums: {
      change_action:
        | "created"
        | "updated"
        | "deleted"
        | "assigned"
        | "unassigned"
      course_level: "undergraduate" | "graduate"
      cycle_status: "draft" | "open" | "closed" | "archived"
      instructor_category:
        | "full_time"
        | "affiliate"
        | "part_time"
        | "emeritus"
        | "other"
      modality: "in_person" | "hybrid" | "online_sync" | "online_async"
      pref_tier: "eager" | "willing" | "reluctant" | "unqualified"
      qualification_source: "coordinator" | "self" | "history"
      quarter: "autumn" | "winter" | "spring" | "summer"
      scenario_status: "draft" | "official" | "archived"
      section_status: "planned" | "staffed" | "confirmed" | "cancelled"
      submission_status: "not_started" | "draft" | "submitted"
      time_of_day: "morning" | "midday" | "afternoon" | "evening"
      user_role: "coordinator" | "instructor" | "viewer"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {
      change_action: [
        "created",
        "updated",
        "deleted",
        "assigned",
        "unassigned",
      ],
      course_level: ["undergraduate", "graduate"],
      cycle_status: ["draft", "open", "closed", "archived"],
      instructor_category: [
        "full_time",
        "affiliate",
        "part_time",
        "emeritus",
        "other",
      ],
      modality: ["in_person", "hybrid", "online_sync", "online_async"],
      pref_tier: ["eager", "willing", "reluctant", "unqualified"],
      qualification_source: ["coordinator", "self", "history"],
      quarter: ["autumn", "winter", "spring", "summer"],
      scenario_status: ["draft", "official", "archived"],
      section_status: ["planned", "staffed", "confirmed", "cancelled"],
      submission_status: ["not_started", "draft", "submitted"],
      time_of_day: ["morning", "midday", "afternoon", "evening"],
      user_role: ["coordinator", "instructor", "viewer"],
    },
  },
} as const
