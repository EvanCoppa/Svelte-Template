/**
 * Database types for the Supabase client. This committed version matches the
 * starter schema in `supabase/migrations/` (the `profiles` table).
 *
 * After EVERY migration, regenerate and commit:
 *
 *   npm run db:types
 *
 * The CLI's output replaces this file wholesale. Until a table exists here,
 * `.from('that_table')` is a type error — which is the point: types must
 * exist before queries do, instead of rows silently typing as `any`.
 */

export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
	public: {
		Tables: {
			profiles: {
				Row: {
					avatar_url: string | null;
					created_at: string;
					display_name: string | null;
					id: string;
					updated_at: string;
				};
				Insert: {
					avatar_url?: string | null;
					created_at?: string;
					display_name?: string | null;
					id: string;
					updated_at?: string;
				};
				Update: {
					avatar_url?: string | null;
					created_at?: string;
					display_name?: string | null;
					id?: string;
					updated_at?: string;
				};
				Relationships: [];
			};
		};
		Views: { [_ in never]: never };
		Functions: { [_ in never]: never };
		Enums: { [_ in never]: never };
		CompositeTypes: { [_ in never]: never };
	};
};

/**
 * Convenience aliases matching the ones the Supabase CLI generates, so code
 * written against this file keeps compiling after regeneration.
 *
 *   type Profile = Tables<'profiles'>;
 *   type NewProfile = TablesInsert<'profiles'>;
 */
export type Tables<T extends keyof Database['public']['Tables']> =
	Database['public']['Tables'][T]['Row'];
export type TablesInsert<T extends keyof Database['public']['Tables']> =
	Database['public']['Tables'][T]['Insert'];
export type TablesUpdate<T extends keyof Database['public']['Tables']> =
	Database['public']['Tables'][T]['Update'];
export type Enums<T extends keyof Database['public']['Enums']> = Database['public']['Enums'][T];
