import { useState, useCallback, useEffect } from "react";
import ShellLayout from "@/components/ShellLayout";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";

import { toast } from "@/hooks/use-toast";
import { NavItem, NavGroup } from "@/components/NavItem";
import { Eyebrow, BigTitle, Desc, Box } from "@/components/ui-custom";
import { ProcurationFlow } from "@/components/ProcurationFlow";
import { type UploadedPiece } from "@/components/DocumentUploader";
import { PiecesRequisesClient } from "@/components/PiecesRequisesClient";
import { DecisionRefusUpload } from "@/components/DecisionRefusUpload";
import { useGenerateRecours } from "@/hooks/useGenerateRecours";
import { LetterPreview } from "@/components/LetterPreview";
import { SendOptionChooser } from "@/components/SendOptionChooser";
import { LrarCompositionWrapper } from "@/components/LrarCompositionWrapper";
import { LrarTrackingSuivi } from "@/components/LrarTrackingSuivi";

type SendOption = "A" | "B" | "C";
type PaymentMethod = "stripe" | "taramoney";
type DossierUpdate = Database["public"]["Tables"]["dossiers"]["Update"];

type OcrDetails = {
  canAutoCorrect?: boolean;
  typeMismatchWarning?: string;
  decisionWarning?: string;
  languageNotice?: string;
};

type PieceOcrRow = {
  id: string;
  nom_piece: string;
  statut_ocr: string;
  score_qualite: number | null;
  nombre_pages: number | null;
  motif_rejet: string | null;
  url_fichier_original: string | null;
  type_document_detecte: string | null;
  langue_detectee: string | null;
  ocr_details: OcrDetails | null;
};

type ActiveDossier = {
  id: string;
  dossier_ref: string;
  date_notification_refus?: string | null;
  lrar_status?: string | null;
  option_choisie?: string | null;
  option_envoi?: string | null;
  url_lettre_definitive?: string | null;
  validation_juridique_status?: string | null;
  procuration_signee?: boolean | null;
  date_signature_procuration?: string | null;
  procuration_expiration?: string | null;
};

type TaraPaymentLinks = {
  whatsappLink?: string | null;
  telegramLink?: string | null;
  dikaloLink?: string | null;
  smsLink?: string | null;
};

const OPTION_LABELS: Record<SendOption, string> = {
  A: "Téléchargement direct",
  B: "Envoi MySendingBox automatique",
  C: "Avocat relit, signe et envoie",
};

const normalizeStoredOption = (value?: string | null): SendOption | null => {
  if (!value) return null;
  const normalized = value.charAt(0).toUpperCase();
  return normalized === "A" || normalized === "B" || normalized === "C" ? normalized : null;
};

// Removed getErrorMessage — all errors are now handled with user-friendly messages inline

// ── Step prerequisite definitions ────────────────────────────────
// Each step declares what must be true BEFORE entering it.
// `check` returns true if the prerequisite is met.
// `msg` is the user-facing toast shown when blocked.
// `redirect` is the step to send the user back to.
// Guards are checked inline in navigateToStep

const cTitles: Record<number, string> = {
  0: "Vérification de recevabilité", 1: "Création de compte", 2: "Décision de refus",
  5: "Pièces justificatives",
  7: "Lettre de recours", 8: "Mode d'envoi", 9: "Paiement",
  10: "Signature YouSign", 11: "Envoi MySendingBox / LRAR",
  13: "Suivi & décision",
};

const ClientSpace = () => {
  const { user } = useAuth();
  const [step, setStep] = useState(0);
  const [cguAccepted, setCguAccepted] = useState(false);
  const [refDate, setRefDate] = useState("");
  const [dlResult, setDlResult] = useState<{ type: string; days: number; deadline: string } | null>(null);
  const [uploadedPieces, setUploadedPieces] = useState<UploadedPiece[]>([]);
  const [selectedVisaType, setSelectedVisaType] = useState("");
  const [selectedMotif, setSelectedMotif] = useState("");
  const [activeDossier, setActiveDossier] = useState<ActiveDossier | null>(null);
  const [procurationModalOpen, setProcurationModalOpen] = useState(false);
  const [procurationSignee, setProcurationSignee] = useState(false);
  const [procurationDate, setProcurationDate] = useState<string | null>(null);
  const [procurationExpiry, setProcurationExpiry] = useState<string | null>(null);
  const [profileForm, setProfileForm] = useState({ first_name: "", last_name: "", phone: "", prefixe_telephone: "+237" });
  const [profileLoaded, setProfileLoaded] = useState(false);
  const { generate: generateRecours, loading: generatingRecours, result: recoursResult } = useGenerateRecours();
  const [selectedOption, setSelectedOption] = useState<SendOption | null>(null);
  const [finalizingOption, setFinalizingOption] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("stripe");
  const [paymentLoading, setPaymentLoading] = useState(false);
  const [taraPaymentLinks, setTaraPaymentLinks] = useState<TaraPaymentLinks | null>(null);
  const [paymentConfirmed, setPaymentConfirmed] = useState(false);

  const updateActiveDossier = useCallback(async (patch: DossierUpdate) => {
    if (!activeDossier) return false;
    const { error } = await supabase
      .from("dossiers")
      .update(patch)
      .eq("id", activeDossier.id);

    if (error) {
      console.error("Dossier update error:", error);
      toast({ title: "Sauvegarde impossible", description: "Vérifiez votre connexion internet et réessayez.", variant: "destructive" });
      return false;
    }

    setActiveDossier((prev) => (prev ? { ...prev, ...patch } : prev));
    return true;
  }, [activeDossier]);

  // Load profile data
  useEffect(() => {
    if (!user) return;
    const loadProfile = async () => {
      const { data } = await supabase
        .from("profiles")
        .select("first_name, last_name, phone, prefixe_telephone")
        .eq("id", user.id)
        .single();
      if (data) {
        setProfileForm({
          first_name: data.first_name || user.user_metadata?.first_name || user.user_metadata?.given_name || "",
          last_name: data.last_name || user.user_metadata?.last_name || user.user_metadata?.family_name || "",
          phone: data.phone || "",
          prefixe_telephone: data.prefixe_telephone || "+237",
        });
      }
      setProfileLoaded(true);
    };
    loadProfile();
  }, [user]);

  // Fetch or create active dossier
  useEffect(() => {
    if (!user) return;
    const loadOrCreateDossier = async () => {
      const { data } = await supabase
        .from("dossiers")
        .select("id, dossier_ref, procuration_signee, date_signature_procuration, procuration_expiration, date_notification_refus, lrar_status, option_choisie, option_envoi, url_lettre_definitive, validation_juridique_status")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (data) {
        setActiveDossier(data as ActiveDossier);
        setProcurationSignee(data.procuration_signee || false);
        setProcurationDate(data.date_signature_procuration || null);
        setProcurationExpiry(data.procuration_expiration || null);
        setSelectedOption(normalizeStoredOption(data.option_choisie || data.option_envoi));
        if (data.date_notification_refus) {
          setRefDate(data.date_notification_refus);
        }
      } else {
        const ref = `IZY-${new Date().getFullYear()}-${String(Date.now()).slice(-6)}`;
        const { data: newDossier, error } = await supabase
          .from("dossiers")
          .insert({
            user_id: user.id,
            dossier_ref: ref,
            visa_type: "court_sejour",
            client_first_name: user.user_metadata?.first_name || user.user_metadata?.given_name || "",
            client_last_name: user.user_metadata?.last_name || user.user_metadata?.family_name || "",
            client_email: user.email || "",
            recipient_name: "Commission de Recours contre les Refus de Visa",
            recipient_address: "BP 83609",
            recipient_postal_code: "44036",
            recipient_city: "Nantes Cedex 1",
          })
          .select("id, dossier_ref, procuration_signee, date_signature_procuration, procuration_expiration, date_notification_refus, lrar_status, option_choisie, option_envoi, url_lettre_definitive, validation_juridique_status")
          .single();

        if (!error && newDossier) {
          setActiveDossier(newDossier as ActiveDossier);
        }
      }
    };
    loadOrCreateDossier();
  }, [user]);

  // Check payment status from DB
  useEffect(() => {
    if (!activeDossier) return;
    const checkPayment = async () => {
      const { data } = await supabase
        .from("payments")
        .select("status, verified_by_webhook")
        .eq("dossier_ref", activeDossier.dossier_ref)
        .eq("status", "paid")
        .limit(1)
        .maybeSingle();
      setPaymentConfirmed(!!data);
    };
    checkPayment();
  }, [activeDossier, step]);

  useEffect(() => {
    if (!activeDossier) return;
    const params = new URLSearchParams(window.location.search);
    const paymentStatus = params.get("payment");
    if (!paymentStatus) return;

    if (paymentStatus === "success") {
      setPaymentConfirmed(true);
      toast({ title: "✅ Paiement confirmé", description: "Vous pouvez passer à la signature YouSign." });
      setStep(10);
    } else if (paymentStatus === "taramoney_pending") {
      toast({ title: "Paiement Mobile Money en attente", description: "La suite sera débloquée après confirmation Tara." });
      setStep(9);
    } else if (paymentStatus === "cancelled") {
      toast({ title: "Paiement annulé", description: "Aucun paiement n'a été enregistré." });
      setStep(9);
    }

    params.delete("payment");
    const nextQuery = params.toString();
    window.history.replaceState({}, "", `${window.location.pathname}${nextQuery ? `?${nextQuery}` : ""}`);
  }, [activeDossier]);

  // Load existing pieces from DB and subscribe to realtime OCR updates
  useEffect(() => {
    if (!activeDossier) return;
    const dossierId = activeDossier.id;

    // Load existing pieces
    const loadPieces = async () => {
      const { data } = await supabase
        .from("pieces_justificatives")
        .select("id, nom_piece, statut_ocr, score_qualite, nombre_pages, motif_rejet, url_fichier_original, type_document_detecte, langue_detectee, ocr_details")
        .eq("dossier_id", dossierId)
        .order("created_at", { ascending: true });

      if (data && data.length > 0) {
        const mapped: UploadedPiece[] = data.map((row) => {
          const details = (row.ocr_details || {}) as OcrDetails;
          let status: UploadedPiece["status"] = "analyzing";
          if (row.statut_ocr === "accepte") status = "accepted";
          else if (row.statut_ocr === "rejete" || row.statut_ocr === "erreur") status = "rejected";
          else if (row.statut_ocr === "en_cours") status = "analyzing";

          return {
            id: row.id,
            name: row.nom_piece,
            status,
            score: row.score_qualite || 0,
            pages: row.nombre_pages || 1,
            rejectionMessage: row.motif_rejet || undefined,
            canAutoCorrect: details.canAutoCorrect || false,
            fileUrl: row.url_fichier_original || undefined,
            typeMismatchWarning: details.typeMismatchWarning || undefined,
            decisionWarning: details.decisionWarning || undefined,
            languageNotice: details.languageNotice || undefined,
            typeDocumentDetecte: row.type_document_detecte || undefined,
          };
        });
        setUploadedPieces(mapped);
      }
    };
    loadPieces();

    // Subscribe to realtime updates for this dossier's pieces
    const channel = supabase
      .channel(`pieces-ocr-${dossierId}`)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "pieces_justificatives",
          filter: `dossier_id=eq.${dossierId}`,
        },
        (payload) => {
          const row = payload.new as PieceOcrRow;
          if (!row || row.statut_ocr === "en_cours") return;

          const details = (row.ocr_details || {}) as OcrDetails;
          let status: UploadedPiece["status"] = "analyzing";
          if (row.statut_ocr === "accepte") status = "accepted";
          else if (row.statut_ocr === "rejete" || row.statut_ocr === "erreur") status = "rejected";

          const updated: UploadedPiece = {
            id: row.id,
            name: row.nom_piece,
            status,
            score: row.score_qualite || 0,
            pages: row.nombre_pages || 1,
            rejectionMessage: row.motif_rejet || undefined,
            canAutoCorrect: details.canAutoCorrect || false,
            fileUrl: row.url_fichier_original || undefined,
            typeMismatchWarning: details.typeMismatchWarning || undefined,
            decisionWarning: details.decisionWarning || undefined,
            languageNotice: details.languageNotice || undefined,
            typeDocumentDetecte: row.type_document_detecte || undefined,
          };

          setUploadedPieces((prev) => {
            const idx = prev.findIndex((p) => p.id === row.id);
            if (idx >= 0) {
              const next = [...prev];
              next[idx] = { ...next[idx], ...updated };
              return next;
            }
            return [...prev, updated];
          });

          if (status === "accepted") {
            toast({ title: `✅ ${row.nom_piece} acceptée — Qualité : ${row.score_qualite}/100` });
          } else if (status === "rejected") {
            toast({ title: `❌ ${row.nom_piece} rejetée`, description: row.motif_rejet || "Qualité insuffisante", variant: "destructive" });
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [activeDossier]);

  const handlePieceUploaded = useCallback((piece: UploadedPiece) => {
    setUploadedPieces((prev) => {
      const idx = prev.findIndex((p) => p.id === piece.id);
      if (idx >= 0) {
        const next = [...prev];
        next[idx] = piece;
        return next;
      }
      return [...prev, piece];
    });
  }, []);

  const handlePieceRemoved = useCallback((id: string) => {
    setUploadedPieces((prev) => prev.filter((p) => p.id !== id));
  }, []);

  const hasRejectedPieces = uploadedPieces.some((p) => p.status === "rejected");
  const hasAnalyzingPieces = uploadedPieces.some((p) => p.status === "uploading" || p.status === "analyzing" || p.status === "correcting");

  const checkDeadline = (dateStr: string) => {
    if (!dateStr) return;
    const ref = new Date(dateStr);
    const dl = new Date(ref);
    dl.setDate(dl.getDate() + 30);
    const today = new Date();
    const diff = Math.ceil((dl.getTime() - today.getTime()) / 86400000);
    const deadline = dl.toLocaleDateString("fr-FR");
    if (diff < 0) setDlResult({ type: "expired", days: Math.abs(diff), deadline });
    else if (diff <= 7) setDlResult({ type: "urgent", days: diff, deadline });
    else setDlResult({ type: "ok", days: diff, deadline });
  };

  // ── Step navigation with guardrails ────────────────────────────
  // Validates prerequisites before allowing navigation to a step.
  // For steps requiring DB checks, fetches fresh data from the dossier.
  const navigateToStep = useCallback(async (target: number) => {
    // Steps 0 and 1 are always accessible
    if (target <= 1) { setStep(target); return; }

    if (!activeDossier) {
      toast({ title: "Dossier non chargé", description: "Patientez le chargement de votre dossier.", variant: "destructive" });
      return;
    }

    // Fetch fresh dossier state for reliable checks
    const { data: d } = await supabase
      .from("dossiers")
      .select("date_notification_refus, motifs_refus, consulat_nom, lettre_neutre_contenu, option_choisie, lrar_status, url_lettre_definitive, validation_juridique_status")
      .eq("id", activeDossier.id)
      .single();

    if (!d) {
      toast({ title: "Dossier introuvable", description: "Rechargez la page.", variant: "destructive" });
      return;
    }

    const block = (title: string, description: string, redirect: number) => {
      toast({ title, description, variant: "destructive" });
      setStep(redirect);
    };

    // Step 2: needs recevabilité (date set)
    if (target === 2) {
      if (!d.date_notification_refus && !refDate) {
        block("Recevabilité requise", "Indiquez d'abord la date de notification du refus.", 0);
        return;
      }
      setStep(2); return;
    }

    // Step 5: needs décision de refus analysée (motifs + consulat)
    if (target === 5) {
      const motifs = d.motifs_refus as string[] | null;
      if (!motifs || motifs.length === 0 || !d.consulat_nom) {
        block("Décision de refus incomplète", "Uploadez et validez votre décision de refus avant d'accéder aux pièces justificatives.", 2);
        return;
      }
      setStep(5); return;
    }

    // Step 7: needs pieces step done (no rejected) + motifs present
    if (target === 7) {
      const motifs = d.motifs_refus as string[] | null;
      if (!motifs || motifs.length === 0 || !d.consulat_nom) {
        block("Décision de refus incomplète", "Les motifs de refus et le consulat doivent être renseignés.", 2);
        return;
      }
      if (hasRejectedPieces) {
        block("Pièces rejetées", "Corrigez les pièces rejetées avant de générer la lettre.", 5);
        return;
      }
      setStep(7); return;
    }

    // Step 8: needs lettre générée
    if (target === 8) {
      if (!d.lettre_neutre_contenu) {
        block("Lettre non générée", "Générez d'abord votre lettre de recours.", 7);
        return;
      }
      setStep(8); return;
    }

    // Step 9: needs lettre générée + option choisie
    if (target === 9) {
      const motifs = d.motifs_refus as string[] | null;
      if (!motifs || motifs.length === 0 || !d.consulat_nom) {
        block("Décision de refus incomplète", "Complétez d'abord votre décision de refus.", 2);
        return;
      }
      if (!d.lettre_neutre_contenu) {
        block("Lettre non générée", "Générez d'abord votre lettre de recours avant de payer.", 7);
        return;
      }
      if (!d.option_choisie) {
        block("Mode d'envoi manquant", "Choisissez d'abord votre mode d'envoi.", 8);
        return;
      }
      setStep(9); return;
    }

    // Step 10: needs payment (lrar_status check)
    if (target === 10) {
      const paidStatuses = ["paiement_confirme", "lettre_finalisee", "signature_verifiee", "envoyee", "distribuee"];
      if (!d.option_choisie || !paidStatuses.includes(d.lrar_status || "")) {
        block("Paiement requis", "Finalisez le paiement avant de passer à la signature.", 9);
        return;
      }
      setStep(10); return;
    }

    // Step 11: needs signature verified
    if (target === 11) {
      const opt = normalizeStoredOption(d.option_choisie);
      if (opt === "A") {
        block("Option A : pas d'envoi LRAR", "Avec l'option téléchargement, vous envoyez vous-même. Rendez-vous au suivi.", 13);
        return;
      }
      setStep(11); return;
    }

    // Step 13: always accessible once dossier exists
    setStep(target);
  }, [activeDossier, refDate, hasRejectedPieces]);

  const handleReceivabilityContinue = async () => {
    if (refDate && activeDossier) {
      const saved = await updateActiveDossier({
        date_notification_refus: refDate,
        lrar_status: "recevabilite_verifiee",
      });
      if (!saved) return;
    }
    setStep(1);
  };

  const handleOptionSelect = async (option: SendOption) => {
    if (!activeDossier) return;

    // Pre-check: fetch dossier to verify letter was generated
    const { data: freshDossier } = await supabase
      .from("dossiers")
      .select("lettre_neutre_contenu, validation_juridique_status")
      .eq("id", activeDossier.id)
      .single();

    if (!freshDossier?.lettre_neutre_contenu) {
      toast({
        title: "Lettre non générée",
        description: "Vous devez d'abord générer votre lettre de recours à l'étape précédente avant de choisir un mode d'envoi.",
        variant: "destructive",
      });
      setStep(7);
      return;
    }

    if (freshDossier.validation_juridique_status === "bloquee") {
      toast({
        title: "Lettre à corriger",
        description: "Votre lettre contient des éléments à corriger. Regénérez-la avant de continuer.",
        variant: "destructive",
      });
      setStep(7);
      return;
    }

    setFinalizingOption(true);
    setSelectedOption(option);
    try {
      const { data, error } = await supabase.functions.invoke("finalize-letter", {
        body: { dossier_id: activeDossier.id, option },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      const saved = await updateActiveDossier({
        option_choisie: option,
        option_envoi: data?.option_envoi || option,
        url_lettre_definitive: data?.url_lettre_definitive,
        validation_juridique_status: data?.validation_juridique_status,
        lrar_status: data?.status || "lettre_finalisee",
      });
      if (!saved) return;
      toast({ title: "✅ Lettre finalisée", description: "Le PDF définitif est prêt pour le paiement et l'envoi." });
      setStep(9);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "";
      let userMessage = "Une erreur est survenue lors de la préparation de votre lettre. Réessayez.";

      if (msg.includes("neutre non générée") || msg.includes("Générez d'abord")) {
        userMessage = "Vous devez d'abord générer votre lettre de recours à l'étape « Lettre de recours ».";
        setStep(7);
      } else if (msg.includes("bloquants") || msg.includes("Regénérez")) {
        userMessage = "Votre lettre contient des éléments à corriger. Retournez à l'étape de la lettre pour la regénérer.";
        setStep(7);
      } else if (msg.includes("avocat") || msg.includes("Option C")) {
        userMessage = "Des références juridiques nécessitent une relecture par un avocat. Choisissez l'option C ou corrigez votre lettre.";
      } else if (msg.includes("indisponible")) {
        userMessage = "Le service avocat est temporairement indisponible. Réessayez dans quelques instants ou choisissez une autre option.";
      }

      toast({
        title: "Impossible de continuer",
        description: userMessage,
        variant: "destructive",
      });
    } finally {
      setFinalizingOption(false);
    }
  };

  const handlePayment = async () => {
    if (!selectedOption) {
      toast({ title: "Option manquante", description: "Retournez à l'étape « Mode d'envoi » pour choisir votre option.", variant: "destructive" });
      setStep(8);
      return;
    }
    if (!cguAccepted) {
      toast({ title: "CGU requises", description: "Vous devez accepter les conditions générales avant de payer.", variant: "destructive" });
      return;
    }
    if (!activeDossier) return;

    setPaymentLoading(true);
    setTaraPaymentLinks(null);
    try {
      const functionName = paymentMethod === "stripe" ? "create-payment" : "create-taramoney-payment";
      const { data, error } = await supabase.functions.invoke(functionName, {
        body: { dossier_ref: activeDossier.dossier_ref, option: selectedOption },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      setActiveDossier((prev) => prev ? { ...prev, lrar_status: "paiement_en_attente" } : prev);

      if (paymentMethod === "stripe") {
        if (!data?.url) throw new Error("Lien de paiement indisponible");
        window.open(data.url, "_blank");
        return;
      }

      const links = (data?.links || {}) as TaraPaymentLinks;
      setTaraPaymentLinks(links);
      if (data?.primaryLink) {
        window.open(data.primaryLink, "_blank");
      }
      toast({
        title: "Lien Mobile Money créé",
        description: "Choisissez WhatsApp, Telegram, Dikalo ou SMS pour finaliser le paiement.",
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "";
      let userMessage = "Impossible de lancer le paiement. Vérifiez votre connexion et réessayez.";

      if (msg.includes("secrets") || msg.includes("configured")) {
        userMessage = "Le service de paiement est temporairement indisponible. Réessayez dans quelques minutes.";
      } else if (msg.includes("Dossier introuvable")) {
        userMessage = "Votre dossier est introuvable. Rechargez la page et réessayez.";
      } else if (msg.includes("Non autorise") || msg.includes("Non authentifie")) {
        userMessage = "Votre session a expiré. Reconnectez-vous pour continuer.";
      }

      toast({
        title: "Erreur de paiement",
        description: userMessage,
        variant: "destructive",
      });
    } finally {
      setPaymentLoading(false);
    }
  };

  const sidebar = (
    <>
      <NavGroup label="Qualification">
        <NavItem icon="⚠️" label="Recevabilité" active={step === 0} badge={{ text: "!", color: "red" }} onClick={() => navigateToStep(0)} />
        <NavItem icon="👤" label="Création de compte" active={step === 1} suffixIcon={procurationSignee ? "✅" : "⚠️"} onClick={() => navigateToStep(1)} />
      </NavGroup>
      <NavGroup label="Dossier">
        <NavItem icon="📄" label="Décision de refus" active={step === 2} onClick={() => navigateToStep(2)} />
      </NavGroup>
      <NavGroup label="Constitution">
        <NavItem icon="📎" label="Pièces justificatives" active={step === 5} onClick={() => navigateToStep(5)} />
        <NavItem icon="📄" label="Lettre de recours" active={step === 7} onClick={() => navigateToStep(7)} />
      </NavGroup>
      <NavGroup label="Finalisation">
        <NavItem icon="🔀" label="Mode d'envoi" active={step === 8} gold onClick={() => navigateToStep(8)} />
        <NavItem icon="💳" label="Paiement" active={step === 9} onClick={() => navigateToStep(9)} />
        <NavItem icon="✍️" label="Signature YouSign" active={step === 10} onClick={() => navigateToStep(10)} />
        <NavItem icon="📬" label="Envoi LRAR" active={step === 11} onClick={() => navigateToStep(11)} />
        <NavItem icon="📊" label="Suivi & décision" active={step === 13} onClick={() => navigateToStep(13)} />
      </NavGroup>
    </>
  );

  const bottomNavItems = [
    { icon: "🏠", label: "Accueil", onClick: () => navigateToStep(0), active: step === 0 },
    { icon: "📋", label: "Dossier", onClick: () => navigateToStep(2), active: step >= 2 && step <= 7 },
    { icon: "📬", label: "Envoi", onClick: () => navigateToStep(11), active: step >= 8 && step <= 11 },
    { icon: "📊", label: "Suivi", onClick: () => navigateToStep(13), active: step === 13 },
  ];

  return (
    <ShellLayout
      role="client"
      roleLabel="Client"
      sidebar={sidebar}
      topbarTitle={cTitles[step]}
      topbarRight={<div className="w-[30px] h-[30px] rounded-md bg-gradient-to-br from-primary-hover to-purple-600 flex items-center justify-center font-syne font-extrabold text-[0.68rem]">AD</div>}
      footerContent={<><strong className="text-muted-foreground">Me NGUIYAN Dieu Le Fit</strong><br />Avocat à la cour<br />2C Rue Ferdinand de Lesseps<br />94000 Créteil</>}
      bottomNavItems={bottomNavItems}
    >
      <div className="animate-fadeU">
        {/* Step 0 — Recevabilité */}
        {step === 0 && (
          <div>
            <Eyebrow>⚠ Avant tout</Eyebrow>
            <BigTitle>Vérification de recevabilité</BigTitle>
            <Desc>Premier écran obligatoire. Un recours hors délai est irrecevable sans exception possible.</Desc>
            <Box variant="alert" title="🚨 Délai de forclusion : 30 jours calendaires">À compter de la notification du refus exprès. Passé ce délai, aucun recours administratif n'est possible.</Box>
            <div className="mb-4">
              <label className="font-syne text-[0.64rem] font-bold tracking-wider uppercase text-muted-foreground mb-1.5 block">Date de notification du refus</label>
              <div className="grid grid-cols-3 gap-2">
                <select className="w-full bg-background-2 border-[1.5px] border-border-2 rounded-[9px] px-3 py-2.5 text-foreground text-sm outline-none cursor-pointer focus:border-primary-hover/55 focus:bg-primary/[0.07]"
                  value={refDate ? refDate.split("-")[2] || "" : ""}
                  onChange={(e) => { const parts = (refDate || "--").split("-"); const newDate = `${parts[0] || ""}-${parts[1] || ""}-${e.target.value}`; setRefDate(newDate); if (parts[0] && parts[1] && e.target.value) checkDeadline(newDate); }}>
                  <option value="">Jour</option>
                  {Array.from({ length: 31 }, (_, i) => i + 1).map((d) => (<option key={d} value={String(d).padStart(2, "0")}>{d}</option>))}
                </select>
                <select className="w-full bg-background-2 border-[1.5px] border-border-2 rounded-[9px] px-3 py-2.5 text-foreground text-sm outline-none cursor-pointer focus:border-primary-hover/55 focus:bg-primary/[0.07]"
                  value={refDate ? refDate.split("-")[1] || "" : ""}
                  onChange={(e) => { const parts = (refDate || "--").split("-"); const newDate = `${parts[0] || ""}-${e.target.value}-${parts[2] || ""}`; setRefDate(newDate); if (parts[0] && e.target.value && parts[2]) checkDeadline(newDate); }}>
                  <option value="">Mois</option>
                  {["Janvier","Février","Mars","Avril","Mai","Juin","Juillet","Août","Septembre","Octobre","Novembre","Décembre"].map((m, i) => (<option key={i} value={String(i + 1).padStart(2, "0")}>{m}</option>))}
                </select>
                <select className="w-full bg-background-2 border-[1.5px] border-border-2 rounded-[9px] px-3 py-2.5 text-foreground text-sm outline-none cursor-pointer focus:border-primary-hover/55 focus:bg-primary/[0.07]"
                  value={refDate ? refDate.split("-")[0] || "" : ""}
                  onChange={(e) => { const parts = (refDate || "--").split("-"); const newDate = `${e.target.value}-${parts[1] || ""}-${parts[2] || ""}`; setRefDate(newDate); if (e.target.value && parts[1] && parts[2]) checkDeadline(newDate); }}>
                  <option value="">Année</option>
                  {Array.from({ length: 5 }, (_, i) => new Date().getFullYear() - i).map((y) => (<option key={y} value={String(y)}>{y}</option>))}
                </select>
              </div>
            </div>
            {dlResult && dlResult.type === "expired" && <Box variant="alert" title={`🚫 Recours irrecevable — Délai expiré depuis ${dlResult.days} jours`}>Consultez un avocat pour d'autres options.</Box>}
            {dlResult && dlResult.type === "urgent" && <Box variant="alert" title={`⚠️ URGENCE — ${dlResult.days} jour(s) restant(s)`}>Date limite : <strong>{dlResult.deadline}</strong>. Agissez immédiatement.</Box>}
            {dlResult && dlResult.type === "ok" && <Box variant="ok" title={`✓ Recevable — ${dlResult.days} jours restants`}>Date limite : <strong>{dlResult.deadline}</strong>.</Box>}
            <div className="flex gap-2.5 mt-7 flex-wrap">
              <button className="font-syne font-bold text-[0.78rem] px-5 py-2.5 rounded-[7px] bg-primary-hover text-foreground hover:bg-[#5585ff] hover:-translate-y-px transition-all" onClick={handleReceivabilityContinue}>Mon recours est recevable →</button>
            </div>
          </div>
        )}

        {/* Step 1 — Compte */}
        {step === 1 && (
          <div>
            <Eyebrow>Étape 1</Eyebrow>
            <BigTitle>Création de compte</BigTitle>
            <Desc>Indispensable pour reprendre votre dossier, être alerté des délais et permettre à l'avocat d'accéder à votre recours.</Desc>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div className="mb-4"><label className="font-syne text-[0.64rem] font-bold tracking-wider uppercase text-muted-foreground mb-1.5 block">Prénom</label><input className="w-full bg-background-2 border-[1.5px] border-border-2 rounded-[9px] px-3 py-2.5 text-foreground text-sm outline-none focus:border-primary-hover/55 focus:bg-primary/[0.07]" placeholder="Marie-Claire" value={profileForm.first_name} onChange={e => setProfileForm(p => ({ ...p, first_name: e.target.value }))} /></div>
              <div className="mb-4"><label className="font-syne text-[0.64rem] font-bold tracking-wider uppercase text-muted-foreground mb-1.5 block">Nom</label><input className="w-full bg-background-2 border-[1.5px] border-border-2 rounded-[9px] px-3 py-2.5 text-foreground text-sm outline-none focus:border-primary-hover/55 focus:bg-primary/[0.07]" placeholder="MVONDO" value={profileForm.last_name} onChange={e => setProfileForm(p => ({ ...p, last_name: e.target.value }))} /></div>
            </div>
            <div className="mb-4"><label className="font-syne text-[0.64rem] font-bold tracking-wider uppercase text-muted-foreground mb-1.5 block">Email</label><input type="email" className="w-full bg-background-2 border-[1.5px] border-border-2 rounded-[9px] px-3 py-2.5 text-foreground text-sm outline-none focus:border-primary-hover/55 focus:bg-primary/[0.07]" value={user?.email || ""} disabled /></div>
            <div className="mb-4"><label className="font-syne text-[0.64rem] font-bold tracking-wider uppercase text-muted-foreground mb-1.5 block">WhatsApp (alertes délais)</label><input type="tel" className="w-full bg-background-2 border-[1.5px] border-border-2 rounded-[9px] px-3 py-2.5 text-foreground text-sm outline-none focus:border-primary-hover/55 focus:bg-primary/[0.07]" placeholder="+237 6 90 00 00 00" value={profileForm.phone} onChange={e => setProfileForm(p => ({ ...p, phone: e.target.value }))} /></div>
            <div className="flex gap-2.5 mt-7">
              <button className="font-syne font-bold text-[0.78rem] px-5 py-2.5 rounded-[7px] bg-foreground/[0.07] text-muted-foreground border border-border-2 hover:text-foreground transition-all" onClick={() => setStep(0)}>← Retour</button>
              <button className="font-syne font-bold text-[0.78rem] px-5 py-2.5 rounded-[7px] bg-primary-hover text-foreground hover:bg-[#5585ff] transition-all" onClick={async () => {
                if (!user) return;
                const { error } = await supabase.from("profiles").update({
                  first_name: profileForm.first_name, last_name: profileForm.last_name,
                  phone: profileForm.phone, prefixe_telephone: profileForm.prefixe_telephone,
                }).eq("id", user.id);
                if (error) { toast({ title: "Profil non sauvegardé", description: "Vérifiez vos informations et réessayez.", variant: "destructive" }); }
                else {
                  const profilePatch: DossierUpdate = {
                    client_first_name: profileForm.first_name,
                    client_last_name: profileForm.last_name,
                    client_phone: profileForm.phone,
                    lrar_status: "profil_complete",
                  };
                  await updateActiveDossier(profilePatch);
                  toast({ title: "✅ Profil sauvegardé" });
                  setProcurationModalOpen(true);
                }
              }}>Sauvegarder & continuer →</button>
            </div>
            {!procurationSignee && (
              <button onClick={() => setProcurationModalOpen(true)} className="mt-4 font-syne font-bold text-xs px-4 py-2 rounded-lg bg-amber-500/10 text-amber-600 border border-amber-500/30 hover:bg-amber-500/20 transition-all">
                ⚠️ Signer ma procuration CAPDEMARCHES
              </button>
            )}
          </div>
        )}

        {/* Procuration Modal */}
        {activeDossier && user && (
          <ProcurationFlow
            open={procurationModalOpen}
            onOpenChange={setProcurationModalOpen}
            dossierRef={activeDossier.dossier_ref}
            dossierId={activeDossier.id}
            userEmail={user.email || ""}
            userId={user.id}
            onComplete={() => {
              const signedAt = new Date().toISOString();
              const expiry = new Date();
              expiry.setMonth(expiry.getMonth() + 12);
              const expiryDate = expiry.toISOString().split("T")[0];
              setProcurationSignee(true);
              setProcurationDate(signedAt);
              setProcurationExpiry(expiryDate);
              setActiveDossier((prev) => prev ? {
                ...prev,
                procuration_signee: true,
                date_signature_procuration: signedAt,
                procuration_expiration: expiryDate,
                lrar_status: "procuration_signee",
              } : prev);
              setStep(step === 10 || step === 13 ? step : 2);
            }}
            onSkip={() => setStep(step === 10 || step === 13 ? step : 2)}
          />
        )}

        {/* Step 2 — Décision de refus */}
        {step === 2 && activeDossier && user && (
          <DecisionRefusUpload
            dossierId={activeDossier.id}
            userId={user.id}
            onComplete={async (data) => {
              try {
                const parsedNotificationDate = data.refus.date_notification ? (() => {
                  const p = data.refus.date_notification!.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);
                  return p ? `${p[3]}-${p[2]}-${p[1]}` : null;
                })() : null;
                const decisionPatch: DossierUpdate = {
                  client_first_name: data.demandeur.prenom || undefined,
                  client_last_name: data.demandeur.nom || undefined,
                  client_date_naissance: data.demandeur.date_naissance || undefined,
                  client_lieu_naissance: data.demandeur.lieu_naissance || undefined,
                  client_nationalite: data.demandeur.nationalite || undefined,
                  client_passport_number: data.demandeur.numero_passeport || undefined,
                  visa_type: data.visa.type_visa,
                  type_visa_texte_original: data.visa.type_visa_texte_original,
                  consulat_nom: data.consulat.nom,
                  consulat_ville: data.consulat.ville,
                  consulat_pays: data.consulat.pays,
                  date_notification_refus: parsedNotificationDate,
                  motifs_refus: data.refus.motifs_coches,
                  motifs_texte_original: data.refus.motifs_texte_original,
                  numero_decision: data.refus.numero_decision,
                  destinataire_recours: data.destinataire_recours,
                  langue_document: data.langue_document,
                  url_decision_refus: data.url_fichier,
                  score_ocr_decision: data.confiance_extraction,
                  date_qualification: new Date().toISOString(),
                  lrar_status: "qualification_complete",
                };
                const { error } = await supabase
                  .from("dossiers")
                  .update(decisionPatch)
                  .eq("id", activeDossier.id);

                if (error) throw error;
                setSelectedVisaType(data.visa.type_visa);
                setSelectedMotif(data.refus.motifs_coches[0] || "F");
                setActiveDossier((prev) => prev ? {
                  ...prev,
                  date_notification_refus: parsedNotificationDate,
                  lrar_status: "qualification_complete",
                } : prev);
                setStep(5);
              } catch (err: unknown) {
                console.error("Save error:", err);
                toast({ title: "Enregistrement impossible", description: "Les données de votre décision n'ont pas pu être sauvegardées. Réessayez.", variant: "destructive" });
              }
            }}
            onBack={() => setStep(1)}
          />
        )}
        {step === 2 && (!activeDossier || !user) && (
          <div className="text-center py-12 text-muted-foreground"><p>Chargement de votre dossier…</p></div>
        )}

        {/* Step 5 — Pièces justificatives */}
        {step === 5 && (
          <div>
            <Eyebrow>Étape 2</Eyebrow>
            <BigTitle>Pièces justificatives</BigTitle>
            <Desc>Liste personnalisée selon votre visa et le motif. Chaque pièce est numérotée pour l'inventaire de la lettre. Chaque document est vérifié par OCR automatiquement.</Desc>
            <PiecesRequisesClient
              visaType={selectedVisaType || "court_sejour"}
              motifRefus={selectedMotif || "F"}
              dossierId={activeDossier?.id || ""}
              userId={user?.id || ""}
              uploadedPieces={uploadedPieces}
              onPieceUploaded={handlePieceUploaded}
              onPieceRemoved={handlePieceRemoved}
            />
            {hasRejectedPieces && (
              <Box variant="alert" title="⚠️ Pièces rejetées">Certains documents ont été rejetés par le contrôle qualité. Corrigez-les ou réuploadez-les avant de continuer.</Box>
            )}
            <div className="flex gap-2.5 mt-7">
              <button className="font-syne font-bold text-[0.78rem] px-5 py-2.5 rounded-[7px] bg-foreground/[0.07] text-muted-foreground border border-border-2 transition-all" onClick={() => setStep(2)}>← Retour</button>
              <button
                className={`font-syne font-bold text-[0.78rem] px-5 py-2.5 rounded-[7px] transition-all ${
                  hasRejectedPieces || hasAnalyzingPieces ? "bg-muted text-muted-foreground cursor-not-allowed opacity-50" : "bg-primary-hover text-foreground hover:bg-[#5585ff]"
                }`}
                disabled={hasRejectedPieces || hasAnalyzingPieces}
                onClick={async () => {
                  const saved = await updateActiveDossier({ lrar_status: "pieces_validees" });
                  if (saved) setStep(7);
                }}
              >
                {hasAnalyzingPieces ? "Analyse en cours…" : "Valider les pièces →"}
              </button>
            </div>
          </div>
        )}

        {/* Step 7 — TEMPS 1 : Lettre neutre */}
        {step === 7 && (
          <LetterPreview
            result={recoursResult!}
            loading={generatingRecours}
            onGenerate={() => activeDossier && generateRecours(activeDossier.id)}
            onRegenerate={() => activeDossier && generateRecours(activeDossier.id)}
            onChooseOption={() => setStep(8)}
            onBack={() => setStep(5)}
            canGenerate={!!activeDossier}
          />
        )}

        {/* Step 8 — Choix du mode d'envoi (TEMPS 2) */}
        {step === 8 && activeDossier && (
          <SendOptionChooser
            dossierRef={activeDossier.dossier_ref}
            dateNotification={activeDossier.date_notification_refus}
            onSelect={handleOptionSelect}
            onBack={() => setStep(7)}
            loading={finalizingOption}
          />
        )}

        {/* Step 9 — Paiement */}
        {step === 9 && (
          <div>
            <Eyebrow>Paiement</Eyebrow>
            <BigTitle>Paiement sécurisé</BigTitle>
            <Desc>Paiement sécurisé par carte bancaire via Stripe.</Desc>

            {selectedOption && (
              <div className="bg-panel border border-border rounded-xl p-4 mb-4">
                <div className="font-syne text-[0.65rem] font-bold tracking-wider uppercase text-muted mb-2">Option sélectionnée</div>
                <div className="font-syne font-bold text-sm">
                  {selectedOption === "A" && "📥 "}
                  {selectedOption === "B" && "📬 "}
                  {selectedOption === "C" && "⚖️ "}
                  {OPTION_LABELS[selectedOption]}
                </div>
              </div>
            )}
            {!selectedOption && (
              <Box variant="alert" title="Option d'envoi manquante">
                Revenez au choix du mode d'envoi avant de payer.
              </Box>
            )}

            {/* ── Paiement déjà confirmé ── */}
            {paymentConfirmed ? (
              <div>
                <Box variant="ok" title="✅ Paiement confirmé">
                  Votre paiement a été validé avec succès. Vous pouvez passer à l'étape suivante.
                </Box>

                <div className="flex gap-2.5 mt-7">
                  <button className="font-syne font-bold text-[0.78rem] px-5 py-2.5 rounded-[7px] bg-foreground/[0.07] text-muted-foreground border border-border-2 transition-all" onClick={() => setStep(8)}>← Retour</button>
                  <button
                    onClick={() => setStep(10)}
                    className="font-syne font-bold text-[0.78rem] px-5 py-2.5 rounded-[7px] bg-primary-hover text-foreground hover:bg-[#5585ff] transition-all"
                  >
                    Continuer vers la signature →
                  </button>
                </div>
              </div>
            ) : (
              <div>
                {/* Card visual */}
                <div className="bg-gradient-to-br from-background-3 via-primary-hover/[0.12] to-gold/[0.08] border border-border-2 rounded-[13px] p-4 mb-4 font-mono relative overflow-hidden">
                  <div className="absolute -top-8 -right-5 w-28 h-28 rounded-full bg-[radial-gradient(circle,rgba(56,112,255,0.14),transparent_70%)]" />
                  <div className="w-8 h-6 rounded-[3px] bg-gradient-to-br from-[#D4AF37] to-[#F5D060] mb-3 flex items-center justify-center">
                    <div className="w-5 h-3.5 rounded-sm bg-gradient-to-br from-[#B8960A] to-[#E8C040]" />
                  </div>
                  <div className="text-[0.95rem] tracking-[0.16em] text-foreground mb-2.5 flex gap-2.5">
                    <span className="opacity-40">••••</span><span className="opacity-40">••••</span><span className="opacity-40">••••</span><span className="opacity-40">••••</span>
                  </div>
                  <div className="flex justify-between">
                    <div><div className="text-[0.5rem] text-muted-foreground uppercase tracking-wider font-syne mb-0.5">Titulaire</div><div className="text-xs">NOM PRÉNOM</div></div>
                    <div><div className="text-[0.5rem] text-muted-foreground uppercase tracking-wider font-syne mb-0.5">Expire</div><div className="text-xs">MM/AA</div></div>
                  </div>
                </div>

                <div className="grid md:grid-cols-2 gap-3 mb-4">
                  <button
                    type="button"
                    onClick={() => setPaymentMethod("stripe")}
                    className={`text-left rounded-xl border p-4 transition-all ${
                      paymentMethod === "stripe"
                        ? "border-primary bg-primary/[0.08]"
                        : "border-border bg-background-2 hover:border-primary/60"
                    }`}
                  >
                    <div className="font-syne font-bold text-sm">Carte bancaire</div>
                    <div className="text-xs text-muted-foreground mt-1">Stripe · Visa · Mastercard · Amex</div>
                  </button>
                  <button
                    type="button"
                    onClick={() => setPaymentMethod("taramoney")}
                    className={`text-left rounded-xl border p-4 transition-all ${
                      paymentMethod === "taramoney"
                        ? "border-primary bg-primary/[0.08]"
                        : "border-border bg-background-2 hover:border-primary/60"
                    }`}
                  >
                    <div className="font-syne font-bold text-sm">Mobile Money</div>
                    <div className="text-xs text-muted-foreground mt-1">Tara · WhatsApp · Telegram · SMS</div>
                  </button>
                </div>

                <Box variant="info" title={paymentMethod === "stripe" ? "Paiement sécurisé Stripe" : "Paiement Mobile Money via Tara"}>
                  {paymentMethod === "stripe"
                    ? "Vous serez redirigé vers la page de paiement sécurisée Stripe. Vos données bancaires ne transitent jamais par nos serveurs."
                    : "Tara génère un lien de paiement Mobile Money. Le dossier passera à l'étape suivante après confirmation du paiement."}
                </Box>

                <button
                  disabled={!cguAccepted || !selectedOption || !activeDossier || paymentLoading}
                  onClick={handlePayment}
                  className={`w-full rounded-xl py-4 font-syne font-extrabold text-[0.92rem] transition-all flex items-center justify-center gap-2 mt-5 ${cguAccepted && selectedOption && activeDossier && !paymentLoading ? "cursor-pointer bg-gradient-to-br from-primary to-[#2258CC] text-foreground shadow-[0_8px_24px_rgba(26,80,220,0.32)] hover:shadow-[0_12px_32px_rgba(26,80,220,0.48)] hover:-translate-y-0.5" : "cursor-not-allowed opacity-50 bg-muted text-muted-foreground"}`}
                >
                  {paymentLoading
                    ? "Préparation du paiement…"
                    : paymentMethod === "stripe"
                      ? "🔒 Payer par carte"
                      : "📱 Payer par Mobile Money"}
                </button>

                {taraPaymentLinks && (
                  <div className="mt-4 rounded-xl border border-border bg-background-2 p-4">
                    <div className="font-syne font-bold text-sm mb-2">Liens de paiement Tara</div>
                    <div className="grid sm:grid-cols-2 gap-2">
                      {taraPaymentLinks.whatsappLink && <a href={taraPaymentLinks.whatsappLink} target="_blank" rel="noreferrer" className="rounded-lg border border-border px-3 py-2 text-sm hover:border-primary">WhatsApp</a>}
                      {taraPaymentLinks.telegramLink && <a href={taraPaymentLinks.telegramLink} target="_blank" rel="noreferrer" className="rounded-lg border border-border px-3 py-2 text-sm hover:border-primary">Telegram</a>}
                      {taraPaymentLinks.dikaloLink && <a href={taraPaymentLinks.dikaloLink} target="_blank" rel="noreferrer" className="rounded-lg border border-border px-3 py-2 text-sm hover:border-primary">Dikalo</a>}
                      {taraPaymentLinks.smsLink && <a href={taraPaymentLinks.smsLink} className="rounded-lg border border-border px-3 py-2 text-sm hover:border-primary">SMS</a>}
                    </div>
                  </div>
                )}

                <div className="mt-4 text-center text-[0.72rem] text-muted-foreground leading-relaxed">
                  {paymentMethod === "stripe" ? (
                    <>
                      💳 Paiement sécurisé par <strong>Stripe</strong><br />
                      Visa · Mastercard · American Express<br />
                      Chiffrement TLS 1.3 · PCI-DSS Level 1
                    </>
                  ) : (
                    <>
                      📱 Paiement sécurisé par <strong>Tara</strong><br />
                      Mobile Money selon le pays et le canal choisi<br />
                      Confirmation par webhook après paiement
                    </>
                  )}
                </div>

                <label className="flex items-start gap-3 mt-5 p-4 rounded-xl border border-border bg-background-2 cursor-pointer select-none">
                  <input type="checkbox" checked={cguAccepted} onChange={(e) => setCguAccepted(e.target.checked)} className="mt-0.5 w-4 h-4 rounded border-border accent-primary shrink-0" />
                  <span className="text-xs text-muted-foreground leading-relaxed">
                    J'accepte les{" "}
                    <a href="/cgu" target="_blank" className="text-primary hover:underline font-medium">Conditions Générales d'Utilisation et la Politique de Confidentialité</a>.
                    Je comprends qu'IZY Visa est un outil d'aide à la rédaction et ne se substitue pas à un avocat.
                  </span>
                </label>
                {!cguAccepted && <p className="text-[0.7rem] text-destructive mt-1 ml-1">Vous devez accepter les CGU avant de procéder au paiement.</p>}

                <div className="flex gap-2.5 mt-7">
                  <button className="font-syne font-bold text-[0.78rem] px-5 py-2.5 rounded-[7px] bg-foreground/[0.07] text-muted-foreground border border-border-2 transition-all" onClick={() => setStep(8)}>← Retour</button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Step 10 — Signature YouSign / Procuration */}
        {step === 10 && activeDossier && (
          <div>
           <Eyebrow>Signature YouSign</Eyebrow>
            <BigTitle>Validation de la procuration</BigTitle>
            <Desc>
              Cette étape vérifie que la procuration CAPDEMARCHES est signée avant l'envoi suivi du dossier.
            </Desc>

            {paymentConfirmed && (
              <Box variant="ok" title="✅ Paiement confirmé">
                Votre paiement a été validé. Vous pouvez continuer la procédure.
              </Box>
            )}

            {selectedOption && (
              <div className="bg-panel border border-border rounded-xl p-4 mb-4">
                <div className="font-syne text-[0.65rem] font-bold tracking-wider uppercase text-muted mb-2">Option payée</div>
                <div className="font-syne font-bold text-sm">{OPTION_LABELS[selectedOption]}</div>
              </div>
            )}

            <div className="bg-panel border border-border rounded-xl p-5 mb-4">
              <h3 className="font-syne font-bold text-sm mb-3">Procuration CAPDEMARCHES</h3>
              {procurationSignee ? (
                <Box variant="ok" title="✓ Procuration signée">
                  Signée le {procurationDate ? new Date(procurationDate).toLocaleDateString("fr-FR") : "date non disponible"}.
                  {procurationExpiry ? ` Valide jusqu'au ${new Date(procurationExpiry).toLocaleDateString("fr-FR")}.` : ""}
                </Box>
              ) : (
                <Box variant={selectedOption === "A" ? "info" : "alert"} title="Procuration non signée">
                  {selectedOption === "A"
                    ? "Elle n'est pas obligatoire si le client télécharge et envoie lui-même son recours."
                    : "Elle est nécessaire pour que CAPDEMARCHES puisse réceptionner et transmettre les courriers officiels."}
                </Box>
              )}

              <button
                onClick={() => setProcurationModalOpen(true)}
                className="mt-4 font-syne font-bold text-xs px-4 py-2 rounded-lg bg-primary text-primary-foreground"
              >
                {procurationSignee ? "Voir ou renouveler la procuration" : "Signer la procuration via YouSign"}
              </button>
            </div>

            {selectedOption === "C" && activeDossier.validation_juridique_status !== "validee_avocat" && (
              <Box variant="alert" title="Relecture avocat en attente">
                L'option C nécessite la validation de l'avocat avant l'envoi LRAR automatique.
              </Box>
            )}

            <div className="flex gap-2.5 mt-7">
              <button className="font-syne font-bold text-[0.78rem] px-5 py-2.5 rounded-[7px] bg-foreground/[0.07] text-muted-foreground border border-border-2 transition-all" onClick={() => setStep(8)}>← Retour mode d'envoi</button>
              <button
                disabled={!selectedOption || (selectedOption !== "A" && !procurationSignee) || (selectedOption === "C" && activeDossier.validation_juridique_status !== "validee_avocat")}
                className={`font-syne font-bold text-[0.78rem] px-5 py-2.5 rounded-[7px] transition-all ${
                  !selectedOption || (selectedOption !== "A" && !procurationSignee) || (selectedOption === "C" && activeDossier.validation_juridique_status !== "validee_avocat")
                    ? "bg-muted text-muted-foreground cursor-not-allowed opacity-50"
                    : "bg-primary-hover text-foreground hover:bg-[#5585ff]"
                }`}
                onClick={async () => {
                  if (!selectedOption) return;
                  const saved = await updateActiveDossier({ lrar_status: "signature_verifiee" });
                  if (saved) setStep(selectedOption === "A" ? 13 : 11);
                }}
              >
                {selectedOption === "A" ? "Continuer vers le suivi →" : "Continuer vers l'envoi LRAR →"}
              </button>
            </div>
          </div>
        )}

        {step === 10 && !activeDossier && (
          <div className="text-center py-12 text-muted-foreground"><p>Chargement de votre dossier…</p></div>
        )}

        {/* Step 11 — Composition & Envoi LRAR */}
        {step === 11 && activeDossier && (
          <LrarCompositionWrapper
            dossierId={activeDossier.id}
            dossierRef={activeDossier.dossier_ref}
            onConfirm={() => setStep(13)}
            onBack={() => setStep(10)}
          />
        )}

        {/* Step 13 — Suivi */}
        {step === 13 && activeDossier && (
          <div>
            <LrarTrackingSuivi dossierId={activeDossier.id} dossierRef={activeDossier.dossier_ref} />
            <div className="flex gap-2.5 mt-7 flex-wrap">
              <button className="font-syne font-bold text-[0.78rem] px-5 py-2.5 rounded-[7px] bg-foreground/[0.07] text-muted-foreground border border-border-2 transition-all">+ Transmettre des pièces complémentaires</button>
              <button className="font-syne font-bold text-[0.78rem] px-5 py-2.5 rounded-[7px] bg-success/20 text-success border border-success/30 transition-all">Visa obtenu ✓</button>
            </div>
            {/* Procuration section */}
            <div className="mt-8 bg-panel border border-border rounded-xl p-5">
              <h3 className="font-syne font-bold text-sm mb-3">📬 Ma procuration CAPDEMARCHES</h3>
              {procurationSignee ? (
                <div>
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-green-600 text-lg">✅</span>
                    <span className="font-syne font-bold text-sm text-green-700 dark:text-green-400">Procuration active</span>
                  </div>
                  <div className="text-xs text-muted-foreground space-y-1">
                    <p>Signée le {procurationDate ? new Date(procurationDate).toLocaleDateString("fr-FR") : "—"}</p>
                    <p>Valide jusqu'au {procurationExpiry ? new Date(procurationExpiry).toLocaleDateString("fr-FR") : "—"}</p>
                  </div>
                  <div className="flex gap-2 mt-3">
                    <button className="font-syne font-bold text-xs px-3 py-1.5 rounded-lg bg-foreground/[0.07] text-muted-foreground border border-border">⬇️ Télécharger</button>
                    {procurationExpiry && (() => {
                      const daysLeft = Math.ceil((new Date(procurationExpiry).getTime() - Date.now()) / 86400000);
                      return daysLeft <= 30 ? (
                        <button onClick={() => setProcurationModalOpen(true)} className="font-syne font-bold text-xs px-3 py-1.5 rounded-lg bg-amber-500/10 text-amber-600 border border-amber-500/30">🔄 Renouveler</button>
                      ) : null;
                    })()}
                  </div>
                </div>
              ) : (
                <div>
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-amber-500 text-lg">⚠️</span>
                    <span className="font-syne font-bold text-sm text-amber-600">Procuration non signée</span>
                  </div>
                  <button onClick={() => setProcurationModalOpen(true)} className="mt-2 font-syne font-bold text-xs px-4 py-2 rounded-lg bg-primary text-primary-foreground">✍️ Signer ma procuration</button>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </ShellLayout>
  );
};

export default ClientSpace;
