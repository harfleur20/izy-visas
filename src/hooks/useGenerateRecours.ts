import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import type { GenerationResult } from "@/components/ComplianceReport";

export function useGenerateRecours() {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<GenerationResult | null>(null);

  const generate = async (dossierId: string) => {
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("generate-recours", {
        body: { dossier_id: dossierId },
      });

      // When edge function returns 4xx, supabase SDK puts body in error context
      // Try to extract missing_fields from the error or data
      const responseData = data || (error as any)?.context?.json?.() || null;

      if (error) {
        // Check if this is a "missing fields" 400 error
        let parsed: any = null;
        try {
          if (typeof error === "object" && "context" in error) {
            const ctx = (error as any).context;
            if (ctx && typeof ctx.json === "function") {
              parsed = await ctx.json();
            }
          }
        } catch { /* ignore parse errors */ }

        if (parsed?.missing_fields) {
          const fieldLabels: Record<string, string> = {
            "MOTIF DE REFUS": "les motifs de refus (retournez à l'étape Décision de refus)",
            "CONSULAT": "les informations du consulat (retournez à l'étape Décision de refus)",
            "PIÈCES JOINTES": "au moins une pièce justificative (retournez à l'étape Pièces justificatives)",
          };
          const missing = (parsed.missing_fields as string[])
            .map((f: string) => fieldLabels[f] || f)
            .join("\n• ");
          toast.error(`Impossible de générer la lettre.\n\nIl manque :\n• ${missing}`, { duration: 8000 });
          return null;
        }
        throw error;
      }

      if (data?.error && data?.missing_fields) {
        const fieldLabels: Record<string, string> = {
          "MOTIF DE REFUS": "les motifs de refus (retournez à l'étape Décision de refus)",
          "CONSULAT": "les informations du consulat (retournez à l'étape Décision de refus)",
          "PIÈCES JOINTES": "au moins une pièce justificative (retournez à l'étape Pièces justificatives)",
        };
        const missing = (data.missing_fields as string[])
          .map((f: string) => fieldLabels[f] || f)
          .join("\n• ");
        toast.error(`Impossible de générer la lettre.\n\nIl manque :\n• ${missing}`, { duration: 8000 });
        return null;
      }

      setResult(data);

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
      if (err?.status === 429) {
        toast.error("Limite de requêtes atteinte, réessayez dans quelques instants");
      } else if (err?.status === 402) {
        toast.error("Crédits IA insuffisants");
      } else {
        toast.error("Erreur lors de la génération du recours");
      }
      return null;
    } finally {
      setLoading(false);
    }
  };

  return { generate, loading, result, setResult };
}
