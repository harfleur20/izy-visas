import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import type { GenerationResult } from "@/components/ComplianceReport";

const FIELD_LABELS: Record<string, string> = {
  "MOTIF DE REFUS": "les motifs de refus (retournez à l'étape Décision de refus)",
  "CONSULAT": "les informations du consulat (retournez à l'étape Décision de refus)",
  "PIÈCES JOINTES": "au moins une pièce justificative (retournez à l'étape Pièces justificatives)",
};

export function useGenerateRecours() {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<GenerationResult | null>(null);
  const [restoredFor, setRestoredFor] = useState<string | null>(null);

  // Restore previously generated letter from database
  const restore = useCallback(async (dossierId: string) => {
    if (restoredFor === dossierId && result) return; // already restored
    const { data } = await supabase
      .from("dossiers")
      .select("lettre_neutre_contenu, references_verifiees, references_a_verifier, validation_juridique_status")
      .eq("id", dossierId)
      .single();

    if (data?.lettre_neutre_contenu) {
      // Rebuild a GenerationResult from saved data
      const refs = (data.references_verifiees as any[]) || [];
      const refsToCheck = (data.references_a_verifier as any[]) || [];
      const hasAVerifier = refsToCheck.length > 0;
      const hasNonTrouve = refs.some((r: any) => r.statut === "non_trouve_openlegi");

      // If the letter was generated and saved, it passed validation at generation time.
      // Bloc report isn't persisted, so we mark it as restored (no bloc-level detail).
      const canSend = !hasNonTrouve;

      const restored: GenerationResult = {
        letter: data.lettre_neutre_contenu,
        bloc_report: [], // Not persisted — will show "restored" UI
        references_status: refs,
        can_send: canSend,
        has_red_blocs: false,
        has_non_trouve_refs: hasNonTrouve,
        has_a_verifier_refs: hasAVerifier,
        _restored: true,
      };
      setResult(restored);
    }
    setRestoredFor(dossierId);
  }, [restoredFor, result]);

  const generate = async (dossierId: string) => {
    setLoading(true);
    try {
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
      const anonKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token ?? anonKey;

      const res = await fetch(`${supabaseUrl}/functions/v1/generate-recours`, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${token}`,
          "apikey": anonKey,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ dossier_id: dossierId }),
      });

      const data = await res.json();

      if (!res.ok) {
        if (data?.missing_fields) {
          const missing = (data.missing_fields as string[])
            .map((f: string) => FIELD_LABELS[f] || f)
            .join("\n• ");
          toast.error(`Impossible de générer la lettre.\n\nIl manque :\n• ${missing}`, { duration: 8000 });
          return null;
        }
        throw new Error(data?.message || "Erreur serveur");
      }

      setResult(data);
      setRestoredFor(dossierId);

      if (data.can_send) {
        toast.success("Lettre générée — 12 blocs conformes, toutes références validées");
      } else {
        const issues: string[] = [];
        if (data.has_red_blocs) issues.push("blocs incomplets");
        if (data.has_unverified_refs) issues.push("références non validées");
        toast.warning(`Lettre générée — ${issues.join(" et ")} à corriger`);
      }

      return data;
    } catch (err: any) {
      console.error("Generate recours error:", err);
      if (err?.message?.includes("429")) {
        toast.error("Limite de requêtes atteinte, réessayez dans quelques instants");
      } else if (err?.message?.includes("402")) {
        toast.error("Crédits IA insuffisants");
      } else {
        toast.error("Erreur lors de la génération du recours");
      }
      return null;
    } finally {
      setLoading(false);
    }
  };

  return { generate, loading, result, setResult, restore };
}
