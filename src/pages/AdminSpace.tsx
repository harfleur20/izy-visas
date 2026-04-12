import { useState } from "react";
import ShellLayout from "@/components/ShellLayout";
import { NavItem, NavGroup } from "@/components/NavItem";
import { Eyebrow, BigTitle, Box, Pill, SectionLabel } from "@/components/ui-custom";
import { toast } from "sonner";
import { AdminCapdemarchesDashboard } from "@/components/AdminCapdemarchesDashboard";
import { AdminReferencesJuridiques } from "@/components/AdminReferencesJuridiques";
import { AdminPiecesRequises } from "@/components/AdminPiecesRequises";

const mTitles = ["Vue générale", "Tous les dossiers", "Alertes & urgences", "Réassignations", "Suivi MySendingBox", "Gestion avocats", "Inscriptions", "Contenu juridique", "Finances", "RGPD & journaux", "CAPDEMARCHES", "Base juridique", "Pièces requises"];

const AdminSpace = () => {
  const [page, setPage] = useState(0);
  const [modalOpen, setModalOpen] = useState(false);
  const [selectedMotif, setSelectedMotif] = useState("Dossier orphelin");
  const [selectedAvocat, setSelectedAvocat] = useState<string | null>(null);

  const openModal = () => setModalOpen(true);
  const closeModal = () => { setModalOpen(false); setSelectedAvocat(null); };

  const doReassign = () => {
    closeModal();
    toast.success("IZY-2026-0849 réassigné à Me Sylvie Moreau · Notification envoyée · Journal mis à jour");
  };

  const sidebar = (
    <>
      <NavGroup label="Dashboard">
        <NavItem icon="📊" label="Vue générale" active={page === 0} onClick={() => setPage(0)} />
      </NavGroup>
      <NavGroup label="Dossiers">
        <NavItem icon="📁" label="Tous les dossiers" active={page === 1} badge={{ text: "127", color: "blue" }} onClick={() => setPage(1)} />
        <NavItem icon="🚨" label="Alertes" active={page === 2} badge={{ text: "5", color: "red" }} onClick={() => setPage(2)} />
        <NavItem icon="🔄" label="Réassignations" active={page === 3} badge={{ text: "2", color: "amber" }} onClick={() => setPage(3)} />
        <NavItem icon="📬" label="Suivi MySendingBox" active={page === 4} onClick={() => setPage(4)} />
        <NavItem icon="📮" label="CAPDEMARCHES" active={page === 10} onClick={() => setPage(10)} />
      </NavGroup>
      <NavGroup label="Avocats">
        <NavItem icon="⚖️" label="Gestion avocats" active={page === 5} onClick={() => setPage(5)} />
        <NavItem icon="📥" label="Inscriptions" active={page === 6} badge={{ text: "3", color: "amber" }} onClick={() => setPage(6)} />
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
      <button className="bg-foreground/[0.06] border border-border-2 rounded-md px-2.5 py-1.5 text-xs text-muted-foreground font-syne font-semibold flex items-center gap-1.5 hover:bg-foreground/10 hover:text-foreground transition-all" onClick={openModal}>🔄 Réassigner</button>
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
                { val: "127", label: "Dossiers actifs", color: "text-primary-hover", top: "bg-primary-hover", delta: "↑ +12 semaine", deltaClass: "text-green-2" },
                { val: "5", label: "Alertes critiques", color: "text-amber-2", top: "bg-amber-2", delta: "↑ +2 depuis hier", deltaClass: "text-red-2" },
                { val: "2", label: "Orphelins", color: "text-red-2", top: "bg-red-2", delta: "Action requise", deltaClass: "text-red-2" },
                { val: "94%", label: "Satisfaction", color: "text-green-2", top: "bg-green-2", delta: "↑ +2%", deltaClass: "text-green-2" },
                { val: "38h", label: "Délai relecture", color: "text-purple-400", top: "bg-purple-400", delta: "↓ Sous 48h", deltaClass: "text-green-2" },
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
              <Box variant="alert" title="Orphelin — IZY-2026-0849" action={<button className="font-syne font-bold text-[0.68rem] px-2.5 py-1 rounded-md bg-destructive/[0.14] text-red-2 border border-destructive/25 flex-shrink-0" onClick={openModal}>Réassigner</button>}>MVONDO B. · <strong className="text-red-2">3 jours</strong> avant forclusion. Aucun avocat assigné.</Box>
                  <Box variant="alert" title="72h dépassé — IZY-2026-0841" action={<button className="font-syne font-bold text-[0.68rem] px-2.5 py-1 rounded-md bg-destructive/[0.14] text-red-2 border border-destructive/25 flex-shrink-0" onClick={openModal}>Réassigner</button>}>ATANGANA T. · Me Bernard · <strong className="text-red-2">5 jours</strong> avant forclusion.</Box>
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
            <BigTitle>Tous les dossiers (127)</BigTitle>
            <div className="bg-panel border border-border rounded-xl overflow-hidden">
              <div className="flex items-center justify-between p-3 border-b border-border">
                <div className="font-syne font-bold text-sm">Dossiers actifs</div>
                <div className="flex gap-1.5">
                  <input className="bg-foreground/[0.05] border border-border-2 rounded-md px-2.5 py-1 text-foreground text-xs outline-none w-40 focus:border-primary-hover/45 focus:w-52 transition-all" placeholder="🔍 Rechercher…" />
                  <button className="font-syne font-bold text-[0.7rem] px-3 py-1 rounded-md bg-foreground/[0.07] text-muted-foreground border border-border-2">Export CSV</button>
                </div>
              </div>
              <div className="flex gap-1.5 p-2 border-b border-border flex-wrap bg-foreground/[0.015]">
                {["Tous (127)", "🔴 Orphelins (2)", "Assignés (48)", "En relecture (31)", "Validés (28)", "Envoyés MySendingBox (18)"].map((f, i) => (
                  <span key={f} className={`font-syne text-[0.64rem] font-bold px-2.5 py-1 rounded-full border cursor-pointer transition-all ${i === 0 ? "bg-primary/[0.18] border-primary-hover text-primary-hover" : "border-border-2 text-muted-foreground hover:border-foreground/20 hover:text-foreground"}`}>{f}</span>
                ))}
              </div>
              <div className="overflow-x-auto">
                <table className="w-full border-collapse">
                  <thead><tr>{["Réf.", "Client", "Type", "Motif", "Délai", "Avocat", "Statut", "MSB", "Actions"].map((h) => (<th key={h} className="font-syne text-[0.6rem] font-bold tracking-wider uppercase text-muted px-3.5 py-2 text-left border-b border-border whitespace-nowrap">{h}</th>))}</tr></thead>
                  <tbody>
                    {[
                      { ref: "0849", name: "MVONDO Bénédicte", type: "Étudiant", motif: "F", delay: "⚠ 3j", delayColor: "text-red-2", avocat: <Pill variant="red">⚡ Orphelin</Pill>, statut: <Pill variant="red">Urgent</Pill>, maileva: "—", urgent: true },
                      { ref: "0841", name: "ATANGANA Thierno", type: "Travail", motif: "C", delay: "⚠ 5j", delayColor: "text-red-2", avocat: "Me Bernard R.", statut: <Pill variant="warn">72h dépassé</Pill>, maileva: "—", urgent: true },
                      { ref: "0851", name: "MBARGA Mamadou", type: "Conjoint FR", motif: "J", delay: "7j", delayColor: "text-amber-2", avocat: "Me Moreau S.", statut: <Pill variant="new">En attente</Pill>, maileva: "—", urgent: false },
                      { ref: "0847", name: "ESSOMBA Amina", type: "Étudiant", motif: "F", delay: "14j", delayColor: "text-muted-foreground", avocat: "Me Moreau S.", statut: <Pill variant="ok">Validé</Pill>, maileva: <Pill variant="post">📬 Livré</Pill>, urgent: false },
                      { ref: "0855", name: "NKODO Fatima", type: "Court séjour", motif: "C", delay: "21j", delayColor: "text-muted-foreground", avocat: "Me Laurent P.", statut: <Pill variant="new">En relecture</Pill>, maileva: <Pill variant="muted">En attente</Pill>, urgent: false },
                    ].map((r) => (
                      <tr key={r.ref} className={`cursor-pointer transition-colors hover:bg-foreground/[0.022] ${r.urgent ? "border-l-2 border-l-red-2" : ""}`}>
                        <td className="px-3.5 py-2.5 text-xs font-syne text-muted border-b border-foreground/[0.03]">{r.ref}</td>
                        <td className="px-3.5 py-2.5 text-xs font-semibold border-b border-foreground/[0.03]">{r.name}</td>
                        <td className="px-3.5 py-2.5 text-xs text-muted-foreground border-b border-foreground/[0.03]">{r.type}</td>
                        <td className="px-3.5 py-2.5 text-xs text-muted-foreground border-b border-foreground/[0.03]">{r.motif}</td>
                        <td className={`px-3.5 py-2.5 text-xs font-syne font-bold border-b border-foreground/[0.03] ${r.delayColor}`}>{r.delay}</td>
                        <td className="px-3.5 py-2.5 text-xs text-muted-foreground border-b border-foreground/[0.03]">{r.avocat}</td>
                        <td className="px-3.5 py-2.5 border-b border-foreground/[0.03]">{r.statut}</td>
                        <td className="px-3.5 py-2.5 border-b border-foreground/[0.03]">{r.maileva}</td>
                        <td className="px-3.5 py-2.5 border-b border-foreground/[0.03]">
                          <span className="bg-primary/[0.18] border border-primary-hover/30 text-primary-hover rounded px-2 py-1 font-syne text-[0.6rem] font-bold cursor-pointer hover:bg-primary/30" onClick={openModal}>Réassigner</span>
                        </td>
                      </tr>
                    ))}
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
            <BigTitle>Alertes & urgences (5)</BigTitle>
            <Box variant="alert" title="🔴 Dossier orphelin — IZY-2026-0849 · MVONDO Bénédicte" action={<button className="font-syne font-bold text-[0.78rem] px-4 py-2 rounded-[7px] bg-destructive/[0.14] text-red-2 border border-destructive/25 flex-shrink-0" onClick={openModal}>Réassigner maintenant</button>}>Aucun avocat assigné. Délai : <strong className="text-red-2">3 jours</strong>. Visa étudiant · Motif F.</Box>
            <Box variant="alert" title="🔴 72h sans réponse — IZY-2026-0841 · ATANGANA Thierno" action={<button className="font-syne font-bold text-[0.78rem] px-4 py-2 rounded-[7px] bg-destructive/[0.14] text-red-2 border border-destructive/25 flex-shrink-0" onClick={openModal}>Réassigner</button>}>Me Bernard R. n'a fourni aucun retour. Client : <strong className="text-red-2">5 jours</strong> avant forclusion.</Box>
            <Box variant="warn" title="🟡 Délai client proche — IZY-2026-0851">MBARGA M. · Me Moreau · 7 jours restants. Relecture en attente depuis 36h.</Box>
            <Box variant="warn" title="🟡 Capacité atteinte — Me Laurent P.">5/5 dossiers. 2 nouveaux dossiers ne peuvent être assignés automatiquement.</Box>
            <Box variant="info" title="🔵 3 candidatures avocat en attente">Me Alain Ndjock, Me Patricia Renard, Me Omar Biya — Vérification barreau + RCP requise.</Box>
          </div>
        )}

        {/* M3 — Réassignations */}
        {page === 3 && (
          <div>
            <Eyebrow>Réassignations</Eyebrow>
            <BigTitle>Journal des réassignations</BigTitle>
            <Box variant="info" title="Traçabilité immuable">Chaque réassignation est journalisée : admin, horodatage, motif, avocat retiré, nouvel avocat. Non modifiable.</Box>
            <div className="bg-panel border border-border rounded-xl overflow-hidden">
              <table className="w-full border-collapse">
                <thead><tr>{["Date", "Dossier", "Client", "Avocat retiré", "Nouvel avocat", "Motif", "Admin"].map((h) => (<th key={h} className="font-syne text-[0.6rem] font-bold tracking-wider uppercase text-muted px-3.5 py-2 text-left border-b border-border">{h}</th>))}</tr></thead>
                <tbody>
                  {[
                    { date: "06/04 08:55", ref: "0839", client: "NKODO A.", from: "Me Bernard R.", to: "Me Moreau S.", motif: "Indisponibilité", admin: "Admin IZY" },
                    { date: "05/04 14:20", ref: "0822", client: "ESSOMBA M.", from: "Me Petit J.", to: "Me Laurent P.", motif: "72h sans réponse", admin: "Admin IZY" },
                    { date: "03/04 09:10", ref: "0801", client: "MVONDO S.", from: "—", to: "Me Moreau S.", motif: "Dossier orphelin", admin: "Admin IZY" },
                  ].map((r) => (
                    <tr key={r.ref} className="hover:bg-foreground/[0.022] transition-colors">
                      <td className="px-3.5 py-2.5 text-xs text-muted-foreground border-b border-foreground/[0.03]">{r.date}</td>
                      <td className="px-3.5 py-2.5 text-xs font-syne text-muted border-b border-foreground/[0.03]">{r.ref}</td>
                      <td className="px-3.5 py-2.5 text-xs font-semibold border-b border-foreground/[0.03]">{r.client}</td>
                      <td className="px-3.5 py-2.5 text-xs text-muted-foreground border-b border-foreground/[0.03]">{r.from}</td>
                      <td className="px-3.5 py-2.5 text-xs text-green-2 border-b border-foreground/[0.03]">{r.to}</td>
                      <td className="px-3.5 py-2.5 text-xs text-muted-foreground border-b border-foreground/[0.03]">{r.motif}</td>
                      <td className="px-3.5 py-2.5 text-xs text-muted-foreground border-b border-foreground/[0.03]">{r.admin}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="flex gap-2.5 mt-7">
              <button className="font-syne font-bold text-[0.78rem] px-5 py-2.5 rounded-[7px] bg-primary-hover text-foreground transition-all" onClick={openModal}>+ Nouvelle réassignation</button>
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
            <BigTitle>Avocats inscrits (14 actifs)</BigTitle>
            {[
              { initials: "SM", name: "Me Sylvie Moreau", barreau: "Paris · P-2019-4821", info: "47 dossiers · ⭐ 94% · 3/5 dossiers/sem", gradient: "from-primary-hover to-purple-600", warn: false },
              { initials: "PL", name: "Me Pierre Laurent", barreau: "Lyon · L-2015-2204", info: "89 dossiers · ⭐ 91% · 5/5 🔴", gradient: "from-green to-[#0A5040]", warn: false },
              { initials: "BR", name: "Me Bernard Renaud", barreau: "Bordeaux · B-2010-1188", info: "34 dossiers · ⭐ 78% ⚠ · 72h sans réponse", gradient: "from-amber to-[#8B5010]", warn: true },
            ].map((av) => (
              <div key={av.initials} className={`bg-panel border rounded-xl p-4 flex items-center gap-3 mb-2.5 ${av.warn ? "border-destructive/20" : "border-border"}`}>
                <div className={`w-10 h-10 rounded-lg bg-gradient-to-br ${av.gradient} flex items-center justify-center font-syne font-extrabold text-sm flex-shrink-0`}>{av.initials}</div>
                <div className="flex-1">
                  <div className="font-semibold text-sm mb-0.5">{av.name} · {av.barreau}</div>
                  <div className="text-xs text-muted-foreground">{av.info}</div>
                </div>
                <div className="flex gap-2 items-center flex-shrink-0">
                  <div className="w-8 h-[17px] rounded-[9px] bg-green/35 border border-green-2 relative cursor-pointer">
                    <div className="absolute top-[2px] left-[15px] w-[11px] h-[11px] rounded-full bg-green-2 transition-all" />
                  </div>
                  <button className="font-syne font-bold text-[0.7rem] px-3 py-1 rounded-[7px] bg-foreground/[0.07] text-muted-foreground border border-border-2">Profil</button>
                  <button className="font-syne font-bold text-[0.7rem] px-3 py-1 rounded-[7px] bg-destructive/[0.14] text-red-2 border border-destructive/25">Suspendre</button>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* M6 — Inscriptions */}
        {page === 6 && (
          <div>
            <Eyebrow>Inscriptions</Eyebrow>
            <BigTitle>Candidatures en attente (3)</BigTitle>
            <div className="bg-panel border border-border rounded-xl overflow-hidden">
              <table className="w-full border-collapse">
                <thead><tr>{["Candidat", "Barreau", "N° tableau", "Tableau", "RCP", "Décision"].map((h) => (<th key={h} className="font-syne text-[0.6rem] font-bold tracking-wider uppercase text-muted px-3.5 py-2 text-left border-b border-border">{h}</th>))}</tr></thead>
                <tbody>
                  {[
                    { name: "Me Alain Ndjock", bar: "Paris", tab: "P-2022-6841", tabOk: true, rcp: false },
                    { name: "Me Patricia Renard", bar: "Créteil", tab: "C-2018-3302", tabOk: true, rcp: true },
                    { name: "Me Omar Biya", bar: "Marseille", tab: "M-2020-5512", tabOk: false, rcp: false },
                  ].map((r) => (
                    <tr key={r.name} className="hover:bg-foreground/[0.022] transition-colors">
                      <td className="px-3.5 py-2.5 text-xs font-semibold border-b border-foreground/[0.03]">{r.name}</td>
                      <td className="px-3.5 py-2.5 text-xs text-muted-foreground border-b border-foreground/[0.03]">{r.bar}</td>
                      <td className="px-3.5 py-2.5 text-xs text-muted-foreground border-b border-foreground/[0.03]">{r.tab}</td>
                      <td className="px-3.5 py-2.5 border-b border-foreground/[0.03]"><Pill variant={r.tabOk ? "ok" : "red"}>{r.tabOk ? "✓" : "✗"}</Pill></td>
                      <td className="px-3.5 py-2.5 border-b border-foreground/[0.03]"><Pill variant={r.rcp ? "ok" : "red"}>{r.rcp ? "✓" : "✗"}</Pill></td>
                      <td className="px-3.5 py-2.5 border-b border-foreground/[0.03]">
                        <div className="flex gap-1.5">
                          {r.tabOk && r.rcp && <span className="bg-primary/[0.18] border border-primary-hover/30 text-primary-hover rounded px-2 py-1 font-syne text-[0.6rem] font-bold cursor-pointer">Activer</span>}
                          <span className="bg-destructive/[0.12] border border-destructive/24 text-red-2 rounded px-2 py-1 font-syne text-[0.6rem] font-bold cursor-pointer">Refuser</span>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
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
                { key: "Données paiement (Stripe)", val: "Jamais stockées sur IZY · PCI-DSS Level 1", valClass: "text-green-2" },
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
      {modalOpen && (
        <div className="fixed inset-0 bg-black/75 z-[8000] flex items-center justify-center p-4 backdrop-blur-sm" onClick={(e) => e.target === e.currentTarget && closeModal()}>
          <div className="bg-background-2 border border-border-2 rounded-2xl w-full max-w-[700px] max-h-[88vh] overflow-hidden flex flex-col shadow-[0_24px_80px_rgba(0,0,0,0.7)] animate-mIn">
            {/* Header */}
            <div className="p-5 border-b border-border flex items-start justify-between gap-4 flex-shrink-0">
              <div>
                <div className="font-syne font-extrabold text-base mb-1">🔄 Réassignation d'avocat</div>
                <div className="text-xs text-muted-foreground">IZY-2026-0849 · MVONDO Bénédicte · Visa étudiant · Motif F</div>
              </div>
              <div className="w-[26px] h-[26px] rounded-md bg-foreground/[0.07] border border-border cursor-pointer flex items-center justify-center text-sm text-muted-foreground hover:bg-foreground/[0.13] hover:text-foreground transition-all flex-shrink-0" onClick={closeModal}>✕</div>
            </div>

            {/* Body */}
            <div className="flex-1 overflow-y-auto p-5">
              {/* Detail strip */}
              <div className="bg-background-3 border border-border-2 rounded-[9px] p-3 grid grid-cols-4 gap-3 mb-4">
                {[
                  { label: "Client", val: "MVONDO Bénédicte" },
                  { label: "Type", val: "Visa étudiant" },
                  { label: "Motif", val: "F" },
                  { label: "Délai restant", val: "⚠ 3 jours", valClass: "text-red-2" },
                ].map((d) => (
                  <div key={d.label}>
                    <div className="font-syne text-[0.58rem] font-bold tracking-wider uppercase text-muted mb-1">{d.label}</div>
                    <div className={`text-sm font-medium ${d.valClass || ""}`}>{d.val}</div>
                  </div>
                ))}
              </div>

              {/* Current avocat */}
              <div className="bg-amber/[0.07] border border-amber/20 rounded-[9px] p-3 flex items-center gap-3 mb-4">
                <div className="w-[38px] h-[38px] rounded-[7px] bg-gradient-to-br from-destructive to-[#8B1010] flex items-center justify-center font-syne font-extrabold text-sm flex-shrink-0">?</div>
                <div className="flex-1">
                  <div className="font-semibold text-sm mb-0.5">Aucun avocat assigné</div>
                  <div className="text-xs text-muted-foreground">Dossier orphelin — Assignation automatique impossible</div>
                </div>
                <div className="font-syne text-[0.62rem] font-bold px-2 py-0.5 rounded bg-amber/[0.18] text-amber-2 border border-amber/30">ORPHELIN</div>
              </div>

              <SectionLabel>Motif de la réassignation</SectionLabel>
              <div className="flex gap-1.5 flex-wrap mb-3">
                {["Dossier orphelin", "72h sans réponse", "Indisponibilité", "Conflit d'intérêts", "Qualité insuffisante", "Autre"].map((m) => (
                  <span key={m} onClick={() => setSelectedMotif(m)} className={`text-[0.7rem] font-syne font-semibold px-3 py-1 rounded-md border cursor-pointer transition-all ${selectedMotif === m ? "bg-destructive/[0.14] border-red-2 text-red-2" : "border-border-2 text-muted-foreground hover:text-foreground"}`}>{m}</span>
                ))}
              </div>
              <textarea className="w-full bg-background-2 border-[1.5px] border-border-2 rounded-[9px] px-3 py-2.5 text-foreground text-xs outline-none h-[60px] resize-none mb-4 focus:border-primary-hover/55" placeholder="Précisez le motif (obligatoire pour traçabilité)…" />

              <SectionLabel>Sélectionner le nouvel avocat</SectionLabel>
              <div className="flex flex-col gap-2">
                {[
                  { id: "sm", initials: "SM", name: "Me Sylvie Moreau", info: "Paris · 3/5 dossiers · Étudiant ✓ · Conjoint FR ✓", satisf: "94%", delay: "36h", gradient: "from-primary-hover to-purple-600", available: true },
                  { id: "pl", initials: "PL", name: "Me Pierre Laurent", info: "Lyon · 5/5 🔴 · Capacité atteinte", satisf: "91%", delay: "", gradient: "from-green to-[#0A5040]", available: false },
                  { id: "pr", initials: "PR", name: "Me Patricia Renard", info: "Créteil · 1/5 dossiers · Étudiant ✓", satisf: "88%", delay: "41h", gradient: "from-[#0E8FA0] to-[#065868]", available: true },
                ].map((av) => (
                  <div
                    key={av.id}
                    onClick={() => av.available && setSelectedAvocat(av.id)}
                    className={`bg-background-3 border-[1.5px] rounded-[9px] p-3 flex items-center gap-3 transition-all ${!av.available ? "opacity-40 cursor-not-allowed" : "cursor-pointer hover:border-border-2"} ${selectedAvocat === av.id ? "border-primary-hover bg-primary/10" : "border-border"}`}
                  >
                    <div className={`w-[17px] h-[17px] rounded-full border-[1.5px] flex items-center justify-center text-[0.58rem] transition-all ${selectedAvocat === av.id ? "bg-primary-hover border-primary-hover text-foreground" : "border-border-2"}`}>
                      {selectedAvocat === av.id ? "✓" : ""}
                    </div>
                    <div className={`w-[34px] h-[34px] rounded-[7px] bg-gradient-to-br ${av.gradient} flex items-center justify-center font-syne font-extrabold text-xs flex-shrink-0`}>{av.initials}</div>
                    <div className="flex-1">
                      <div className="font-semibold text-sm mb-0.5">{av.name}</div>
                      <div className="text-xs text-muted-foreground">{av.info}</div>
                    </div>
                    <div className="flex gap-2 items-center flex-shrink-0">
                      <div className="text-center"><div className="font-syne font-extrabold text-sm text-green-2">{av.satisf}</div><div className="text-[0.6rem] text-muted block">Satisf.</div></div>
                      {av.delay && (
                        <>
                          <div className="w-px h-[22px] bg-border flex-shrink-0" />
                          <div className="text-center"><div className="font-syne font-extrabold text-sm">{av.delay}</div><div className="text-[0.6rem] text-muted block">Délai</div></div>
                        </>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Footer */}
            <div className="p-4 border-t border-border flex gap-2.5 items-center bg-foreground/[0.02] flex-shrink-0">
              <div className="flex-1 text-xs text-muted-foreground">La réassignation sera journalisée. L'avocat retiré sera notifié. Le nouvel avocat reçoit le dossier immédiatement.</div>
              <button className="font-syne font-bold text-[0.78rem] px-4 py-2 rounded-[7px] bg-foreground/[0.07] text-muted-foreground border border-border-2 transition-all" onClick={closeModal}>Annuler</button>
              <button className="font-syne font-bold text-[0.78rem] px-4 py-2 rounded-[7px] bg-primary-hover text-foreground transition-all disabled:opacity-35 disabled:cursor-not-allowed" disabled={!selectedAvocat} onClick={doReassign}>Confirmer la réassignation</button>
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
