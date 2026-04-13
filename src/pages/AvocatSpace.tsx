import { useState, useEffect, useCallback } from "react";

import ShellLayout from "@/components/ShellLayout";
import { NavItem, NavGroup } from "@/components/NavItem";
import { Eyebrow, BigTitle, Desc, Box, Pill } from "@/components/ui-custom";
import { toast } from "sonner";
import { ComplianceReportPanel } from "@/components/ComplianceReport";
import { useGenerateRecours } from "@/hooks/useGenerateRecours";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { format, differenceInDays } from "date-fns";
import { fr } from "date-fns/locale";

// Types
interface Dossier {
  id: string;
  dossier_ref: string;
  visa_type: string;
  refus_type: string;
  client_first_name: string;
  client_last_name: string;
  motifs_refus: string[] | null;
  lrar_status: string;
  created_at: string;
  updated_at: string;
  validation_juridique_status: string;
  lettre_neutre_contenu: string | null;
  url_lettre_neutre: string | null;
  date_notification_refus: string | null;
  recipient_name: string;
  recipient_address: string;
  recipient_postal_code: string;
  recipient_city: string;
  consulat_nom: string | null;
  consulat_ville: string | null;
  option_choisie: string | null;
}

interface AvocatProfile {
  id: string;
  nom: string;
  prenom: string;
  barreau: string;
  email: string;
  phone: string | null;
  specialites: string[] | null;
  capacite_max: number;
  dossiers_en_cours: number;
  delai_moyen_jours: number;
  disponible: boolean;
}

const VISA_LABELS: Record<string, string> = {
  etudiant: "Étudiant",
  court_sejour: "Court séjour",
  long_sejour: "Long séjour",
  conjoint_francais: "Conjoint FR",
  salarie: "Salarié",
  visiteur: "Visiteur",
  talent: "Passeport talent",
};

const aTitles = ["Dossiers à relire", "Éditeur de recours", "Dossiers validés", "Statistiques", "Mon profil"];

const AvocatSpace = () => {
  const [page, setPage] = useState(0);
  const { user } = useAuth();
  
  const { generate, loading: generating, result: recoursResult, restore } = useGenerateRecours();

  const [avocatProfile, setAvocatProfile] = useState<AvocatProfile | null>(null);
  const [pendingDossiers, setPendingDossiers] = useState<Dossier[]>([]);
  const [validatedDossiers, setValidatedDossiers] = useState<Dossier[]>([]);
  const [selectedDossier, setSelectedDossier] = useState<Dossier | null>(null);
  const [loadingData, setLoadingData] = useState(true);
  const [annotations, setAnnotations] = useState<{ type: string; page: string; text: string }[]>([]);
  const [newAnnotation, setNewAnnotation] = useState("");
  const [annotationType, setAnnotationType] = useState<"probleme" | "suggestion">("probleme");

  // Checklist state
  const [checklist, setChecklist] = useState({
    adresse_crrv: false,
    delai_30j: false,
    arguments_refs: false,
    inventaire_pieces: false,
    signataire_qualifie: false,
    redige_francais: false,
    references_verifiees: false,
  });

  const allChecked = Object.values(checklist).every(Boolean);

  // Load avocat profile & dossiers
  const loadData = useCallback(async () => {
    if (!user) return;
    setLoadingData(true);
    try {
      // Load avocat profile
      const { data: profile } = await supabase
        .from("avocats_partenaires")
        .select("*")
        .eq("user_id", user.id)
        .maybeSingle();

      if (profile) setAvocatProfile(profile);

      // Load assigned dossiers
      const { data: dossiers } = await supabase
        .from("dossiers")
        .select("*")
        .eq("avocat_id", user.id)
        .order("created_at", { ascending: false });

      if (dossiers) {
        const pending = dossiers.filter(
          (d) => d.validation_juridique_status !== "validee" && d.validation_juridique_status !== "rejetee"
        );
        const validated = dossiers.filter(
          (d) => d.validation_juridique_status === "validee"
        );
        setPendingDossiers(pending);
        setValidatedDossiers(validated);
      }
    } catch (err) {
      console.error("Erreur chargement données avocat:", err);
    } finally {
      setLoadingData(false);
    }
  }, [user]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Open dossier in editor
  const openDossier = useCallback((dossier: Dossier) => {
    setSelectedDossier(dossier);
    setAnnotations([]);
    setChecklist({
      adresse_crrv: false,
      delai_30j: false,
      arguments_refs: false,
      inventaire_pieces: false,
      signataire_qualifie: false,
      redige_francais: false,
      references_verifiees: false,
    });
    setPage(1);
    // Try to restore previously generated letter
    restore(dossier.id);
  }, [restore]);

  // Compute delay remaining (30 days from notification)
  const getDelayInfo = (dossier: Dossier) => {
    if (!dossier.date_notification_refus) return { text: "N/A", color: "text-muted-foreground" };
    const notifDate = new Date(dossier.date_notification_refus);
    const deadline = new Date(notifDate);
    deadline.setDate(deadline.getDate() + 30);
    const remaining = differenceInDays(deadline, new Date());
    if (remaining <= 3) return { text: `${remaining}j`, color: "text-destructive" };
    if (remaining <= 7) return { text: `${remaining}j`, color: "text-amber-500" };
    return { text: `${remaining}j`, color: "text-muted-foreground" };
  };

  // Add annotation
  const addAnnotation = () => {
    if (!newAnnotation.trim()) return;
    setAnnotations((prev) => [
      ...prev,
      { type: annotationType, page: "P." + (prev.length + 1), text: newAnnotation.trim() },
    ]);
    setNewAnnotation("");
  };

  // Validate dossier
  const handleValidate = async () => {
    if (!selectedDossier) return;
    if (!allChecked) {
      toast.error("Complétez toute la checklist avant de valider");
      return;
    }
    if (recoursResult && !recoursResult.can_send) {
      toast.error("Envoi bloqué — des références non validées");
      return;
    }

    const { error } = await supabase
      .from("dossiers")
      .update({
        validation_juridique_status: "validee",
        date_validation_juridique: new Date().toISOString(),
        validation_juridique_mode: "avocat",
      })
      .eq("id", selectedDossier.id);

    if (error) {
      toast.error("Erreur lors de la validation");
      return;
    }

    toast.success("Dossier validé — envoi LRAR déclenché automatiquement · Client notifié");
    loadData();
    setPage(0);
    setSelectedDossier(null);
  };

  // Return dossier for corrections
  const handleReturn = async () => {
    if (!selectedDossier) return;
    const { error } = await supabase
      .from("dossiers")
      .update({
        validation_juridique_status: "rejetee",
        date_validation_juridique: new Date().toISOString(),
      })
      .eq("id", selectedDossier.id);

    if (error) {
      toast.error("Erreur lors du retour");
      return;
    }

    toast.info("Dossier retourné — le client sera notifié des corrections requises");
    loadData();
    setPage(0);
    setSelectedDossier(null);
  };

  // Save profile
  const handleSaveProfile = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!avocatProfile) return;
    const form = new FormData(e.currentTarget);
    const { error } = await supabase
      .from("avocats_partenaires")
      .update({
        nom: form.get("nom") as string,
        prenom: form.get("prenom") as string,
        barreau: form.get("barreau") as string,
        phone: form.get("phone") as string,
        capacite_max: parseInt(form.get("capacite_max") as string) || 10,
        disponible: form.get("disponible") === "on",
      })
      .eq("id", avocatProfile.id);

    if (error) {
      toast.error("Erreur lors de la sauvegarde");
    } else {
      toast.success("Profil mis à jour");
      loadData();
    }
  };

  // Stats
  const totalDossiers = pendingDossiers.length + validatedDossiers.length;
  const initials = avocatProfile ? `${avocatProfile.prenom[0]}${avocatProfile.nom[0]}`.toUpperCase() : "AV";

  const sidebar = (
    <>
      <NavGroup label="Dossiers">
        <NavItem icon="📂" label="À relire" active={page === 0} badge={pendingDossiers.length > 0 ? { text: String(pendingDossiers.length), color: "red" } : undefined} onClick={() => setPage(0)} />
        <NavItem icon="✏️" label="Éditeur" active={page === 1} onClick={() => setPage(1)} />
        <NavItem icon="✅" label="Validés" active={page === 2} onClick={() => setPage(2)} />
      </NavGroup>
      <NavGroup label="Compte">
        <NavItem icon="📊" label="Statistiques" active={page === 3} onClick={() => setPage(3)} />
        <NavItem icon="👤" label="Mon profil" active={page === 4} onClick={() => setPage(4)} />
      </NavGroup>
    </>
  );

  const bottomNavItems = [
    { icon: "📂", label: "À relire", onClick: () => setPage(0), active: page === 0 },
    { icon: "✏️", label: "Éditeur", onClick: () => setPage(1), active: page === 1 },
    { icon: "✅", label: "Validés", onClick: () => setPage(2), active: page === 2 },
    { icon: "👤", label: "Profil", onClick: () => setPage(4), active: page === 4 },
  ];

  if (loadingData) {
    return (
      <ShellLayout role="avocat" roleLabel="Avocat" sidebar={sidebar} topbarTitle="Chargement…" bottomNavItems={bottomNavItems}>
        <div className="flex items-center justify-center min-h-[300px]">
          <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
        </div>
      </ShellLayout>
    );
  }

  return (
    <ShellLayout
      role="avocat"
      roleLabel="Avocat partenaire"
      sidebar={sidebar}
      topbarTitle={aTitles[page]}
      topbarRight={
        <div className="w-[30px] h-[30px] rounded-md bg-gradient-to-br from-primary to-purple-600 flex items-center justify-center font-syne font-extrabold text-[0.68rem] text-primary-foreground">
          {initials}
        </div>
      }
      footerContent={
        avocatProfile ? (
          <>
            <strong className="text-muted-foreground">Me {avocatProfile.prenom} {avocatProfile.nom}</strong><br />
            Barreau de {avocatProfile.barreau} · {totalDossiers} dossiers
          </>
        ) : (
          <span className="text-muted-foreground">Profil non configuré</span>
        )
      }
      bottomNavItems={bottomNavItems}
    >
      <div className="animate-fadeU">
        {/* PAGE 0 — Dossiers à relire */}
        {page === 0 && (
          <div>
            <Eyebrow>File d'attente</Eyebrow>
            <BigTitle>Dossiers à relire ({pendingDossiers.length})</BigTitle>
            <Desc>Délai contractuel : 48h ouvrées. Les dossiers urgents sont prioritaires.</Desc>
            <Box variant="warn" title="⚠ Rappel déontologique">
              Votre mission se limite à la relecture et annotation. Tout mandat contentieux devant le TA de Nantes nécessite un contrat distinct hors plateforme.
            </Box>

            {pendingDossiers.length === 0 ? (
              <Box variant="ok" title="Aucun dossier en attente">
                Tous vos dossiers assignés ont été traités. Vous serez notifié lorsqu'un nouveau dossier vous sera assigné.
              </Box>
            ) : (
              <div className="bg-card border border-border rounded-xl overflow-hidden">
                <table className="w-full border-collapse">
                  <thead>
                    <tr>
                      {["Réf.", "Client", "Type visa", "Délai restant", "Reçu le", "Statut", "Action"].map((h) => (
                        <th key={h} className="font-syne text-[0.6rem] font-bold tracking-wider uppercase text-muted-foreground px-3.5 py-2 text-left border-b border-border whitespace-nowrap">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {pendingDossiers.map((dossier) => {
                      const delay = getDelayInfo(dossier);
                      const isUrgent = delay.color === "text-destructive";
                      return (
                        <tr
                          key={dossier.id}
                          onClick={() => openDossier(dossier)}
                          className={`cursor-pointer transition-colors hover:bg-muted/50 ${isUrgent ? "border-l-2 border-l-destructive" : ""}`}
                        >
                          <td className="px-3.5 py-2.5 text-xs text-muted-foreground font-syne border-b border-border">{dossier.dossier_ref.split("-").pop()}</td>
                          <td className="px-3.5 py-2.5 text-xs font-semibold border-b border-border">{dossier.client_last_name} {dossier.client_first_name}</td>
                          <td className="px-3.5 py-2.5 text-xs text-muted-foreground border-b border-border">{VISA_LABELS[dossier.visa_type] || dossier.visa_type}</td>
                          <td className={`px-3.5 py-2.5 text-xs font-syne font-bold border-b border-border ${delay.color}`}>⚠ {delay.text}</td>
                          <td className="px-3.5 py-2.5 text-xs text-muted-foreground border-b border-border">
                            {format(new Date(dossier.created_at), "dd/MM", { locale: fr })}
                          </td>
                          <td className="px-3.5 py-2.5 border-b border-border">
                            <Pill variant={dossier.validation_juridique_status === "en_cours" ? "new" : "default"}>
                              {dossier.validation_juridique_status === "en_cours" ? "En cours" : "À relire"}
                            </Pill>
                          </td>
                          <td className="px-3.5 py-2.5 border-b border-border">
                            <span className="bg-primary/20 border border-primary/30 text-primary rounded px-2 py-1 font-syne text-[0.6rem] font-bold cursor-pointer hover:bg-primary/30">
                              Relire →
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* PAGE 1 — Éditeur */}
        {page === 1 && (
          <div>
            {!selectedDossier ? (
              <div>
                <Eyebrow>Éditeur</Eyebrow>
                <BigTitle>Aucun dossier sélectionné</BigTitle>
                <Desc>Sélectionnez un dossier depuis la liste "À relire" pour commencer.</Desc>
                <button
                  className="mt-4 font-syne font-bold text-sm px-4 py-2 rounded-lg bg-primary/20 text-primary border border-primary/30"
                  onClick={() => setPage(0)}
                >
                  ← Voir les dossiers
                </button>
              </div>
            ) : (
              <div>
                <Eyebrow>{selectedDossier.dossier_ref} · {selectedDossier.client_last_name} {selectedDossier.client_first_name}</Eyebrow>
                <BigTitle>Relecture en cours</BigTitle>
                <Desc>
                  {VISA_LABELS[selectedDossier.visa_type] || selectedDossier.visa_type} · Délai : <strong className={getDelayInfo(selectedDossier).color}>{getDelayInfo(selectedDossier).text}</strong>
                </Desc>

                <div className="grid grid-cols-1 lg:grid-cols-[1fr_300px] gap-4 mt-5">
                  {/* Letter panel */}
                  <div className="bg-card border border-border rounded-xl overflow-hidden">
                    <div className="bg-muted/30 border-b border-border px-3 py-2 flex gap-1.5 flex-wrap">
                      {["Annoter", "Problème", "Suggestion", "Valider ✓"].map((btn) => (
                        <button key={btn} className="bg-card border border-border rounded-[5px] px-2 py-1 text-[0.7rem] text-muted-foreground cursor-pointer hover:text-foreground hover:border-primary/35 transition-all">{btn}</button>
                      ))}
                    </div>
                    <div className="p-5 min-h-[320px] text-sm text-muted-foreground leading-relaxed">
                      {selectedDossier.lettre_neutre_contenu ? (
                        <div className="whitespace-pre-wrap">{selectedDossier.lettre_neutre_contenu}</div>
                      ) : (
                        <div className="text-center py-12">
                          <p className="text-muted-foreground mb-4">La lettre de recours n'a pas encore été générée pour ce dossier.</p>
                          <button
                            className="font-syne font-bold text-sm px-5 py-2.5 rounded-lg bg-primary/20 text-primary border border-primary/30 disabled:opacity-50"
                            disabled={generating}
                            onClick={() => generate(selectedDossier.id)}
                          >
                            {generating ? "⏳ Génération…" : "🔍 Générer le recours"}
                          </button>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Annotations panel */}
                  <div className="flex flex-col gap-3">
                    <div className="font-syne text-[0.65rem] font-bold tracking-wider uppercase text-muted-foreground mb-1">
                      Annotations ({annotations.length})
                    </div>

                    {annotations.map((a, i) => (
                      <div key={i} className={`bg-card border border-border rounded-[10px] p-3 border-l-[3px] ${a.type === "probleme" ? "border-l-destructive" : "border-l-primary"}`}>
                        <div className={`flex justify-between font-syne text-[0.6rem] font-bold uppercase tracking-wider mb-1.5 ${a.type === "probleme" ? "text-destructive" : "text-primary"}`}>
                          <span>{a.type === "probleme" ? "⚠ Problème" : "💡 Suggestion"}</span>
                          <span>{a.page}</span>
                        </div>
                        <div className="text-xs text-muted-foreground leading-relaxed">{a.text}</div>
                      </div>
                    ))}

                    {annotations.length === 0 && (
                      <p className="text-xs text-muted-foreground italic">Aucune annotation ajoutée.</p>
                    )}

                    <div className="mt-1.5">
                      <textarea
                        className="w-full bg-background border-[1.5px] border-border rounded-[9px] px-3 py-2.5 text-foreground text-xs outline-none focus:border-primary/55 h-[68px] resize-none"
                        placeholder="Ajouter une annotation…"
                        value={newAnnotation}
                        onChange={(e) => setNewAnnotation(e.target.value)}
                      />
                      <div className="flex gap-1.5 mt-1.5">
                        <button
                          className={`font-syne font-bold text-[0.68rem] px-3 py-1.5 rounded-[7px] border transition-all ${annotationType === "probleme" ? "bg-destructive/20 text-destructive border-destructive/30" : "bg-muted text-muted-foreground border-border"}`}
                          onClick={() => setAnnotationType("probleme")}
                        >
                          Problème
                        </button>
                        <button
                          className={`font-syne font-bold text-[0.68rem] px-3 py-1.5 rounded-[7px] border transition-all ${annotationType === "suggestion" ? "bg-primary/20 text-primary border-primary/30" : "bg-muted text-muted-foreground border-border"}`}
                          onClick={() => setAnnotationType("suggestion")}
                        >
                          Suggestion
                        </button>
                        <button
                          className="font-syne font-bold text-[0.68rem] px-3 py-1.5 rounded-[7px] bg-primary text-primary-foreground ml-auto"
                          onClick={addAnnotation}
                        >
                          Ajouter
                        </button>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Compliance Report */}
                {recoursResult && <ComplianceReportPanel result={recoursResult} />}

                {/* Checklist */}
                <Box variant="warn" title="Checklist avant validation" className="mt-4">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-2">
                    {[
                      { key: "adresse_crrv", label: "Adresse CRRV correcte" },
                      { key: "delai_30j", label: "Délai 30j respecté" },
                      { key: "arguments_refs", label: "Arguments avec références" },
                      { key: "inventaire_pieces", label: "Inventaire pièces complet" },
                      { key: "signataire_qualifie", label: "Signataire qualifié" },
                      { key: "redige_francais", label: "Rédigé en français" },
                      { key: "references_verifiees", label: "Références vérifiées" },
                    ].map((item) => (
                      <label key={item.key} className="flex items-center gap-2 text-xs cursor-pointer">
                        <input
                          type="checkbox"
                          checked={checklist[item.key as keyof typeof checklist]}
                          onChange={(e) => setChecklist((prev) => ({ ...prev, [item.key]: e.target.checked }))}
                          className="rounded border-border"
                        />
                        <span className={checklist[item.key as keyof typeof checklist] ? "text-foreground" : "text-muted-foreground"}>
                          {item.label}
                        </span>
                      </label>
                    ))}
                  </div>
                </Box>

                <div className="flex gap-2.5 mt-7 flex-wrap">
                  <button
                    className="font-syne font-bold text-[0.78rem] px-5 py-2.5 rounded-[7px] bg-primary/20 text-primary border border-primary/30 transition-all disabled:opacity-50"
                    disabled={generating}
                    onClick={() => generate(selectedDossier.id)}
                  >
                    {generating ? "⏳ Génération en cours…" : "🔍 Générer & vérifier via OpenLégi"}
                  </button>
                  <button
                    className="font-syne font-bold text-[0.78rem] px-5 py-2.5 rounded-[7px] bg-destructive/20 text-destructive border border-destructive/30 transition-all"
                    onClick={handleReturn}
                  >
                    Retourner (corrections requises)
                  </button>
                  <button
                    className="font-syne font-bold text-[0.78rem] px-5 py-2.5 rounded-[7px] bg-green-500/20 text-green-600 border border-green-500/30 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                    disabled={!allChecked || (recoursResult ? !recoursResult.can_send : false)}
                    onClick={handleValidate}
                  >
                    ✓ Valider & déclencher envoi
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* PAGE 2 — Validés */}
        {page === 2 && (
          <div>
            <Eyebrow>Historique</Eyebrow>
            <BigTitle>Dossiers validés ({validatedDossiers.length})</BigTitle>

            {validatedDossiers.length === 0 ? (
              <Box variant="info" title="Aucun dossier validé">Vos dossiers validés apparaîtront ici.</Box>
            ) : (
              <div className="bg-card border border-border rounded-xl overflow-hidden">
                <table className="w-full border-collapse">
                  <thead>
                    <tr>
                      {["Réf.", "Client", "Type visa", "Validé le", "Statut LRAR"].map((h) => (
                        <th key={h} className="font-syne text-[0.6rem] font-bold tracking-wider uppercase text-muted-foreground px-3.5 py-2 text-left border-b border-border">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {validatedDossiers.map((d) => (
                      <tr key={d.id} className="hover:bg-muted/50 transition-colors">
                        <td className="px-3.5 py-2.5 text-xs text-muted-foreground font-syne border-b border-border">{d.dossier_ref.split("-").pop()}</td>
                        <td className="px-3.5 py-2.5 text-xs font-semibold border-b border-border">{d.client_last_name} {d.client_first_name}</td>
                        <td className="px-3.5 py-2.5 text-xs text-muted-foreground border-b border-border">{VISA_LABELS[d.visa_type] || d.visa_type}</td>
                        <td className="px-3.5 py-2.5 text-xs text-muted-foreground border-b border-border">
                          {format(new Date(d.updated_at), "dd/MM/yyyy", { locale: fr })}
                        </td>
                        <td className="px-3.5 py-2.5 border-b border-border">
                          <Pill variant={d.lrar_status === "distribuee" || d.lrar_status === "lrar_envoye" || d.lrar_status === "envoyee" ? "ok" : "new"}>
                            {d.lrar_status === "lrar_envoye" || d.lrar_status === "envoyee" ? "Envoyé" : d.lrar_status === "distribuee" ? "Distribué" : "En attente"}
                          </Pill>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* PAGE 3 — Stats */}
        {page === 3 && (
          <div>
            <Eyebrow>Dashboard</Eyebrow>
            <BigTitle>Mes statistiques</BigTitle>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-5">
              {[
                { val: String(totalDossiers), label: "Dossiers traités", color: "text-primary", top: "bg-primary" },
                { val: String(pendingDossiers.length), label: "En attente", color: "text-amber-500", top: "bg-amber-500" },
                { val: String(validatedDossiers.length), label: "Validés", color: "text-green-600", top: "bg-green-600" },
                { val: avocatProfile ? `${avocatProfile.delai_moyen_jours * 24}h` : "N/A", label: "Délai moyen", color: "text-purple-500", top: "bg-purple-500" },
              ].map((k) => (
                <div key={k.label} className="bg-card border border-border rounded-[10px] p-3 relative overflow-hidden cursor-pointer hover:border-primary/30 hover:-translate-y-px transition-all">
                  <div className={`absolute top-0 left-0 right-0 h-0.5 ${k.top}`} />
                  <div className={`font-syne font-extrabold text-2xl leading-none mb-1 ${k.color}`}>{k.val}</div>
                  <div className="text-[0.7rem] text-muted-foreground">{k.label}</div>
                </div>
              ))}
            </div>
            {avocatProfile && avocatProfile.delai_moyen_jours <= 2 && (
              <Box variant="ok" title="Top performance">
                Délai moyen ({avocatProfile.delai_moyen_jours * 24}h) inférieur au seuil contractuel (48h). Vous recevez en priorité les dossiers urgents.
              </Box>
            )}
          </div>
        )}

        {/* PAGE 4 — Profil */}
        {page === 4 && (
          <div>
            <Eyebrow>Compte</Eyebrow>
            <BigTitle>Mon profil avocat</BigTitle>

            {!avocatProfile ? (
              <Box variant="warn" title="Profil non configuré">
                Votre profil avocat n'a pas encore été créé. Contactez l'administrateur pour être enregistré comme avocat partenaire.
              </Box>
            ) : (
              <form onSubmit={handleSaveProfile}>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <div className="mb-4">
                      <label className="font-syne text-[0.64rem] font-bold tracking-wider uppercase text-muted-foreground mb-1.5 block">Prénom</label>
                      <input name="prenom" className="w-full bg-background border-[1.5px] border-border rounded-[9px] px-3 py-2.5 text-foreground text-sm outline-none focus:border-primary/55" defaultValue={avocatProfile.prenom} />
                    </div>
                    <div className="mb-4">
                      <label className="font-syne text-[0.64rem] font-bold tracking-wider uppercase text-muted-foreground mb-1.5 block">Nom</label>
                      <input name="nom" className="w-full bg-background border-[1.5px] border-border rounded-[9px] px-3 py-2.5 text-foreground text-sm outline-none focus:border-primary/55" defaultValue={avocatProfile.nom} />
                    </div>
                    <div className="mb-4">
                      <label className="font-syne text-[0.64rem] font-bold tracking-wider uppercase text-muted-foreground mb-1.5 block">Barreau</label>
                      <input name="barreau" className="w-full bg-background border-[1.5px] border-border rounded-[9px] px-3 py-2.5 text-foreground text-sm outline-none focus:border-primary/55" defaultValue={avocatProfile.barreau} />
                    </div>
                    <div className="mb-4">
                      <label className="font-syne text-[0.64rem] font-bold tracking-wider uppercase text-muted-foreground mb-1.5 block">Téléphone</label>
                      <input name="phone" className="w-full bg-background border-[1.5px] border-border rounded-[9px] px-3 py-2.5 text-foreground text-sm outline-none focus:border-primary/55" defaultValue={avocatProfile.phone || ""} />
                    </div>
                    <div className="mb-4">
                      <label className="font-syne text-[0.64rem] font-bold tracking-wider uppercase text-muted-foreground mb-1.5 block">Capacité max (dossiers simultanés)</label>
                      <input name="capacite_max" type="number" className="w-full bg-background border-[1.5px] border-border rounded-[9px] px-3 py-2.5 text-foreground text-sm outline-none focus:border-primary/55" defaultValue={avocatProfile.capacite_max} />
                    </div>
                    <div className="mb-4 flex items-center gap-3">
                      <input name="disponible" type="checkbox" defaultChecked={avocatProfile.disponible} className="rounded" />
                      <label className="text-sm text-muted-foreground">Disponible pour recevoir de nouveaux dossiers</label>
                    </div>
                  </div>
                  <div className="bg-card border border-border rounded-xl p-4">
                    <div className="font-syne font-bold text-sm mb-3">Spécialités</div>
                    <div className="flex flex-wrap gap-1.5">
                      {(avocatProfile.specialites || []).map((s) => (
                        <span key={s} className="bg-primary/10 border border-primary/20 rounded-[5px] px-2.5 py-1 text-[0.7rem] text-primary font-syne font-semibold">
                          {VISA_LABELS[s] || s} ✓
                        </span>
                      ))}
                      {(!avocatProfile.specialites || avocatProfile.specialites.length === 0) && (
                        <p className="text-xs text-muted-foreground italic">Aucune spécialité configurée.</p>
                      )}
                    </div>
                    <div className="mt-6">
                      <div className="font-syne font-bold text-sm mb-2">Informations</div>
                      <div className="text-xs text-muted-foreground space-y-1">
                        <p>Email : {avocatProfile.email}</p>
                        <p>Dossiers en cours : {avocatProfile.dossiers_en_cours}</p>
                        <p>Délai moyen : {avocatProfile.delai_moyen_jours} jour(s)</p>
                      </div>
                    </div>
                  </div>
                </div>
                <div className="flex gap-2.5 mt-7">
                  <button type="submit" className="font-syne font-bold text-[0.78rem] px-5 py-2.5 rounded-[7px] bg-primary text-primary-foreground transition-all">
                    Enregistrer
                  </button>
                </div>
              </form>
            )}
          </div>
        )}
      </div>
    </ShellLayout>
  );
};

export default AvocatSpace;
