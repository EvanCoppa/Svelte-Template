/**
 * PLACEHOLDER — regenerate with `npm run db:types` once your schema exists,
 * and re-run it after every migration. The generated output from the Supabase
 * CLI replaces this file wholesale; commit the result.
 *
 * The schema below is intentionally empty: until you generate real types,
 * every `.from('table')` call is a type error. That's the point — it forces
 * the types to exist before queries do, instead of silently typing rows as
 * `any`.
 */

export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
	public: {
		// `[_ in never]` is what the CLI emits for an empty schema: an object
		// type with no keys, so `keyof Tables` is `never` and `.from(...)`
		// rejects every table name until real types are generated.
		Tables: { [_ in never]: never };
		Views: { [_ in never]: never };
		Functions: { [_ in never]: never };
		Enums: { [_ in never]: never };
		CompositeTypes: { [_ in never]: never };
	};
};

/**
 * Convenience aliases matching the ones the Supabase CLI generates, so code
 * written against the placeholder keeps compiling after real generation.
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
