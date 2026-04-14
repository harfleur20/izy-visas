import { useEffect, useState } from "react";
import ShellLayout from "@/components/ShellLayout";
import { NavItem, NavGroup } from "@/components/NavItem";
import { Eyebrow, BigTitle, Box, Pill, SectionLabel } from "@/components/ui-custom";
import { toast } from "sonner";
import { AdminCapdemarchesDashboard } from "@/components/AdminCapdemarchesDashboard";
import { AdminReferencesJuridiques } from "@/components/AdminReferencesJuridiques";
import { AdminPiecesRequises } from "@/components/AdminPiecesRequises";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";

const mTitles = ["Vue générale", "Tous les dossiers", "Alertes & urgences", "Réassignations", "Suivi MySendingBox", "Gestion avocats", "Inscriptions", "Contenu juridique", "Finances", "RGPD & journaux", "CAPDEMARCHES", "Base juridique", "Pièces requises"];

type AvocatRow = Database["public"]["Tables"]["avocats_partenaires"]["Row"];
type AvocatInvitationRow = Database["public"]["Tables"]["avocat_invitations"]["Row"];
type DossierRow = Database["public"]["Tables"]["dossiers"]["Row"];

type InviteAvocatResponse = {
  error?: string;
  activation_url?: string;
  message?: string;
};

type AssignAvocatResponse = {
  error?: string;
  message?: string;
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
const validatedStatuses = new Set(["validee_avocat", "validee_automatique"]);
const isSentLrarStatus = (status: string | null | undefined) => Boolean(status && sentLrarStatuses.has(status));
const isValidatedStatus = (status: string | null | undefined) => Boolean(status && validatedStatuses.has(status));
const getInitials = (prenom?: string | null, nom?: string | null) => `${prenom?.[0] || ""}${nom?.[0] || ""}`.toUpperCase() || "AV";

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
  if (isSentLrarStatus(status)) return { label: "Envoyé", variant: "post" as const };
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
  const [dossiers, setDossiers] = useState<DossierRow[]>([]);
  const [loadingDossiers, setLoadingDossiers] = useState(false);
  const [dossierSearch, setDossierSearch] = useState("");
  const [dossierFilter, setDossierFilter] = useState<DossierFilter>("all");
  const [avocats, setAvocats] = useState<AvocatRow[]>([]);
  const [avocatInvitations, setAvocatInvitations] = useState<AvocatInvitationRow[]>([]);
  const [loadingAvocats, setLoadingAvocats] = useState(false);
  const [invitingAvocat, setInvitingAvocat] = useState(false);
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

  useEffect(() => {
    void fetchDossiers();
    void fetchAvocatData();
  }, []);

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
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Assignation impossible");
    } finally {
      setAssigningDossier(false);
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
        <span className="absolute -top-1 -right-1 w-3.5 h-3.5 rounded-full bg-destructive font-syne text-[0.52rem] font-extrabold flex items-center justify-center">3</span>
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
      footerContent={<><strong className="text-muted-foreground">Admin IZY</strong><br />Me NGUIYAN D.L.F.<br />Dernière connexion : 06/04 08:42</>}
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
                  {[
                    { color: "bg-green-2", time: "09:41", text: "MySendingBox · IZY-0847 livré CRRV · AR signé" },
                    { color: "bg-primary-hover", time: "09:18", text: "Nouveau dossier IZY-0858 · Assigné Me Laurent" },
                    { color: "bg-amber-2", time: "08:55", text: "Réassignation 0839 · Me Bernard → Me Moreau" },
                    { color: "bg-post-dark", time: "08:30", text: "MySendingBox · 3 envois LRAR confirmés La Poste" },
                    { color: "bg-green-2", time: "07:45", text: "Paiement Stripe · IZY-0851 · 98,90€" },
                  ].map((item, i) => (
                    <div key={i} className="flex gap-3 py-2 border-b border-foreground/[0.04] last:border-b-0 text-xs">
                      <div className={`w-2 h-2 rounded-full flex-shrink-0 mt-1 ${item.color}`} />
                      <div className="text-muted flex-shrink-0 text-[0.7rem] whitespace-nowrap min-w-[40px]">{item.time}</div>
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
                            <button
                              className="bg-primary/[0.18] border border-primary-hover/30 text-primary-hover rounded px-2 py-1 font-syne text-[0.6rem] font-bold cursor-pointer hover:bg-primary/30"
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
          </div>
        )}

        {/* M4 — MySendingBox */}
        {page === 4 && (
          <div>
            <Eyebrow>MySendingBox · La Poste</Eyebrow>
            <BigTitle>Suivi MySendingBox — Envois LRAR</BigTitle>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-5">
              {[
                { val: "18", label: "Envois ce mois", color: "text-primary-hover", top: "bg-primary-hover" },
                { val: "14", label: "AR signés CRRV", color: "text-green-2", top: "bg-green-2" },
                { val: "3", label: "En transit", color: "text-amber-2", top: "bg-amber-2" },
                { val: "1", label: "Échec / relance", color: "text-red-2", top: "bg-red-2" },
              ].map((k) => (
                <div key={k.label} className="bg-panel border border-border rounded-[10px] p-3 relative overflow-hidden">
                  <div className={`absolute top-0 left-0 right-0 h-0.5 ${k.top}`} />
                  <div className={`font-syne font-extrabold text-2xl leading-none mb-1 ${k.color}`}>{k.val}</div>
                  <div className="text-[0.7rem] text-muted-foreground">{k.label}</div>
                </div>
              ))}
            </div>
            <div className="bg-panel border border-border rounded-xl overflow-hidden mb-4">
              <div className="p-3 border-b border-border"><div className="font-syne font-bold text-sm">Tous les envois MySendingBox</div></div>
              <div className="overflow-x-auto">
                <table className="w-full border-collapse">
                  <thead><tr>{["Réf. IZY", "Client", "N° LRAR", "Envoyé le", "Destinataire", "Statut", "AR reçu"].map((h) => (<th key={h} className="font-syne text-[0.6rem] font-bold tracking-wider uppercase text-muted px-3.5 py-2 text-left border-b border-border">{h}</th>))}</tr></thead>
                  <tbody>
                    {[
                      { ref: "0847", name: "ESSOMBA Amina", lrar: "2C 234 567 8FR", date: "06/04", dest: "CRRV Nantes", statut: <Pill variant="ok">✓ Livré</Pill>, ar: "08/04 ✓" },
                      { ref: "0855", name: "NKODO Fatima", lrar: "2C 234 567 9FR", date: "06/04", dest: "SD Visas Nantes", statut: <Pill variant="warn">En transit</Pill>, ar: "—" },
                      { ref: "0842", name: "ATANGANA K.", lrar: "—", date: "04/04", dest: "CRRV Nantes", statut: <Pill variant="red">⚡ Échec API</Pill>, ar: "—" },
                    ].map((r) => (
                      <tr key={r.ref} className="hover:bg-foreground/[0.022] transition-colors">
                        <td className="px-3.5 py-2.5 text-xs font-syne text-muted border-b border-foreground/[0.03]">{r.ref}</td>
                        <td className="px-3.5 py-2.5 text-xs font-semibold border-b border-foreground/[0.03]">{r.name}</td>
                        <td className="px-3.5 py-2.5 text-xs font-mono text-muted border-b border-foreground/[0.03]">{r.lrar}</td>
                        <td className="px-3.5 py-2.5 text-xs text-muted-foreground border-b border-foreground/[0.03]">{r.date}</td>
                        <td className="px-3.5 py-2.5 text-xs text-muted-foreground border-b border-foreground/[0.03]">{r.dest}</td>
                        <td className="px-3.5 py-2.5 border-b border-foreground/[0.03]">{r.statut}</td>
                        <td className="px-3.5 py-2.5 text-xs text-muted-foreground border-b border-foreground/[0.03]">{r.ar}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
            <Box variant="alert" title="⚡ Échec API MySendingBox — IZY-2026-0842 · ATANGANA K.">L'envoi via l'API MySendingBox a échoué (timeout serveur). Relance automatique programmée dans 2h.</Box>
            <Box variant="post" title="Configuration API MySendingBox">Endpoint : api.mysendingbox.fr · Clé API active · Webhook de statut configuré</Box>
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
                          {["Avocat", "Email", "Barreau", "Statut", "Expiration", "Lien"].map((h) => (
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
                                  <button
                                    className="bg-primary/[0.18] border border-primary-hover/30 text-primary-hover rounded px-2 py-1 font-syne text-[0.6rem] font-bold"
                                    onClick={() => void copyToClipboard(activationUrl, "Lien d'activation copié")}
                                  >
                                    Copier
                                  </button>
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
                { icon: "📋", title: "Motifs de refus codifiés (12)", desc: "Dernière MAJ : 15 jan. 2026" },
                { icon: "📦", title: "Listes de pièces par visa (5)", desc: "Dernière MAJ : 20 mars 2026" },
                { icon: "⚖️", title: "Arguments juridiques", desc: "Dernière MAJ : 2 avril 2026" },
                { icon: "📬", title: "Adresses MySendingBox / CRRV", desc: "Vérifiées le 1er avril 2026" },
              ].map((c) => (
                <div key={c.title} className="bg-panel border border-border rounded-xl p-4 cursor-pointer hover:bg-foreground/[0.04] hover:-translate-y-px transition-all">
                  <div className="text-2xl mb-2">{c.icon}</div>
                  <h4 className="font-syne font-bold text-sm mb-1">{c.title}</h4>
                  <p className="text-xs text-muted-foreground">{c.desc}</p>
                </div>
              ))}
            </div>
            <Box variant="warn" title="Jurisprudence à intégrer">CAA Nantes, 18 mars 2026, n°25NT01882 — Motif F · Pays à fort taux d'émigration. À intégrer dans les arguments pré-rédigés.</Box>
          </div>
        )}

        {/* M8 — Finances */}
        {page === 8 && (
          <div>
            <Eyebrow>Finance</Eyebrow>
            <BigTitle>Tableau financier — Avril 2026</BigTitle>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-5">
              {[
                { val: "7 830€", label: "Revenus clients", color: "text-primary-hover", top: "bg-primary-hover" },
                { val: "2 475€", label: "Honoraires avocats", color: "text-green-2", top: "bg-green-2" },
                { val: "178€", label: "Frais MySendingBox", color: "text-purple-400", top: "bg-purple-400" },
                { val: "5 177€", label: "Marge nette", color: "text-amber-2", top: "bg-amber-2" },
              ].map((k) => (
                <div key={k.label} className="bg-panel border border-border rounded-[10px] p-3 relative overflow-hidden">
                  <div className={`absolute top-0 left-0 right-0 h-0.5 ${k.top}`} />
                  <div className={`font-syne font-extrabold text-2xl leading-none mb-1 ${k.color}`}>{k.val}</div>
                  <div className="text-[0.7rem] text-muted-foreground">{k.label}</div>
                </div>
              ))}
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <Box variant="info" title="Stripe — Cartes bancaires">87 transactions · 7 830€ · Frais Stripe : 227€ · Visa · Mastercard · Amex · Reversements avocats via Stripe Connect automatique</Box>
              {/* CinetPay — Mobile Money : désactivé en bêta, à activer en production */}
            </div>
          </div>
        )}

        {/* M9 — RGPD */}
        {page === 9 && (
          <div>
            <Eyebrow>RGPD & Conformité</Eyebrow>
            <BigTitle>Données personnelles & journaux</BigTitle>
            <div className="bg-panel border border-border rounded-xl overflow-hidden mb-4">
              {[
                { key: "Conservation des dossiers", val: "5 ans après clôture · Suppression auto", valClass: "" },
                { key: "Chiffrement pièces jointes", val: "AES-256 · Accès limité avocat assigné", valClass: "text-green-2" },
                { key: "Accès admin aux dossiers", val: "Journalisé · Motif requis", valClass: "text-green-2" },
                { key: "Demandes de suppression", val: "2 en attente · Délai légal 30j", valClass: "text-amber-2" },
                { key: "Données paiement", val: "Stripe/Tara · jamais stockées sur IZY", valClass: "text-green-2" },
                { key: "Journalisation réassignations", val: "Immuable · Exportable pour audit", valClass: "text-green-2" },
              ].map((r) => (
                <div key={r.key} className="flex justify-between px-4 py-3 border-b border-foreground/[0.04] last:border-b-0 text-sm gap-3">
                  <span className="text-muted-foreground">{r.key}</span>
                  <span className={`font-medium text-right ${r.valClass || "text-foreground"}`}>{r.val}</span>
                </div>
              ))}
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

      {/* Page 10 — CAPDEMARCHES */}
      {page === 10 && (
        <div className="animate-fadeU">
          <AdminCapdemarchesDashboard />
        </div>
      )}

      {/* Page 11 — Base juridique */}
      {page === 11 && (
        <div className="animate-fadeU">
          <AdminReferencesJuridiques />
        </div>
      )}

      {/* Page 12 — Pièces requises */}
      {page === 12 && (
        <div className="animate-fadeU">
          <AdminPiecesRequises />
        </div>
      )}
    </ShellLayout>
  );
};

export default AdminSpace;
