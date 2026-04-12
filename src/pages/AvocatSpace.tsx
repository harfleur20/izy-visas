import { useState } from "react";
import ShellLayout from "@/components/ShellLayout";
import { NavItem, NavGroup } from "@/components/NavItem";
import { Eyebrow, BigTitle, Desc, Box, Pill } from "@/components/ui-custom";
import { toast } from "sonner";
import { ComplianceReportPanel } from "@/components/ComplianceReport";
import { useGenerateRecours } from "@/hooks/useGenerateRecours";

const aTitles = ["Dossiers à relire", "Éditeur de recours", "Dossiers validés", "Statistiques", "Mon profil"];

const AvocatSpace = () => {
  const [page, setPage] = useState(0);
  const { generate, loading: generating, result: recoursResult } = useGenerateRecours();

  const sidebar = (
    <>
      <NavGroup label="Dossiers">
        <NavItem icon="📂" label="À relire" active={page === 0} badge={{ text: "3", color: "red" }} onClick={() => setPage(0)} />
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

  return (
    <ShellLayout
      role="avocat"
      roleLabel="Avocat inscrit"
      sidebar={sidebar}
      topbarTitle={aTitles[page]}
      topbarRight={<div className="w-[30px] h-[30px] rounded-md bg-gradient-to-br from-primary-hover to-purple-600 flex items-center justify-center font-syne font-extrabold text-[0.68rem]">SM</div>}
      footerContent={<><strong className="text-muted-foreground">Me Sylvie Moreau</strong><br />Barreau de Paris · P-2019-4821<br />47 dossiers · ⭐ 94%</>}
      bottomNavItems={bottomNavItems}
    >
      <div className="animate-fadeU">
        {/* A0 — Liste */}
        {page === 0 && (
          <div>
            <Eyebrow>File d'attente</Eyebrow>
            <BigTitle>Dossiers à relire (3)</BigTitle>
            <Desc>Délai contractuel : 48h ouvrées. Les dossiers urgents sont prioritaires.</Desc>
            <Box variant="warn" title="⚠ Rappel déontologique">Votre mission se limite à la relecture et annotation. Tout mandat contentieux devant le TA de Nantes nécessite un contrat distinct hors plateforme.</Box>
            <div className="bg-panel border border-border rounded-xl overflow-hidden">
              <table className="w-full border-collapse">
                <thead>
                  <tr>
                    {["Réf.", "Client", "Type", "Motif", "Délai client", "Reçu le", "Action"].map((h) => (
                      <th key={h} className="font-syne text-[0.6rem] font-bold tracking-wider uppercase text-muted px-3.5 py-2 text-left border-b border-border whitespace-nowrap">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {[
                    { ref: "0849", name: "KOUASSI Bénédicte", type: "Étudiant", motif: "F", delay: "3j", delayColor: "text-red-2", date: "06/04", urgent: true },
                    { ref: "0847", name: "DIALLO Amina", type: "Étudiant", motif: "F", delay: "6j", delayColor: "text-amber-2", date: "06/04", urgent: false },
                    { ref: "0855", name: "BENALI Fatima", type: "Court séjour", motif: "C", delay: "21j", delayColor: "text-muted-foreground", date: "06/04", urgent: false },
                  ].map((row) => (
                    <tr key={row.ref} onClick={() => setPage(1)} className={`cursor-pointer transition-colors hover:bg-foreground/[0.022] ${row.urgent ? "border-l-2 border-l-red-2" : ""}`}>
                      <td className="px-3.5 py-2.5 text-xs text-muted font-syne border-b border-foreground/[0.03]">{row.ref}</td>
                      <td className="px-3.5 py-2.5 text-xs font-semibold border-b border-foreground/[0.03]">{row.name}</td>
                      <td className="px-3.5 py-2.5 text-xs text-muted-foreground border-b border-foreground/[0.03]">{row.type}</td>
                      <td className="px-3.5 py-2.5 text-xs text-muted-foreground border-b border-foreground/[0.03]">{row.motif}</td>
                      <td className={`px-3.5 py-2.5 text-xs font-syne font-bold border-b border-foreground/[0.03] ${row.delayColor}`}>⚠ {row.delay}</td>
                      <td className="px-3.5 py-2.5 text-xs text-muted-foreground border-b border-foreground/[0.03]">{row.date}</td>
                      <td className="px-3.5 py-2.5 border-b border-foreground/[0.03]">
                        <span className="bg-primary/[0.18] border border-primary-hover/30 text-primary-hover rounded px-2 py-1 font-syne text-[0.6rem] font-bold cursor-pointer hover:bg-primary/30">Relire →</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* A1 — Éditeur */}
        {page === 1 && (
          <div>
            <Eyebrow>IZY-2026-0847 · MVONDO Marie-Claire</Eyebrow>
            <BigTitle>Relecture en cours</BigTitle>
            <Desc>Visa étudiant · Motif F · Délai client : 6 jours · <strong className="text-amber-2">Agir avant le 12 avril</strong></Desc>
            <Box variant="info" title="Pièces jointes (7) · Envoi prévu via MySendingBox après validation">✓ Passeport · ✓ Décision de refus · ✓ Campus France · ✓ Admission · ✓ AVI 8 000€ · ✓ Relevés · ✓ Lettre motivation</Box>

            <div className="grid grid-cols-1 lg:grid-cols-[1fr_300px] gap-4 mt-5">
              {/* Letter panel */}
              <div className="bg-panel border border-border rounded-xl overflow-hidden">
                <div className="bg-background-3 border-b border-border px-3 py-2 flex gap-1.5 flex-wrap">
                  {["Annoter", "Problème", "Suggestion", "Valider ✓"].map((btn) => (
                    <button key={btn} className="bg-panel border border-border-2 rounded-[5px] px-2 py-1 text-[0.7rem] text-muted-foreground cursor-pointer hover:text-foreground hover:border-primary-hover/35 transition-all">{btn}</button>
                  ))}
                </div>
                <div className="p-5 min-h-[320px] text-sm text-muted-foreground leading-relaxed">
                  <div className="text-muted text-xs mb-5">Commission de recours contre les décisions de refus de visa d'entrée en France<br />BP 83609 — 44036 Nantes Cedex 01<br /><br />Yaoundé, le 6 avril 2026</div>
                  <div className="font-semibold text-foreground mb-3">Objet : Recours contre la décision de refus de visa long séjour étudiant n° 2026-YAO-04-1847 notifiée le 15 mars 2026</div>
                  <p className="mb-3">Madame, Monsieur, j'ai l'honneur de former le présent recours contre la décision de refus de visa long séjour mention étudiant notifiée le 15 mars 2026.</p>
                  <p className="mb-3">Cette décision est <span className="bg-amber/[0.12] border-b-2 border-amber-2 rounded-sm cursor-pointer hover:bg-amber/[0.22] transition-colors">entachée d'une erreur manifeste d'appréciation</span> au regard des éléments produits, et méconnaît les dispositions de l'article L211-2 du CESEDA.</p>
                  <p className="mb-3">Je dispose <span className="bg-green/[0.08] border-b-2 border-green-2 rounded-sm">d'attaches personnelles et professionnelles solides au Cameroun</span>, attestées par les pièces jointes au présent recours.</p>
                  <p className="text-muted italic">[Suite — 9 pages · Arguments développés · Inventaire pièces]</p>
                </div>
              </div>

              {/* Annotations panel */}
              <div className="flex flex-col gap-3">
                <div className="font-syne text-[0.65rem] font-bold tracking-wider uppercase text-muted mb-1">Annotations (3)</div>
                <div className="bg-panel border border-border rounded-[10px] p-3 border-l-[3px] border-l-amber-2">
                  <div className="flex justify-between font-syne text-[0.6rem] font-bold uppercase tracking-wider text-amber-2 mb-1.5"><span>⚠ Problème</span><span>P.2</span></div>
                  <div className="text-xs text-muted-foreground leading-relaxed">Ajouter la référence CAA Nantes, 3 déc. 2021, n°21NT02481 pour étayer l'erreur manifeste d'appréciation.</div>
                  <div className="text-[0.7rem] text-primary-hover cursor-pointer font-syne font-semibold mt-2">Appliquer →</div>
                </div>
                <div className="bg-panel border border-border rounded-[10px] p-3 border-l-[3px] border-l-primary-hover">
                  <div className="flex justify-between font-syne text-[0.6rem] font-bold uppercase tracking-wider text-primary-hover mb-1.5"><span>💡 Suggestion</span><span>P.3</span></div>
                  <div className="text-xs text-muted-foreground leading-relaxed">Citer explicitement le contrat CDI (pièce n°6) dans le paragraphe sur les attaches professionnelles.</div>
                  <div className="text-[0.7rem] text-primary-hover cursor-pointer font-syne font-semibold mt-2">Intégrer →</div>
                </div>
                <div className="bg-panel border border-border rounded-[10px] p-3 border-l-[3px] border-l-green-2">
                  <div className="flex justify-between font-syne text-[0.6rem] font-bold uppercase tracking-wider text-green-2 mb-1.5"><span>✓ Validé</span><span>P.1</span></div>
                  <div className="text-xs text-muted-foreground leading-relaxed">En-tête conforme. Adresse CRRV correcte. Références exactes.</div>
                </div>
                <div className="mt-1.5">
                  <textarea className="w-full bg-background-2 border-[1.5px] border-border-2 rounded-[9px] px-3 py-2.5 text-foreground text-xs outline-none focus:border-primary-hover/55 h-[68px] resize-none" placeholder="Ajouter une annotation…" />
                  <div className="flex gap-1.5 mt-1.5">
                    <button className="font-syne font-bold text-[0.68rem] px-3 py-1.5 rounded-[7px] bg-foreground/[0.07] text-muted-foreground border border-border-2">Problème</button>
                    <button className="font-syne font-bold text-[0.68rem] px-3 py-1.5 rounded-[7px] bg-primary-hover text-foreground">Ajouter</button>
                  </div>
                </div>
              </div>
            </div>

            {/* Compliance Report */}
            {recoursResult && (
              <ComplianceReportPanel result={recoursResult} />
            )}

            <Box variant="post" title="📬 Envoi MySendingBox après validation" className="mt-4">Dès votre validation, IZY déclenche automatiquement l'envoi via l'API MySendingBox. Le client est notifié sur WhatsApp avec le numéro de suivi LRAR.</Box>
            <Box variant="warn" title="Checklist avant validation">☐ Adresse CRRV correcte · ☐ Délai 30j respecté · ☐ Arguments avec références · ☐ Inventaire pièces complet · ☐ Signataire qualifié · ☐ Rédigé en français</Box>
            <div className="flex gap-2.5 mt-7 flex-wrap">
              <button
                className="font-syne font-bold text-[0.78rem] px-5 py-2.5 rounded-[7px] bg-primary/[0.18] text-primary-hover border border-primary-hover/30 transition-all disabled:opacity-50"
                disabled={generating}
                onClick={() => generate("demo-dossier-id")}
              >
                {generating ? "⏳ Génération en cours…" : "🔍 Générer & vérifier via OpenLégi"}
              </button>
              <button className="font-syne font-bold text-[0.78rem] px-5 py-2.5 rounded-[7px] bg-destructive/[0.14] text-red-2 border border-destructive/25 transition-all">Retourner (corrections requises)</button>
              <button
                className="font-syne font-bold text-[0.78rem] px-5 py-2.5 rounded-[7px] bg-green/20 text-green-2 border border-green/30 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                disabled={recoursResult ? !recoursResult.can_send : false}
                onClick={() => {
                  if (recoursResult && !recoursResult.can_send) {
                    toast.error("Envoi bloqué — des références non validées par OpenLégi");
                    return;
                  }
                  toast.success("Dossier validé — MySendingBox déclenché automatiquement · Client notifié WhatsApp");
                }}
              >
                ✓ Valider & déclencher envoi MySendingBox
              </button>
            </div>
          </div>
        )}

        {/* A2 — Validés */}
        {page === 2 && (
          <div>
            <Eyebrow>Historique</Eyebrow>
            <BigTitle>Dossiers validés ce mois</BigTitle>
            <div className="bg-panel border border-border rounded-xl overflow-hidden">
              <table className="w-full border-collapse">
                <thead><tr>{["Client", "Type", "Envoi MySendingBox", "LRAR reçu", "Statut", "Honoraires"].map((h) => (<th key={h} className="font-syne text-[0.6rem] font-bold tracking-wider uppercase text-muted px-3.5 py-2 text-left border-b border-border">{h}</th>))}</tr></thead>
                <tbody>
                  {[
                    { name: "ESSOMBA P.", type: "Étudiant", maileva: "ok", date: "08/04", statut: "AR reçu", hon: "45€" },
                    { name: "ATANGANA J.", type: "Conjoint FR", maileva: "ok", date: "07/04", statut: "AR reçu", hon: "45€" },
                    { name: "NKODO I.", type: "Salarié", maileva: "ok", date: "05/04", statut: "Instruction", hon: "45€" },
                  ].map((r) => (
                    <tr key={r.name} className="hover:bg-foreground/[0.022] transition-colors">
                      <td className="px-3.5 py-2.5 text-xs font-semibold border-b border-foreground/[0.03]">{r.name}</td>
                      <td className="px-3.5 py-2.5 text-xs text-muted-foreground border-b border-foreground/[0.03]">{r.type}</td>
                      <td className="px-3.5 py-2.5 border-b border-foreground/[0.03]"><Pill variant="ok">✓ Envoyé</Pill></td>
                      <td className="px-3.5 py-2.5 text-xs text-muted-foreground border-b border-foreground/[0.03]">{r.date}</td>
                      <td className="px-3.5 py-2.5 border-b border-foreground/[0.03]"><Pill variant={r.statut === "Instruction" ? "new" : "ok"}>{r.statut}</Pill></td>
                      <td className="px-3.5 py-2.5 text-xs text-muted-foreground border-b border-foreground/[0.03]">{r.hon}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* A3 — Stats */}
        {page === 3 && (
          <div>
            <Eyebrow>Dashboard</Eyebrow>
            <BigTitle>Mes statistiques — Avril 2026</BigTitle>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-5">
              {[
                { val: "47", label: "Dossiers traités", color: "text-primary-hover", top: "bg-primary-hover" },
                { val: "94%", label: "Satisfaction", color: "text-green-2", top: "bg-green-2" },
                { val: "36h", label: "Délai moyen", color: "text-purple-400", top: "bg-purple-400" },
                { val: "2 115€", label: "Honoraires", color: "text-amber-2", top: "bg-amber-2" },
              ].map((k) => (
                <div key={k.label} className="bg-panel border border-border rounded-[10px] p-3 relative overflow-hidden cursor-pointer hover:border-border-2 hover:-translate-y-px transition-all">
                  <div className={`absolute top-0 left-0 right-0 h-0.5 ${k.top}`} />
                  <div className={`font-syne font-extrabold text-2xl leading-none mb-1 ${k.color}`}>{k.val}</div>
                  <div className="text-[0.7rem] text-muted-foreground">{k.label}</div>
                </div>
              ))}
            </div>
            <Box variant="ok" title="Top 10% des avocats inscrits">Délai moyen (36h) inférieur au seuil contractuel (48h). Vous recevez en priorité les dossiers urgents.</Box>
          </div>
        )}

        {/* A4 — Profil */}
        {page === 4 && (
          <div>
            <Eyebrow>Compte</Eyebrow>
            <BigTitle>Mon profil avocat</BigTitle>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <div className="mb-4"><label className="font-syne text-[0.64rem] font-bold tracking-wider uppercase text-muted-foreground mb-1.5 block">Nom complet</label><input className="w-full bg-background-2 border-[1.5px] border-border-2 rounded-[9px] px-3 py-2.5 text-foreground text-sm outline-none focus:border-primary-hover/55" defaultValue="Me Sylvie Moreau" /></div>
                <div className="mb-4"><label className="font-syne text-[0.64rem] font-bold tracking-wider uppercase text-muted-foreground mb-1.5 block">Barreau</label><input className="w-full bg-background-2 border-[1.5px] border-border-2 rounded-[9px] px-3 py-2.5 text-foreground text-sm outline-none focus:border-primary-hover/55" defaultValue="Paris" /></div>
                <div className="mb-4"><label className="font-syne text-[0.64rem] font-bold tracking-wider uppercase text-muted-foreground mb-1.5 block">N° tableau</label><input className="w-full bg-background-2 border-[1.5px] border-border-2 rounded-[9px] px-3 py-2.5 text-foreground text-sm outline-none focus:border-primary-hover/55" defaultValue="P-2019-4821" /></div>
              </div>
              <div className="bg-panel border border-border rounded-xl p-4">
                <div className="font-syne font-bold text-sm mb-3">Spécialités</div>
                <div className="flex flex-wrap gap-1.5">
                  {["🎓 Étudiant", "💍 Conjoint FR", "🛂 Court séjour"].map((s) => (
                    <span key={s} className="bg-primary-hover/[0.12] border border-primary-hover/[0.22] rounded-[5px] px-2.5 py-1 text-[0.7rem] text-primary-light font-syne font-semibold">{s} ✓</span>
                  ))}
                </div>
                <div className="mt-4"><label className="font-syne text-[0.64rem] font-bold tracking-wider uppercase text-muted-foreground mb-1.5 block">Capacité max (dossiers/semaine)</label><input type="number" className="w-full bg-background-2 border-[1.5px] border-border-2 rounded-[9px] px-3 py-2.5 text-foreground text-sm outline-none focus:border-primary-hover/55" defaultValue={5} /></div>
              </div>
            </div>
            <div className="flex gap-2.5 mt-7">
              <button className="font-syne font-bold text-[0.78rem] px-5 py-2.5 rounded-[7px] bg-primary-hover text-foreground transition-all">Enregistrer</button>
            </div>
          </div>
        )}
      </div>
    </ShellLayout>
  );
};

export default AvocatSpace;
