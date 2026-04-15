import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { LrarComposition } from "@/components/LrarComposition";
import { toast } from "sonner";
import type { Database } from "@/integrations/supabase/types";
import { Box } from "@/components/ui-custom";

type Dossier = Database["public"]["Tables"]["dossiers"]["Row"];
type PieceJustificative = Database["public"]["Tables"]["pieces_justificatives"]["Row"];

function normalizeSendOption(value?: string | null): "A" | "B" | "C" | null {
  if (!value) return null;
  const normalized = value.charAt(0).toUpperCase();
  return normalized === "A" || normalized === "B" || normalized === "C" ? normalized : null;
}

interface LrarCompositionWrapperProps {
  dossierId: string;
  dossierRef: string;
  onConfirm: () => void;
  onBack: () => void;
}

export function LrarCompositionWrapper({
  dossierId,
  dossierRef,
  onConfirm,
  onBack,
}: LrarCompositionWrapperProps) {
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [dossier, setDossier] = useState<Dossier | null>(null);
  const [pieces, setPieces] = useState<PieceJustificative[]>([]);

  useEffect(() => {
    const load = async () => {
      setLoading(true);

      // Fetch dossier
      const { data: d } = await supabase
        .from("dossiers")
        .select("*")
        .eq("id", dossierId)
        .single();

      // Fetch pieces justificatives
      const { data: pj } = await supabase
        .from("pieces_justificatives")
        .select("*")
        .eq("dossier_id", dossierId)
        .order("created_at", { ascending: true });

      setDossier(d);
      setPieces(pj || []);
      setLoading(false);
    };
    load();
  }, [dossierId]);

  if (loading) {
    return (
      <div className="text-center py-12 text-muted-foreground">
        <div className="animate-spin h-8 w-8 border-4 border-primary border-t-transparent rounded-full mx-auto mb-4" />
        <p className="text-sm">Chargement de la composition LRAR…</p>
      </div>
    );
  }

  if (sending) {
    return (
      <div className="text-center py-12 text-muted-foreground">
        <div className="animate-spin h-8 w-8 border-4 border-primary border-t-transparent rounded-full mx-auto mb-4" />
        <p className="text-sm">Préparation du PDF LRAR et envoi MySendingBox…</p>
      </div>
    );
  }

  if (!dossier) {
    return (
      <div className="text-center py-12 text-muted-foreground">
        <p>Dossier introuvable.</p>
      </div>
    );
  }

  const optionChoisie = normalizeSendOption(dossier.option_choisie || dossier.option_envoi);
  if (optionChoisie === "C" && !dossier.url_lettre_signee_avocat) {
    return (
      <div>
        <Box variant="alert" title="Signature avocat requise">
          La lettre signée par l'avocat doit être déposée avant de composer et envoyer la LRAR.
        </Box>
        <button
          onClick={onBack}
          className="font-syne font-bold text-[0.78rem] px-5 py-2.5 rounded-[7px] bg-foreground/[0.07] text-muted-foreground border border-border-2 transition-all"
        >
          ← Retour
        </button>
      </div>
    );
  }

  // Build mandatory pieces (always 2: lettre de recours + décision de refus)
  const mandatoryPieces = [
    {
      title: optionChoisie === "C" ? "Lettre de recours signée par avocat" : "Lettre de recours",
      pages: 4, // Will be dynamically set after YouSign signing
      date: optionChoisie === "C" ? "Signée par l'avocat — Obligatoire" : "Signée YouSign — Obligatoire",
    },
    {
      title: "Décision de refus de visa",
      pages: pieces.find(
        (p) => p.type_piece === "obligatoire" && p.nom_piece?.toLowerCase().includes("refus")
      )?.nombre_pages || 2,
      date: dossier.date_notification_refus
        ? `Uploadée le ${new Date(dossier.date_notification_refus).toLocaleDateString("fr-FR")} — Obligatoire`
        : "Obligatoire",
    },
  ];

  // Build optional pieces from pieces_justificatives (exclude mandatory-type recours/refus)
  const optionalPieces = pieces
    .filter((p) => {
      const isDecisionRefus =
        p.nom_piece?.toLowerCase().includes("refus") && p.type_piece === "obligatoire";
      return !isDecisionRefus && p.statut_ocr !== "rejected";
    })
    .map((p) => ({
      id: p.id,
      title: p.nom_piece,
      pages: p.nombre_pages || 1,
      pdfUrl: p.url_fichier_original || "",
      uploadedAt: new Date(p.date_upload).toLocaleDateString("fr-FR"),
    }));

  return (
    <LrarComposition
      dossierRef={dossierRef}
      dossierId={dossierId}
      clientName={`${dossier.client_last_name} ${dossier.client_first_name}`}
      clientFirstName={dossier.client_first_name}
      clientLastName={dossier.client_last_name}
      visaType={dossier.visa_type}
      mandatoryPieces={mandatoryPieces}
      optionalPieces={optionalPieces}
      onConfirm={async () => {
        setSending(true);
        try {
          const { data: pdfData, error: pdfError } = await supabase.functions.invoke("build-lrar-pdf", {
            body: { dossierId },
          });
          if (pdfError) throw pdfError;
          if (pdfData?.error) throw new Error(pdfData.error);

          const { data: sendData, error: sendError } = await supabase.functions.invoke("send-lrar/send", {
            body: { dossierId },
          });
          if (sendError) throw sendError;
          if (sendData?.error) throw new Error(sendData.error);

          toast.success(`LRAR envoyée${sendData?.trackingNumber ? ` — suivi ${sendData.trackingNumber}` : ""}`);
          onConfirm();
        } catch (err) {
          console.error("LRAR send error:", err);
          toast.error(err instanceof Error ? err.message : "Impossible d'envoyer la LRAR.");
        } finally {
          setSending(false);
        }
      }}
      onBack={onBack}
    />
  );
}
