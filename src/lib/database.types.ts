export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  public: {
    Tables: {
      activities: {
        Row: {
          author_id: string | null
          body: string | null
          created_at: string
          direction: Database["public"]["Enums"]["activity_direction"] | null
          duration_minutes: number | null
          entity_id: string | null
          entity_type: Database["public"]["Enums"]["crm_entity_type"] | null
          id: string
          occurred_at: string
          org_id: string
          subject: string | null
          type: Database["public"]["Enums"]["activity_type"]
          updated_at: string
        }
        Insert: {
          author_id?: string | null
          body?: string | null
          created_at?: string
          direction?: Database["public"]["Enums"]["activity_direction"] | null
          duration_minutes?: number | null
          entity_id?: string | null
          entity_type?: Database["public"]["Enums"]["crm_entity_type"] | null
          id?: string
          occurred_at?: string
          org_id: string
          subject?: string | null
          type?: Database["public"]["Enums"]["activity_type"]
          updated_at?: string
        }
        Update: {
          author_id?: string | null
          body?: string | null
          created_at?: string
          direction?: Database["public"]["Enums"]["activity_direction"] | null
          duration_minutes?: number | null
          entity_id?: string | null
          entity_type?: Database["public"]["Enums"]["crm_entity_type"] | null
          id?: string
          occurred_at?: string
          org_id?: string
          subject?: string | null
          type?: Database["public"]["Enums"]["activity_type"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "activities_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      addresses: {
        Row: {
          city: string | null
          country: string | null
          created_at: string
          entity_id: string
          entity_type: Database["public"]["Enums"]["crm_entity_type"]
          id: string
          is_primary: boolean
          kind: Database["public"]["Enums"]["address_kind"]
          label: string | null
          latitude: number | null
          line1: string
          line2: string | null
          longitude: number | null
          org_id: string
          postal_code: string | null
          region: string | null
          updated_at: string
        }
        Insert: {
          city?: string | null
          country?: string | null
          created_at?: string
          entity_id: string
          entity_type: Database["public"]["Enums"]["crm_entity_type"]
          id?: string
          is_primary?: boolean
          kind?: Database["public"]["Enums"]["address_kind"]
          label?: string | null
          latitude?: number | null
          line1: string
          line2?: string | null
          longitude?: number | null
          org_id: string
          postal_code?: string | null
          region?: string | null
          updated_at?: string
        }
        Update: {
          city?: string | null
          country?: string | null
          created_at?: string
          entity_id?: string
          entity_type?: Database["public"]["Enums"]["crm_entity_type"]
          id?: string
          is_primary?: boolean
          kind?: Database["public"]["Enums"]["address_kind"]
          label?: string | null
          latitude?: number | null
          line1?: string
          line2?: string | null
          longitude?: number | null
          org_id?: string
          postal_code?: string | null
          region?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "addresses_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      assistant_conversations: {
        Row: {
          created_at: string
          id: string
          org_id: string
          title: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          org_id: string
          title?: string | null
          updated_at?: string
          user_id?: string
        }
        Update: {
          created_at?: string
          id?: string
          org_id?: string
          title?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "assistant_conversations_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      assistant_messages: {
        Row: {
          conversation_id: string
          created_at: string
          id: string
          metadata: Json | null
          parts: Json
          position: number
          role: string
        }
        Insert: {
          conversation_id: string
          created_at?: string
          id: string
          metadata?: Json | null
          parts: Json
          position: number
          role: string
        }
        Update: {
          conversation_id?: string
          created_at?: string
          id?: string
          metadata?: Json | null
          parts?: Json
          position?: number
          role?: string
        }
        Relationships: [
          {
            foreignKeyName: "assistant_messages_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "assistant_conversations"
            referencedColumns: ["id"]
          },
        ]
      }
      billables: {
        Row: {
          code: string | null
          created_at: string
          created_by: string | null
          currency: string
          description: string | null
          id: string
          is_active: boolean
          is_featured: boolean
          name: string
          org_id: string
          sort_order: number
          unit: string | null
          unit_choices: string[] | null
          unit_price: number
          updated_at: string
        }
        Insert: {
          code?: string | null
          created_at?: string
          created_by?: string | null
          currency?: string
          description?: string | null
          id?: string
          is_active?: boolean
          is_featured?: boolean
          name: string
          org_id: string
          sort_order?: number
          unit?: string | null
          unit_choices?: string[] | null
          unit_price?: number
          updated_at?: string
        }
        Update: {
          code?: string | null
          created_at?: string
          created_by?: string | null
          currency?: string
          description?: string | null
          id?: string
          is_active?: boolean
          is_featured?: boolean
          name?: string
          org_id?: string
          sort_order?: number
          unit?: string | null
          unit_choices?: string[] | null
          unit_price?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "billables_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      calendar_events: {
        Row: {
          all_day: boolean
          assigned_to: string | null
          color: Database["public"]["Enums"]["badge_tone"]
          created_at: string
          created_by: string | null
          description: string | null
          ends_at: string
          entity_id: string | null
          entity_type: Database["public"]["Enums"]["crm_entity_type"] | null
          id: string
          location: string | null
          org_id: string
          starts_at: string
          title: string
          updated_at: string
        }
        Insert: {
          all_day?: boolean
          assigned_to?: string | null
          color?: Database["public"]["Enums"]["badge_tone"]
          created_at?: string
          created_by?: string | null
          description?: string | null
          ends_at: string
          entity_id?: string | null
          entity_type?: Database["public"]["Enums"]["crm_entity_type"] | null
          id?: string
          location?: string | null
          org_id: string
          starts_at: string
          title: string
          updated_at?: string
        }
        Update: {
          all_day?: boolean
          assigned_to?: string | null
          color?: Database["public"]["Enums"]["badge_tone"]
          created_at?: string
          created_by?: string | null
          description?: string | null
          ends_at?: string
          entity_id?: string | null
          entity_type?: Database["public"]["Enums"]["crm_entity_type"] | null
          id?: string
          location?: string | null
          org_id?: string
          starts_at?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "calendar_events_org_id_assigned_to_fkey"
            columns: ["org_id", "assigned_to"]
            isOneToOne: false
            referencedRelation: "organization_members"
            referencedColumns: ["org_id", "user_id"]
          },
          {
            foreignKeyName: "calendar_events_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      companies: {
        Row: {
          created_at: string
          created_by: string | null
          distribution_fee_pct: number | null
          email: string | null
          id: string
          name: string
          org_id: string
          payment_terms_days: number | null
          phone: string | null
          relationship: Database["public"]["Enums"]["company_relationship"]
          status: Database["public"]["Enums"]["party_status"]
          updated_at: string
          vendor_account_number: string | null
          website: string | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          distribution_fee_pct?: number | null
          email?: string | null
          id?: string
          name: string
          org_id: string
          payment_terms_days?: number | null
          phone?: string | null
          relationship?: Database["public"]["Enums"]["company_relationship"]
          status?: Database["public"]["Enums"]["party_status"]
          updated_at?: string
          vendor_account_number?: string | null
          website?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          distribution_fee_pct?: number | null
          email?: string | null
          id?: string
          name?: string
          org_id?: string
          payment_terms_days?: number | null
          phone?: string | null
          relationship?: Database["public"]["Enums"]["company_relationship"]
          status?: Database["public"]["Enums"]["party_status"]
          updated_at?: string
          vendor_account_number?: string | null
          website?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "companies_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      company_relationships: {
        Row: {
          company_id: string
          created_at: string
          org_id: string
          relationship: Database["public"]["Enums"]["company_relationship"]
        }
        Insert: {
          company_id: string
          created_at?: string
          org_id: string
          relationship: Database["public"]["Enums"]["company_relationship"]
        }
        Update: {
          company_id?: string
          created_at?: string
          org_id?: string
          relationship?: Database["public"]["Enums"]["company_relationship"]
        }
        Relationships: [
          {
            foreignKeyName: "company_relationships_company_id_org_id_fkey"
            columns: ["company_id", "org_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id", "org_id"]
          },
          {
            foreignKeyName: "company_relationships_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      contact_profiles: {
        Row: {
          contact_id: string
          created_at: string
          id: string
          invited_at: string | null
          last_seen_at: string | null
          org_id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          contact_id: string
          created_at?: string
          id?: string
          invited_at?: string | null
          last_seen_at?: string | null
          org_id: string
          updated_at?: string
          user_id: string
        }
        Update: {
          contact_id?: string
          created_at?: string
          id?: string
          invited_at?: string | null
          last_seen_at?: string | null
          org_id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "contact_profiles_contact_id_org_id_fkey"
            columns: ["contact_id", "org_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id", "org_id"]
          },
          {
            foreignKeyName: "contact_profiles_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      contacts: {
        Row: {
          company_id: string | null
          created_at: string
          created_by: string | null
          email: string | null
          id: string
          is_primary: boolean
          name: string
          org_id: string
          phone: string | null
          status: Database["public"]["Enums"]["party_status"]
          title: string | null
          updated_at: string
        }
        Insert: {
          company_id?: string | null
          created_at?: string
          created_by?: string | null
          email?: string | null
          id?: string
          is_primary?: boolean
          name: string
          org_id: string
          phone?: string | null
          status?: Database["public"]["Enums"]["party_status"]
          title?: string | null
          updated_at?: string
        }
        Update: {
          company_id?: string | null
          created_at?: string
          created_by?: string | null
          email?: string | null
          id?: string
          is_primary?: boolean
          name?: string
          org_id?: string
          phone?: string | null
          status?: Database["public"]["Enums"]["party_status"]
          title?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "contacts_company_id_org_id_fkey"
            columns: ["company_id", "org_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id", "org_id"]
          },
          {
            foreignKeyName: "contacts_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      custom_field_definitions: {
        Row: {
          allowed_values: Json | null
          created_at: string
          entity_type: Database["public"]["Enums"]["crm_entity_type"]
          id: string
          key: string
          label: string
          org_id: string
          updated_at: string
          value_type: Database["public"]["Enums"]["custom_field_value_type"]
        }
        Insert: {
          allowed_values?: Json | null
          created_at?: string
          entity_type: Database["public"]["Enums"]["crm_entity_type"]
          id?: string
          key: string
          label: string
          org_id: string
          updated_at?: string
          value_type: Database["public"]["Enums"]["custom_field_value_type"]
        }
        Update: {
          allowed_values?: Json | null
          created_at?: string
          entity_type?: Database["public"]["Enums"]["crm_entity_type"]
          id?: string
          key?: string
          label?: string
          org_id?: string
          updated_at?: string
          value_type?: Database["public"]["Enums"]["custom_field_value_type"]
        }
        Relationships: [
          {
            foreignKeyName: "custom_field_definitions_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      custom_field_values: {
        Row: {
          created_at: string
          entity_id: string
          entity_type: Database["public"]["Enums"]["crm_entity_type"]
          field_definition_id: string
          id: string
          org_id: string
          updated_at: string
          value_boolean: boolean | null
          value_numeric: number | null
          value_text: string | null
        }
        Insert: {
          created_at?: string
          entity_id: string
          entity_type: Database["public"]["Enums"]["crm_entity_type"]
          field_definition_id: string
          id?: string
          org_id: string
          updated_at?: string
          value_boolean?: boolean | null
          value_numeric?: number | null
          value_text?: string | null
        }
        Update: {
          created_at?: string
          entity_id?: string
          entity_type?: Database["public"]["Enums"]["crm_entity_type"]
          field_definition_id?: string
          id?: string
          org_id?: string
          updated_at?: string
          value_boolean?: boolean | null
          value_numeric?: number | null
          value_text?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "custom_field_values_field_definition_id_entity_type_fkey"
            columns: ["field_definition_id", "entity_type"]
            isOneToOne: false
            referencedRelation: "custom_field_definitions"
            referencedColumns: ["id", "entity_type"]
          },
          {
            foreignKeyName: "custom_field_values_field_definition_id_org_id_fkey"
            columns: ["field_definition_id", "org_id"]
            isOneToOne: false
            referencedRelation: "custom_field_definitions"
            referencedColumns: ["id", "org_id"]
          },
          {
            foreignKeyName: "custom_field_values_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      deals: {
        Row: {
          amount: number | null
          assigned_to: string | null
          company_id: string | null
          contact_id: string | null
          created_at: string
          created_by: string | null
          expected_close_date: string | null
          id: string
          org_id: string
          pipeline_id: string
          stage_id: string
          title: string
          updated_at: string
        }
        Insert: {
          amount?: number | null
          assigned_to?: string | null
          company_id?: string | null
          contact_id?: string | null
          created_at?: string
          created_by?: string | null
          expected_close_date?: string | null
          id?: string
          org_id: string
          pipeline_id: string
          stage_id: string
          title: string
          updated_at?: string
        }
        Update: {
          amount?: number | null
          assigned_to?: string | null
          company_id?: string | null
          contact_id?: string | null
          created_at?: string
          created_by?: string | null
          expected_close_date?: string | null
          id?: string
          org_id?: string
          pipeline_id?: string
          stage_id?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "deals_company_id_org_id_fkey"
            columns: ["company_id", "org_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id", "org_id"]
          },
          {
            foreignKeyName: "deals_contact_id_org_id_fkey"
            columns: ["contact_id", "org_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id", "org_id"]
          },
          {
            foreignKeyName: "deals_org_id_assigned_to_fkey"
            columns: ["org_id", "assigned_to"]
            isOneToOne: false
            referencedRelation: "organization_members"
            referencedColumns: ["org_id", "user_id"]
          },
          {
            foreignKeyName: "deals_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "deals_pipeline_id_org_id_fkey"
            columns: ["pipeline_id", "org_id"]
            isOneToOne: false
            referencedRelation: "pipelines"
            referencedColumns: ["id", "org_id"]
          },
          {
            foreignKeyName: "deals_stage_id_pipeline_id_fkey"
            columns: ["stage_id", "pipeline_id"]
            isOneToOne: false
            referencedRelation: "pipeline_stages"
            referencedColumns: ["id", "pipeline_id"]
          },
        ]
      }
      execution_records: {
        Row: {
          created_at: string
          created_by: string | null
          details: Json
          execution_type: Database["public"]["Enums"]["execution_type"]
          id: string
          org_id: string
          proposal_id: string
          proposal_option_id: string
          status: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          details?: Json
          execution_type: Database["public"]["Enums"]["execution_type"]
          id?: string
          org_id: string
          proposal_id: string
          proposal_option_id: string
          status?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          details?: Json
          execution_type?: Database["public"]["Enums"]["execution_type"]
          id?: string
          org_id?: string
          proposal_id?: string
          proposal_option_id?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "execution_records_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "execution_records_proposal_id_org_id_fkey"
            columns: ["proposal_id", "org_id"]
            isOneToOne: false
            referencedRelation: "proposals"
            referencedColumns: ["id", "org_id"]
          },
          {
            foreignKeyName: "execution_records_proposal_option_id_proposal_id_fkey"
            columns: ["proposal_option_id", "proposal_id"]
            isOneToOne: false
            referencedRelation: "proposal_options"
            referencedColumns: ["id", "proposal_id"]
          },
        ]
      }
      features: {
        Row: {
          category: string | null
          created_at: string
          description: string | null
          icon: string | null
          id: string
          name: string
          noun: string | null
          route: string
          sort_order: number
        }
        Insert: {
          category?: string | null
          created_at?: string
          description?: string | null
          icon?: string | null
          id: string
          name: string
          noun?: string | null
          route: string
          sort_order?: number
        }
        Update: {
          category?: string | null
          created_at?: string
          description?: string | null
          icon?: string | null
          id?: string
          name?: string
          noun?: string | null
          route?: string
          sort_order?: number
        }
        Relationships: []
      }
      industries: {
        Row: {
          created_at: string
          id: string
          name: string
        }
        Insert: {
          created_at?: string
          id: string
          name: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
        }
        Relationships: []
      }
      industry_features: {
        Row: {
          created_at: string
          feature_id: string
          industry_id: string
          name: string | null
          noun: string | null
        }
        Insert: {
          created_at?: string
          feature_id: string
          industry_id: string
          name?: string | null
          noun?: string | null
        }
        Update: {
          created_at?: string
          feature_id?: string
          industry_id?: string
          name?: string | null
          noun?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "industry_features_feature_id_fkey"
            columns: ["feature_id"]
            isOneToOne: false
            referencedRelation: "features"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "industry_features_industry_id_fkey"
            columns: ["industry_id"]
            isOneToOne: false
            referencedRelation: "industries"
            referencedColumns: ["id"]
          },
        ]
      }
      industry_terms: {
        Row: {
          created_at: string
          industry_id: string
          label: string
          term_id: string
        }
        Insert: {
          created_at?: string
          industry_id: string
          label: string
          term_id: string
        }
        Update: {
          created_at?: string
          industry_id?: string
          label?: string
          term_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "industry_terms_industry_id_fkey"
            columns: ["industry_id"]
            isOneToOne: false
            referencedRelation: "industries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "industry_terms_term_id_fkey"
            columns: ["term_id"]
            isOneToOne: false
            referencedRelation: "terms"
            referencedColumns: ["id"]
          },
        ]
      }
      invoice_line_items: {
        Row: {
          created_at: string
          description: string
          discount: number
          id: string
          invoice_id: string
          line_total: number | null
          net_amount: number | null
          org_id: string
          product_id: string | null
          product_sku_snapshot: string | null
          quantity: number
          sort_order: number
          tax: number
          unit_price: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          description: string
          discount?: number
          id?: string
          invoice_id: string
          line_total?: number | null
          net_amount?: number | null
          org_id: string
          product_id?: string | null
          product_sku_snapshot?: string | null
          quantity?: number
          sort_order?: number
          tax?: number
          unit_price?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string
          discount?: number
          id?: string
          invoice_id?: string
          line_total?: number | null
          net_amount?: number | null
          org_id?: string
          product_id?: string | null
          product_sku_snapshot?: string | null
          quantity?: number
          sort_order?: number
          tax?: number
          unit_price?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "invoice_line_items_invoice_id_org_id_fkey"
            columns: ["invoice_id", "org_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id", "org_id"]
          },
          {
            foreignKeyName: "invoice_line_items_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoice_line_items_product_id_org_id_fkey"
            columns: ["product_id", "org_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id", "org_id"]
          },
        ]
      }
      invoices: {
        Row: {
          amount_paid: number
          balance_due: number | null
          billing_email: string | null
          company_id: string
          contact_id: string | null
          created_at: string
          created_by: string | null
          currency: string
          discount: number
          due_date: string | null
          id: string
          issued_at: string | null
          memo: string | null
          notes: string | null
          number: string
          order_id: string | null
          org_id: string
          paid_at: string | null
          payment_status: Database["public"]["Enums"]["payment_state"]
          payment_terms_days: number | null
          shipping: number
          status: Database["public"]["Enums"]["invoice_status"]
          subtotal: number
          tax: number
          total: number | null
          updated_at: string
          voided_at: string | null
        }
        Insert: {
          amount_paid?: number
          balance_due?: number | null
          billing_email?: string | null
          company_id: string
          contact_id?: string | null
          created_at?: string
          created_by?: string | null
          currency?: string
          discount?: number
          due_date?: string | null
          id?: string
          issued_at?: string | null
          memo?: string | null
          notes?: string | null
          number: string
          order_id?: string | null
          org_id: string
          paid_at?: string | null
          payment_status?: Database["public"]["Enums"]["payment_state"]
          payment_terms_days?: number | null
          shipping?: number
          status?: Database["public"]["Enums"]["invoice_status"]
          subtotal?: number
          tax?: number
          total?: number | null
          updated_at?: string
          voided_at?: string | null
        }
        Update: {
          amount_paid?: number
          balance_due?: number | null
          billing_email?: string | null
          company_id?: string
          contact_id?: string | null
          created_at?: string
          created_by?: string | null
          currency?: string
          discount?: number
          due_date?: string | null
          id?: string
          issued_at?: string | null
          memo?: string | null
          notes?: string | null
          number?: string
          order_id?: string | null
          org_id?: string
          paid_at?: string | null
          payment_status?: Database["public"]["Enums"]["payment_state"]
          payment_terms_days?: number | null
          shipping?: number
          status?: Database["public"]["Enums"]["invoice_status"]
          subtotal?: number
          tax?: number
          total?: number | null
          updated_at?: string
          voided_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "invoices_company_id_org_id_fkey"
            columns: ["company_id", "org_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id", "org_id"]
          },
          {
            foreignKeyName: "invoices_contact_id_org_id_fkey"
            columns: ["contact_id", "org_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id", "org_id"]
          },
          {
            foreignKeyName: "invoices_order_id_org_id_fkey"
            columns: ["order_id", "org_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id", "org_id"]
          },
          {
            foreignKeyName: "invoices_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      member_roles: {
        Row: {
          created_at: string
          org_id: string
          role_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          org_id: string
          role_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          org_id?: string
          role_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "member_roles_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "member_roles_org_id_user_id_fkey"
            columns: ["org_id", "user_id"]
            isOneToOne: false
            referencedRelation: "organization_members"
            referencedColumns: ["org_id", "user_id"]
          },
          {
            foreignKeyName: "member_roles_role_id_fkey"
            columns: ["role_id"]
            isOneToOne: false
            referencedRelation: "roles"
            referencedColumns: ["id"]
          },
        ]
      }
      notes: {
        Row: {
          archived_at: string | null
          author_id: string | null
          body: string
          color: Database["public"]["Enums"]["badge_tone"]
          created_at: string
          entity_id: string | null
          entity_type: Database["public"]["Enums"]["crm_entity_type"] | null
          id: string
          org_id: string
          position: number
          title: string | null
          updated_at: string
        }
        Insert: {
          archived_at?: string | null
          author_id?: string | null
          body?: string
          color?: Database["public"]["Enums"]["badge_tone"]
          created_at?: string
          entity_id?: string | null
          entity_type?: Database["public"]["Enums"]["crm_entity_type"] | null
          id?: string
          org_id: string
          position?: number
          title?: string | null
          updated_at?: string
        }
        Update: {
          archived_at?: string | null
          author_id?: string | null
          body?: string
          color?: Database["public"]["Enums"]["badge_tone"]
          created_at?: string
          entity_id?: string | null
          entity_type?: Database["public"]["Enums"]["crm_entity_type"] | null
          id?: string
          org_id?: string
          position?: number
          title?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "notes_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications: {
        Row: {
          body: string | null
          created_at: string
          id: string
          link: string | null
          org_id: string
          read_at: string | null
          title: string
          type: string
          user_id: string
        }
        Insert: {
          body?: string | null
          created_at?: string
          id?: string
          link?: string | null
          org_id: string
          read_at?: string | null
          title: string
          type: string
          user_id: string
        }
        Update: {
          body?: string | null
          created_at?: string
          id?: string
          link?: string | null
          org_id?: string
          read_at?: string | null
          title?: string
          type?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "notifications_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notifications_org_id_user_id_fkey"
            columns: ["org_id", "user_id"]
            isOneToOne: false
            referencedRelation: "organization_members"
            referencedColumns: ["org_id", "user_id"]
          },
        ]
      }
      order_line_items: {
        Row: {
          created_at: string
          description: string
          discount: number
          fulfillment_status: Database["public"]["Enums"]["line_fulfillment_status"]
          fulfillment_status_changed_at: string | null
          id: string
          line_total: number | null
          net_amount: number | null
          order_id: string
          org_id: string
          product_id: string | null
          product_sku_snapshot: string | null
          quantity: number
          sort_order: number
          supplier_id: string | null
          tax: number
          unit_price: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          description: string
          discount?: number
          fulfillment_status?: Database["public"]["Enums"]["line_fulfillment_status"]
          fulfillment_status_changed_at?: string | null
          id?: string
          line_total?: number | null
          net_amount?: number | null
          order_id: string
          org_id: string
          product_id?: string | null
          product_sku_snapshot?: string | null
          quantity?: number
          sort_order?: number
          supplier_id?: string | null
          tax?: number
          unit_price?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string
          discount?: number
          fulfillment_status?: Database["public"]["Enums"]["line_fulfillment_status"]
          fulfillment_status_changed_at?: string | null
          id?: string
          line_total?: number | null
          net_amount?: number | null
          order_id?: string
          org_id?: string
          product_id?: string | null
          product_sku_snapshot?: string | null
          quantity?: number
          sort_order?: number
          supplier_id?: string | null
          tax?: number
          unit_price?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "order_line_items_order_id_org_id_fkey"
            columns: ["order_id", "org_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id", "org_id"]
          },
          {
            foreignKeyName: "order_line_items_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_line_items_product_id_org_id_fkey"
            columns: ["product_id", "org_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id", "org_id"]
          },
          {
            foreignKeyName: "order_line_items_supplier_id_org_id_fkey"
            columns: ["supplier_id", "org_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id", "org_id"]
          },
        ]
      }
      orders: {
        Row: {
          cancelled_at: string | null
          company_id: string
          confirmed_at: string | null
          contact_id: string | null
          created_at: string
          created_by: string | null
          currency: string
          customer_po: string | null
          discount: number
          estimated_ship_date: string | null
          fulfillment_status: Database["public"]["Enums"]["fulfillment_state"]
          id: string
          idempotency_key: string | null
          notes: string | null
          number: string
          org_id: string
          placed_at: string | null
          ship_to_snapshot: Json | null
          shipping: number
          status: Database["public"]["Enums"]["order_status"]
          subtotal: number
          tax: number
          total: number | null
          updated_at: string
        }
        Insert: {
          cancelled_at?: string | null
          company_id: string
          confirmed_at?: string | null
          contact_id?: string | null
          created_at?: string
          created_by?: string | null
          currency?: string
          customer_po?: string | null
          discount?: number
          estimated_ship_date?: string | null
          fulfillment_status?: Database["public"]["Enums"]["fulfillment_state"]
          id?: string
          idempotency_key?: string | null
          notes?: string | null
          number: string
          org_id: string
          placed_at?: string | null
          ship_to_snapshot?: Json | null
          shipping?: number
          status?: Database["public"]["Enums"]["order_status"]
          subtotal?: number
          tax?: number
          total?: number | null
          updated_at?: string
        }
        Update: {
          cancelled_at?: string | null
          company_id?: string
          confirmed_at?: string | null
          contact_id?: string | null
          created_at?: string
          created_by?: string | null
          currency?: string
          customer_po?: string | null
          discount?: number
          estimated_ship_date?: string | null
          fulfillment_status?: Database["public"]["Enums"]["fulfillment_state"]
          id?: string
          idempotency_key?: string | null
          notes?: string | null
          number?: string
          org_id?: string
          placed_at?: string | null
          ship_to_snapshot?: Json | null
          shipping?: number
          status?: Database["public"]["Enums"]["order_status"]
          subtotal?: number
          tax?: number
          total?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "orders_company_id_org_id_fkey"
            columns: ["company_id", "org_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id", "org_id"]
          },
          {
            foreignKeyName: "orders_contact_id_org_id_fkey"
            columns: ["contact_id", "org_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id", "org_id"]
          },
          {
            foreignKeyName: "orders_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      organization_disabled_features: {
        Row: {
          created_at: string
          feature_id: string
          org_id: string
        }
        Insert: {
          created_at?: string
          feature_id: string
          org_id: string
        }
        Update: {
          created_at?: string
          feature_id?: string
          org_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "organization_disabled_features_feature_id_fkey"
            columns: ["feature_id"]
            isOneToOne: false
            referencedRelation: "features"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "organization_disabled_features_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      organization_feature_overrides: {
        Row: {
          created_at: string
          feature_id: string
          mode: Database["public"]["Enums"]["feature_mode"]
          note: string | null
          org_id: string
        }
        Insert: {
          created_at?: string
          feature_id: string
          mode: Database["public"]["Enums"]["feature_mode"]
          note?: string | null
          org_id: string
        }
        Update: {
          created_at?: string
          feature_id?: string
          mode?: Database["public"]["Enums"]["feature_mode"]
          note?: string | null
          org_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "organization_feature_overrides_feature_id_fkey"
            columns: ["feature_id"]
            isOneToOne: false
            referencedRelation: "features"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "organization_feature_overrides_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      organization_invites: {
        Row: {
          created_at: string
          email: string | null
          expires_at: string
          id: string
          invited_by: string | null
          org_id: string
          token: string
        }
        Insert: {
          created_at?: string
          email?: string | null
          expires_at?: string
          id?: string
          invited_by?: string | null
          org_id: string
          token?: string
        }
        Update: {
          created_at?: string
          email?: string | null
          expires_at?: string
          id?: string
          invited_by?: string | null
          org_id?: string
          token?: string
        }
        Relationships: [
          {
            foreignKeyName: "organization_invites_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      organization_members: {
        Row: {
          created_at: string
          org_id: string
          role: Database["public"]["Enums"]["org_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          org_id: string
          role?: Database["public"]["Enums"]["org_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          org_id?: string
          role?: Database["public"]["Enums"]["org_role"]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "organization_members_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "organization_members_user_id_profiles_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      organizations: {
        Row: {
          created_at: string
          id: string
          industry_id: string
          name: string
          tier_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          industry_id?: string
          name: string
          tier_id?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          industry_id?: string
          name?: string
          tier_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "organizations_industry_id_fkey"
            columns: ["industry_id"]
            isOneToOne: false
            referencedRelation: "industries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "organizations_tier_id_fkey"
            columns: ["tier_id"]
            isOneToOne: false
            referencedRelation: "tiers"
            referencedColumns: ["id"]
          },
        ]
      }
      pages: {
        Row: {
          created_at: string
          feature_id: string | null
          id: string
          path: string
          title: string | null
        }
        Insert: {
          created_at?: string
          feature_id?: string | null
          id: string
          path: string
          title?: string | null
        }
        Update: {
          created_at?: string
          feature_id?: string | null
          id?: string
          path?: string
          title?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "pages_feature_id_fkey"
            columns: ["feature_id"]
            isOneToOne: false
            referencedRelation: "features"
            referencedColumns: ["id"]
          },
        ]
      }
      payments: {
        Row: {
          amount: number
          company_id: string
          created_at: string
          created_by: string | null
          currency: string
          id: string
          idempotency_key: string | null
          invoice_id: string | null
          kind: Database["public"]["Enums"]["payment_kind"]
          method: Database["public"]["Enums"]["payment_method"]
          notes: string | null
          org_id: string
          received_at: string
          reference: string | null
          signed_amount: number | null
          updated_at: string
        }
        Insert: {
          amount: number
          company_id: string
          created_at?: string
          created_by?: string | null
          currency?: string
          id?: string
          idempotency_key?: string | null
          invoice_id?: string | null
          kind?: Database["public"]["Enums"]["payment_kind"]
          method?: Database["public"]["Enums"]["payment_method"]
          notes?: string | null
          org_id: string
          received_at?: string
          reference?: string | null
          signed_amount?: number | null
          updated_at?: string
        }
        Update: {
          amount?: number
          company_id?: string
          created_at?: string
          created_by?: string | null
          currency?: string
          id?: string
          idempotency_key?: string | null
          invoice_id?: string | null
          kind?: Database["public"]["Enums"]["payment_kind"]
          method?: Database["public"]["Enums"]["payment_method"]
          notes?: string | null
          org_id?: string
          received_at?: string
          reference?: string | null
          signed_amount?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "payments_company_id_org_id_fkey"
            columns: ["company_id", "org_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id", "org_id"]
          },
          {
            foreignKeyName: "payments_invoice_id_org_id_fkey"
            columns: ["invoice_id", "org_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id", "org_id"]
          },
          {
            foreignKeyName: "payments_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      pipeline_stages: {
        Row: {
          created_at: string
          id: string
          name: string
          org_id: string
          outcome: Database["public"]["Enums"]["stage_outcome"]
          pipeline_id: string
          probability: number | null
          sort_order: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          org_id: string
          outcome?: Database["public"]["Enums"]["stage_outcome"]
          pipeline_id: string
          probability?: number | null
          sort_order?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          org_id?: string
          outcome?: Database["public"]["Enums"]["stage_outcome"]
          pipeline_id?: string
          probability?: number | null
          sort_order?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "pipeline_stages_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pipeline_stages_pipeline_id_org_id_fkey"
            columns: ["pipeline_id", "org_id"]
            isOneToOne: false
            referencedRelation: "pipelines"
            referencedColumns: ["id", "org_id"]
          },
        ]
      }
      pipelines: {
        Row: {
          created_at: string
          description: string | null
          id: string
          is_default: boolean
          name: string
          org_id: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          is_default?: boolean
          name: string
          org_id: string
          sort_order?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          is_default?: boolean
          name?: string
          org_id?: string
          sort_order?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "pipelines_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      product_categories: {
        Row: {
          created_at: string
          description: string | null
          id: string
          name: string
          org_id: string
          parent_id: string | null
          sort_order: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          name: string
          org_id: string
          parent_id?: string | null
          sort_order?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          name?: string
          org_id?: string
          parent_id?: string | null
          sort_order?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "product_categories_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_categories_parent_id_org_id_fkey"
            columns: ["parent_id", "org_id"]
            isOneToOne: false
            referencedRelation: "product_categories"
            referencedColumns: ["id", "org_id"]
          },
        ]
      }
      products: {
        Row: {
          category_id: string | null
          created_at: string
          created_by: string | null
          currency: string
          description: string | null
          id: string
          is_active: boolean
          kind: Database["public"]["Enums"]["product_kind"]
          name: string
          org_id: string
          quantity_on_hand: number | null
          sku: string | null
          track_inventory: boolean
          unit: string | null
          unit_cost: number | null
          unit_price: number
          updated_at: string
        }
        Insert: {
          category_id?: string | null
          created_at?: string
          created_by?: string | null
          currency?: string
          description?: string | null
          id?: string
          is_active?: boolean
          kind?: Database["public"]["Enums"]["product_kind"]
          name: string
          org_id: string
          quantity_on_hand?: number | null
          sku?: string | null
          track_inventory?: boolean
          unit?: string | null
          unit_cost?: number | null
          unit_price?: number
          updated_at?: string
        }
        Update: {
          category_id?: string | null
          created_at?: string
          created_by?: string | null
          currency?: string
          description?: string | null
          id?: string
          is_active?: boolean
          kind?: Database["public"]["Enums"]["product_kind"]
          name?: string
          org_id?: string
          quantity_on_hand?: number | null
          sku?: string | null
          track_inventory?: boolean
          unit?: string | null
          unit_cost?: number | null
          unit_price?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "products_category_id_org_id_fkey"
            columns: ["category_id", "org_id"]
            isOneToOne: false
            referencedRelation: "product_categories"
            referencedColumns: ["id", "org_id"]
          },
          {
            foreignKeyName: "products_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          display_name: string | null
          email: string | null
          id: string
          updated_at: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          display_name?: string | null
          email?: string | null
          id: string
          updated_at?: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          display_name?: string | null
          email?: string | null
          id?: string
          updated_at?: string
        }
        Relationships: []
      }
      proposal_events: {
        Row: {
          actor: string | null
          event_type: Database["public"]["Enums"]["proposal_event_type"]
          id: string
          metadata: Json
          occurred_at: string
          org_id: string
          proposal_id: string
          proposal_option_id: string | null
        }
        Insert: {
          actor?: string | null
          event_type: Database["public"]["Enums"]["proposal_event_type"]
          id?: string
          metadata?: Json
          occurred_at?: string
          org_id: string
          proposal_id: string
          proposal_option_id?: string | null
        }
        Update: {
          actor?: string | null
          event_type?: Database["public"]["Enums"]["proposal_event_type"]
          id?: string
          metadata?: Json
          occurred_at?: string
          org_id?: string
          proposal_id?: string
          proposal_option_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "proposal_events_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "proposal_events_proposal_id_org_id_fkey"
            columns: ["proposal_id", "org_id"]
            isOneToOne: false
            referencedRelation: "proposals"
            referencedColumns: ["id", "org_id"]
          },
          {
            foreignKeyName: "proposal_events_proposal_option_id_proposal_id_fkey"
            columns: ["proposal_option_id", "proposal_id"]
            isOneToOne: false
            referencedRelation: "proposal_options"
            referencedColumns: ["id", "proposal_id"]
          },
        ]
      }
      proposal_line_items: {
        Row: {
          billable_id: string | null
          created_at: string
          detail: string | null
          id: string
          label: string
          org_id: string
          product_id: string | null
          proposal_option_id: string
          quantity: number
          sort_order: number
          total: number | null
          unit_cost: number
          updated_at: string
        }
        Insert: {
          billable_id?: string | null
          created_at?: string
          detail?: string | null
          id?: string
          label: string
          org_id: string
          product_id?: string | null
          proposal_option_id: string
          quantity?: number
          sort_order?: number
          total?: number | null
          unit_cost?: number
          updated_at?: string
        }
        Update: {
          billable_id?: string | null
          created_at?: string
          detail?: string | null
          id?: string
          label?: string
          org_id?: string
          product_id?: string | null
          proposal_option_id?: string
          quantity?: number
          sort_order?: number
          total?: number | null
          unit_cost?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "proposal_line_items_billable_id_org_id_fkey"
            columns: ["billable_id", "org_id"]
            isOneToOne: false
            referencedRelation: "billables"
            referencedColumns: ["id", "org_id"]
          },
          {
            foreignKeyName: "proposal_line_items_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "proposal_line_items_product_id_org_id_fkey"
            columns: ["product_id", "org_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id", "org_id"]
          },
          {
            foreignKeyName: "proposal_line_items_proposal_option_id_org_id_fkey"
            columns: ["proposal_option_id", "org_id"]
            isOneToOne: false
            referencedRelation: "proposal_options"
            referencedColumns: ["id", "org_id"]
          },
        ]
      }
      proposal_options: {
        Row: {
          base_price: number
          computed_total: number | null
          created_at: string
          currency: string
          custom_fields: Json
          discount_amount: number
          discount_pct: number | null
          duration_unit: Database["public"]["Enums"]["duration_unit"] | null
          duration_value: number | null
          fee_override: number | null
          financing_apr: number | null
          financing_available: boolean
          financing_term_months: number | null
          id: string
          is_recommended: boolean
          label: string
          org_id: string
          primary_image_url: string | null
          proposal_id: string
          sort_order: number
          start_offset_days: number | null
          updated_at: string
        }
        Insert: {
          base_price?: number
          computed_total?: number | null
          created_at?: string
          currency?: string
          custom_fields?: Json
          discount_amount?: number
          discount_pct?: number | null
          duration_unit?: Database["public"]["Enums"]["duration_unit"] | null
          duration_value?: number | null
          fee_override?: number | null
          financing_apr?: number | null
          financing_available?: boolean
          financing_term_months?: number | null
          id?: string
          is_recommended?: boolean
          label: string
          org_id: string
          primary_image_url?: string | null
          proposal_id: string
          sort_order?: number
          start_offset_days?: number | null
          updated_at?: string
        }
        Update: {
          base_price?: number
          computed_total?: number | null
          created_at?: string
          currency?: string
          custom_fields?: Json
          discount_amount?: number
          discount_pct?: number | null
          duration_unit?: Database["public"]["Enums"]["duration_unit"] | null
          duration_value?: number | null
          fee_override?: number | null
          financing_apr?: number | null
          financing_available?: boolean
          financing_term_months?: number | null
          id?: string
          is_recommended?: boolean
          label?: string
          org_id?: string
          primary_image_url?: string | null
          proposal_id?: string
          sort_order?: number
          start_offset_days?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "proposal_options_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "proposal_options_proposal_id_org_id_fkey"
            columns: ["proposal_id", "org_id"]
            isOneToOne: false
            referencedRelation: "proposals"
            referencedColumns: ["id", "org_id"]
          },
        ]
      }
      proposals: {
        Row: {
          base_config: Json
          created_at: string
          created_by: string | null
          deck_id: string | null
          default_fee: number | null
          entity_id: string | null
          entity_type: Database["public"]["Enums"]["crm_entity_type"] | null
          id: string
          org_id: string
          presenter_id: string | null
          responsible_id: string | null
          selected_option_id: string | null
          status: Database["public"]["Enums"]["proposal_status"]
          tax_rate: number | null
          title: string
          updated_at: string
          valid_until: string | null
        }
        Insert: {
          base_config?: Json
          created_at?: string
          created_by?: string | null
          deck_id?: string | null
          default_fee?: number | null
          entity_id?: string | null
          entity_type?: Database["public"]["Enums"]["crm_entity_type"] | null
          id?: string
          org_id: string
          presenter_id?: string | null
          responsible_id?: string | null
          selected_option_id?: string | null
          status?: Database["public"]["Enums"]["proposal_status"]
          tax_rate?: number | null
          title: string
          updated_at?: string
          valid_until?: string | null
        }
        Update: {
          base_config?: Json
          created_at?: string
          created_by?: string | null
          deck_id?: string | null
          default_fee?: number | null
          entity_id?: string | null
          entity_type?: Database["public"]["Enums"]["crm_entity_type"] | null
          id?: string
          org_id?: string
          presenter_id?: string | null
          responsible_id?: string | null
          selected_option_id?: string | null
          status?: Database["public"]["Enums"]["proposal_status"]
          tax_rate?: number | null
          title?: string
          updated_at?: string
          valid_until?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "proposals_deck_id_org_id_fkey"
            columns: ["deck_id", "org_id"]
            isOneToOne: false
            referencedRelation: "slide_decks"
            referencedColumns: ["id", "org_id"]
          },
          {
            foreignKeyName: "proposals_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "proposals_org_id_presenter_id_fkey"
            columns: ["org_id", "presenter_id"]
            isOneToOne: false
            referencedRelation: "organization_members"
            referencedColumns: ["org_id", "user_id"]
          },
          {
            foreignKeyName: "proposals_org_id_responsible_id_fkey"
            columns: ["org_id", "responsible_id"]
            isOneToOne: false
            referencedRelation: "organization_members"
            referencedColumns: ["org_id", "user_id"]
          },
          {
            foreignKeyName: "proposals_selected_option_id_id_fkey"
            columns: ["selected_option_id", "id"]
            isOneToOne: false
            referencedRelation: "proposal_options"
            referencedColumns: ["id", "proposal_id"]
          },
        ]
      }
      purchase_line_items: {
        Row: {
          created_at: string
          description: string
          freight_allocation: number
          id: string
          landed_unit_cost: number | null
          line_total: number | null
          org_id: string
          product_id: string | null
          product_sku_snapshot: string | null
          purchase_id: string
          quantity_ordered: number
          quantity_received: number
          sort_order: number
          unit_cost: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          description: string
          freight_allocation?: number
          id?: string
          landed_unit_cost?: number | null
          line_total?: number | null
          org_id: string
          product_id?: string | null
          product_sku_snapshot?: string | null
          purchase_id: string
          quantity_ordered?: number
          quantity_received?: number
          sort_order?: number
          unit_cost?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string
          freight_allocation?: number
          id?: string
          landed_unit_cost?: number | null
          line_total?: number | null
          org_id?: string
          product_id?: string | null
          product_sku_snapshot?: string | null
          purchase_id?: string
          quantity_ordered?: number
          quantity_received?: number
          sort_order?: number
          unit_cost?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "purchase_line_items_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_line_items_product_id_org_id_fkey"
            columns: ["product_id", "org_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id", "org_id"]
          },
          {
            foreignKeyName: "purchase_line_items_purchase_id_org_id_fkey"
            columns: ["purchase_id", "org_id"]
            isOneToOne: false
            referencedRelation: "purchases"
            referencedColumns: ["id", "org_id"]
          },
        ]
      }
      purchases: {
        Row: {
          company_id: string
          created_at: string
          created_by: string | null
          currency: string
          distribution_fee: number
          distribution_fee_pct: number | null
          due_date: string | null
          expected_at: string | null
          freight: number
          id: string
          notes: string | null
          number: string
          ordered_at: string | null
          org_id: string
          paid_at: string | null
          payment_status: Database["public"]["Enums"]["payment_state"]
          received_at: string | null
          reference: string | null
          status: Database["public"]["Enums"]["purchase_status"]
          subtotal: number
          tax: number
          total: number | null
          updated_at: string
        }
        Insert: {
          company_id: string
          created_at?: string
          created_by?: string | null
          currency?: string
          distribution_fee?: number
          distribution_fee_pct?: number | null
          due_date?: string | null
          expected_at?: string | null
          freight?: number
          id?: string
          notes?: string | null
          number: string
          ordered_at?: string | null
          org_id: string
          paid_at?: string | null
          payment_status?: Database["public"]["Enums"]["payment_state"]
          received_at?: string | null
          reference?: string | null
          status?: Database["public"]["Enums"]["purchase_status"]
          subtotal?: number
          tax?: number
          total?: number | null
          updated_at?: string
        }
        Update: {
          company_id?: string
          created_at?: string
          created_by?: string | null
          currency?: string
          distribution_fee?: number
          distribution_fee_pct?: number | null
          due_date?: string | null
          expected_at?: string | null
          freight?: number
          id?: string
          notes?: string | null
          number?: string
          ordered_at?: string | null
          org_id?: string
          paid_at?: string | null
          payment_status?: Database["public"]["Enums"]["payment_state"]
          received_at?: string | null
          reference?: string | null
          status?: Database["public"]["Enums"]["purchase_status"]
          subtotal?: number
          tax?: number
          total?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "purchases_company_id_org_id_fkey"
            columns: ["company_id", "org_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id", "org_id"]
          },
          {
            foreignKeyName: "purchases_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      quick_plan_billables: {
        Row: {
          billable_id: string
          created_at: string
          org_id: string
          quick_plan_id: string
          sort_order: number
        }
        Insert: {
          billable_id: string
          created_at?: string
          org_id: string
          quick_plan_id: string
          sort_order?: number
        }
        Update: {
          billable_id?: string
          created_at?: string
          org_id?: string
          quick_plan_id?: string
          sort_order?: number
        }
        Relationships: [
          {
            foreignKeyName: "quick_plan_billables_billable_id_org_id_fkey"
            columns: ["billable_id", "org_id"]
            isOneToOne: false
            referencedRelation: "billables"
            referencedColumns: ["id", "org_id"]
          },
          {
            foreignKeyName: "quick_plan_billables_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quick_plan_billables_quick_plan_id_org_id_fkey"
            columns: ["quick_plan_id", "org_id"]
            isOneToOne: false
            referencedRelation: "quick_plans"
            referencedColumns: ["id", "org_id"]
          },
        ]
      }
      quick_plans: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          name: string
          org_id: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          name: string
          org_id: string
          sort_order?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          name?: string
          org_id?: string
          sort_order?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "quick_plans_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      role_permissions: {
        Row: {
          created_at: string
          feature_id: string
          level: Database["public"]["Enums"]["permission_level"]
          role_id: string
        }
        Insert: {
          created_at?: string
          feature_id: string
          level?: Database["public"]["Enums"]["permission_level"]
          role_id: string
        }
        Update: {
          created_at?: string
          feature_id?: string
          level?: Database["public"]["Enums"]["permission_level"]
          role_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "role_permissions_feature_id_fkey"
            columns: ["feature_id"]
            isOneToOne: false
            referencedRelation: "features"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "role_permissions_role_id_fkey"
            columns: ["role_id"]
            isOneToOne: false
            referencedRelation: "roles"
            referencedColumns: ["id"]
          },
        ]
      }
      roles: {
        Row: {
          created_at: string
          description: string | null
          id: string
          industry_id: string
          name: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          industry_id: string
          name: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          industry_id?: string
          name?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "roles_industry_id_fkey"
            columns: ["industry_id"]
            isOneToOne: false
            referencedRelation: "industries"
            referencedColumns: ["id"]
          },
        ]
      }
      shipment_events: {
        Row: {
          city: string | null
          country: string | null
          created_at: string
          description: string | null
          id: string
          message: string
          occurred_at: string
          org_id: string
          postal_code: string | null
          region: string | null
          shipment_id: string
          source: string | null
          status: string | null
          status_detail: string | null
        }
        Insert: {
          city?: string | null
          country?: string | null
          created_at?: string
          description?: string | null
          id?: string
          message: string
          occurred_at: string
          org_id: string
          postal_code?: string | null
          region?: string | null
          shipment_id: string
          source?: string | null
          status?: string | null
          status_detail?: string | null
        }
        Update: {
          city?: string | null
          country?: string | null
          created_at?: string
          description?: string | null
          id?: string
          message?: string
          occurred_at?: string
          org_id?: string
          postal_code?: string | null
          region?: string | null
          shipment_id?: string
          source?: string | null
          status?: string | null
          status_detail?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "shipment_events_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shipment_events_shipment_id_org_id_fkey"
            columns: ["shipment_id", "org_id"]
            isOneToOne: false
            referencedRelation: "shipments"
            referencedColumns: ["id", "org_id"]
          },
        ]
      }
      shipment_line_items: {
        Row: {
          created_at: string
          order_line_item_id: string
          org_id: string
          shipment_id: string
        }
        Insert: {
          created_at?: string
          order_line_item_id: string
          org_id: string
          shipment_id: string
        }
        Update: {
          created_at?: string
          order_line_item_id?: string
          org_id?: string
          shipment_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "shipment_line_items_order_line_item_id_org_id_fkey"
            columns: ["order_line_item_id", "org_id"]
            isOneToOne: false
            referencedRelation: "order_line_items"
            referencedColumns: ["id", "org_id"]
          },
          {
            foreignKeyName: "shipment_line_items_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shipment_line_items_shipment_id_org_id_fkey"
            columns: ["shipment_id", "org_id"]
            isOneToOne: false
            referencedRelation: "shipments"
            referencedColumns: ["id", "org_id"]
          },
        ]
      }
      shipments: {
        Row: {
          carrier: string | null
          carrier_updated_at: string | null
          created_at: string
          created_by: string | null
          delivered_at: string | null
          delivery_status: Database["public"]["Enums"]["shipment_delivery_status"]
          estimated_delivery_date: string | null
          external_tracker_id: string | null
          id: string
          notes: string | null
          order_id: string
          org_id: string
          ship_date: string | null
          shipped_at: string | null
          status_detail: string | null
          supplier_id: string | null
          tracking_error: string | null
          tracking_number: string | null
          tracking_synced_at: string | null
          tracking_url: string | null
          updated_at: string
        }
        Insert: {
          carrier?: string | null
          carrier_updated_at?: string | null
          created_at?: string
          created_by?: string | null
          delivered_at?: string | null
          delivery_status?: Database["public"]["Enums"]["shipment_delivery_status"]
          estimated_delivery_date?: string | null
          external_tracker_id?: string | null
          id?: string
          notes?: string | null
          order_id: string
          org_id: string
          ship_date?: string | null
          shipped_at?: string | null
          status_detail?: string | null
          supplier_id?: string | null
          tracking_error?: string | null
          tracking_number?: string | null
          tracking_synced_at?: string | null
          tracking_url?: string | null
          updated_at?: string
        }
        Update: {
          carrier?: string | null
          carrier_updated_at?: string | null
          created_at?: string
          created_by?: string | null
          delivered_at?: string | null
          delivery_status?: Database["public"]["Enums"]["shipment_delivery_status"]
          estimated_delivery_date?: string | null
          external_tracker_id?: string | null
          id?: string
          notes?: string | null
          order_id?: string
          org_id?: string
          ship_date?: string | null
          shipped_at?: string | null
          status_detail?: string | null
          supplier_id?: string | null
          tracking_error?: string | null
          tracking_number?: string | null
          tracking_synced_at?: string | null
          tracking_url?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "shipments_order_id_org_id_fkey"
            columns: ["order_id", "org_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id", "org_id"]
          },
          {
            foreignKeyName: "shipments_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shipments_supplier_id_org_id_fkey"
            columns: ["supplier_id", "org_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id", "org_id"]
          },
        ]
      }
      slide_decks: {
        Row: {
          created_at: string
          created_by: string | null
          deck_json: Json
          id: string
          name: string
          org_id: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          deck_json?: Json
          id?: string
          name: string
          org_id: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          deck_json?: Json
          id?: string
          name?: string
          org_id?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "slide_decks_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      support_tickets: {
        Row: {
          assigned_to: string | null
          company_id: string | null
          contact_id: string | null
          created_at: string
          created_by: string | null
          description: string | null
          id: string
          number: number
          org_id: string
          priority: Database["public"]["Enums"]["ticket_priority"]
          status: Database["public"]["Enums"]["ticket_status"]
          subject: string
          updated_at: string
        }
        Insert: {
          assigned_to?: string | null
          company_id?: string | null
          contact_id?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          number?: never
          org_id: string
          priority?: Database["public"]["Enums"]["ticket_priority"]
          status?: Database["public"]["Enums"]["ticket_status"]
          subject: string
          updated_at?: string
        }
        Update: {
          assigned_to?: string | null
          company_id?: string | null
          contact_id?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          number?: never
          org_id?: string
          priority?: Database["public"]["Enums"]["ticket_priority"]
          status?: Database["public"]["Enums"]["ticket_status"]
          subject?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "support_tickets_company_id_org_id_fkey"
            columns: ["company_id", "org_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id", "org_id"]
          },
          {
            foreignKeyName: "support_tickets_contact_id_org_id_fkey"
            columns: ["contact_id", "org_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id", "org_id"]
          },
          {
            foreignKeyName: "support_tickets_org_id_assigned_to_fkey"
            columns: ["org_id", "assigned_to"]
            isOneToOne: false
            referencedRelation: "organization_members"
            referencedColumns: ["org_id", "user_id"]
          },
          {
            foreignKeyName: "support_tickets_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      system_admins: {
        Row: {
          created_at: string
          note: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          note?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          note?: string | null
          user_id?: string
        }
        Relationships: []
      }
      taggings: {
        Row: {
          created_at: string
          created_by: string | null
          entity_id: string
          entity_type: Database["public"]["Enums"]["crm_entity_type"]
          id: string
          org_id: string
          tag_id: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          entity_id: string
          entity_type: Database["public"]["Enums"]["crm_entity_type"]
          id?: string
          org_id: string
          tag_id: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          entity_id?: string
          entity_type?: Database["public"]["Enums"]["crm_entity_type"]
          id?: string
          org_id?: string
          tag_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "taggings_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "taggings_tag_id_org_id_fkey"
            columns: ["tag_id", "org_id"]
            isOneToOne: false
            referencedRelation: "tags"
            referencedColumns: ["id", "org_id"]
          },
        ]
      }
      tags: {
        Row: {
          created_at: string
          id: string
          name: string
          org_id: string
          tone: Database["public"]["Enums"]["badge_tone"]
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          org_id: string
          tone?: Database["public"]["Enums"]["badge_tone"]
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          org_id?: string
          tone?: Database["public"]["Enums"]["badge_tone"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "tags_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      tasks: {
        Row: {
          assigned_to: string | null
          company_id: string | null
          completed_at: string | null
          contact_id: string | null
          created_at: string
          created_by: string | null
          details: string | null
          due_at: string | null
          id: string
          org_id: string
          title: string
          updated_at: string
        }
        Insert: {
          assigned_to?: string | null
          company_id?: string | null
          completed_at?: string | null
          contact_id?: string | null
          created_at?: string
          created_by?: string | null
          details?: string | null
          due_at?: string | null
          id?: string
          org_id: string
          title: string
          updated_at?: string
        }
        Update: {
          assigned_to?: string | null
          company_id?: string | null
          completed_at?: string | null
          contact_id?: string | null
          created_at?: string
          created_by?: string | null
          details?: string | null
          due_at?: string | null
          id?: string
          org_id?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "tasks_company_id_org_id_fkey"
            columns: ["company_id", "org_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id", "org_id"]
          },
          {
            foreignKeyName: "tasks_contact_id_org_id_fkey"
            columns: ["contact_id", "org_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id", "org_id"]
          },
          {
            foreignKeyName: "tasks_org_id_assigned_to_fkey"
            columns: ["org_id", "assigned_to"]
            isOneToOne: false
            referencedRelation: "organization_members"
            referencedColumns: ["org_id", "user_id"]
          },
          {
            foreignKeyName: "tasks_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      terms: {
        Row: {
          created_at: string
          description: string | null
          id: string
          label: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id: string
          label: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          label?: string
        }
        Relationships: []
      }
      ticket_comments: {
        Row: {
          author_id: string | null
          body: string
          created_at: string
          id: string
          is_internal: boolean
          org_id: string
          ticket_id: string
          updated_at: string
        }
        Insert: {
          author_id?: string | null
          body: string
          created_at?: string
          id?: string
          is_internal?: boolean
          org_id: string
          ticket_id: string
          updated_at?: string
        }
        Update: {
          author_id?: string | null
          body?: string
          created_at?: string
          id?: string
          is_internal?: boolean
          org_id?: string
          ticket_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "ticket_comments_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ticket_comments_ticket_id_org_id_fkey"
            columns: ["ticket_id", "org_id"]
            isOneToOne: false
            referencedRelation: "support_tickets"
            referencedColumns: ["id", "org_id"]
          },
        ]
      }
      tier_features: {
        Row: {
          created_at: string
          feature_id: string
          tier_id: string
        }
        Insert: {
          created_at?: string
          feature_id: string
          tier_id: string
        }
        Update: {
          created_at?: string
          feature_id?: string
          tier_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "tier_features_feature_id_fkey"
            columns: ["feature_id"]
            isOneToOne: false
            referencedRelation: "features"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tier_features_tier_id_fkey"
            columns: ["tier_id"]
            isOneToOne: false
            referencedRelation: "tiers"
            referencedColumns: ["id"]
          },
        ]
      }
      tiers: {
        Row: {
          created_at: string
          id: string
          name: string
        }
        Insert: {
          created_at?: string
          id: string
          name: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
        }
        Relationships: []
      }
      user_preferences: {
        Row: {
          key: string
          updated_at: string
          user_id: string
          value: Json
        }
        Insert: {
          key: string
          updated_at?: string
          user_id: string
          value: Json
        }
        Update: {
          key?: string
          updated_at?: string
          user_id?: string
          value?: Json
        }
        Relationships: []
      }
      views: {
        Row: {
          columns: string[]
          created_at: string
          default_layout: string
          filter: Json
          id: string
          layouts: string[]
          source: Database["public"]["Enums"]["crm_entity_type"]
        }
        Insert: {
          columns: string[]
          created_at?: string
          default_layout?: string
          filter?: Json
          id: string
          layouts?: string[]
          source: Database["public"]["Enums"]["crm_entity_type"]
        }
        Update: {
          columns?: string[]
          created_at?: string
          default_layout?: string
          filter?: Json
          id?: string
          layouts?: string[]
          source?: Database["public"]["Enums"]["crm_entity_type"]
        }
        Relationships: [
          {
            foreignKeyName: "views_id_fkey"
            columns: ["id"]
            isOneToOne: true
            referencedRelation: "features"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      create_default_pipeline: { Args: { org: string }; Returns: string }
    }
    Enums: {
      activity_direction: "inbound" | "outbound"
      activity_type: "note" | "call" | "email" | "meeting" | "sms" | "other"
      address_kind: "primary" | "billing" | "shipping" | "service" | "other"
      badge_tone:
        | "neutral"
        | "success"
        | "info"
        | "warning"
        | "error"
        | "violet"
        | "orange"
        | "cyan"
        | "rose"
        | "indigo"
      company_relationship: "customer" | "supplier" | "partner" | "other"
      crm_entity_type:
        | "billable"
        | "company"
        | "contact"
        | "deal"
        | "invoice"
        | "order"
        | "product"
        | "proposal"
        | "proposal_option"
        | "purchase"
        | "shipment"
        | "task"
        | "ticket"
      custom_field_value_type: "text" | "numeric" | "boolean" | "select"
      duration_unit: "visits" | "days" | "weeks" | "months" | "sec"
      execution_type:
        | "appointment_schedule"
        | "work_order"
        | "purchase_order"
        | "production_run"
      feature_mode: "enabled" | "locked_visible" | "disabled" | "hidden"
      fulfillment_state: "unfulfilled" | "partial" | "fulfilled"
      invoice_status: "draft" | "issued" | "void"
      line_fulfillment_status:
        | "pending"
        | "processing"
        | "backordered"
        | "shipped"
        | "delivered"
        | "cancelled"
        | "returned"
      order_status: "draft" | "confirmed" | "cancelled"
      org_role: "owner" | "admin" | "member"
      party_status: "lead" | "prospect" | "active" | "inactive"
      payment_kind: "payment" | "refund"
      payment_method:
        | "check"
        | "ach"
        | "wire"
        | "card"
        | "cash"
        | "credit"
        | "other"
      payment_state: "unpaid" | "partial" | "paid"
      permission_level: "read" | "manage" | "delete"
      product_kind: "good" | "service"
      proposal_event_type:
        | "sent"
        | "viewed"
        | "option_selected"
        | "accepted"
        | "declined"
        | "expired"
      proposal_status:
        | "draft"
        | "sent"
        | "viewed"
        | "accepted"
        | "declined"
        | "expired"
      purchase_status:
        | "draft"
        | "ordered"
        | "partially_received"
        | "received"
        | "cancelled"
      shipment_delivery_status:
        | "preparing"
        | "pending"
        | "pre_transit"
        | "in_transit"
        | "out_for_delivery"
        | "available_for_pickup"
        | "delivered"
        | "return_to_sender"
        | "failed"
        | "cancelled"
        | "unknown"
      stage_outcome: "open" | "won" | "lost"
      ticket_priority: "low" | "normal" | "high" | "urgent"
      ticket_status: "open" | "pending" | "resolved" | "closed"
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
  public: {
    Enums: {
      activity_direction: ["inbound", "outbound"],
      activity_type: ["note", "call", "email", "meeting", "sms", "other"],
      address_kind: ["primary", "billing", "shipping", "service", "other"],
      badge_tone: [
        "neutral",
        "success",
        "info",
        "warning",
        "error",
        "violet",
        "orange",
        "cyan",
        "rose",
        "indigo",
      ],
      company_relationship: ["customer", "supplier", "partner", "other"],
      crm_entity_type: [
        "billable",
        "company",
        "contact",
        "deal",
        "invoice",
        "order",
        "product",
        "proposal",
        "proposal_option",
        "purchase",
        "shipment",
        "task",
        "ticket",
      ],
      custom_field_value_type: ["text", "numeric", "boolean", "select"],
      duration_unit: ["visits", "days", "weeks", "months", "sec"],
      execution_type: [
        "appointment_schedule",
        "work_order",
        "purchase_order",
        "production_run",
      ],
      feature_mode: ["enabled", "locked_visible", "disabled", "hidden"],
      fulfillment_state: ["unfulfilled", "partial", "fulfilled"],
      invoice_status: ["draft", "issued", "void"],
      line_fulfillment_status: [
        "pending",
        "processing",
        "backordered",
        "shipped",
        "delivered",
        "cancelled",
        "returned",
      ],
      order_status: ["draft", "confirmed", "cancelled"],
      org_role: ["owner", "admin", "member"],
      party_status: ["lead", "prospect", "active", "inactive"],
      payment_kind: ["payment", "refund"],
      payment_method: [
        "check",
        "ach",
        "wire",
        "card",
        "cash",
        "credit",
        "other",
      ],
      payment_state: ["unpaid", "partial", "paid"],
      permission_level: ["read", "manage", "delete"],
      product_kind: ["good", "service"],
      proposal_event_type: [
        "sent",
        "viewed",
        "option_selected",
        "accepted",
        "declined",
        "expired",
      ],
      proposal_status: [
        "draft",
        "sent",
        "viewed",
        "accepted",
        "declined",
        "expired",
      ],
      purchase_status: [
        "draft",
        "ordered",
        "partially_received",
        "received",
        "cancelled",
      ],
      shipment_delivery_status: [
        "preparing",
        "pending",
        "pre_transit",
        "in_transit",
        "out_for_delivery",
        "available_for_pickup",
        "delivered",
        "return_to_sender",
        "failed",
        "cancelled",
        "unknown",
      ],
      stage_outcome: ["open", "won", "lost"],
      ticket_priority: ["low", "normal", "high", "urgent"],
      ticket_status: ["open", "pending", "resolved", "closed"],
    },
  },
} as const

