import { useEffect, useState } from "react";
import ShellLayout from "@/components/ShellLayout";
import { NavItem, NavGroup } from "@/components/NavItem";
import { Eyebrow, BigTitle, Box, Pill, SectionLabel } from "@/components/ui-custom";
import { toast } from "sonner";
import { AdminCapdemarchesDashboard } from "@/components/AdminCapdemarchesDashboard";
import { AdminReferencesJuridiques } from "@/components/AdminReferencesJuridiques";
import { AdminPiecesRequises } from "@/components/AdminPiecesRequises";
import { supabase } from "@/integrations/supabase/client";
import type { Database, Json } from "@/integrations/supabase/types";

const mTitles = ["Vue générale", "Tous les dossiers", "Alertes & urgences", "Réassignations", "Suivi MySendingBox", "Gestion avocats", "Inscriptions", "Contenu juridique", "Finances", "RGPD & journaux", "CAPDEMARCHES", "Base juridique", "Pièces requises"];

type AvocatRow = Database["public"]["Tables"]["avocats_partenaires"]["Row"];
type AvocatInvitationRow = Database["public"]["Tables"]["avocat_invitations"]["Row"];
type DossierRow = Database["public"]["Tables"]["dossiers"]["Row"];
type AuditLogRow = Database["public"]["Tables"]["audit_admin"]["Row"];
type PaymentRow = Database["public"]["Tables"]["payments"]["Row"];
type ReferenceJuridiqueRow = Database["public"]["Tables"]["references_juridiques"]["Row"];
type PieceRequiseRow = Database["public"]["Tables"]["pieces_requises"]["Row"];
type RgpdRequestRow = Database["public"]["Tables"]["rgpd_requests"]["Row"];
type TarificationRow = Database["public"]["Tables"]["tarification"]["Row"];

type InviteAvocatResponse = {
  error?: string;
  activation_url?: string;
  message?: string;
};

type AssignAvocatResponse = {
  error?: string;
  message?: string;
};

type ManageAvocatResponse = {
  error?: string;
  message?: string;
  activation_url?: string;
};

type DossierFilter = "all" | "orphans" | "assigned" | "review" | "validated" | "sent";

const specialiteOptions = [
  { value: "tous", label: "Tous dossiers" },
  { value: "etudiant", label: "Étudiant" },
  { value: "court_sejour", label: "Court séjour" },
  { value: "long_sejour", label: "Long séjour" },
  { value: "conjoint_francais", label: "Conjoint FR" },
  { value: "salarie", label: "Salarié" },
  { value: "visiteur", label: "Visiteur" },
  { value: "talent", label: "Passeport talent" },
];

const formInputClass = "w-full bg-background border-[1.5px] border-border rounded-[9px] px-3 py-2.5 text-foreground text-sm outline-none focus:border-primary/55";
const labelClass = "font-syne text-[0.64rem] font-bold tracking-wider uppercase text-muted-foreground mb-1.5 block";

const formatDateTime = (value: string | null) => {
  if (!value) return "—";
  return new Date(value).toLocaleString("fr-FR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
};

const formatDate = (value: string | null) => {
  if (!value) return "—";
  return new Date(value).toLocaleDateString("fr-FR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
};

const formatCurrency = (value: number) => (
  new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(value)
);

const getInvitationStatus = (invitation: AvocatInvitationRow) => {
  if (invitation.revoked) return { label: "Révoquée", variant: "red" as const };
  if (invitation.used_at) return { label: "Activée", variant: "ok" as const };
  if (new Date(invitation.expires_at).getTime() < Date.now()) return { label: "Expirée", variant: "warn" as const };
  return { label: "En attente", variant: "new" as const };
};

const getSpecialiteLabel = (value: string | null | undefined) => {
  if (!value) return "—";
  return specialiteOptions.find((option) => option.value === value)?.label || value;
};

const sentLrarStatuses = new Set(["lrar_envoye", "envoyee", "distribuee", "livre", "ar_signe", "delivered", "sent"]);
const inTransitLrarStatuses = new Set(["lrar_envoye", "lrar_cree", "depose_poste", "en_transit", "attente_retrait", "envoyee", "sent"]);
const deliveredLrarStatuses = new Set(["livre", "ar_signe", "distribuee", "delivered"]);
const failedLrarStatuses = new Set(["retourne", "adresse_incorrecte", "erreur", "lrar_echec"]);
const validatedStatuses = new Set(["validee_avocat", "validee_automatique"]);
const isSentLrarStatus = (status: string | null | undefined) => Boolean(status && sentLrarStatuses.has(status));
const isValidatedStatus = (status: string | null | undefined) => Boolean(status && validatedStatuses.has(status));
const getInitials = (prenom?: string | null, nom?: string | null) => `${prenom?.[0] || ""}${nom?.[0] || ""}`.toUpperCase() || "AV";

const getJsonObject = (value: Json | null) => (
  value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {}
);

const getPricingNumber = (payment: PaymentRow, key: string) => {
  const details = getJsonObject(payment.pricing_details);
  const value = details[key];
  return typeof value === "number" ? value : Number(value || 0);
};

const getClientLabel = (dossier: DossierRow) => (
  [dossier.client_last_name, dossier.client_first_name].filter(Boolean).join(" ") || dossier.client_email || "Client"
);

const getRgpdTypeLabel = (type: string) => {
  const labels: Record<string, string> = {
    acces: "Accès",
    rectification: "Rectification",
    suppression: "Suppression",
    opposition: "Opposition",
    portabilite: "Portabilité",
    limitation: "Limitation",
    autre: "Autre",
  };
  return labels[type] || type;
};

const getPaymentStatus = (status: string) => {
  if (status === "paid") return { label: "Payé", variant: "ok" as const };
  if (status === "failed") return { label: "Échec", variant: "red" as const };
  if (status === "refunded") return { label: "Remboursé", variant: "warn" as const };
  if (status === "superseded") return { label: "Remplacé", variant: "muted" as const };
  return { label: "En attente", variant: "new" as const };
};

const isCurrentMonth = (value: string | null) => {
  if (!value) return false;
  const date = new Date(value);
  const now = new Date();
  return date.getMonth() === now.getMonth() && date.getFullYear() === now.getFullYear();
};

const isMysendingboxDossier = (dossier: DossierRow) => (
  Boolean(dossier.mysendingbox_letter_id || dossier.tracking_number || dossier.sent_at)
  || dossier.option_choisie === "B"
  || dossier.option_envoi === "B_mysendingbox"
  || isSentLrarStatus(dossier.lrar_status)
);

const getDelayInfo = (dossier: DossierRow) => {
  if (!dossier.date_notification_refus) {
    return { label: "N/A", color: "text-muted-foreground", days: null as number | null };
  }

  const notificationTime = new Date(dossier.date_notification_refus).getTime();
  const deadlineTime = notificationTime + 30 * 24 * 60 * 60 * 1000;
  const days = Math.ceil((deadlineTime - Date.now()) / (24 * 60 * 60 * 1000));

  if (days <= 3) return { label: `${days}j`, color: "text-red-2", days };
  if (days <= 7) return { label: `${days}j`, color: "text-amber-2", days };
  return { label: `${days}j`, color: "text-muted-foreground", days };
};

const getDossierStatus = (dossier: DossierRow) => {
  if (!dossier.avocat_id) return { label: "Orphelin", variant: "red" as const };
  if (dossier.validation_juridique_status === "a_verifier_avocat") return { label: "Relecture", variant: "warn" as const };
  if (isValidatedStatus(dossier.validation_juridique_status)) return { label: "Validé", variant: "ok" as const };
  if (dossier.validation_juridique_status === "bloquee") return { label: "Bloqué", variant: "red" as const };
  return { label: "En cours", variant: "new" as const };
};

const getLrarStatus = (status: string | null | undefined) => {
  if (status && deliveredLrarStatuses.has(status)) return { label: "Livré", variant: "ok" as const };
  if (status && inTransitLrarStatuses.has(status)) return { label: "En transit", variant: "post" as const };
  if (status && failedLrarStatuses.has(status)) return { label: "Incident", variant: "red" as const };
  if (status === "paiement_confirme" || status === "lettre_finalisee") return { label: "Prêt", variant: "ok" as const };
  if (status === "paiement_echoue") return { label: "Échec", variant: "red" as const };
  return { label: status || "En attente", variant: "muted" as const };
};

const matchesDossierFilter = (dossier: DossierRow, filter: DossierFilter) => {
  switch (filter) {
    case "orphans":
      return !dossier.avocat_id;
    case "assigned":
      return Boolean(dossier.avocat_id);
    case "review":
      return dossier.validation_juridique_status === "a_verifier_avocat";
    case "validated":
      return isValidatedStatus(dossier.validation_juridique_status);
    case "sent":
      return isSentLrarStatus(dossier.lrar_status);
    default:
      return true;
  }
};

const AdminSpace = () => {
  const [page, setPage] = useState(0);
  const [modalOpen, setModalOpen] = useState(false);
  const [selectedMotif, setSelectedMotif] = useState("Dossier orphelin");
  const [selectedAvocat, setSelectedAvocat] = useState<string | null>(null);
  const [assignNote, setAssignNote] = useState("");
  const [assigningDossier, setAssigningDossier] = useState(false);
  const [selectedDossierForAssign, setSelectedDossierForAssign] = useState<DossierRow | null>(null);
  const [selectedDossierDetail, setSelectedDossierDetail] = useState<DossierRow | null>(null);
  const [dossiers, setDossiers] = useState<DossierRow[]>([]);
  const [loadingDossiers, setLoadingDossiers] = useState(false);
  const [dossierSearch, setDossierSearch] = useState("");
  const [dossierFilter, setDossierFilter] = useState<DossierFilter>("all");
  const [auditLogs, setAuditLogs] = useState<AuditLogRow[]>([]);
  const [loadingAudit, setLoadingAudit] = useState(false);
  const [avocats, setAvocats] = useState<AvocatRow[]>([]);
  const [avocatInvitations, setAvocatInvitations] = useState<AvocatInvitationRow[]>([]);
  const [loadingAvocats, setLoadingAvocats] = useState(false);
  const [payments, setPayments] = useState<PaymentRow[]>([]);
  const [referencesJuridiques, setReferencesJuridiques] = useState<ReferenceJuridiqueRow[]>([]);
  const [piecesRequises, setPiecesRequises] = useState<PieceRequiseRow[]>([]);
  const [rgpdRequests, setRgpdRequests] = useState<RgpdRequestRow[]>([]);
  const [tarification, setTarification] = useState<TarificationRow | null>(null);
  const [loadingPlatformData, setLoadingPlatformData] = useState(false);
  const [updatingRgpdRequestId, setUpdatingRgpdRequestId] = useState<string | null>(null);
  const [creatingRgpdRequest, setCreatingRgpdRequest] = useState(false);
  const [rgpdForm, setRgpdForm] = useState({
    demandeur_email: "",
    type: "acces",
    dossier_ref: "",
    motif: "",
  });
  const [invitingAvocat, setInvitingAvocat] = useState(false);
  const [savingAvocatId, setSavingAvocatId] = useState<string | null>(null);
  const [workingInvitationId, setWorkingInvitationId] = useState<string | null>(null);
  const [lastAvocatActivationUrl, setLastAvocatActivationUrl] = useState("");
  const [inviteForm, setInviteForm] = useState({
    email: "",
    prenom: "",
    nom: "",
    barreau: "",
    phone: "",
    capacite_max: "5",
    specialites: "tous",
  });

  const openModal = (dossier?: DossierRow) => {
    if (!dossier) {
      setPage(1);
      toast.info("Choisissez un dossier dans la liste pour l'assigner.");
      return;
    }

    setSelectedDossierForAssign(dossier);
    setSelectedMotif(dossier.avocat_id ? "Réassignation admin" : "Dossier orphelin");
    setSelectedAvocat(null);
    setAssignNote("");
    setModalOpen(true);
  };

  const closeModal = () => {
    setModalOpen(false);
    setSelectedAvocat(null);
    setSelectedDossierForAssign(null);
    setAssignNote("");
  };

  const fetchDossiers = async () => {
    setLoadingDossiers(true);
    try {
      const { data, error } = await supabase
        .from("dossiers")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(200);

      if (error) throw error;
      setDossiers(data || []);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Chargement des dossiers impossible");
    } finally {
      setLoadingDossiers(false);
    }
  };

  const fetchAvocatData = async () => {
    setLoadingAvocats(true);
    try {
      const [avocatsResult, invitationsResult] = await Promise.all([
        supabase
          .from("avocats_partenaires")
          .select("*")
          .order("created_at", { ascending: false }),
        supabase
          .from("avocat_invitations")
          .select("*")
          .order("created_at", { ascending: false })
          .limit(50),
      ]);

      if (avocatsResult.error) throw avocatsResult.error;
      if (invitationsResult.error) throw invitationsResult.error;

      setAvocats(avocatsResult.data || []);
      setAvocatInvitations(invitationsResult.data || []);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Chargement des avocats impossible");
    } finally {
      setLoadingAvocats(false);
    }
  };

  const fetchAuditLogs = async () => {
    setLoadingAudit(true);
    try {
      const { data, error } = await supabase
        .from("audit_admin")
        .select("*")
        .in("action_type", [
          "assignation_avocat_dossier",
          "reassignation_avocat_dossier",
          "mise_a_jour_avocat_partenaire",
          "suspension_avocat_partenaire",
          "reactivation_avocat_partenaire",
          "creation_invitation_avocat",
          "revocation_invitation_avocat",
          "prolongation_invitation_avocat",
          "validation_avocat_dossier",
          "blocage_avocat_dossier",
        ])
        .order("created_at", { ascending: false })
        .limit(40);

      if (error) throw error;
      setAuditLogs(data || []);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Chargement du journal impossible");
    } finally {
      setLoadingAudit(false);
    }
  };

  const fetchPlatformData = async () => {
    setLoadingPlatformData(true);
    try {
      const [paymentsResult, referencesResult, piecesResult, rgpdResult, tarificationResult] = await Promise.all([
        supabase
          .from("payments")
          .select("*")
          .order("created_at", { ascending: false })
          .limit(200),
        supabase
          .from("references_juridiques")
          .select("*")
          .order("updated_at", { ascending: false })
          .limit(500),
        supabase
          .from("pieces_requises")
          .select("*")
          .order("updated_at", { ascending: false })
          .limit(500),
        supabase
          .from("rgpd_requests")
          .select("*")
          .order("created_at", { ascending: false })
          .limit(100),
        supabase
          .from("tarification")
          .select("*")
          .order("updated_at", { ascending: false })
          .limit(1),
      ]);

      if (paymentsResult.error) throw paymentsResult.error;
      if (referencesResult.error) throw referencesResult.error;
      if (piecesResult.error) throw piecesResult.error;
      if (rgpdResult.error) throw rgpdResult.error;
      if (tarificationResult.error) throw tarificationResult.error;

      setPayments(paymentsResult.data || []);
      setReferencesJuridiques(referencesResult.data || []);
      setPiecesRequises(piecesResult.data || []);
      setRgpdRequests(rgpdResult.data || []);
      setTarification(tarificationResult.data?.[0] || null);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Chargement des données plateforme impossible");
    } finally {
      setLoadingPlatformData(false);
    }
  };

  useEffect(() => {
    void fetchDossiers();
    void fetchAvocatData();
    void fetchAuditLogs();
    void fetchPlatformData();
  }, []);

  const handleCreateRgpdRequest = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!rgpdForm.demandeur_email.trim()) {
      toast.error("Email demandeur requis");
      return;
    }

    setCreatingRgpdRequest(true);
    try {
      const { error } = await supabase
        .from("rgpd_requests")
        .insert({
          demandeur_email: rgpdForm.demandeur_email.trim(),
          type: rgpdForm.type,
          dossier_ref: rgpdForm.dossier_ref.trim() || null,
          motif: rgpdForm.motif.trim() || null,
        });

      if (error) throw error;

      toast.success("Demande RGPD enregistrée");
      setRgpdForm({ demandeur_email: "", type: "acces", dossier_ref: "", motif: "" });
      void fetchPlatformData();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Création RGPD impossible");
    } finally {
      setCreatingRgpdRequest(false);
    }
  };

  const handleUpdateRgpdRequest = async (request: RgpdRequestRow, statut: "en_cours" | "terminee" | "rejetee") => {
    setUpdatingRgpdRequestId(request.id);
    try {
      const { data: authData } = await supabase.auth.getUser();
      const { error } = await supabase
        .from("rgpd_requests")
        .update({
          statut,
          assigned_to: statut === "en_cours" ? authData.user?.id || null : request.assigned_to,
          completed_at: statut === "terminee" || statut === "rejetee" ? new Date().toISOString() : null,
        })
        .eq("id", request.id);

      if (error) throw error;

      toast.success("Demande RGPD mise à jour");
      void fetchPlatformData();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Mise à jour RGPD impossible");
    } finally {
      setUpdatingRgpdRequestId(null);
    }
  };

  const copyToClipboard = async (value: string, successMessage: string) => {
    try {
      await navigator.clipboard.writeText(value);
      toast.success(successMessage);
    } catch {
      toast.error("Copie impossible");
    }
  };

  const handleInviteAvocat = async (e: React.FormEvent) => {
    e.preventDefault();
    setInvitingAvocat(true);
    setLastAvocatActivationUrl("");

    try {
      const specialites = inviteForm.specialites
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean);

      const { data, error } = await supabase.functions.invoke("invite-avocat", {
        body: {
          ...inviteForm,
          specialites,
          capacite_max: Number(inviteForm.capacite_max),
        },
      });

      if (error) throw error;

      const payload = data as InviteAvocatResponse;
      if (payload?.error) throw new Error(payload.error);

      setLastAvocatActivationUrl(payload.activation_url || "");
      toast.success(payload.message || "Invitation avocat créée");
      setInviteForm({
        email: "",
        prenom: "",
        nom: "",
        barreau: "",
        phone: "",
        capacite_max: "5",
        specialites: "tous",
      });
      void fetchAvocatData();
      void fetchAuditLogs();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Erreur lors de l'invitation avocat");
    } finally {
      setInvitingAvocat(false);
    }
  };

  const handleManualAssign = async () => {
    if (!selectedDossierForAssign || !selectedAvocat) {
      return;
    }

    setAssigningDossier(true);
    try {
      const { data, error } = await supabase.functions.invoke("assign-avocat-manual", {
        body: {
          dossier_id: selectedDossierForAssign.id,
          avocat_partenaire_id: selectedAvocat,
          motif: selectedMotif,
          note: assignNote,
        },
      });

      if (error) throw error;

      const payload = data as AssignAvocatResponse;
      if (payload?.error) throw new Error(payload.error);

      toast.success(payload.message || "Dossier assigné");
      closeModal();
      void fetchDossiers();
      void fetchAvocatData();
      void fetchAuditLogs();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Assignation impossible");
    } finally {
      setAssigningDossier(false);
    }
  };

  const handleUpdateAvocat = async (e: React.FormEvent<HTMLFormElement>, avocat: AvocatRow) => {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    setSavingAvocatId(avocat.id);

    try {
      const { data, error } = await supabase.functions.invoke("manage-avocat-admin", {
        body: {
          action: "update_avocat",
          avocat_id: avocat.id,
          capacite_max: Number(form.get("capacite_max")),
          delai_moyen_jours: Number(form.get("delai_moyen_jours")),
          specialites: [String(form.get("specialites") || "tous")],
        },
      });

      if (error) throw error;

      const payload = data as ManageAvocatResponse;
      if (payload?.error) throw new Error(payload.error);

      toast.success(payload.message || "Avocat mis à jour");
      void fetchAvocatData();
      void fetchAuditLogs();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Mise à jour avocat impossible");
    } finally {
      setSavingAvocatId(null);
    }
  };

  const handleToggleAvocat = async (avocat: AvocatRow) => {
    setSavingAvocatId(avocat.id);
    try {
      const { data, error } = await supabase.functions.invoke("manage-avocat-admin", {
        body: {
          action: "toggle_avocat",
          avocat_id: avocat.id,
          disponible: !avocat.disponible,
        },
      });

      if (error) throw error;

      const payload = data as ManageAvocatResponse;
      if (payload?.error) throw new Error(payload.error);

      toast.success(payload.message || "Statut avocat mis à jour");
      void fetchAvocatData();
      void fetchAuditLogs();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Changement de statut impossible");
    } finally {
      setSavingAvocatId(null);
    }
  };

  const handleInvitationAction = async (invitation: AvocatInvitationRow, action: "revoke_invitation" | "renew_invitation") => {
    setWorkingInvitationId(invitation.id);
    try {
      const { data, error } = await supabase.functions.invoke("manage-avocat-admin", {
        body: {
          action,
          invitation_id: invitation.id,
        },
      });

      if (error) throw error;

      const payload = data as ManageAvocatResponse;
      if (payload?.error) throw new Error(payload.error);

      if (payload.activation_url) {
        await copyToClipboard(payload.activation_url, "Lien d'activation copié");
      }

      toast.success(payload.message || "Invitation mise à jour");
      void fetchAvocatData();
      void fetchAuditLogs();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Action invitation impossible");
    } finally {
      setWorkingInvitationId(null);
    }
  };

  const dossierStats = {
    total: dossiers.length,
    orphans: dossiers.filter((dossier) => !dossier.avocat_id).length,
    assigned: dossiers.filter((dossier) => dossier.avocat_id).length,
    review: dossiers.filter((dossier) => dossier.validation_juridique_status === "a_verifier_avocat").length,
    validated: dossiers.filter((dossier) => isValidatedStatus(dossier.validation_juridique_status)).length,
    sent: dossiers.filter((dossier) => isSentLrarStatus(dossier.lrar_status)).length,
    urgent: dossiers.filter((dossier) => {
      const delay = getDelayInfo(dossier);
      return delay.days !== null && delay.days <= 7;
    }).length,
  };

  const lrarDossiers = [...dossiers]
    .filter(isMysendingboxDossier)
    .sort((a, b) => new Date(b.sent_at || b.updated_at || b.created_at).getTime() - new Date(a.sent_at || a.updated_at || a.created_at).getTime());

  const lrarStats = {
    month: lrarDossiers.filter((dossier) => isCurrentMonth(dossier.sent_at || dossier.created_at)).length,
    delivered: lrarDossiers.filter((dossier) => deliveredLrarStatuses.has(dossier.lrar_status) || Boolean(dossier.delivered_at)).length,
    transit: lrarDossiers.filter((dossier) => inTransitLrarStatuses.has(dossier.lrar_status)).length,
    failed: lrarDossiers.filter((dossier) => failedLrarStatuses.has(dossier.lrar_status)).length,
  };

  const paidPayments = payments.filter((payment) => payment.status === "paid");
  const monthlyPaidPayments = paidPayments.filter((payment) => isCurrentMonth(payment.created_at));
  const financeStats = {
    revenue: monthlyPaidPayments.reduce((sum, payment) => sum + payment.amount / 100, 0),
    avocatFees: monthlyPaidPayments.reduce((sum, payment) => sum + getPricingNumber(payment, "honoraires_avocat_eur"), 0),
    mysendingboxFees: monthlyPaidPayments.reduce((sum, payment) => sum + getPricingNumber(payment, "envoi_mysendingbox_eur"), 0),
    letterFees: monthlyPaidPayments.reduce((sum, payment) => sum + getPricingNumber(payment, "generation_lettre_eur"), 0),
    pending: payments.filter((payment) => payment.status === "pending").length,
    failed: payments.filter((payment) => payment.status === "failed").length,
  };
  const netMargin = financeStats.revenue - financeStats.avocatFees - financeStats.mysendingboxFees;

  const activeReferences = referencesJuridiques.filter((ref) => ref.actif);
  const activePieces = piecesRequises.filter((piece) => piece.actif);
  const motifCoverage = activeReferences.reduce<Record<string, number>>((acc, ref) => {
    for (const motif of ref.motifs_concernes || []) {
      acc[motif] = (acc[motif] || 0) + 1;
    }
    return acc;
  }, {});
  const underCoveredMotifs = ["A", "B", "C", "D", "E", "F", "G", "H", "I", "J", "K", "L"].filter((motif) => (motifCoverage[motif] || 0) < 3);
  const referencesToVerify = activeReferences.filter((ref) => {
    if (!ref.date_verification || !ref.source_url) return true;
    const verifiedAt = new Date(ref.date_verification).getTime();
    return verifiedAt < Date.now() - 180 * 24 * 60 * 60 * 1000;
  });
  const lastReferenceUpdate = referencesJuridiques[0]?.updated_at || referencesJuridiques[0]?.created_at || null;
  const lastPieceUpdate = piecesRequises[0]?.updated_at || piecesRequises[0]?.created_at || null;

  const rgpdStats = {
    pending: rgpdRequests.filter((request) => request.statut === "nouvelle" || request.statut === "en_cours").length,
    overdue: rgpdRequests.filter((request) => request.statut !== "terminee" && request.statut !== "rejetee" && new Date(request.due_at).getTime() < Date.now()).length,
    completed: rgpdRequests.filter((request) => request.statut === "terminee").length,
  };

  const recentActivity = [
    ...auditLogs.map((log) => ({
      id: `audit-${log.id}`,
      createdAt: log.created_at,
      color: log.action_type.includes("blocage") || log.action_type.includes("revocation") ? "bg-red-2" : log.action_type.includes("validation") || log.action_type.includes("activation") ? "bg-green-2" : "bg-primary-hover",
      text: `${log.action_type.split("_").join(" ")} · ${String(getJsonObject(log.details).dossier_ref || getJsonObject(log.details).email || log.cible_id || "audit")}`,
    })),
    ...payments.slice(0, 20).map((payment) => ({
      id: `payment-${payment.id}`,
      createdAt: payment.created_at,
      color: payment.status === "paid" ? "bg-green-2" : payment.status === "failed" ? "bg-red-2" : "bg-amber-2",
      text: `Paiement ${payment.payment_method} · ${payment.dossier_ref} · ${getPaymentStatus(payment.status).label}`,
    })),
    ...lrarDossiers.slice(0, 20).map((dossier) => ({
      id: `lrar-${dossier.id}`,
      createdAt: dossier.delivered_at || dossier.sent_at || dossier.updated_at || dossier.created_at,
      color: deliveredLrarStatuses.has(dossier.lrar_status) ? "bg-green-2" : failedLrarStatuses.has(dossier.lrar_status) ? "bg-red-2" : "bg-post-dark",
      text: `MySendingBox · ${dossier.dossier_ref} · ${getLrarStatus(dossier.lrar_status).label}`,
    })),
  ]
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .slice(0, 6);

  const filteredDossiers = dossiers.filter((dossier) => {
    if (!matchesDossierFilter(dossier, dossierFilter)) return false;
    const query = dossierSearch.trim().toLowerCase();
    if (!query) return true;

    const haystack = [
      dossier.dossier_ref,
      dossier.client_first_name,
      dossier.client_last_name,
      dossier.client_email,
      dossier.visa_type,
      dossier.avocat_nom,
      dossier.avocat_prenom,
    ].filter(Boolean).join(" ").toLowerCase();

    return haystack.includes(query);
  });

  const urgentDossiers = dossiers
    .filter((dossier) => !dossier.avocat_id || ((getDelayInfo(dossier).days ?? 99) <= 7))
    .slice(0, 3);

  const priorityDossiers = dossiers
    .filter((dossier) => !dossier.avocat_id || ((getDelayInfo(dossier).days ?? 99) <= 7))
    .slice(0, 20);

  const selectedDossierDelay = selectedDossierForAssign ? getDelayInfo(selectedDossierForAssign) : null;
  const selectedDossierClient = selectedDossierForAssign
    ? [selectedDossierForAssign.client_last_name, selectedDossierForAssign.client_first_name].filter(Boolean).join(" ") || selectedDossierForAssign.client_email || "Client"
    : "Client";
  const selectedDossierMotif = selectedDossierForAssign?.motifs_refus?.join(", ") || selectedDossierForAssign?.refus_type || "—";

  const sidebar = (
    <>
      <NavGroup label="Dashboard">
        <NavItem icon="📊" label="Vue générale" active={page === 0} onClick={() => setPage(0)} />
      </NavGroup>
      <NavGroup label="Dossiers">
        <NavItem icon="📁" label="Tous les dossiers" active={page === 1} badge={{ text: String(dossierStats.total), color: "blue" }} onClick={() => setPage(1)} />
        <NavItem icon="🚨" label="Alertes" active={page === 2} badge={{ text: String(dossierStats.urgent), color: "red" }} onClick={() => setPage(2)} />
        <NavItem icon="🔄" label="Réassignations" active={page === 3} badge={{ text: String(dossierStats.orphans), color: "amber" }} onClick={() => setPage(3)} />
        <NavItem icon="📬" label="Suivi MySendingBox" active={page === 4} onClick={() => setPage(4)} />
        <NavItem icon="📮" label="CAPDEMARCHES" active={page === 10} onClick={() => setPage(10)} />
      </NavGroup>
      <NavGroup label="Avocats">
        <NavItem icon="⚖️" label="Gestion avocats" active={page === 5} onClick={() => setPage(5)} />
        <NavItem icon="📥" label="Inscriptions" active={page === 6} badge={{ text: String(avocatInvitations.filter((invitation) => !invitation.used_at && !invitation.revoked).length), color: "amber" }} onClick={() => setPage(6)} />
      </NavGroup>
      <NavGroup label="Plateforme">
        <NavItem icon="📋" label="Contenu juridique" active={page === 7} onClick={() => setPage(7)} />
        <NavItem icon="⚖️" label="Base juridique" active={page === 11} onClick={() => setPage(11)} />
        <NavItem icon="📎" label="Pièces requises" active={page === 12} onClick={() => setPage(12)} />
        <NavItem icon="💰" label="Finances" active={page === 8} onClick={() => setPage(8)} />
        <NavItem icon="🔒" label="RGPD & journaux" active={page === 9} onClick={() => setPage(9)} />
      </NavGroup>
    </>
  );

  const topbarRight = (
    <>
      <button className="bg-foreground/[0.06] border border-border-2 rounded-md px-2.5 py-1.5 text-xs text-muted-foreground font-syne font-semibold flex items-center gap-1.5 hover:bg-foreground/10 hover:text-foreground transition-all" onClick={() => openModal()}>🔄 Réassigner</button>
      <div className="relative w-[30px] h-[30px] rounded-md bg-foreground/[0.05] border border-border cursor-pointer flex items-center justify-center text-sm" onClick={() => setPage(2)}>
        🔔
        {dossierStats.urgent > 0 && (
          <span className="absolute -top-1 -right-1 min-w-3.5 h-3.5 px-1 rounded-full bg-destructive font-syne text-[0.52rem] font-extrabold flex items-center justify-center">{dossierStats.urgent}</span>
        )}
      </div>
      <div className="w-[30px] h-[30px] rounded-md bg-gradient-to-br from-primary-hover to-purple-600 flex items-center justify-center font-syne font-extrabold text-[0.68rem]">AD</div>
    </>
  );

  const bottomNavItems = [
    { icon: "📊", label: "Accueil", onClick: () => setPage(0), active: page === 0 },
    { icon: "📁", label: "Dossiers", onClick: () => setPage(1), active: page === 1 },
    { icon: "🚨", label: "Alertes", onClick: () => setPage(2), active: page === 2 },
    { icon: "⚖️", label: "Avocats", onClick: () => setPage(5), active: page === 5 || page === 6 },
  ];

  return (
    <ShellLayout
      role="admin"
      roleLabel="Administration"
      sidebar={sidebar}
      topbarTitle={mTitles[page]}
      topbarRight={topbarRight}
      footerContent={<><strong className="text-muted-foreground">Admin IZY</strong><br />Données Supabase actualisées</>}
      bottomNavItems={bottomNavItems}
    >
      <div className="animate-fadeU">
        {/* M0 — Dashboard */}
        {page === 0 && (
          <div>
            <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-5">
              {[
                { val: String(dossierStats.total), label: "Dossiers actifs", color: "text-primary-hover", top: "bg-primary-hover", delta: "Données Supabase", deltaClass: "text-green-2" },
                { val: String(dossierStats.urgent), label: "Alertes critiques", color: "text-amber-2", top: "bg-amber-2", delta: "Délai ≤ 7j", deltaClass: "text-red-2" },
                { val: String(dossierStats.orphans), label: "Orphelins", color: "text-red-2", top: "bg-red-2", delta: "Action requise", deltaClass: "text-red-2" },
                { val: String(avocats.filter((avocat) => avocat.disponible && avocat.dossiers_en_cours < avocat.capacite_max).length), label: "Avocats dispo", color: "text-green-2", top: "bg-green-2", delta: `${avocats.length} inscrits`, deltaClass: "text-green-2" },
                { val: String(dossierStats.review), label: "En relecture", color: "text-purple-400", top: "bg-purple-400", delta: "Avocat requis", deltaClass: "text-muted-foreground" },
              ].map((k) => (
                <div key={k.label} className="bg-panel border border-border rounded-[10px] p-3 relative overflow-hidden cursor-pointer hover:border-border-2 hover:-translate-y-px transition-all" onClick={() => k.label.includes("Alertes") ? setPage(2) : k.label.includes("MySendingBox") ? setPage(4) : setPage(1)}>
                  <div className={`absolute top-0 left-0 right-0 h-0.5 ${k.top}`} />
                  <div className={`font-syne font-extrabold text-2xl leading-none mb-1 ${k.color}`}>{k.val}</div>
                  <div className="text-[0.7rem] text-muted-foreground">{k.label}</div>
                  <div className={`text-[0.65rem] mt-0.5 ${k.deltaClass}`}>{k.delta}</div>
                </div>
              ))}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {/* Urgences */}
              <div className="bg-panel border border-border rounded-xl overflow-hidden">
                <div className="flex items-center justify-between p-3 border-b border-border">
                  <div className="font-syne font-bold text-sm">🚨 Urgences immédiates</div>
                  <button className="font-syne font-bold text-[0.68rem] px-2.5 py-1 rounded-md bg-foreground/[0.07] text-muted-foreground border border-border-2" onClick={() => setPage(2)}>Tout voir</button>
                </div>
                <div className="p-2">
                  {urgentDossiers.length === 0 ? (
                    <Box variant="ok" title="Aucune urgence">
                      Aucun dossier orphelin ou proche du délai critique.
                    </Box>
                  ) : urgentDossiers.map((dossier) => {
                    const delay = getDelayInfo(dossier);
                    return (
                      <Box
                        key={dossier.id}
                        variant="alert"
                        title={`${dossier.avocat_id ? "Délai proche" : "Orphelin"} — ${dossier.dossier_ref}`}
                        action={<button className="font-syne font-bold text-[0.68rem] px-2.5 py-1 rounded-md bg-destructive/[0.14] text-red-2 border border-destructive/25 flex-shrink-0" onClick={() => openModal(dossier)}>Assigner</button>}
                      >
                        {dossier.client_last_name} {dossier.client_first_name} · <strong className={delay.color}>{delay.label}</strong> avant forclusion.
                      </Box>
                    );
                  })}
                </div>
              </div>

              {/* Activity */}
              <div className="bg-panel border border-border rounded-xl overflow-hidden">
                <div className="flex items-center justify-between p-3 border-b border-border">
                  <div className="font-syne font-bold text-sm">⏱ Activité récente</div>
                </div>
                <div className="p-3">
                  {recentActivity.length === 0 ? (
                    <div className="text-xs text-muted-foreground py-2">Aucune activité récente dans les journaux chargés.</div>
                  ) : recentActivity.map((item) => (
                    <div key={item.id} className="flex gap-3 py-2 border-b border-foreground/[0.04] last:border-b-0 text-xs">
                      <div className={`w-2 h-2 rounded-full flex-shrink-0 mt-1 ${item.color}`} />
                      <div className="text-muted flex-shrink-0 text-[0.7rem] whitespace-nowrap min-w-[40px]">
                        {new Date(item.createdAt).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}
                      </div>
                      <div className="text-muted-foreground flex-1 leading-relaxed">{item.text}</div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* M1 — Dossiers */}
        {page === 1 && (
          <div>
            <Eyebrow>Gestion</Eyebrow>
            <BigTitle>Tous les dossiers ({filteredDossiers.length})</BigTitle>
            <div className="bg-panel border border-border rounded-xl overflow-hidden">
              <div className="flex items-center justify-between p-3 border-b border-border">
                <div className="font-syne font-bold text-sm">Dossiers actifs</div>
                <div className="flex gap-1.5">
                  <input
                    className="bg-foreground/[0.05] border border-border-2 rounded-md px-2.5 py-1 text-foreground text-xs outline-none w-40 focus:border-primary-hover/45 focus:w-52 transition-all"
                    placeholder="🔍 Rechercher…"
                    value={dossierSearch}
                    onChange={(e) => setDossierSearch(e.target.value)}
                  />
                  <button
                    className="font-syne font-bold text-[0.7rem] px-3 py-1 rounded-md bg-foreground/[0.07] text-muted-foreground border border-border-2 disabled:opacity-50"
                    onClick={() => void fetchDossiers()}
                    disabled={loadingDossiers}
                  >
                    {loadingDossiers ? "Chargement…" : "Actualiser"}
                  </button>
                </div>
              </div>
              <div className="flex gap-1.5 p-2 border-b border-border flex-wrap bg-foreground/[0.015]">
                {[
                  { key: "all" as const, label: `Tous (${dossierStats.total})` },
                  { key: "orphans" as const, label: `Orphelins (${dossierStats.orphans})` },
                  { key: "assigned" as const, label: `Assignés (${dossierStats.assigned})` },
                  { key: "review" as const, label: `En relecture (${dossierStats.review})` },
                  { key: "validated" as const, label: `Validés (${dossierStats.validated})` },
                  { key: "sent" as const, label: `Envoyés (${dossierStats.sent})` },
                ].map((filter) => (
                  <button
                    key={filter.key}
                    onClick={() => setDossierFilter(filter.key)}
                    className={`font-syne text-[0.64rem] font-bold px-2.5 py-1 rounded-full border cursor-pointer transition-all ${dossierFilter === filter.key ? "bg-primary/[0.18] border-primary-hover text-primary-hover" : "border-border-2 text-muted-foreground hover:border-foreground/20 hover:text-foreground"}`}
                  >
                    {filter.label}
                  </button>
                ))}
              </div>
              <div className="overflow-x-auto">
                <table className="w-full border-collapse">
                  <thead><tr>{["Réf.", "Client", "Type", "Motif", "Délai", "Avocat", "Statut", "MSB", "Actions"].map((h) => (<th key={h} className="font-syne text-[0.6rem] font-bold tracking-wider uppercase text-muted px-3.5 py-2 text-left border-b border-border whitespace-nowrap">{h}</th>))}</tr></thead>
                  <tbody>
                    {filteredDossiers.length === 0 ? (
                      <tr>
                        <td colSpan={9} className="px-3.5 py-8 text-center text-xs text-muted-foreground">
                          Aucun dossier ne correspond au filtre.
                        </td>
                      </tr>
                    ) : filteredDossiers.map((dossier) => {
                      const delay = getDelayInfo(dossier);
                      const dossierStatus = getDossierStatus(dossier);
                      const lrarStatus = getLrarStatus(dossier.lrar_status);
                      const urgent = delay.days !== null && delay.days <= 7;
                      return (
                        <tr key={dossier.id} className={`cursor-pointer transition-colors hover:bg-foreground/[0.022] ${urgent || !dossier.avocat_id ? "border-l-2 border-l-red-2" : ""}`}>
                          <td className="px-3.5 py-2.5 text-xs font-syne text-muted border-b border-foreground/[0.03]">{dossier.dossier_ref}</td>
                          <td className="px-3.5 py-2.5 text-xs font-semibold border-b border-foreground/[0.03]">{dossier.client_last_name} {dossier.client_first_name}</td>
                          <td className="px-3.5 py-2.5 text-xs text-muted-foreground border-b border-foreground/[0.03]">{getSpecialiteLabel(dossier.visa_type)}</td>
                          <td className="px-3.5 py-2.5 text-xs text-muted-foreground border-b border-foreground/[0.03]">{dossier.motifs_refus?.join(", ") || dossier.refus_type || "—"}</td>
                          <td className={`px-3.5 py-2.5 text-xs font-syne font-bold border-b border-foreground/[0.03] ${delay.color}`}>{delay.label}</td>
                          <td className="px-3.5 py-2.5 text-xs text-muted-foreground border-b border-foreground/[0.03]">
                            {dossier.avocat_id ? `Me ${dossier.avocat_prenom || ""} ${dossier.avocat_nom || ""}` : <Pill variant="red">Orphelin</Pill>}
                          </td>
                          <td className="px-3.5 py-2.5 border-b border-foreground/[0.03]"><Pill variant={dossierStatus.variant}>{dossierStatus.label}</Pill></td>
                          <td className="px-3.5 py-2.5 border-b border-foreground/[0.03]"><Pill variant={lrarStatus.variant}>{lrarStatus.label}</Pill></td>
                          <td className="px-3.5 py-2.5 border-b border-foreground/[0.03]">
                            <div className="flex gap-1.5">
                              <button
                                className="bg-foreground/[0.07] border border-border-2 text-muted-foreground rounded px-2 py-1 font-syne text-[0.6rem] font-bold cursor-pointer hover:text-foreground"
                                onClick={() => setSelectedDossierDetail(dossier)}
                              >
                                Détails
                              </button>
                            <button
                              className="bg-primary/[0.18] border border-primary-hover/30 text-primary-hover rounded px-2 py-1 font-syne text-[0.6rem] font-bold cursor-pointer hover:bg-primary/30"
                              onClick={() => openModal(dossier)}
                            >
                              {dossier.avocat_id ? "Réassigner" : "Assigner"}
                            </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* M2 — Alertes */}
        {page === 2 && (
          <div>
            <Eyebrow>Alertes</Eyebrow>
            <BigTitle>Alertes & urgences ({dossierStats.urgent})</BigTitle>
            {urgentDossiers.length === 0 ? (
              <Box variant="ok" title="Aucune alerte dossier">
                Aucun dossier orphelin ou délai critique dans les 200 derniers dossiers chargés.
              </Box>
            ) : urgentDossiers.map((dossier) => {
              const delay = getDelayInfo(dossier);
              const isOrphan = !dossier.avocat_id;
              const client = [dossier.client_last_name, dossier.client_first_name].filter(Boolean).join(" ") || dossier.client_email || "Client";
              return (
                <Box
                  key={dossier.id}
                  variant={isOrphan || (delay.days !== null && delay.days <= 3) ? "alert" : "warn"}
                  title={`${isOrphan ? "Dossier orphelin" : "Délai critique"} — ${dossier.dossier_ref} · ${client}`}
                  action={
                    <button
                      className="font-syne font-bold text-[0.78rem] px-4 py-2 rounded-[7px] bg-destructive/[0.14] text-red-2 border border-destructive/25 flex-shrink-0"
                      onClick={() => openModal(dossier)}
                    >
                      {isOrphan ? "Assigner maintenant" : "Réassigner"}
                    </button>
                  }
                >
                  {isOrphan ? "Aucun avocat assigné." : `Avocat actuel : Me ${dossier.avocat_prenom || ""} ${dossier.avocat_nom || ""}.`} Délai : <strong className={delay.color}>{delay.label}</strong>. {getSpecialiteLabel(dossier.visa_type)} · Motif {dossier.motifs_refus?.join(", ") || dossier.refus_type || "—"}.
                </Box>
              );
            })}
            <Box variant="warn" title="Capacité avocats">
              {avocats.filter((avocat) => avocat.dossiers_en_cours >= avocat.capacite_max).length} avocat(s) ont atteint leur capacité maximale.
            </Box>
            <Box variant="info" title="Invitations avocat en attente">
              {avocatInvitations.filter((invitation) => !invitation.used_at && !invitation.revoked).length} invitation(s) non activées.
            </Box>
          </div>
        )}

        {/* M3 — Réassignations */}
        {page === 3 && (
          <div>
            <Eyebrow>Réassignations</Eyebrow>
            <BigTitle>Réassignations manuelles</BigTitle>
            <Box variant="info" title="Traçabilité">
              Chaque assignation confirmée ici est enregistrée dans audit_admin avec l'admin, le dossier, l'ancien avocat, le nouvel avocat et le motif.
            </Box>
            <div className="bg-panel border border-border rounded-xl overflow-hidden">
              <div className="flex items-center justify-between p-3 border-b border-border">
                <div className="font-syne font-bold text-sm">Dossiers à traiter en priorité</div>
                <button
                  className="font-syne font-bold text-[0.7rem] px-3 py-1 rounded-md bg-foreground/[0.07] text-muted-foreground border border-border-2 disabled:opacity-50"
                  onClick={() => void fetchDossiers()}
                  disabled={loadingDossiers}
                >
                  {loadingDossiers ? "Chargement…" : "Actualiser"}
                </button>
              </div>
              <table className="w-full border-collapse">
                <thead><tr>{["Dossier", "Client", "Type", "Motif", "Délai", "Avocat actuel", "Action"].map((h) => (<th key={h} className="font-syne text-[0.6rem] font-bold tracking-wider uppercase text-muted px-3.5 py-2 text-left border-b border-border">{h}</th>))}</tr></thead>
                <tbody>
                  {priorityDossiers.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="px-3.5 py-8 text-center text-xs text-muted-foreground">
                        Aucun dossier prioritaire.
                      </td>
                    </tr>
                  ) : priorityDossiers.map((dossier) => {
                    const delay = getDelayInfo(dossier);
                    const client = [dossier.client_last_name, dossier.client_first_name].filter(Boolean).join(" ") || dossier.client_email || "Client";
                    return (
                      <tr key={dossier.id} className="hover:bg-foreground/[0.022] transition-colors">
                        <td className="px-3.5 py-2.5 text-xs font-syne text-muted border-b border-foreground/[0.03]">{dossier.dossier_ref}</td>
                        <td className="px-3.5 py-2.5 text-xs font-semibold border-b border-foreground/[0.03]">{client}</td>
                        <td className="px-3.5 py-2.5 text-xs text-muted-foreground border-b border-foreground/[0.03]">{getSpecialiteLabel(dossier.visa_type)}</td>
                        <td className="px-3.5 py-2.5 text-xs text-muted-foreground border-b border-foreground/[0.03]">{dossier.motifs_refus?.join(", ") || dossier.refus_type || "—"}</td>
                        <td className={`px-3.5 py-2.5 text-xs font-syne font-bold border-b border-foreground/[0.03] ${delay.color}`}>{delay.label}</td>
                        <td className="px-3.5 py-2.5 text-xs text-muted-foreground border-b border-foreground/[0.03]">
                          {dossier.avocat_id ? `Me ${dossier.avocat_prenom || ""} ${dossier.avocat_nom || ""}` : <Pill variant="red">Orphelin</Pill>}
                        </td>
                        <td className="px-3.5 py-2.5 border-b border-foreground/[0.03]">
                          <button
                            className="bg-primary/[0.18] border border-primary-hover/30 text-primary-hover rounded px-2 py-1 font-syne text-[0.6rem] font-bold"
                            onClick={() => openModal(dossier)}
                          >
                            {dossier.avocat_id ? "Réassigner" : "Assigner"}
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <div className="flex gap-2.5 mt-7">
              <button className="font-syne font-bold text-[0.78rem] px-5 py-2.5 rounded-[7px] bg-primary-hover text-foreground transition-all" onClick={() => setPage(1)}>Choisir dans tous les dossiers</button>
            </div>

            <div className="bg-panel border border-border rounded-xl overflow-hidden mt-5">
              <div className="flex items-center justify-between p-3 border-b border-border">
                <div className="font-syne font-bold text-sm">Journal opérationnel</div>
                <button
                  className="font-syne font-bold text-[0.7rem] px-3 py-1 rounded-md bg-foreground/[0.07] text-muted-foreground border border-border-2 disabled:opacity-50"
                  onClick={() => void fetchAuditLogs()}
                  disabled={loadingAudit}
                >
                  {loadingAudit ? "Chargement…" : "Actualiser"}
                </button>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full border-collapse">
                  <thead><tr>{["Date", "Action", "Dossier/Cible", "Acteur", "Détails"].map((h) => (<th key={h} className="font-syne text-[0.6rem] font-bold tracking-wider uppercase text-muted px-3.5 py-2 text-left border-b border-border whitespace-nowrap">{h}</th>))}</tr></thead>
                  <tbody>
                    {auditLogs.length === 0 ? (
                      <tr>
                        <td colSpan={5} className="px-3.5 py-8 text-center text-xs text-muted-foreground">
                          Aucun événement opérationnel enregistré.
                        </td>
                      </tr>
                    ) : auditLogs.map((log) => {
                      const details = getJsonObject(log.details);
                      const cible = String(details.dossier_ref || details.email || log.cible_id || "—");
                      const change = String(details.new_avocat_label || details.next_status || details.previous_status || details.note || "—");
                      return (
                        <tr key={log.id} className="hover:bg-foreground/[0.022] transition-colors">
                          <td className="px-3.5 py-2.5 text-xs text-muted-foreground border-b border-foreground/[0.03] whitespace-nowrap">{formatDateTime(log.created_at)}</td>
                          <td className="px-3.5 py-2.5 text-xs font-semibold border-b border-foreground/[0.03]">{log.action_type.split("_").join(" ")}</td>
                          <td className="px-3.5 py-2.5 text-xs text-muted-foreground border-b border-foreground/[0.03]">{cible}</td>
                          <td className="px-3.5 py-2.5 text-xs text-muted-foreground border-b border-foreground/[0.03]">{log.admin_role}</td>
                          <td className="px-3.5 py-2.5 text-xs text-muted-foreground border-b border-foreground/[0.03] max-w-[280px] truncate">{change}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* M4 — MySendingBox */}
        {page === 4 && (
          <div>
            <Eyebrow>MySendingBox · La Poste</Eyebrow>
            <BigTitle>Suivi MySendingBox — Envois LRAR</BigTitle>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-5">
              {[
                { val: String(lrarStats.month), label: "Envois ce mois", color: "text-primary-hover", top: "bg-primary-hover" },
                { val: String(lrarStats.delivered), label: "AR signés / livrés", color: "text-green-2", top: "bg-green-2" },
                { val: String(lrarStats.transit), label: "En transit", color: "text-amber-2", top: "bg-amber-2" },
                { val: String(lrarStats.failed), label: "Incident / relance", color: "text-red-2", top: "bg-red-2" },
              ].map((k) => (
                <div key={k.label} className="bg-panel border border-border rounded-[10px] p-3 relative overflow-hidden">
                  <div className={`absolute top-0 left-0 right-0 h-0.5 ${k.top}`} />
                  <div className={`font-syne font-extrabold text-2xl leading-none mb-1 ${k.color}`}>{k.val}</div>
                  <div className="text-[0.7rem] text-muted-foreground">{k.label}</div>
                </div>
              ))}
            </div>
            <div className="bg-panel border border-border rounded-xl overflow-hidden mb-4">
              <div className="flex items-center justify-between p-3 border-b border-border">
                <div className="font-syne font-bold text-sm">Tous les envois MySendingBox</div>
                <button
                  className="font-syne font-bold text-[0.7rem] px-3 py-1 rounded-md bg-foreground/[0.07] text-muted-foreground border border-border-2 disabled:opacity-50"
                  onClick={() => void fetchDossiers()}
                  disabled={loadingDossiers}
                >
                  {loadingDossiers ? "Chargement…" : "Actualiser"}
                </button>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full border-collapse">
                  <thead><tr>{["Réf. IZY", "Client", "N° LRAR", "Envoyé le", "Destinataire", "Statut", "AR reçu"].map((h) => (<th key={h} className="font-syne text-[0.6rem] font-bold tracking-wider uppercase text-muted px-3.5 py-2 text-left border-b border-border">{h}</th>))}</tr></thead>
                  <tbody>
                    {lrarDossiers.length === 0 ? (
                      <tr>
                        <td colSpan={7} className="px-3.5 py-8 text-center text-xs text-muted-foreground">
                          Aucun envoi MySendingBox trouvé dans les dossiers chargés.
                        </td>
                      </tr>
                    ) : lrarDossiers.map((dossier) => {
                      const status = getLrarStatus(dossier.lrar_status);
                      return (
                        <tr key={dossier.id} className="hover:bg-foreground/[0.022] transition-colors">
                          <td className="px-3.5 py-2.5 text-xs font-syne text-muted border-b border-foreground/[0.03]">{dossier.dossier_ref}</td>
                          <td className="px-3.5 py-2.5 text-xs font-semibold border-b border-foreground/[0.03]">{getClientLabel(dossier)}</td>
                          <td className="px-3.5 py-2.5 text-xs font-mono text-muted border-b border-foreground/[0.03]">{dossier.tracking_number || dossier.mysendingbox_letter_id || "—"}</td>
                          <td className="px-3.5 py-2.5 text-xs text-muted-foreground border-b border-foreground/[0.03]">{formatDate(dossier.sent_at)}</td>
                          <td className="px-3.5 py-2.5 text-xs text-muted-foreground border-b border-foreground/[0.03]">{dossier.recipient_name} · {dossier.recipient_city}</td>
                          <td className="px-3.5 py-2.5 border-b border-foreground/[0.03]"><Pill variant={status.variant}>{status.label}</Pill></td>
                          <td className="px-3.5 py-2.5 text-xs text-muted-foreground border-b border-foreground/[0.03]">{dossier.delivered_at ? `${formatDate(dossier.delivered_at)} ✓` : "—"}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
            {lrarStats.failed > 0 ? (
              <Box variant="alert" title="Incidents MySendingBox">
                {lrarStats.failed} dossier(s) nécessitent une vérification ou une relance depuis les statuts postaux synchronisés.
              </Box>
            ) : (
              <Box variant="ok" title="Aucun incident MySendingBox">
                Aucun statut postal en incident dans les dossiers chargés.
              </Box>
            )}
          </div>
        )}

        {/* M5 — Avocats */}
        {page === 5 && (
          <div>
            <Eyebrow>Gestion</Eyebrow>
            <BigTitle>Avocats inscrits ({avocats.length})</BigTitle>
            <div className="flex gap-2 mb-4 flex-wrap">
              <button
                className="font-syne font-bold text-[0.78rem] px-4 py-2 rounded-[7px] bg-primary-hover text-foreground transition-all"
                onClick={() => setPage(6)}
              >
                Inviter un avocat
              </button>
              <button
                className="font-syne font-bold text-[0.78rem] px-4 py-2 rounded-[7px] bg-foreground/[0.07] text-muted-foreground border border-border-2 transition-all"
                onClick={() => void fetchAvocatData()}
                disabled={loadingAvocats}
              >
                {loadingAvocats ? "Actualisation…" : "Actualiser"}
              </button>
            </div>

            {loadingAvocats && (
              <Box variant="info" title="Chargement">
                Récupération des avocats partenaires depuis Supabase.
              </Box>
            )}

            {!loadingAvocats && avocats.length === 0 && (
              <Box variant="warn" title="Aucun avocat actif">
                Invitez un premier avocat partenaire depuis l’onglet Inscriptions.
              </Box>
            )}

            <div className="grid grid-cols-1 xl:grid-cols-2 gap-3">
              {avocats.map((avocat) => {
                const initials = `${avocat.prenom?.[0] || ""}${avocat.nom?.[0] || ""}`.toUpperCase() || "AV";
                const capacityReached = avocat.dossiers_en_cours >= avocat.capacite_max;
                return (
                  <div key={avocat.id} className={`bg-panel border rounded-xl p-4 ${capacityReached ? "border-amber/25" : "border-border"}`}>
                    <div className="flex items-start gap-3">
                      <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-primary-hover to-purple-600 flex items-center justify-center font-syne font-extrabold text-sm flex-shrink-0">
                        {initials}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="font-semibold text-sm mb-0.5 truncate">Me {avocat.prenom} {avocat.nom}</div>
                        <div className="text-xs text-muted-foreground truncate">{avocat.email}</div>
                        <div className="text-xs text-muted-foreground mt-1">Barreau de {avocat.barreau}</div>
                      </div>
                      <Pill variant={avocat.disponible ? (capacityReached ? "warn" : "ok") : "red"}>
                        {avocat.disponible ? (capacityReached ? "Saturé" : "Disponible") : "Suspendu"}
                      </Pill>
                    </div>

                    <div className="grid grid-cols-3 gap-2 mt-4">
                      <div className="bg-background-3 border border-border rounded-[9px] p-2">
                        <div className="font-syne font-extrabold text-lg">{avocat.dossiers_en_cours}</div>
                        <div className="text-[0.65rem] text-muted-foreground">En cours</div>
                      </div>
                      <div className="bg-background-3 border border-border rounded-[9px] p-2">
                        <div className="font-syne font-extrabold text-lg">{avocat.capacite_max}</div>
                        <div className="text-[0.65rem] text-muted-foreground">Capacité</div>
                      </div>
                      <div className="bg-background-3 border border-border rounded-[9px] p-2">
                        <div className="font-syne font-extrabold text-lg">{avocat.delai_moyen_jours}j</div>
                        <div className="text-[0.65rem] text-muted-foreground">Délai moyen</div>
                      </div>
                    </div>

                    <div className="flex gap-1.5 flex-wrap mt-3">
                      {(avocat.specialites || []).length > 0 ? (
                        (avocat.specialites || []).map((specialite) => (
                          <span key={specialite} className="bg-primary/[0.1] border border-primary/20 rounded-[5px] px-2 py-1 text-[0.68rem] text-primary font-syne font-semibold">
                            {getSpecialiteLabel(specialite)}
                          </span>
                        ))
                      ) : (
                        <span className="text-xs text-muted-foreground">Aucune spécialité configurée</span>
                      )}
                    </div>

                    <form className="grid grid-cols-1 md:grid-cols-3 gap-2 mt-4" onSubmit={(e) => void handleUpdateAvocat(e, avocat)}>
                      <div>
                        <label className={labelClass}>Spécialité</label>
                        <select name="specialites" className={formInputClass} defaultValue={avocat.specialites?.[0] || "tous"}>
                          {specialiteOptions.map((option) => (
                            <option key={option.value} value={option.value}>{option.label}</option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label className={labelClass}>Capacité</label>
                        <input name="capacite_max" type="number" min={1} max={100} className={formInputClass} defaultValue={avocat.capacite_max} />
                      </div>
                      <div>
                        <label className={labelClass}>Délai moyen</label>
                        <input name="delai_moyen_jours" type="number" min={1} max={30} className={formInputClass} defaultValue={avocat.delai_moyen_jours} />
                      </div>
                      <div className="md:col-span-3 flex gap-2">
                        <button
                          type="submit"
                          disabled={savingAvocatId === avocat.id}
                          className="font-syne font-bold text-[0.72rem] px-3 py-2 rounded-[7px] bg-primary-hover text-foreground disabled:opacity-50"
                        >
                          {savingAvocatId === avocat.id ? "Enregistrement…" : "Enregistrer"}
                        </button>
                        <button
                          type="button"
                          disabled={savingAvocatId === avocat.id}
                          className={`font-syne font-bold text-[0.72rem] px-3 py-2 rounded-[7px] border disabled:opacity-50 ${avocat.disponible ? "bg-destructive/[0.14] text-red-2 border-destructive/25" : "bg-green/[0.12] text-green-2 border-green/25"}`}
                          onClick={() => void handleToggleAvocat(avocat)}
                        >
                          {avocat.disponible ? "Suspendre" : "Réactiver"}
                        </button>
                      </div>
                    </form>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* M6 — Inscriptions */}
        {page === 6 && (
          <div>
            <Eyebrow>Inscriptions</Eyebrow>
            <BigTitle>Inviter un avocat partenaire</BigTitle>
            <div className="grid grid-cols-1 xl:grid-cols-[420px_1fr] gap-4">
              <div className="bg-panel border border-border rounded-xl p-4">
                <form onSubmit={handleInviteAvocat} className="space-y-3">
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className={labelClass}>Prénom</label>
                      <input className={formInputClass} value={inviteForm.prenom} onChange={(e) => setInviteForm((prev) => ({ ...prev, prenom: e.target.value }))} placeholder="Sylvie" required />
                    </div>
                    <div>
                      <label className={labelClass}>Nom</label>
                      <input className={formInputClass} value={inviteForm.nom} onChange={(e) => setInviteForm((prev) => ({ ...prev, nom: e.target.value }))} placeholder="Moreau" required />
                    </div>
                  </div>

                  <div>
                    <label className={labelClass}>Email de connexion</label>
                    <input type="email" className={formInputClass} value={inviteForm.email} onChange={(e) => setInviteForm((prev) => ({ ...prev, email: e.target.value }))} placeholder="avocat@email.com" required />
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className={labelClass}>Barreau</label>
                      <input className={formInputClass} value={inviteForm.barreau} onChange={(e) => setInviteForm((prev) => ({ ...prev, barreau: e.target.value }))} placeholder="Paris" required />
                    </div>
                    <div>
                      <label className={labelClass}>Téléphone</label>
                      <input className={formInputClass} value={inviteForm.phone} onChange={(e) => setInviteForm((prev) => ({ ...prev, phone: e.target.value }))} placeholder="+33..." />
                    </div>
                  </div>

                  <div>
                    <label className={labelClass}>Spécialités</label>
                    <select
                      className={formInputClass}
                      value={inviteForm.specialites}
                      onChange={(e) => setInviteForm((prev) => ({ ...prev, specialites: e.target.value }))}
                    >
                      {specialiteOptions.map((option) => (
                        <option key={option.value} value={option.value}>{option.label}</option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className={labelClass}>Capacité max</label>
                    <input type="number" min={1} max={100} className={formInputClass} value={inviteForm.capacite_max} onChange={(e) => setInviteForm((prev) => ({ ...prev, capacite_max: e.target.value }))} required />
                  </div>

                  <button
                    type="submit"
                    disabled={invitingAvocat}
                    className="w-full font-syne font-bold text-[0.78rem] px-5 py-3 rounded-[9px] bg-primary-hover text-foreground hover:bg-[#5585ff] transition-all disabled:opacity-50"
                  >
                    {invitingAvocat ? "Création…" : "Créer le lien d'activation"}
                  </button>
                </form>

                {lastAvocatActivationUrl && (
                  <div className="mt-4 bg-background-3 border border-primary/25 rounded-[9px] p-3">
                    <div className="font-syne font-bold text-xs mb-1">Lien d'activation</div>
                    <p className="text-[0.7rem] text-muted-foreground break-all mb-2">{lastAvocatActivationUrl}</p>
                    <button
                      className="font-syne font-bold text-[0.7rem] px-3 py-1.5 rounded-[7px] bg-primary/20 text-primary border border-primary/30"
                      onClick={() => void copyToClipboard(lastAvocatActivationUrl, "Lien d'activation copié")}
                    >
                      Copier le lien
                    </button>
                  </div>
                )}
              </div>

              <div className="bg-panel border border-border rounded-xl overflow-hidden">
                <div className="flex items-center justify-between p-3 border-b border-border">
                  <div className="font-syne font-bold text-sm">Invitations avocat</div>
                  <button
                    className="font-syne font-bold text-[0.7rem] px-3 py-1 rounded-md bg-foreground/[0.07] text-muted-foreground border border-border-2"
                    onClick={() => void fetchAvocatData()}
                    disabled={loadingAvocats}
                  >
                    Actualiser
                  </button>
                </div>
                {avocatInvitations.length === 0 ? (
                  <div className="p-4">
                    <Box variant="info" title="Aucune invitation">
                      Les invitations créées apparaîtront ici avec leur statut.
                    </Box>
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full border-collapse">
                      <thead>
                        <tr>
                          {["Avocat", "Email", "Barreau", "Statut", "Expiration", "Actions"].map((h) => (
                            <th key={h} className="font-syne text-[0.6rem] font-bold tracking-wider uppercase text-muted px-3.5 py-2 text-left border-b border-border whitespace-nowrap">{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {avocatInvitations.map((invitation) => {
                          const status = getInvitationStatus(invitation);
                          const activationUrl = `${window.location.origin}/activate-avocat?token=${encodeURIComponent(invitation.token)}`;
                          return (
                            <tr key={invitation.id} className="hover:bg-foreground/[0.022] transition-colors">
                              <td className="px-3.5 py-2.5 text-xs font-semibold border-b border-foreground/[0.03]">Me {invitation.prenom} {invitation.nom}</td>
                              <td className="px-3.5 py-2.5 text-xs text-muted-foreground border-b border-foreground/[0.03]">{invitation.email}</td>
                              <td className="px-3.5 py-2.5 text-xs text-muted-foreground border-b border-foreground/[0.03]">{invitation.barreau}</td>
                              <td className="px-3.5 py-2.5 border-b border-foreground/[0.03]"><Pill variant={status.variant}>{status.label}</Pill></td>
                              <td className="px-3.5 py-2.5 text-xs text-muted-foreground border-b border-foreground/[0.03]">{formatDateTime(invitation.expires_at)}</td>
                              <td className="px-3.5 py-2.5 border-b border-foreground/[0.03]">
                                {!invitation.used_at && !invitation.revoked && (
                                  <div className="flex gap-1.5">
                                    <button
                                      className="bg-primary/[0.18] border border-primary-hover/30 text-primary-hover rounded px-2 py-1 font-syne text-[0.6rem] font-bold"
                                      onClick={() => void copyToClipboard(activationUrl, "Lien d'activation copié")}
                                    >
                                      Copier
                                    </button>
                                    <button
                                      className="bg-foreground/[0.07] border border-border-2 text-muted-foreground rounded px-2 py-1 font-syne text-[0.6rem] font-bold disabled:opacity-50"
                                      disabled={workingInvitationId === invitation.id}
                                      onClick={() => void handleInvitationAction(invitation, "renew_invitation")}
                                    >
                                      Prolonger
                                    </button>
                                    <button
                                      className="bg-destructive/[0.14] border border-destructive/25 text-red-2 rounded px-2 py-1 font-syne text-[0.6rem] font-bold disabled:opacity-50"
                                      disabled={workingInvitationId === invitation.id}
                                      onClick={() => void handleInvitationAction(invitation, "revoke_invitation")}
                                    >
                                      Révoquer
                                    </button>
                                  </div>
                                )}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* M7 — Contenu */}
        {page === 7 && (
          <div>
            <Eyebrow>Contenu juridique</Eyebrow>
            <BigTitle>Mise à jour du contenu</BigTitle>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-4">
              {[
                { icon: "📋", title: `Motifs couverts (${Object.keys(motifCoverage).length}/12)`, desc: underCoveredMotifs.length ? `${underCoveredMotifs.length} motif(s) sous-couverts` : "Couverture minimale atteinte", onClick: () => setPage(11) },
                { icon: "📦", title: `Pièces actives (${activePieces.length})`, desc: `Dernière MAJ : ${formatDate(lastPieceUpdate)}`, onClick: () => setPage(12) },
                { icon: "⚖️", title: `Références actives (${activeReferences.length})`, desc: `Dernière MAJ : ${formatDate(lastReferenceUpdate)}`, onClick: () => setPage(11) },
                { icon: "🔎", title: `Références à vérifier (${referencesToVerify.length})`, desc: referencesToVerify.length ? "Source ou date de vérification requise" : "Aucune vérification en retard", onClick: () => setPage(11) },
              ].map((c) => (
                <div key={c.title} onClick={c.onClick} className="bg-panel border border-border rounded-xl p-4 cursor-pointer hover:bg-foreground/[0.04] hover:-translate-y-px transition-all">
                  <div className="text-2xl mb-2">{c.icon}</div>
                  <h4 className="font-syne font-bold text-sm mb-1">{c.title}</h4>
                  <p className="text-xs text-muted-foreground">{c.desc}</p>
                </div>
              ))}
            </div>
            {loadingPlatformData ? (
              <Box variant="info" title="Chargement">
                Synchronisation des références juridiques, pièces requises et demandes RGPD.
              </Box>
            ) : referencesToVerify.length > 0 ? (
              <Box variant="warn" title="Références à vérifier">
                {referencesToVerify.slice(0, 3).map((ref) => ref.intitule_court).join(" · ")}
              </Box>
            ) : (
              <Box variant="ok" title="Base juridique à jour">
                Aucune référence active sans source ou vérification récente.
              </Box>
            )}
          </div>
        )}

        {/* M8 — Finances */}
        {page === 8 && (
          <div>
            <Eyebrow>Finance</Eyebrow>
            <BigTitle>Tableau financier — mois en cours</BigTitle>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-5">
              {[
                { val: formatCurrency(financeStats.revenue), label: "Revenus encaissés", color: "text-primary-hover", top: "bg-primary-hover" },
                { val: formatCurrency(financeStats.avocatFees), label: "Honoraires avocats", color: "text-green-2", top: "bg-green-2" },
                { val: formatCurrency(financeStats.mysendingboxFees), label: "Frais MySendingBox", color: "text-purple-400", top: "bg-purple-400" },
                { val: formatCurrency(netMargin), label: "Marge hors frais paiement", color: "text-amber-2", top: "bg-amber-2" },
              ].map((k) => (
                <div key={k.label} className="bg-panel border border-border rounded-[10px] p-3 relative overflow-hidden">
                  <div className={`absolute top-0 left-0 right-0 h-0.5 ${k.top}`} />
                  <div className={`font-syne font-extrabold text-2xl leading-none mb-1 ${k.color}`}>{k.val}</div>
                  <div className="text-[0.7rem] text-muted-foreground">{k.label}</div>
                </div>
              ))}
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <Box variant="info" title="Paiements">
                {paidPayments.length} paiement(s) encaissé(s), {financeStats.pending} en attente, {financeStats.failed} en échec sur les 200 derniers paiements chargés.
              </Box>
              <Box variant="post" title="Tarification active">
                Lettre {formatCurrency(tarification?.generation_lettre_eur || 0)} · Envoi {formatCurrency(tarification?.envoi_mysendingbox_eur || 0)} · Avocat {formatCurrency(tarification?.honoraires_avocat_eur || 0)}.
              </Box>
            </div>
            <div className="bg-panel border border-border rounded-xl overflow-hidden mt-4">
              <div className="flex items-center justify-between p-3 border-b border-border">
                <div className="font-syne font-bold text-sm">Derniers paiements</div>
                <button
                  className="font-syne font-bold text-[0.7rem] px-3 py-1 rounded-md bg-foreground/[0.07] text-muted-foreground border border-border-2 disabled:opacity-50"
                  onClick={() => void fetchPlatformData()}
                  disabled={loadingPlatformData}
                >
                  {loadingPlatformData ? "Chargement…" : "Actualiser"}
                </button>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full border-collapse">
                  <thead><tr>{["Date", "Dossier", "Méthode", "Option", "Montant", "Statut", "Webhook"].map((h) => (<th key={h} className="font-syne text-[0.6rem] font-bold tracking-wider uppercase text-muted px-3.5 py-2 text-left border-b border-border whitespace-nowrap">{h}</th>))}</tr></thead>
                  <tbody>
                    {payments.length === 0 ? (
                      <tr>
                        <td colSpan={7} className="px-3.5 py-8 text-center text-xs text-muted-foreground">
                          Aucun paiement trouvé.
                        </td>
                      </tr>
                    ) : payments.slice(0, 20).map((payment) => {
                      const status = getPaymentStatus(payment.status);
                      return (
                        <tr key={payment.id} className="hover:bg-foreground/[0.022] transition-colors">
                          <td className="px-3.5 py-2.5 text-xs text-muted-foreground border-b border-foreground/[0.03] whitespace-nowrap">{formatDateTime(payment.created_at)}</td>
                          <td className="px-3.5 py-2.5 text-xs font-syne text-muted border-b border-foreground/[0.03]">{payment.dossier_ref}</td>
                          <td className="px-3.5 py-2.5 text-xs text-muted-foreground border-b border-foreground/[0.03]">{payment.payment_method}</td>
                          <td className="px-3.5 py-2.5 text-xs text-muted-foreground border-b border-foreground/[0.03]">{payment.option_choisie || "—"}</td>
                          <td className="px-3.5 py-2.5 text-xs font-semibold border-b border-foreground/[0.03]">{formatCurrency(payment.amount / 100)}</td>
                          <td className="px-3.5 py-2.5 border-b border-foreground/[0.03]"><Pill variant={status.variant}>{status.label}</Pill></td>
                          <td className="px-3.5 py-2.5 border-b border-foreground/[0.03]"><Pill variant={payment.verified_by_webhook ? "ok" : "muted"}>{payment.verified_by_webhook ? "Confirmé" : "Non"}</Pill></td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* M9 — RGPD */}
        {page === 9 && (
          <div>
            <Eyebrow>RGPD & Conformité</Eyebrow>
            <BigTitle>Données personnelles & journaux</BigTitle>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-5">
              {[
                { val: String(rgpdStats.pending), label: "Demandes ouvertes", color: rgpdStats.pending ? "text-amber-2" : "text-green-2", top: rgpdStats.pending ? "bg-amber-2" : "bg-green-2" },
                { val: String(rgpdStats.overdue), label: "Hors délai", color: rgpdStats.overdue ? "text-red-2" : "text-green-2", top: rgpdStats.overdue ? "bg-red-2" : "bg-green-2" },
                { val: String(rgpdStats.completed), label: "Terminées", color: "text-primary-hover", top: "bg-primary-hover" },
                { val: String(auditLogs.length), label: "Logs chargés", color: "text-muted-foreground", top: "bg-muted-foreground" },
              ].map((k) => (
                <div key={k.label} className="bg-panel border border-border rounded-[10px] p-3 relative overflow-hidden">
                  <div className={`absolute top-0 left-0 right-0 h-0.5 ${k.top}`} />
                  <div className={`font-syne font-extrabold text-2xl leading-none mb-1 ${k.color}`}>{k.val}</div>
                  <div className="text-[0.7rem] text-muted-foreground">{k.label}</div>
                </div>
              ))}
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-[1.1fr_0.9fr] gap-4">
              <div className="bg-panel border border-border rounded-xl overflow-hidden">
                <div className="flex items-center justify-between p-3 border-b border-border">
                  <div className="font-syne font-bold text-sm">Demandes RGPD</div>
                  <button
                    className="font-syne font-bold text-[0.7rem] px-3 py-1 rounded-md bg-foreground/[0.07] text-muted-foreground border border-border-2 disabled:opacity-50"
                    onClick={() => void fetchPlatformData()}
                    disabled={loadingPlatformData}
                  >
                    {loadingPlatformData ? "Chargement…" : "Actualiser"}
                  </button>
                </div>
                <form onSubmit={handleCreateRgpdRequest} className="grid grid-cols-1 md:grid-cols-[1.2fr_0.8fr_0.8fr_auto] gap-2 p-3 border-b border-border bg-foreground/[0.015]">
                  <input
                    type="email"
                    className="bg-background border border-border rounded-md px-3 py-2 text-xs text-foreground outline-none focus:border-primary/55"
                    placeholder="email demandeur"
                    value={rgpdForm.demandeur_email}
                    onChange={(e) => setRgpdForm((prev) => ({ ...prev, demandeur_email: e.target.value }))}
                  />
                  <select
                    className="bg-background border border-border rounded-md px-3 py-2 text-xs text-foreground outline-none focus:border-primary/55"
                    value={rgpdForm.type}
                    onChange={(e) => setRgpdForm((prev) => ({ ...prev, type: e.target.value }))}
                  >
                    {["acces", "rectification", "suppression", "opposition", "portabilite", "limitation", "autre"].map((type) => (
                      <option key={type} value={type}>{getRgpdTypeLabel(type)}</option>
                    ))}
                  </select>
                  <input
                    className="bg-background border border-border rounded-md px-3 py-2 text-xs text-foreground outline-none focus:border-primary/55"
                    placeholder="dossier optionnel"
                    value={rgpdForm.dossier_ref}
                    onChange={(e) => setRgpdForm((prev) => ({ ...prev, dossier_ref: e.target.value }))}
                  />
                  <button
                    type="submit"
                    disabled={creatingRgpdRequest}
                    className="font-syne font-bold text-[0.7rem] px-3 py-2 rounded-md bg-primary-hover text-foreground disabled:opacity-50"
                  >
                    {creatingRgpdRequest ? "Ajout…" : "Ajouter"}
                  </button>
                  <input
                    className="md:col-span-4 bg-background border border-border rounded-md px-3 py-2 text-xs text-foreground outline-none focus:border-primary/55"
                    placeholder="motif / précision interne"
                    value={rgpdForm.motif}
                    onChange={(e) => setRgpdForm((prev) => ({ ...prev, motif: e.target.value }))}
                  />
                </form>
                <div className="overflow-x-auto">
                  <table className="w-full border-collapse">
                    <thead><tr>{["Date", "Demandeur", "Type", "Échéance", "Statut", "Actions"].map((h) => (<th key={h} className="font-syne text-[0.6rem] font-bold tracking-wider uppercase text-muted px-3.5 py-2 text-left border-b border-border whitespace-nowrap">{h}</th>))}</tr></thead>
                    <tbody>
                      {rgpdRequests.length === 0 ? (
                        <tr>
                          <td colSpan={6} className="px-3.5 py-8 text-center text-xs text-muted-foreground">
                            Aucune demande RGPD enregistrée.
                          </td>
                        </tr>
                      ) : rgpdRequests.map((request) => {
                        const isOverdue = request.statut !== "terminee" && request.statut !== "rejetee" && new Date(request.due_at).getTime() < Date.now();
                        const working = updatingRgpdRequestId === request.id;
                        return (
                          <tr key={request.id} className={`hover:bg-foreground/[0.022] transition-colors ${isOverdue ? "border-l-2 border-l-red-2" : ""}`}>
                            <td className="px-3.5 py-2.5 text-xs text-muted-foreground border-b border-foreground/[0.03] whitespace-nowrap">{formatDate(request.created_at)}</td>
                            <td className="px-3.5 py-2.5 text-xs font-semibold border-b border-foreground/[0.03]">
                              {request.demandeur_email}
                              {request.dossier_ref && <div className="text-[0.65rem] text-muted-foreground">{request.dossier_ref}</div>}
                            </td>
                            <td className="px-3.5 py-2.5 text-xs text-muted-foreground border-b border-foreground/[0.03]">{getRgpdTypeLabel(request.type)}</td>
                            <td className={`px-3.5 py-2.5 text-xs border-b border-foreground/[0.03] ${isOverdue ? "text-red-2 font-semibold" : "text-muted-foreground"}`}>{formatDate(request.due_at)}</td>
                            <td className="px-3.5 py-2.5 border-b border-foreground/[0.03]">
                              <Pill variant={request.statut === "terminee" ? "ok" : request.statut === "rejetee" ? "red" : isOverdue ? "warn" : "new"}>{request.statut}</Pill>
                            </td>
                            <td className="px-3.5 py-2.5 border-b border-foreground/[0.03]">
                              {request.statut === "terminee" || request.statut === "rejetee" ? (
                                <span className="text-xs text-muted-foreground">Clôturée</span>
                              ) : (
                                <div className="flex gap-1.5">
                                  {request.statut === "nouvelle" && (
                                    <button
                                      className="bg-primary/[0.18] border border-primary-hover/30 text-primary-hover rounded px-2 py-1 font-syne text-[0.6rem] font-bold disabled:opacity-50"
                                      disabled={working}
                                      onClick={() => void handleUpdateRgpdRequest(request, "en_cours")}
                                    >
                                      Traiter
                                    </button>
                                  )}
                                  <button
                                    className="bg-green/[0.12] border border-green/25 text-green-2 rounded px-2 py-1 font-syne text-[0.6rem] font-bold disabled:opacity-50"
                                    disabled={working}
                                    onClick={() => void handleUpdateRgpdRequest(request, "terminee")}
                                  >
                                    Terminer
                                  </button>
                                  <button
                                    className="bg-destructive/[0.14] border border-destructive/25 text-red-2 rounded px-2 py-1 font-syne text-[0.6rem] font-bold disabled:opacity-50"
                                    disabled={working}
                                    onClick={() => void handleUpdateRgpdRequest(request, "rejetee")}
                                  >
                                    Rejeter
                                  </button>
                                </div>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="bg-panel border border-border rounded-xl overflow-hidden">
                <div className="p-3 border-b border-border">
                  <div className="font-syne font-bold text-sm">Journal opérationnel</div>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full border-collapse">
                    <thead><tr>{["Date", "Action", "Rôle", "Cible"].map((h) => (<th key={h} className="font-syne text-[0.6rem] font-bold tracking-wider uppercase text-muted px-3.5 py-2 text-left border-b border-border whitespace-nowrap">{h}</th>))}</tr></thead>
                    <tbody>
                      {auditLogs.length === 0 ? (
                        <tr>
                          <td colSpan={4} className="px-3.5 py-8 text-center text-xs text-muted-foreground">
                            Aucun journal chargé.
                          </td>
                        </tr>
                      ) : auditLogs.slice(0, 20).map((log) => (
                        <tr key={log.id} className="hover:bg-foreground/[0.022] transition-colors">
                          <td className="px-3.5 py-2.5 text-xs text-muted-foreground border-b border-foreground/[0.03] whitespace-nowrap">{formatDateTime(log.created_at)}</td>
                          <td className="px-3.5 py-2.5 text-xs font-semibold border-b border-foreground/[0.03]">{log.action_type.split("_").join(" ")}</td>
                          <td className="px-3.5 py-2.5 text-xs text-muted-foreground border-b border-foreground/[0.03]">{log.admin_role}</td>
                          <td className="px-3.5 py-2.5 text-xs text-muted-foreground border-b border-foreground/[0.03]">{log.cible_type || "—"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Reassignment Modal */}
      {modalOpen && selectedDossierForAssign && (
        <div className="fixed inset-0 bg-black/75 z-[8000] flex items-center justify-center p-4 backdrop-blur-sm" onClick={(e) => e.target === e.currentTarget && closeModal()}>
          <div className="bg-background-2 border border-border-2 rounded-2xl w-full max-w-[760px] max-h-[88vh] overflow-hidden flex flex-col shadow-[0_24px_80px_rgba(0,0,0,0.7)] animate-mIn">
            <div className="p-5 border-b border-border flex items-start justify-between gap-4 flex-shrink-0">
              <div>
                <div className="font-syne font-extrabold text-base mb-1">{selectedDossierForAssign.avocat_id ? "Réassignation d'avocat" : "Assignation d'avocat"}</div>
                <div className="text-xs text-muted-foreground">
                  {selectedDossierForAssign.dossier_ref} · {selectedDossierClient} · {getSpecialiteLabel(selectedDossierForAssign.visa_type)}
                </div>
              </div>
              <div className="w-[26px] h-[26px] rounded-md bg-foreground/[0.07] border border-border cursor-pointer flex items-center justify-center text-sm text-muted-foreground hover:bg-foreground/[0.13] hover:text-foreground transition-all flex-shrink-0" onClick={closeModal}>✕</div>
            </div>

            <div className="flex-1 overflow-y-auto p-5">
              <div className="bg-background-3 border border-border-2 rounded-[9px] p-3 grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
                {[
                  { label: "Client", val: selectedDossierClient },
                  { label: "Type", val: getSpecialiteLabel(selectedDossierForAssign.visa_type) },
                  { label: "Motif", val: selectedDossierMotif },
                  {
                    label: "Délai restant",
                    val: selectedDossierDelay ? `${selectedDossierDelay.days !== null && selectedDossierDelay.days <= 7 ? "⚠ " : ""}${selectedDossierDelay.label}` : "N/A",
                    valClass: selectedDossierDelay?.color,
                  },
                ].map((d) => (
                  <div key={d.label} className="min-w-0">
                    <div className="font-syne text-[0.58rem] font-bold tracking-wider uppercase text-muted mb-1">{d.label}</div>
                    <div className={`text-sm font-medium truncate ${d.valClass || ""}`}>{d.val}</div>
                  </div>
                ))}
              </div>

              <div className={`${selectedDossierForAssign.avocat_id ? "bg-primary/[0.07] border-primary/20" : "bg-amber/[0.07] border-amber/20"} border rounded-[9px] p-3 flex items-center gap-3 mb-4`}>
                <div className={`${selectedDossierForAssign.avocat_id ? "bg-primary-hover" : "bg-destructive"} w-[38px] h-[38px] rounded-[7px] flex items-center justify-center font-syne font-extrabold text-sm flex-shrink-0`}>
                  {selectedDossierForAssign.avocat_id ? getInitials(selectedDossierForAssign.avocat_prenom, selectedDossierForAssign.avocat_nom) : "?"}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="font-semibold text-sm mb-0.5 truncate">
                    {selectedDossierForAssign.avocat_id ? `Me ${selectedDossierForAssign.avocat_prenom || ""} ${selectedDossierForAssign.avocat_nom || ""}` : "Aucun avocat assigné"}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {selectedDossierForAssign.avocat_id ? "Avocat actuellement responsable du dossier." : "Dossier orphelin à assigner."}
                  </div>
                </div>
                <Pill variant={selectedDossierForAssign.avocat_id ? "new" : "red"}>{selectedDossierForAssign.avocat_id ? "Assigné" : "Orphelin"}</Pill>
              </div>

              <SectionLabel>Motif</SectionLabel>
              <div className="flex gap-1.5 flex-wrap mb-3">
                {["Dossier orphelin", "Réassignation admin", "72h sans réponse", "Indisponibilité", "Conflit d'intérêts", "Qualité insuffisante", "Autre"].map((m) => (
                  <span key={m} onClick={() => setSelectedMotif(m)} className={`text-[0.7rem] font-syne font-semibold px-3 py-1 rounded-md border cursor-pointer transition-all ${selectedMotif === m ? "bg-destructive/[0.14] border-red-2 text-red-2" : "border-border-2 text-muted-foreground hover:text-foreground"}`}>{m}</span>
                ))}
              </div>
              <textarea
                className="w-full bg-background-2 border-[1.5px] border-border-2 rounded-[9px] px-3 py-2.5 text-foreground text-xs outline-none h-[70px] resize-none mb-4 focus:border-primary-hover/55"
                placeholder="Note interne pour la traçabilité…"
                value={assignNote}
                onChange={(e) => setAssignNote(e.target.value)}
              />

              <SectionLabel>Sélectionner l'avocat</SectionLabel>
              <div className="flex flex-col gap-2">
                {avocats.length === 0 ? (
                  <div className="bg-background-3 border border-border rounded-[9px] p-4 text-xs text-muted-foreground">
                    Aucun avocat partenaire actif. Créez d'abord une invitation avocat depuis l'onglet Inscriptions.
                  </div>
                ) : avocats.map((avocat) => {
                  const isCurrentAvocat = selectedDossierForAssign.avocat_id === avocat.user_id;
                  const capacityReached = avocat.dossiers_en_cours >= avocat.capacite_max;
                  const disabled = isCurrentAvocat || !avocat.disponible || capacityReached;
                  const selected = selectedAvocat === avocat.id;
                  return (
                    <div
                      key={avocat.id}
                      onClick={() => !disabled && setSelectedAvocat(avocat.id)}
                      className={`bg-background-3 border-[1.5px] rounded-[9px] p-3 flex items-center gap-3 transition-all ${disabled ? "opacity-45 cursor-not-allowed" : "cursor-pointer hover:border-border-2"} ${selected ? "border-primary-hover bg-primary/10" : "border-border"}`}
                    >
                      <div className={`w-[17px] h-[17px] rounded-full border-[1.5px] flex items-center justify-center text-[0.58rem] transition-all ${selected ? "bg-primary-hover border-primary-hover text-foreground" : "border-border-2"}`}>
                        {selected ? "✓" : ""}
                      </div>
                      <div className="w-[34px] h-[34px] rounded-[7px] bg-primary-hover flex items-center justify-center font-syne font-extrabold text-xs flex-shrink-0">
                        {getInitials(avocat.prenom, avocat.nom)}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="font-semibold text-sm mb-0.5 truncate">Me {avocat.prenom} {avocat.nom}</div>
                        <div className="text-xs text-muted-foreground truncate">
                          {avocat.barreau} · {avocat.dossiers_en_cours}/{avocat.capacite_max} dossiers · {(avocat.specialites || []).map(getSpecialiteLabel).join(", ") || "Aucune spécialité"}
                        </div>
                      </div>
                      <div className="flex gap-2 items-center flex-shrink-0">
                        <div className="text-center">
                          <div className={`font-syne font-extrabold text-sm ${capacityReached ? "text-amber-2" : "text-green-2"}`}>{avocat.dossiers_en_cours}/{avocat.capacite_max}</div>
                          <div className="text-[0.6rem] text-muted block">Charge</div>
                        </div>
                        <div className="w-px h-[22px] bg-border flex-shrink-0" />
                        <div className="text-center">
                          <div className="font-syne font-extrabold text-sm">{avocat.delai_moyen_jours}j</div>
                          <div className="text-[0.6rem] text-muted block">Délai</div>
                        </div>
                        {isCurrentAvocat && <Pill variant="muted">Actuel</Pill>}
                        {!avocat.disponible && <Pill variant="red">Suspendu</Pill>}
                        {capacityReached && <Pill variant="warn">Saturé</Pill>}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="p-4 border-t border-border flex gap-2.5 items-center bg-foreground/[0.02] flex-shrink-0">
              <div className="flex-1 text-xs text-muted-foreground">L'action sera journalisée. Le client et le nouvel avocat recevront une notification.</div>
              <button className="font-syne font-bold text-[0.78rem] px-4 py-2 rounded-[7px] bg-foreground/[0.07] text-muted-foreground border border-border-2 transition-all" onClick={closeModal}>Annuler</button>
              <button
                className="font-syne font-bold text-[0.78rem] px-4 py-2 rounded-[7px] bg-primary-hover text-foreground transition-all disabled:opacity-35 disabled:cursor-not-allowed"
                disabled={!selectedAvocat || assigningDossier}
                onClick={() => void handleManualAssign()}
              >
                {assigningDossier ? "Assignation…" : "Confirmer"}
              </button>
            </div>
          </div>
        </div>
      )}

      {selectedDossierDetail && (
        <div className="fixed inset-0 bg-black/75 z-[8000] flex items-center justify-center p-4 backdrop-blur-sm" onClick={(e) => e.target === e.currentTarget && setSelectedDossierDetail(null)}>
          <div className="bg-background-2 border border-border-2 rounded-2xl w-full max-w-[760px] max-h-[88vh] overflow-hidden flex flex-col shadow-[0_24px_80px_rgba(0,0,0,0.7)]">
            <div className="p-5 border-b border-border flex items-start justify-between gap-4 flex-shrink-0">
              <div>
                <div className="font-syne font-extrabold text-base mb-1">Détail dossier</div>
                <div className="text-xs text-muted-foreground">{selectedDossierDetail.dossier_ref} · {selectedDossierDetail.client_last_name} {selectedDossierDetail.client_first_name}</div>
              </div>
              <button className="w-[26px] h-[26px] rounded-md bg-foreground/[0.07] border border-border cursor-pointer flex items-center justify-center text-sm text-muted-foreground hover:bg-foreground/[0.13] hover:text-foreground transition-all flex-shrink-0" onClick={() => setSelectedDossierDetail(null)}>✕</button>
            </div>
            <div className="flex-1 overflow-y-auto p-5">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {[
                  ["Client", `${selectedDossierDetail.client_first_name} ${selectedDossierDetail.client_last_name}`],
                  ["Email", selectedDossierDetail.client_email || "—"],
                  ["Téléphone", selectedDossierDetail.client_phone || "—"],
                  ["Visa", getSpecialiteLabel(selectedDossierDetail.visa_type)],
                  ["Motif refus", selectedDossierDetail.motifs_refus?.join(", ") || selectedDossierDetail.refus_type || "—"],
                  ["Notification refus", selectedDossierDetail.date_notification_refus ? formatDateTime(selectedDossierDetail.date_notification_refus) : "—"],
                  ["Avocat", selectedDossierDetail.avocat_id ? `Me ${selectedDossierDetail.avocat_prenom || ""} ${selectedDossierDetail.avocat_nom || ""}` : "Aucun"],
                  ["Barreau", selectedDossierDetail.avocat_barreau || "—"],
                  ["Validation", selectedDossierDetail.validation_juridique_status],
                  ["LRAR", selectedDossierDetail.lrar_status],
                  ["Option", selectedDossierDetail.option_choisie || selectedDossierDetail.option_envoi || "—"],
                  ["Créé le", formatDateTime(selectedDossierDetail.created_at)],
                ].map(([label, value]) => (
                  <div key={label} className="bg-background-3 border border-border rounded-[9px] p-3">
                    <div className="font-syne text-[0.58rem] font-bold tracking-wider uppercase text-muted mb-1">{label}</div>
                    <div className="text-sm text-foreground break-words">{value}</div>
                  </div>
                ))}
              </div>

              {selectedDossierDetail.validation_juridique_note && (
                <Box variant="warn" title="Note de relecture avocat" className="mt-4">
                  {selectedDossierDetail.validation_juridique_note}
                </Box>
              )}

              <div className="bg-background-3 border border-border rounded-[9px] p-3 mt-4">
                <div className="font-syne text-[0.58rem] font-bold tracking-wider uppercase text-muted mb-1">Destinataire recours</div>
                <div className="text-sm text-muted-foreground">
                  {selectedDossierDetail.recipient_name}<br />
                  {selectedDossierDetail.recipient_address}<br />
                  {selectedDossierDetail.recipient_postal_code} {selectedDossierDetail.recipient_city}
                </div>
              </div>
            </div>
            <div className="p-4 border-t border-border flex gap-2.5 justify-end bg-foreground/[0.02] flex-shrink-0">
              <button className="font-syne font-bold text-[0.78rem] px-4 py-2 rounded-[7px] bg-foreground/[0.07] text-muted-foreground border border-border-2" onClick={() => setSelectedDossierDetail(null)}>Fermer</button>
              <button className="font-syne font-bold text-[0.78rem] px-4 py-2 rounded-[7px] bg-primary-hover text-foreground" onClick={() => { const dossier = selectedDossierDetail; setSelectedDossierDetail(null); openModal(dossier); }}>
                {selectedDossierDetail.avocat_id ? "Réassigner" : "Assigner"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Page 10 — CAPDEMARCHES */}
      {page === 10 && (
        <div className="animate-fadeU">
          <AdminCapdemarchesDashboard />
        </div>
      )}

      {/* Page 11 — Base juridique */}
      {page === 11 && (
        <div className="animate-fadeU">
          <AdminReferencesJuridiques readOnly />
        </div>
      )}

      {/* Page 12 — Pièces requises */}
      {page === 12 && (
        <div className="animate-fadeU">
          <AdminPiecesRequises readOnly />
        </div>
      )}
    </ShellLayout>
  );
};

export default AdminSpace;
