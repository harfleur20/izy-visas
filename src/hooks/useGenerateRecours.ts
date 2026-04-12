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

      if (error) throw error;

      if (data?.error && data?.missing_fields) {
        toast.error(data.message || data.error);
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
