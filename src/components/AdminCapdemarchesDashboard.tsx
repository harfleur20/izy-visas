import { useState, useEffect } from "react";
import { Eyebrow, BigTitle, Box, Pill } from "@/components/ui-custom";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface Courrier {
  id: string;
  dossier_ref: string;
  expediteur: string;
  date_reception: string;
  date_transmission: string | null;
  statut: string;
  url_courrier_pdf: string | null;
  type_decision: string | null;
}

interface AdminTask {
  id: string;
  task_type: string;
  dossier_ref: string;
  client_name: string;
  description: string;
  deadline: string | null;
  statut: string;
}

interface DossierSummary {
  id: string;
  dossier_ref: string;
  client_last_name: string;
  client_first_name: string;
  procuration_signee: boolean;
  procuration_active: boolean;
  procuration_expiration: string | null;
  date_signature_procuration: string | null;
  lrar_status: string;
  use_capdemarches: boolean;
  recipient_name: string;
}

export const AdminCapdemarchesDashboard = () => {
  const [dossiers, setDossiers] = useState<DossierSummary[]>([]);
  const [courriers, setCourriers] = useState<Courrier[]>([]);
  const [tasks, setTasks] = useState<AdminTask[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState(0);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      const [dossierRes, courrierRes, taskRes] = await Promise.all([
        supabase.from("dossiers").select("id, dossier_ref, client_last_name, client_first_name, procuration_signee, procuration_active, procuration_expiration, date_signature_procuration, lrar_status, use_capdemarches, recipient_name").eq("use_capdemarches", true as any),
        supabase.from("courriers_capdemarches" as any).select("*").order("created_at", { ascending: false }),
        supabase.from("admin_tasks" as any).select("*").order("created_at", { ascending: false }),
      ]);

      setDossiers((dossierRes.data as any) || []);
      setCourriers((courrierRes.data as any) || []);
      setTasks((taskRes.data as any) || []);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const sendProcurationReminder = async (dossierRef: string) => {
    try {
      await supabase.functions.invoke("capdemarches-notify", {
        body: { action: "remind_procuration", dossier_ref: dossierRef },
      });
      toast.success(`Rappel envoyé au client pour ${dossierRef}`);
    } catch {
      toast.error("Erreur lors de l'envoi du rappel");
    }
  };

  const checkOverdueTasks = async () => {
    const { data } = await supabase.functions.invoke("capdemarches-notify", {
      body: { action: "check_overdue_tasks" },
    });
    if (data?.overdue_count > 0) {
      toast.error(`${data.overdue_count} tâche(s) en retard détectée(s)`);
    } else {
      toast.success("Aucune tâche en retard");
    }
    loadData();
  };

  const now = new Date();
  const thirtyDays = new Date();
  thirtyDays.setDate(thirtyDays.getDate() + 30);

  // Blocked dossiers: ready to send but procuration not signed for 48h+
  const blockedDossiers = dossiers.filter(d => 
    !d.procuration_signee && ["pret_a_envoyer", "pending"].includes(d.lrar_status)
  );

  const pendingCourriers = courriers.filter((c) => c.statut === "recu");
  const transmittedCourriers = courriers.filter((c) => c.statut === "transmis");
  const overdueTasks = tasks.filter((t) => t.statut === "en_retard");

  // Stats
  const delaisTransmission = transmittedCourriers
    .filter((c) => c.date_transmission && c.date_reception)
    .map((c) => {
      const r = new Date(c.date_reception).getTime();
      const t = new Date(c.date_transmission!).getTime();
      return (t - r) / (1000 * 60 * 60);
    });
  const avgDelai = delaisTransmission.length > 0
    ? (delaisTransmission.reduce((a, b) => a + b, 0) / delaisTransmission.length).toFixed(1)
    : "—";
  const tauxDansDelai = delaisTransmission.length > 0
    ? ((delaisTransmission.filter((d) => d <= 24).length / delaisTransmission.length) * 100).toFixed(0)
    : "—";

  const tabs = ["Supervision dossiers", "Courriers", "Tâches", "Statistiques"];

  if (loading) {
    return <div className="text-muted-foreground text-sm">Chargement…</div>;
  }

  return (
    <div>
      <Eyebrow>Supervision CAPDEMARCHES</Eyebrow>
      <BigTitle>Suivi opérationnel — Lecture seule</BigTitle>

      {/* Quick stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-5">
        {[
          { val: String(dossiers.length), label: "Dossiers CAPDEMARCHES", color: "text-primary-hover", top: "bg-primary-hover" },
          { val: String(pendingCourriers.length), label: "Courriers en attente", color: pendingCourriers.length > 0 ? "text-amber-2" : "text-green-2", top: pendingCourriers.length > 0 ? "bg-amber-2" : "bg-green-2" },
          { val: String(blockedDossiers.length), label: "Dossiers bloqués", color: blockedDossiers.length > 0 ? "text-red-2" : "text-green-2", top: blockedDossiers.length > 0 ? "bg-red-2" : "bg-green-2" },
          { val: String(overdueTasks.length), label: "Alertes retard", color: overdueTasks.length > 0 ? "text-red-2" : "text-green-2", top: overdueTasks.length > 0 ? "bg-red-2" : "bg-green-2" },
        ].map((k) => (
          <div key={k.label} className="bg-panel border border-border rounded-[10px] p-3 relative overflow-hidden">
            <div className={`absolute top-0 left-0 right-0 h-0.5 ${k.top}`} />
            <div className={`font-syne font-extrabold text-2xl leading-none mb-1 ${k.color}`}>{k.val}</div>
            <div className="text-[0.7rem] text-muted-foreground">{k.label}</div>
          </div>
        ))}
      </div>

      {/* Blocked dossiers alert */}
      {blockedDossiers.length > 0 && (
        <div className="mb-4 space-y-2">
          {blockedDossiers.map((d) => (
            <Box key={d.id} variant="alert" title={`⚠️ Dossier ${d.dossier_ref} bloqué — Procuration non signée`}
              action={
                <button
                  onClick={() => sendProcurationReminder(d.dossier_ref)}
                  className="font-syne font-bold text-[0.68rem] px-3 py-1.5 rounded-md bg-amber/[0.14] text-amber-2 border border-amber/25 flex-shrink-0 whitespace-nowrap"
                >
                  Envoyer un rappel au client
                </button>
              }
            >
              {d.client_last_name} {d.client_first_name} — Procuration CAPDEMARCHES non signée. Le dossier ne peut pas être envoyé.
            </Box>
          ))}
        </div>
      )}

      {/* Actions */}
      <div className="flex gap-2 mb-4 flex-wrap">
        <button onClick={checkOverdueTasks} className="font-syne font-bold text-[0.7rem] px-3 py-1.5 rounded-[7px] bg-destructive/[0.14] text-red-2 border border-destructive/25">
          🔍 Vérifier retards 24h
        </button>
        <button onClick={loadData} className="font-syne font-bold text-[0.7rem] px-3 py-1.5 rounded-[7px] bg-foreground/[0.07] text-muted-foreground border border-border-2">
          ↻ Actualiser
        </button>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-4 bg-background-3 rounded-lg p-1">
        {tabs.map((tab, i) => (
          <button
            key={tab}
            onClick={() => setActiveTab(i)}
            className={`font-syne font-bold text-[0.72rem] px-3 py-1.5 rounded-md transition-all ${
              activeTab === i ? "bg-panel text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {tab}
          </button>
        ))}
      </div>

      {/* Tab 0: Dossiers supervision (read-only) */}
      {activeTab === 0 && (
        <div className="bg-panel border border-border rounded-xl overflow-hidden">
          <div className="p-3 border-b border-border">
            <p className="text-[0.65rem] text-muted-foreground">🔒 Lecture seule — L'admin ne peut pas modifier les procurations ni les adresses des clients.</p>
          </div>
          <table className="w-full border-collapse">
            <thead>
              <tr>
                {["Client", "Dossier", "Procuration", "Adresse retour", "Statut envoi"].map((h) => (
                  <th key={h} className="font-syne text-[0.6rem] font-bold tracking-wider uppercase text-muted px-3.5 py-2 text-left border-b border-border">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {dossiers.length === 0 ? (
                <tr><td colSpan={5} className="px-3.5 py-6 text-center text-muted-foreground text-sm">Aucun dossier CAPDEMARCHES</td></tr>
              ) : (
                dossiers.map((d) => (
                  <tr key={d.id} className="hover:bg-foreground/[0.022] transition-colors">
                    <td className="px-3.5 py-2.5 text-xs font-semibold border-b border-foreground/[0.03]">
                      {d.client_last_name} {d.client_first_name}
                    </td>
                    <td className="px-3.5 py-2.5 text-xs text-muted-foreground border-b border-foreground/[0.03]">
                      {d.dossier_ref}
                    </td>
                    <td className="px-3.5 py-2.5 text-xs border-b border-foreground/[0.03]">
                      {d.procuration_signee ? (
                        <span className="text-green-2 font-semibold">
                          ✓ Signée {d.date_signature_procuration ? `le ${new Date(d.date_signature_procuration).toLocaleDateString("fr-FR")}` : ""}
                        </span>
                      ) : (
                        <span className="text-red-2 font-semibold">⚠️ Non signée — dossier bloqué</span>
                      )}
                    </td>
                    <td className="px-3.5 py-2.5 text-xs text-muted-foreground border-b border-foreground/[0.03]">
                      {d.use_capdemarches ? (
                        <Pill variant="ok">CAPDEMARCHES</Pill>
                      ) : (
                        <Pill variant="muted">Personnalisée</Pill>
                      )}
                    </td>
                    <td className="px-3.5 py-2.5 border-b border-foreground/[0.03]">
                      <Pill variant={
                        d.lrar_status === "delivered" ? "ok" :
                        d.lrar_status === "sent" ? "post" :
                        d.lrar_status === "pending" ? "new" : "muted"
                      }>
                        {d.lrar_status === "delivered" ? "✓ Livré" :
                         d.lrar_status === "sent" ? "📬 Envoyé" :
                         d.lrar_status === "pending" ? "En attente" : d.lrar_status}
                      </Pill>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* Tab 1: Courriers */}
      {activeTab === 1 && (
        <div className="bg-panel border border-border rounded-xl overflow-hidden">
          <table className="w-full border-collapse">
            <thead>
              <tr>
                {["Dossier", "Expéditeur", "Reçu le", "Transmis le", "Décision", "Statut"].map((h) => (
                  <th key={h} className="font-syne text-[0.6rem] font-bold tracking-wider uppercase text-muted px-3.5 py-2 text-left border-b border-border">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {courriers.length === 0 ? (
                <tr><td colSpan={6} className="px-3.5 py-6 text-center text-muted-foreground text-sm">Aucun courrier</td></tr>
              ) : (
                courriers.map((c) => (
                  <tr key={c.id} className="hover:bg-foreground/[0.022] transition-colors">
                    <td className="px-3.5 py-2.5 text-xs font-semibold border-b border-foreground/[0.03]">{c.dossier_ref}</td>
                    <td className="px-3.5 py-2.5 text-xs text-muted-foreground border-b border-foreground/[0.03]">{c.expediteur}</td>
                    <td className="px-3.5 py-2.5 text-xs text-muted-foreground border-b border-foreground/[0.03]">{new Date(c.date_reception).toLocaleDateString("fr-FR")}</td>
                    <td className="px-3.5 py-2.5 text-xs text-muted-foreground border-b border-foreground/[0.03]">
                      {c.date_transmission ? new Date(c.date_transmission).toLocaleDateString("fr-FR") : "—"}
                    </td>
                    <td className="px-3.5 py-2.5 text-xs border-b border-foreground/[0.03]">
                      {c.type_decision ? (
                        <Pill variant={c.type_decision === "favorable" ? "ok" : c.type_decision === "defavorable" ? "red" : "new"}>
                          {c.type_decision}
                        </Pill>
                      ) : "—"}
                    </td>
                    <td className="px-3.5 py-2.5 border-b border-foreground/[0.03]">
                      <Pill variant={c.statut === "transmis" ? "ok" : c.statut === "recu" ? "new" : "red"}>
                        {c.statut === "recu" ? "⏳ En attente" : c.statut === "transmis" ? "✓ Transmis" : c.statut}
                      </Pill>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* Tab 2: Tâches */}
      {activeTab === 2 && (
        <div className="bg-panel border border-border rounded-xl overflow-hidden">
          <table className="w-full border-collapse">
            <thead>
              <tr>
                {["Type", "Client", "Dossier", "Deadline", "Statut"].map((h) => (
                  <th key={h} className="font-syne text-[0.6rem] font-bold tracking-wider uppercase text-muted px-3.5 py-2 text-left border-b border-border">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {tasks.length === 0 ? (
                <tr><td colSpan={5} className="px-3.5 py-6 text-center text-muted-foreground text-sm">Aucune tâche</td></tr>
              ) : (
                tasks.map((t) => (
                  <tr key={t.id} className={`hover:bg-foreground/[0.022] transition-colors ${t.statut === "en_retard" ? "border-l-2 border-l-red-2" : ""}`}>
                    <td className="px-3.5 py-2.5 text-xs text-muted-foreground border-b border-foreground/[0.03]">
                      {t.task_type === "courrier_a_transmettre" ? "📬 Courrier" : t.task_type === "procuration_expiree" ? "⏰ Expiration" : t.task_type}
                    </td>
                    <td className="px-3.5 py-2.5 text-xs font-semibold border-b border-foreground/[0.03]">{t.client_name}</td>
                    <td className="px-3.5 py-2.5 text-xs text-muted-foreground border-b border-foreground/[0.03]">{t.dossier_ref}</td>
                    <td className="px-3.5 py-2.5 text-xs border-b border-foreground/[0.03]">
                      {t.deadline ? (
                        <span className={new Date(t.deadline) < now ? "text-red-2 font-semibold" : "text-muted-foreground"}>
                          {new Date(t.deadline).toLocaleString("fr-FR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}
                        </span>
                      ) : "—"}
                    </td>
                    <td className="px-3.5 py-2.5 border-b border-foreground/[0.03]">
                      <Pill variant={t.statut === "termine" ? "ok" : t.statut === "en_retard" ? "red" : "new"}>
                        {t.statut === "en_attente" ? "⏳ En attente" : t.statut === "en_retard" ? "🚨 En retard" : t.statut === "termine" ? "✓ Terminé" : t.statut}
                      </Pill>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* Tab 3: Statistiques */}
      {activeTab === 3 && (
        <div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
            {[
              { val: String(transmittedCourriers.length), label: "Courriers traités", color: "text-primary-hover" },
              { val: `${avgDelai}h`, label: "Délai moyen transmission", color: Number(avgDelai) <= 24 ? "text-green-2" : "text-red-2" },
              { val: `${tauxDansDelai}%`, label: "Dans les 24h", color: Number(tauxDansDelai) >= 90 ? "text-green-2" : "text-amber-2" },
              { val: String(courriers.filter((c) => {
                const d = new Date(c.date_reception);
                return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
              }).length), label: "Ce mois-ci", color: "text-primary-hover" },
            ].map((k) => (
              <div key={k.label} className="bg-panel border border-border rounded-[10px] p-4">
                <div className={`font-syne font-extrabold text-2xl leading-none mb-1 ${k.color}`}>{k.val}</div>
                <div className="text-[0.7rem] text-muted-foreground">{k.label}</div>
              </div>
            ))}
          </div>

          {Number(avgDelai) <= 24 ? (
            <Box variant="ok" title="✓ Objectif respecté">
              Délai moyen de transmission ({avgDelai}h) inférieur à l'objectif de 24h.
            </Box>
          ) : (
            <Box variant="warn" title="⚠ Objectif dépassé">
              Délai moyen de transmission ({avgDelai}h) supérieur à l'objectif de 24h. Action requise.
            </Box>
          )}
        </div>
      )}
    </div>
  );
};
