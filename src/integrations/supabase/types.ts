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
  public: {
    Tables: {
      admin_invitations: {
        Row: {
          created_at: string
          created_by: string
          date_debut: string | null
          date_fin: string | null
          email: string
          expires_at: string
          id: string
          motif: string | null
          nom: string | null
          perimetre: string | null
          prenom: string | null
          revoked: boolean
          role: Database["public"]["Enums"]["app_role"]
          token: string
          used_at: string | null
        }
        Insert: {
          created_at?: string
          created_by: string
          date_debut?: string | null
          date_fin?: string | null
          email: string
          expires_at?: string
          id?: string
          motif?: string | null
          nom?: string | null
          perimetre?: string | null
          prenom?: string | null
          revoked?: boolean
          role: Database["public"]["Enums"]["app_role"]
          token?: string
          used_at?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string
          date_debut?: string | null
          date_fin?: string | null
          email?: string
          expires_at?: string
          id?: string
          motif?: string | null
          nom?: string | null
          perimetre?: string | null
          prenom?: string | null
          revoked?: boolean
          role?: Database["public"]["Enums"]["app_role"]
          token?: string
          used_at?: string | null
        }
        Relationships: []
      }
      admin_tasks: {
        Row: {
          assigned_to: string | null
          client_name: string
          created_at: string
          deadline: string | null
          description: string | null
          dossier_ref: string
          id: string
          related_courrier_id: string | null
          statut: string
          task_type: string
          updated_at: string
          user_id: string
        }
        Insert: {
          assigned_to?: string | null
          client_name: string
          created_at?: string
          deadline?: string | null
          description?: string | null
          dossier_ref: string
          id?: string
          related_courrier_id?: string | null
          statut?: string
          task_type: string
          updated_at?: string
          user_id: string
        }
        Update: {
          assigned_to?: string | null
          client_name?: string
          created_at?: string
          deadline?: string | null
          description?: string | null
          dossier_ref?: string
          id?: string
          related_courrier_id?: string | null
          statut?: string
          task_type?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "admin_tasks_related_courrier_id_fkey"
            columns: ["related_courrier_id"]
            isOneToOne: false
            referencedRelation: "courriers_capdemarches"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_admin: {
        Row: {
          action_type: string
          admin_id: string
          admin_role: string
          adresse_ip: string | null
          cible_id: string | null
          cible_type: string | null
          created_at: string
          details: Json | null
          id: string
          user_agent: string | null
        }
        Insert: {
          action_type: string
          admin_id: string
          admin_role: string
          adresse_ip?: string | null
          cible_id?: string | null
          cible_type?: string | null
          created_at?: string
          details?: Json | null
          id?: string
          user_agent?: string | null
        }
        Update: {
          action_type?: string
          admin_id?: string
          admin_role?: string
          adresse_ip?: string | null
          cible_id?: string | null
          cible_type?: string | null
          created_at?: string
          details?: Json | null
          id?: string
          user_agent?: string | null
        }
        Relationships: []
      }
      avocats_partenaires: {
        Row: {
          barreau: string
          capacite_max: number
          created_at: string
          delai_moyen_jours: number
          disponible: boolean
          dossiers_en_cours: number
          email: string
          id: string
          nom: string
          phone: string | null
          prenom: string
          specialites: string[] | null
          updated_at: string
          user_id: string
        }
        Insert: {
          barreau: string
          capacite_max?: number
          created_at?: string
          delai_moyen_jours?: number
          disponible?: boolean
          dossiers_en_cours?: number
          email: string
          id?: string
          nom: string
          phone?: string | null
          prenom: string
          specialites?: string[] | null
          updated_at?: string
          user_id: string
        }
        Update: {
          barreau?: string
          capacite_max?: number
          created_at?: string
          delai_moyen_jours?: number
          disponible?: boolean
          dossiers_en_cours?: number
          email?: string
          id?: string
          nom?: string
          phone?: string | null
          prenom?: string
          specialites?: string[] | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      ceseda_articles_cache: {
        Row: {
          article_content: string
          article_id: string
          article_title: string
          content_hash: string
          created_at: string
          fetched_at: string
          id: string
          source_url: string | null
          updated_at: string
        }
        Insert: {
          article_content: string
          article_id: string
          article_title: string
          content_hash: string
          created_at?: string
          fetched_at?: string
          id?: string
          source_url?: string | null
          updated_at?: string
        }
        Update: {
          article_content?: string
          article_id?: string
          article_title?: string
          content_hash?: string
          created_at?: string
          fetched_at?: string
          id?: string
          source_url?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      courriers_capdemarches: {
        Row: {
          created_at: string
          date_reception: string
          date_transmission: string | null
          dossier_id: string
          dossier_ref: string
          expediteur: string
          id: string
          notes: string | null
          statut: string
          type_decision: string | null
          updated_at: string
          url_courrier_pdf: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          date_reception?: string
          date_transmission?: string | null
          dossier_id: string
          dossier_ref: string
          expediteur?: string
          id?: string
          notes?: string | null
          statut?: string
          type_decision?: string | null
          updated_at?: string
          url_courrier_pdf?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          date_reception?: string
          date_transmission?: string | null
          dossier_id?: string
          dossier_ref?: string
          expediteur?: string
          id?: string
          notes?: string | null
          statut?: string
          type_decision?: string | null
          updated_at?: string
          url_courrier_pdf?: string | null
          user_id?: string
        }
        Relationships: []
      }
      dossiers: {
        Row: {
          avocat_barreau: string | null
          avocat_id: string | null
          avocat_nom: string | null
          avocat_prenom: string | null
          client_adresse_origine: string | null
          client_date_naissance: string | null
          client_email: string | null
          client_first_name: string
          client_last_name: string
          client_lieu_naissance: string | null
          client_nationalite: string | null
          client_passport_number: string | null
          client_phone: string | null
          client_ville: string | null
          consentement_supplement: boolean | null
          consulat_nom: string | null
          consulat_pays: string | null
          consulat_ville: string | null
          cout_mysendingbox_total: number | null
          created_at: string
          date_consentement: string | null
          date_generation_neutre: string | null
          date_notification_refus: string | null
          date_qualification: string | null
          date_signature_procuration: string | null
          date_finalisation_lettre: string | null
          date_validation_juridique: string | null
          delivered_at: string | null
          destinataire_recours: string | null
          dossier_ref: string
          id: string
          langue_document: string | null
          lettre_neutre_contenu: string | null
          lrar_status: string
          motifs_refus: string[] | null
          motifs_texte_original: string[] | null
          mysendingbox_letter_id: string | null
          numero_decision: string | null
          option_choisie: string | null
          option_envoi: string | null
          pieces_obligatoires_pages: number | null
          pieces_optionnelles_pages: number | null
          pieces_selectionnees_ids: Json | null
          procuration_active: boolean
          procuration_expiration: string | null
          procuration_signee: boolean
          procuration_valide_jusqu_au: string | null
          recipient_address: string
          recipient_city: string
          recipient_name: string
          recipient_postal_code: string
          references_a_verifier: Json | null
          references_verifiees: Json | null
          refus_type: string
          score_ocr_decision: number | null
          sent_at: string | null
          tracking_number: string | null
          type_signataire: string | null
          type_visa_texte_original: string | null
          updated_at: string
          url_decision_refus: string | null
          url_lettre_definitive: string | null
          url_lettre_neutre: string | null
          url_lrar_pdf: string | null
          url_procuration_pdf: string | null
          use_capdemarches: boolean
          user_id: string
          validation_juridique_mode: string
          validation_juridique_status: string
          visa_type: string
          webhook_events: Json | null
        }
        Insert: {
          avocat_barreau?: string | null
          avocat_id?: string | null
          avocat_nom?: string | null
          avocat_prenom?: string | null
          client_adresse_origine?: string | null
          client_date_naissance?: string | null
          client_email?: string | null
          client_first_name: string
          client_last_name: string
          client_lieu_naissance?: string | null
          client_nationalite?: string | null
          client_passport_number?: string | null
          client_phone?: string | null
          client_ville?: string | null
          consentement_supplement?: boolean | null
          consulat_nom?: string | null
          consulat_pays?: string | null
          consulat_ville?: string | null
          cout_mysendingbox_total?: number | null
          created_at?: string
          date_consentement?: string | null
          date_generation_neutre?: string | null
          date_notification_refus?: string | null
          date_qualification?: string | null
          date_signature_procuration?: string | null
          date_finalisation_lettre?: string | null
          date_validation_juridique?: string | null
          delivered_at?: string | null
          destinataire_recours?: string | null
          dossier_ref: string
          id?: string
          langue_document?: string | null
          lettre_neutre_contenu?: string | null
          lrar_status?: string
          motifs_refus?: string[] | null
          motifs_texte_original?: string[] | null
          mysendingbox_letter_id?: string | null
          numero_decision?: string | null
          option_choisie?: string | null
          option_envoi?: string | null
          pieces_obligatoires_pages?: number | null
          pieces_optionnelles_pages?: number | null
          pieces_selectionnees_ids?: Json | null
          procuration_active?: boolean
          procuration_expiration?: string | null
          procuration_signee?: boolean
          procuration_valide_jusqu_au?: string | null
          recipient_address: string
          recipient_city: string
          recipient_name: string
          recipient_postal_code: string
          references_a_verifier?: Json | null
          references_verifiees?: Json | null
          refus_type?: string
          score_ocr_decision?: number | null
          sent_at?: string | null
          tracking_number?: string | null
          type_signataire?: string | null
          type_visa_texte_original?: string | null
          updated_at?: string
          url_decision_refus?: string | null
          url_lettre_definitive?: string | null
          url_lettre_neutre?: string | null
          url_lrar_pdf?: string | null
          url_procuration_pdf?: string | null
          use_capdemarches?: boolean
          user_id: string
          validation_juridique_mode?: string
          validation_juridique_status?: string
          visa_type: string
          webhook_events?: Json | null
        }
        Update: {
          avocat_barreau?: string | null
          avocat_id?: string | null
          avocat_nom?: string | null
          avocat_prenom?: string | null
          client_adresse_origine?: string | null
          client_date_naissance?: string | null
          client_email?: string | null
          client_first_name?: string
          client_last_name?: string
          client_lieu_naissance?: string | null
          client_nationalite?: string | null
          client_passport_number?: string | null
          client_phone?: string | null
          client_ville?: string | null
          consentement_supplement?: boolean | null
          consulat_nom?: string | null
          consulat_pays?: string | null
          consulat_ville?: string | null
          cout_mysendingbox_total?: number | null
          created_at?: string
          date_consentement?: string | null
          date_generation_neutre?: string | null
          date_notification_refus?: string | null
          date_qualification?: string | null
          date_signature_procuration?: string | null
          date_finalisation_lettre?: string | null
          date_validation_juridique?: string | null
          delivered_at?: string | null
          destinataire_recours?: string | null
          dossier_ref?: string
          id?: string
          langue_document?: string | null
          lettre_neutre_contenu?: string | null
          lrar_status?: string
          motifs_refus?: string[] | null
          motifs_texte_original?: string[] | null
          mysendingbox_letter_id?: string | null
          numero_decision?: string | null
          option_choisie?: string | null
          option_envoi?: string | null
          pieces_obligatoires_pages?: number | null
          pieces_optionnelles_pages?: number | null
          pieces_selectionnees_ids?: Json | null
          procuration_active?: boolean
          procuration_expiration?: string | null
          procuration_signee?: boolean
          procuration_valide_jusqu_au?: string | null
          recipient_address?: string
          recipient_city?: string
          recipient_name?: string
          recipient_postal_code?: string
          references_a_verifier?: Json | null
          references_verifiees?: Json | null
          refus_type?: string
          score_ocr_decision?: number | null
          sent_at?: string | null
          tracking_number?: string | null
          type_signataire?: string | null
          type_visa_texte_original?: string | null
          updated_at?: string
          url_decision_refus?: string | null
          url_lettre_definitive?: string | null
          url_lettre_neutre?: string | null
          url_lrar_pdf?: string | null
          url_procuration_pdf?: string | null
          use_capdemarches?: boolean
          user_id?: string
          validation_juridique_mode?: string
          validation_juridique_status?: string
          visa_type?: string
          webhook_events?: Json | null
        }
        Relationships: []
      }
      envois_lrar: {
        Row: {
          avocat_id: string | null
          created_at: string
          dossier_ref: string
          id: string
          mysendingbox_letter_id: string | null
          pdf_url: string | null
          recipient_address_line1: string
          recipient_address_line2: string | null
          recipient_city: string
          recipient_country: string
          recipient_name: string
          recipient_postal_code: string
          signature_id: string | null
          status: string
          tracking_number: string | null
          updated_at: string
          user_id: string
          visa_type: string
          webhook_events: Json | null
        }
        Insert: {
          avocat_id?: string | null
          created_at?: string
          dossier_ref: string
          id?: string
          mysendingbox_letter_id?: string | null
          pdf_url?: string | null
          recipient_address_line1: string
          recipient_address_line2?: string | null
          recipient_city: string
          recipient_country?: string
          recipient_name: string
          recipient_postal_code: string
          signature_id?: string | null
          status?: string
          tracking_number?: string | null
          updated_at?: string
          user_id: string
          visa_type: string
          webhook_events?: Json | null
        }
        Update: {
          avocat_id?: string | null
          created_at?: string
          dossier_ref?: string
          id?: string
          mysendingbox_letter_id?: string | null
          pdf_url?: string | null
          recipient_address_line1?: string
          recipient_address_line2?: string | null
          recipient_city?: string
          recipient_country?: string
          recipient_name?: string
          recipient_postal_code?: string
          signature_id?: string | null
          status?: string
          tracking_number?: string | null
          updated_at?: string
          user_id?: string
          visa_type?: string
          webhook_events?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "envois_lrar_signature_id_fkey"
            columns: ["signature_id"]
            isOneToOne: false
            referencedRelation: "signatures"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications: {
        Row: {
          created_at: string
          id: string
          lien: string | null
          lu: boolean
          message: string
          titre: string
          type: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          lien?: string | null
          lu?: boolean
          message: string
          titre: string
          type?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          lien?: string | null
          lu?: boolean
          message?: string
          titre?: string
          type?: string
          user_id?: string
        }
        Relationships: []
      }
      payments: {
        Row: {
          amount: number
          created_at: string
          currency: string
          dossier_ref: string
          id: string
          payment_method: string
          option_choisie: string | null
          pricing_details: Json
          status: string
          stripe_payment_intent_id: string | null
          stripe_session_id: string | null
          updated_at: string
          user_id: string | null
          verified_by_webhook: boolean
        }
        Insert: {
          amount: number
          created_at?: string
          currency?: string
          dossier_ref: string
          id?: string
          payment_method: string
          option_choisie?: string | null
          pricing_details?: Json
          status?: string
          stripe_payment_intent_id?: string | null
          stripe_session_id?: string | null
          updated_at?: string
          user_id?: string | null
          verified_by_webhook?: boolean
        }
        Update: {
          amount?: number
          created_at?: string
          currency?: string
          dossier_ref?: string
          id?: string
          payment_method?: string
          option_choisie?: string | null
          pricing_details?: Json
          status?: string
          stripe_payment_intent_id?: string | null
          stripe_session_id?: string | null
          updated_at?: string
          user_id?: string | null
          verified_by_webhook?: boolean
        }
        Relationships: []
      }
      pieces_justificatives: {
        Row: {
          correction_appliquee: boolean | null
          cout_ocr_estime: number | null
          created_at: string
          date_analyse_ocr: string | null
          date_detectee: string | null
          date_upload: string
          document_tronque: boolean | null
          dossier_id: string
          format_fichier: string | null
          id: string
          langue_detectee: string | null
          moteur_ocr: string | null
          motif_rejet: string | null
          nom_piece: string
          nombre_pages: number | null
          ocr_details: Json | null
          ocr_text_extract: string | null
          pages_detectees: number | null
          problemes_detectes: Json | null
          score_qualite: number | null
          statut_ocr: string
          taille_fichier_ko: number | null
          texte_manuscrit: boolean | null
          type_document_attendu: string | null
          type_document_detecte: string | null
          type_piece: string
          updated_at: string
          url_fichier_corrige: string | null
          url_fichier_original: string | null
          user_id: string
        }
        Insert: {
          correction_appliquee?: boolean | null
          cout_ocr_estime?: number | null
          created_at?: string
          date_analyse_ocr?: string | null
          date_detectee?: string | null
          date_upload?: string
          document_tronque?: boolean | null
          dossier_id: string
          format_fichier?: string | null
          id?: string
          langue_detectee?: string | null
          moteur_ocr?: string | null
          motif_rejet?: string | null
          nom_piece: string
          nombre_pages?: number | null
          ocr_details?: Json | null
          ocr_text_extract?: string | null
          pages_detectees?: number | null
          problemes_detectes?: Json | null
          score_qualite?: number | null
          statut_ocr?: string
          taille_fichier_ko?: number | null
          texte_manuscrit?: boolean | null
          type_document_attendu?: string | null
          type_document_detecte?: string | null
          type_piece?: string
          updated_at?: string
          url_fichier_corrige?: string | null
          url_fichier_original?: string | null
          user_id: string
        }
        Update: {
          correction_appliquee?: boolean | null
          cout_ocr_estime?: number | null
          created_at?: string
          date_analyse_ocr?: string | null
          date_detectee?: string | null
          date_upload?: string
          document_tronque?: boolean | null
          dossier_id?: string
          format_fichier?: string | null
          id?: string
          langue_detectee?: string | null
          moteur_ocr?: string | null
          motif_rejet?: string | null
          nom_piece?: string
          nombre_pages?: number | null
          ocr_details?: Json | null
          ocr_text_extract?: string | null
          pages_detectees?: number | null
          problemes_detectes?: Json | null
          score_qualite?: number | null
          statut_ocr?: string
          taille_fichier_ko?: number | null
          texte_manuscrit?: boolean | null
          type_document_attendu?: string | null
          type_document_detecte?: string | null
          type_piece?: string
          updated_at?: string
          url_fichier_corrige?: string | null
          url_fichier_original?: string | null
          user_id?: string
        }
        Relationships: []
      }
      pieces_requises: {
        Row: {
          actif: boolean
          alternative_possible: string | null
          apostille_requise: boolean
          condition_declenchement: string | null
          conditionnel: boolean
          created_at: string
          description_simple: string
          format_accepte: string
          id: string
          motifs_concernes: string[]
          nom_piece: string
          note: string | null
          obligatoire: boolean
          ordre_affichage: number
          original_requis: boolean
          pourquoi_necessaire: string | null
          taille_max_mo: number
          traduction_requise: boolean
          type_visa: string
          updated_at: string
        }
        Insert: {
          actif?: boolean
          alternative_possible?: string | null
          apostille_requise?: boolean
          condition_declenchement?: string | null
          conditionnel?: boolean
          created_at?: string
          description_simple?: string
          format_accepte?: string
          id?: string
          motifs_concernes?: string[]
          nom_piece: string
          note?: string | null
          obligatoire?: boolean
          ordre_affichage?: number
          original_requis?: boolean
          pourquoi_necessaire?: string | null
          taille_max_mo?: number
          traduction_requise?: boolean
          type_visa?: string
          updated_at?: string
        }
        Update: {
          actif?: boolean
          alternative_possible?: string | null
          apostille_requise?: boolean
          condition_declenchement?: string | null
          conditionnel?: boolean
          created_at?: string
          description_simple?: string
          format_accepte?: string
          id?: string
          motifs_concernes?: string[]
          nom_piece?: string
          note?: string | null
          obligatoire?: boolean
          ordre_affichage?: number
          original_requis?: boolean
          pourquoi_necessaire?: string | null
          taille_max_mo?: number
          traduction_requise?: boolean
          type_visa?: string
          updated_at?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          actif: boolean | null
          adresse_ligne1: string | null
          adresse_ligne2: string | null
          avatar_url: string | null
          code_postal: string | null
          created_at: string
          date_naissance: string | null
          first_name: string | null
          id: string
          last_name: string | null
          lieu_naissance: string | null
          nationalite: string | null
          passport_number: string | null
          pays: string | null
          phone: string | null
          prefixe_telephone: string | null
          updated_at: string
          ville: string | null
        }
        Insert: {
          actif?: boolean | null
          adresse_ligne1?: string | null
          adresse_ligne2?: string | null
          avatar_url?: string | null
          code_postal?: string | null
          created_at?: string
          date_naissance?: string | null
          first_name?: string | null
          id: string
          last_name?: string | null
          lieu_naissance?: string | null
          nationalite?: string | null
          passport_number?: string | null
          pays?: string | null
          phone?: string | null
          prefixe_telephone?: string | null
          updated_at?: string
          ville?: string | null
        }
        Update: {
          actif?: boolean | null
          adresse_ligne1?: string | null
          adresse_ligne2?: string | null
          avatar_url?: string | null
          code_postal?: string | null
          created_at?: string
          date_naissance?: string | null
          first_name?: string | null
          id?: string
          last_name?: string | null
          lieu_naissance?: string | null
          nationalite?: string | null
          passport_number?: string | null
          pays?: string | null
          phone?: string | null
          prefixe_telephone?: string | null
          updated_at?: string
          ville?: string | null
        }
        Relationships: []
      }
      references_juridiques: {
        Row: {
          actif: boolean
          argument_type: string
          categorie: string
          created_at: string
          date_decision: string | null
          date_verification: string | null
          favorable_demandeur: boolean | null
          id: string
          intitule_court: string
          juridiction: string | null
          motifs_concernes: string[]
          reference_complete: string
          resume_vulgarise: string | null
          source_url: string | null
          texte_exact: string
          updated_at: string
          verifie_par: string | null
        }
        Insert: {
          actif?: boolean
          argument_type?: string
          categorie: string
          created_at?: string
          date_decision?: string | null
          date_verification?: string | null
          favorable_demandeur?: boolean | null
          id?: string
          intitule_court: string
          juridiction?: string | null
          motifs_concernes?: string[]
          reference_complete: string
          resume_vulgarise?: string | null
          source_url?: string | null
          texte_exact?: string
          updated_at?: string
          verifie_par?: string | null
        }
        Update: {
          actif?: boolean
          argument_type?: string
          categorie?: string
          created_at?: string
          date_decision?: string | null
          date_verification?: string | null
          favorable_demandeur?: boolean | null
          id?: string
          intitule_court?: string
          juridiction?: string | null
          motifs_concernes?: string[]
          reference_complete?: string
          resume_vulgarise?: string | null
          source_url?: string | null
          texte_exact?: string
          updated_at?: string
          verifie_par?: string | null
        }
        Relationships: []
      }
      signatures: {
        Row: {
          certificate_path: string | null
          created_at: string
          document_name: string
          dossier_ref: string
          id: string
          otp_verified: boolean
          signed_at: string | null
          signer_email: string
          signer_phone: string | null
          status: string
          updated_at: string
          user_id: string
          yousign_signature_request_id: string | null
          yousign_signer_id: string | null
        }
        Insert: {
          certificate_path?: string | null
          created_at?: string
          document_name: string
          dossier_ref: string
          id?: string
          otp_verified?: boolean
          signed_at?: string | null
          signer_email: string
          signer_phone?: string | null
          status?: string
          updated_at?: string
          user_id: string
          yousign_signature_request_id?: string | null
          yousign_signer_id?: string | null
        }
        Update: {
          certificate_path?: string | null
          created_at?: string
          document_name?: string
          dossier_ref?: string
          id?: string
          otp_verified?: boolean
          signed_at?: string | null
          signer_email?: string
          signer_phone?: string | null
          status?: string
          updated_at?: string
          user_id?: string
          yousign_signature_request_id?: string | null
          yousign_signer_id?: string | null
        }
        Relationships: []
      }
      tarification: {
        Row: {
          created_at: string
          envoi_mysendingbox_eur: number
          generation_lettre_eur: number
          honoraires_avocat_eur: number
          id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          envoi_mysendingbox_eur?: number
          generation_lettre_eur?: number
          honoraires_avocat_eur?: number
          id?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          envoi_mysendingbox_eur?: number
          generation_lettre_eur?: number
          honoraires_avocat_eur?: number
          id?: string
          updated_at?: string
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      get_user_role: {
        Args: { _user_id: string }
        Returns: Database["public"]["Enums"]["app_role"]
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
    }
    Enums: {
      app_role:
        | "client"
        | "avocat"
        | "admin"
        | "super_admin"
        | "admin_delegue"
        | "admin_juridique"
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
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
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
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
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
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
      app_role: [
        "client",
        "avocat",
        "admin",
        "super_admin",
        "admin_delegue",
        "admin_juridique",
      ],
    },
  },
} as const
