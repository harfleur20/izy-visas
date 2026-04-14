import { useEffect, useMemo, useState } from "react";
import ShellLayout from "@/components/ShellLayout";
import { NavItem, NavGroup } from "@/components/NavItem";
import { AdminReferencesJuridiques } from "@/components/AdminReferencesJuridiques";
import { AdminPiecesRequises } from "@/components/AdminPiecesRequises";
import { TopbarProfileBadge } from "@/components/TopbarProfileBadge";
import { BigTitle, Box, Eyebrow, Pill, SectionLabel } from "@/components/ui-custom";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";
import { toast } from "sonner";

type RefJuridique = Database["public"]["Tables"]["references_juridiques"]["Row"];
type PieceRequise = Database["public"]["Tables"]["pieces_requises"]["Row"];
type AuditLogRow = Database["public"]["Tables"]["audit_admin"]["Row"];

const MOTIFS = ["A", "B", "C", "D", "E", "F", "G", "H", "I", "J", "K", "L"];
const VERIFY_AFTER_DAYS = 180;
const topbarTitles = [
  "Pilotage juridique",
  "Références juridiques",
  "Pièces requises",
  "À vérifier",
  "Journal juridique",
];

const formatDate = (value: string | null) => {
  if (!value) return "Jamais";
  return new Date(value).toLocaleDateString("fr-FR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
};

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

const getJsonObject = (value: AuditLogRow["details"]) => (
  value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {}
);

const getAuditLabel = (log: AuditLogRow) => {
  const details = getJsonObject(log.details);
  const label = details.label;
  return typeof label === "string" && label.trim() ? label : log.cible_id || "Entrée juridique";
};

const getChangedFields = (log: AuditLogRow) => {
  const details = getJsonObject(log.details);
  const fields = details.changed_fields;
  return Array.isArray(fields) ? fields.filter((field): field is string => typeof field === "string") : [];
};

const getActionLabel = (actionType: string) => {
  if (actionType.endsWith("_insert")) return "Création";
  if (actionType.endsWith("_update")) return "Modification";
  if (actionType.endsWith("_delete")) return "Suppression";
  return actionType.replace(/^juridique_/, "");
};

const isReferenceStale = (ref: RefJuridique) => {
  if (!ref.actif) return false;
  if (!ref.date_verification) return true;
  const verifiedAt = new Date(ref.date_verification).getTime();
  const staleAt = Date.now() - VERIFY_AFTER_DAYS * 24 * 60 * 60 * 1000;
  return verifiedAt < staleAt;
};

const StatCard = ({ label, value, tone = "info" }: { label: string; value: number | string; tone?: "info" | "ok" | "warn" | "muted" }) => {
  const toneClasses = {
    info: "text-primary-hover bg-primary-hover",
    ok: "text-green-2 bg-green-2",
    warn: "text-amber-2 bg-amber-2",
    muted: "text-muted-foreground bg-muted-foreground",
  };

  const [textClass, barClass] = toneClasses[tone].split(" ");

  return (
    <div className="bg-panel border border-border rounded-lg p-4 relative overflow-hidden">
      <div className={`absolute top-0 left-0 right-0 h-0.5 ${barClass}`} />
      <div className={`font-syne font-extrabold text-3xl leading-none mb-1 ${textClass}`}>{value}</div>
      <div className="text-[0.72rem] text-muted-foreground">{label}</div>
    </div>
  );
};

const AdminJuridiqueSpace = () => {
  const [page, setPage] = useState(0);
  const [refs, setRefs] = useState<RefJuridique[]>([]);
  const [pieces, setPieces] = useState<PieceRequise[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditLogRow[]>([]);
  const [loading, setLoading] = useState(false);

  const fetchOverview = async () => {
    setLoading(true);
    try {
      const [refsResult, piecesResult, auditResult] = await Promise.all([
        supabase
          .from("references_juridiques")
          .select("*")
          .order("created_at", { ascending: false }),
        supabase
          .from("pieces_requises")
          .select("*")
          .order("ordre_affichage", { ascending: true }),
        supabase
          .from("audit_admin")
          .select("*")
          .like("action_type", "juridique_%")
          .order("created_at", { ascending: false })
          .limit(50),
      ]);

      if (refsResult.error) throw refsResult.error;
      if (piecesResult.error) throw piecesResult.error;
      if (auditResult.error) throw auditResult.error;

      setRefs(refsResult.data || []);
      setPieces(piecesResult.data || []);
      setAuditLogs(auditResult.data || []);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Chargement de l'espace juridique impossible");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void fetchOverview();
  }, []);

  const activeRefs = useMemo(() => refs.filter((ref) => ref.actif), [refs]);
  const activePieces = useMemo(() => pieces.filter((piece) => piece.actif), [pieces]);

  const refsToVerify = useMemo(() => {
    return refs
      .filter((ref) => isReferenceStale(ref) || (ref.actif && !ref.source_url))
      .sort((a, b) => {
        const aTime = a.date_verification ? new Date(a.date_verification).getTime() : 0;
        const bTime = b.date_verification ? new Date(b.date_verification).getTime() : 0;
        return aTime - bTime;
      });
  }, [refs]);

  const underCoveredMotifs = useMemo(() => {
    return MOTIFS.filter((motif) => {
      const count = activeRefs.filter((ref) => ref.motifs_concernes?.includes(motif)).length;
      return count < 3;
    });
  }, [activeRefs]);

  const recentActionsCount = useMemo(() => {
    const since = Date.now() - 7 * 24 * 60 * 60 * 1000;
    return auditLogs.filter((log) => new Date(log.created_at).getTime() >= since).length;
  }, [auditLogs]);

  const sidebar = (
    <>
      <NavGroup label="Pilotage">
        <NavItem icon="📊" label="Vue générale" active={page === 0} onClick={() => setPage(0)} />
        <NavItem icon="🔎" label="À vérifier" active={page === 3} onClick={() => setPage(3)} />
        <NavItem icon="🧾" label="Journal juridique" active={page === 4} onClick={() => setPage(4)} />
      </NavGroup>
      <NavGroup label="Base juridique">
        <NavItem icon="⚖️" label="Références juridiques" active={page === 1} onClick={() => setPage(1)} />
        <NavItem icon="📎" label="Pièces requises" active={page === 2} onClick={() => setPage(2)} />
      </NavGroup>
    </>
  );

  const renderDashboard = () => (
    <div>
      <Eyebrow>Espace juridique</Eyebrow>
      <BigTitle>Pilotage de la base juridique</BigTitle>

      <Box variant="info" title="Mission">
        Maintenir les références, les pièces exigées et la qualité juridique des dossiers avant leur traitement opérationnel.
      </Box>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-5">
        <StatCard label="Références actives" value={activeRefs.length} />
        <StatCard label="Références à vérifier" value={refsToVerify.length} tone={refsToVerify.length ? "warn" : "ok"} />
        <StatCard label="Pièces actives" value={activePieces.length} tone="ok" />
        <StatCard label="Actions sur 7 jours" value={recentActionsCount} tone="muted" />
      </div>

      <div className="grid lg:grid-cols-[1.2fr_0.8fr] gap-4">
        <div className="bg-panel border border-border rounded-lg p-4">
          <SectionLabel>Priorités</SectionLabel>
          {refsToVerify.length === 0 && underCoveredMotifs.length === 0 ? (
            <div className="text-sm text-muted-foreground">Aucune priorité juridique détectée.</div>
          ) : (
            <div className="space-y-3">
              {refsToVerify.slice(0, 5).map((ref) => (
                <div key={ref.id} className="flex items-start justify-between gap-3 border border-border rounded-lg p-3">
                  <div>
                    <div className="font-syne font-bold text-sm text-foreground">{ref.intitule_court}</div>
                    <div className="text-xs text-muted-foreground mt-1">
                      Vérifiée le {formatDate(ref.date_verification)} · {ref.source_url ? "Source renseignée" : "Source manquante"}
                    </div>
                  </div>
                  <Pill variant="warn">À vérifier</Pill>
                </div>
              ))}

              {underCoveredMotifs.length > 0 && (
                <div className="border border-gold-2/25 bg-gold/[0.08] rounded-lg p-3">
                  <div className="font-syne font-bold text-sm text-gold-2 mb-1">Motifs sous-couverts</div>
                  <div className="text-xs text-gold leading-relaxed">
                    Ajouter des références pour les motifs {underCoveredMotifs.join(", ")}.
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        <div className="bg-panel border border-border rounded-lg p-4">
          <SectionLabel>Dernières actions</SectionLabel>
          {auditLogs.length === 0 ? (
            <div className="text-sm text-muted-foreground">Le journal juridique est vide.</div>
          ) : (
            <div className="space-y-3">
              {auditLogs.slice(0, 6).map((log) => (
                <div key={log.id} className="border-b border-border last:border-0 pb-3 last:pb-0">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-syne text-xs font-bold text-foreground">{getActionLabel(log.action_type)}</span>
                    <span className="text-[0.68rem] text-muted-foreground">{formatDateTime(log.created_at)}</span>
                  </div>
                  <div className="text-xs text-muted-foreground mt-1">{getAuditLabel(log)}</div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );

  const renderVerification = () => (
    <div>
      <Eyebrow>Qualité</Eyebrow>
      <BigTitle>Références à vérifier</BigTitle>

      <Box variant={refsToVerify.length ? "warn" : "ok"} title="Règle de vérification">
        Une référence active doit être revue au moins tous les {VERIFY_AFTER_DAYS} jours et conserver une source exploitable.
      </Box>

      <div className="bg-panel border border-border rounded-lg overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Référence</TableHead>
              <TableHead>Catégorie</TableHead>
              <TableHead>Dernière vérification</TableHead>
              <TableHead>Source</TableHead>
              <TableHead className="text-right">Action</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {refsToVerify.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="text-center text-muted-foreground py-8">
                  Aucune référence à vérifier.
                </TableCell>
              </TableRow>
            ) : (
              refsToVerify.map((ref) => (
                <TableRow key={ref.id}>
                  <TableCell>
                    <div className="font-syne font-bold text-sm">{ref.intitule_court}</div>
                    <div className="text-xs text-muted-foreground">{ref.reference_complete}</div>
                  </TableCell>
                  <TableCell>{ref.categorie}</TableCell>
                  <TableCell>{formatDate(ref.date_verification)}</TableCell>
                  <TableCell>
                    {ref.source_url ? (
                      <a className="text-primary-hover underline-offset-2 hover:underline" href={ref.source_url} target="_blank" rel="noreferrer">
                        Ouvrir
                      </a>
                    ) : (
                      <Pill variant="warn">Manquante</Pill>
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    <Button size="sm" variant="outline" onClick={() => setPage(1)}>
                      Modifier
                    </Button>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );

  const renderAudit = () => (
    <div>
      <Eyebrow>Traçabilité</Eyebrow>
      <BigTitle>Journal juridique</BigTitle>

      <div className="bg-panel border border-border rounded-lg overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Date</TableHead>
              <TableHead>Action</TableHead>
              <TableHead>Élément</TableHead>
              <TableHead>Champs modifiés</TableHead>
              <TableHead>Rôle</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {auditLogs.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="text-center text-muted-foreground py-8">
                  Aucune action juridique journalisée.
                </TableCell>
              </TableRow>
            ) : (
              auditLogs.map((log) => {
                const changedFields = getChangedFields(log);
                return (
                  <TableRow key={log.id}>
                    <TableCell>{formatDateTime(log.created_at)}</TableCell>
                    <TableCell>{getActionLabel(log.action_type)}</TableCell>
                    <TableCell>{getAuditLabel(log)}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {changedFields.length ? changedFields.join(", ") : "—"}
                    </TableCell>
                    <TableCell>
                      <Pill variant={log.admin_role === "super_admin" ? "new" : "muted"}>{log.admin_role}</Pill>
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );

  return (
    <ShellLayout
      role="admin"
      roleLabel="Admin Juridique"
      sidebar={sidebar}
      topbarTitle={topbarTitles[page]}
      topbarRight={
        <div className="flex items-center gap-2">
          <Button size="sm" variant="outline" onClick={() => void fetchOverview()} disabled={loading}>
            {loading ? "..." : "Actualiser"}
          </Button>
          <TopbarProfileBadge fallback="Admin juridique" />
        </div>
      }
      footerContent={<><strong className="text-muted-foreground">Admin Juridique IZY</strong></>}
    >
      <div className="animate-fadeU">
        {page === 0 && renderDashboard()}
        {page === 1 && <AdminReferencesJuridiques />}
        {page === 2 && <AdminPiecesRequises />}
        {page === 3 && renderVerification()}
        {page === 4 && renderAudit()}
      </div>
    </ShellLayout>
  );
};

export default AdminJuridiqueSpace;
