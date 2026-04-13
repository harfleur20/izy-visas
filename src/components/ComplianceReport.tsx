import { Pill } from "@/components/ui-custom";

export interface ReferenceStatus {
  texte_reference: string;
  statut: "verifie_openlegi" | "non_trouve_openlegi" | "a_verifier_avocat";
  url: string;
  details: string;
}

interface BlocStatus {
  bloc: number;
  name: string;
  status: "OK" | "MISSING" | "INCOMPLETE" | string;
}

export interface GenerationResult {
  letter: string;
  bloc_report: BlocStatus[];
  references_status: ReferenceStatus[];
  can_send: boolean;
  has_red_blocs: boolean;
  has_incomplete_blocs?: boolean;
  has_non_trouve_refs: boolean;
  has_a_verifier_refs: boolean;
  openlegi_available?: boolean;
  openlegi_fetch_timestamp?: string;
  blocking_reason?: string;
  modele_ia?: string;
  provider_ia?: string;
  generation_label?: string;
  _restored?: boolean;
}

interface ComplianceReportPanelProps {
  result: GenerationResult | null;
}

export const ComplianceReportPanel = ({ result }: ComplianceReportPanelProps) => {
  if (!result) return null;

  const {
    bloc_report, references_status, can_send, has_a_verifier_refs,
    openlegi_available, openlegi_fetch_timestamp, blocking_reason,
  } = result;

  const conformBlocs = bloc_report?.filter((b) => b.status === "OK") || [];
  const warnBlocs = bloc_report?.filter((b) => b.status === "INCOMPLETE") || [];
  const redBlocs = bloc_report?.filter((b) => b.status === "MISSING") || [];

  const verifiedRefs = references_status?.filter((r) => r.statut === "verifie_openlegi") || [];
  const notFoundRefs = references_status?.filter((r) => r.statut === "non_trouve_openlegi") || [];
  const lawyerRefs = references_status?.filter((r) => r.statut === "a_verifier_avocat") || [];

  const verificationDate = openlegi_fetch_timestamp
    ? new Date(openlegi_fetch_timestamp).toLocaleString("fr-FR", {
        day: "2-digit", month: "2-digit", year: "numeric",
        hour: "2-digit", minute: "2-digit",
      })
    : null;

  return (
    <div className="bg-panel border border-border rounded-xl p-4 mt-4">
      <div className="font-syne text-[0.65rem] font-bold tracking-wider uppercase text-muted mb-3">
        Rapport de conformité — 12 blocs
      </div>

      {/* Restored from DB — simplified view */}
      {result._restored ? (
        <div className="rounded-[9px] p-3 mb-4 border bg-primary/[0.09] border-primary-hover/25">
          <div className="font-syne text-[0.78rem] font-bold text-primary-hover">
            ℹ️ Lettre restaurée depuis votre dossier
          </div>
          <div className="text-[0.75rem] mt-1 text-muted-foreground">
            Le rapport de conformité détaillé n'est disponible qu'après une génération fraîche. Cliquez « Régénérer » pour obtenir le rapport complet.
          </div>
        </div>
      ) : (
        <>
          {/* Global summary */}
          <div className={`rounded-[9px] p-3 mb-4 border ${can_send ? "bg-green/[0.09] border-green-2/25" : "bg-destructive/[0.09] border-destructive/[0.28]"}`}>
            <div className={`font-syne text-[0.78rem] font-bold ${can_send ? "text-green-2" : "text-red-2"}`}>
              {can_send ? "✓ Lettre conforme — Validation possible" : "🚫 Lettre non conforme — Validation bloquée"}
            </div>
            <div className={`text-[0.75rem] mt-1 ${can_send ? "text-emerald-300" : "text-red-300"}`}>
              {can_send
                ? `${conformBlocs.length}/12 blocs conformes — ${verifiedRefs.length} référence(s) vérifiée(s) Légifrance`
                : blocking_reason || "Des éléments bloquants ont été détectés."
              }
            </div>
          </div>
        </>
      )}

      {/* OpenLégi availability warning */}
      {openlegi_available === false && (
        <div className="rounded-[9px] p-3 mb-4 bg-destructive/[0.12] border border-destructive/30">
          <div className="font-syne text-[0.75rem] font-bold text-red-2">
            🚫 Vérification Légifrance impossible
          </div>
          <div className="text-[0.7rem] text-red-300 mt-1">
            L'API Légifrance n'a pas pu être interrogée. Relancez la génération ou contactez le support.
          </div>
        </div>
      )}

      {/* Bloc-level report */}
      {bloc_report && bloc_report.length > 0 && (
        <div className="mb-4">
          {conformBlocs.length > 0 && (
            <div className="mb-3">
              <div className="font-syne text-[0.6rem] font-bold tracking-wider uppercase text-green-2 mb-2">
                ✅ Blocs conformes ({conformBlocs.length}/12)
              </div>
              <div className="flex flex-wrap gap-1.5">
                {conformBlocs.map((b) => (
                  <Pill key={b.bloc} variant="ok">✓ Bloc {b.bloc} — {b.name}</Pill>
                ))}
              </div>
            </div>
          )}

          {warnBlocs.length > 0 && (
            <div className="mb-3">
              <div className="font-syne text-[0.6rem] font-bold tracking-wider uppercase text-amber-2 mb-2">
                ⚠️ Blocs à vérifier ({warnBlocs.length}/12)
              </div>
              <div className="flex flex-wrap gap-1.5">
                {warnBlocs.map((b) => (
                  <span key={b.bloc} className="inline-flex items-center px-2 py-0.5 rounded-full text-[0.68rem] font-syne font-semibold bg-amber/[0.12] border border-amber-2/25 text-amber-2">
                    ⚠ Bloc {b.bloc} — {b.name}
                  </span>
                ))}
              </div>
            </div>
          )}

          {redBlocs.length > 0 && (
            <div className="mb-3">
              <div className="font-syne text-[0.6rem] font-bold tracking-wider uppercase text-red-2 mb-2">
                🔴 Blocs manquants ({redBlocs.length}/12)
              </div>
              <div className="flex flex-wrap gap-1.5">
                {redBlocs.map((b) => (
                  <Pill key={b.bloc} variant="red">✗ Bloc {b.bloc} — {b.name}</Pill>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ═══ RÉFÉRENCES JURIDIQUES — 3 CATÉGORIES CLAIRES ═══ */}
      {references_status && references_status.length > 0 && (
        <div className="mb-3">
          <div className="font-syne text-[0.6rem] font-bold tracking-wider uppercase text-muted-foreground mb-2">
            📋 Références juridiques ({verifiedRefs.length}/{references_status.length} vérifiées Légifrance)
          </div>

          <div className="flex flex-col gap-1.5">
            {/* ✅ RÉFÉRENCES VÉRIFIÉES LÉGIFRANCE */}
            {verifiedRefs.length > 0 && (
              <>
                <div className="font-syne text-[0.55rem] font-bold tracking-wider uppercase text-green-2 mt-1">
                  ✅ Références vérifiées Légifrance
                </div>
                {verifiedRefs.map((r) => (
                  <a key={r.texte_reference} href={r.url || "#"} target="_blank" rel="noopener noreferrer" className="no-underline">
                    <div className="flex items-center gap-2 rounded-[7px] px-3 py-2 border bg-green/[0.06] border-green-2/20 text-green-2 text-xs group">
                      <span className="font-syne font-bold text-[0.7rem]">✓</span>
                      <span className="flex-1 font-medium">{r.texte_reference}</span>
                      <span className="text-[0.6rem] opacity-70">{r.details}</span>
                      {r.url && <span className="text-primary-hover text-[0.65rem] font-syne font-semibold group-hover:underline">Légifrance →</span>}
                    </div>
                  </a>
                ))}
              </>
            )}

            {/* ⚠️ RÉFÉRENCES À CONFIRMER PAR L'AVOCAT */}
            {lawyerRefs.length > 0 && (
              <>
                <div className="font-syne text-[0.55rem] font-bold tracking-wider uppercase text-amber-2 mt-2">
                  ⚠️ Références à confirmer par l'avocat
                </div>
                {lawyerRefs.map((r) => (
                  <a key={r.texte_reference} href={r.url || "#"} target="_blank" rel="noopener noreferrer" className="no-underline">
                    <div className="flex items-center gap-2 rounded-[7px] px-3 py-2 border bg-amber/[0.06] border-amber-2/20 text-amber-2 text-xs group">
                      <span className="font-syne font-bold text-[0.7rem]">⚠</span>
                      <span className="flex-1 font-medium">{r.texte_reference}</span>
                      <span className="text-[0.6rem] opacity-70">Vérifiez sur legifrance.gouv.fr</span>
                      {r.url && <span className="text-primary-hover text-[0.65rem] font-syne font-semibold group-hover:underline">Rechercher →</span>}
                    </div>
                  </a>
                ))}
              </>
            )}

            {/* 🚫 RÉFÉRENCES INTROUVABLES */}
            {notFoundRefs.length > 0 && (
              <>
                <div className="font-syne text-[0.55rem] font-bold tracking-wider uppercase text-red-2 mt-2">
                  🚫 Références introuvables — Correction obligatoire
                </div>
                {notFoundRefs.map((r) => (
                  <div key={r.texte_reference} className="flex items-center gap-2 rounded-[7px] px-3 py-2 border bg-destructive/[0.06] border-destructive/20 text-red-2 text-xs">
                    <span className="font-syne font-bold text-[0.7rem]">✗</span>
                    <span className="flex-1 font-medium">{r.texte_reference} — Introuvable sur Légifrance</span>
                  </div>
                ))}
              </>
            )}
          </div>
        </div>
      )}

      {/* Lawyer-check warning */}
      {has_a_verifier_refs && (
        <div className="mt-3 rounded-[9px] p-3 bg-amber/[0.12] border border-amber-2/30">
          <div className="font-syne text-[0.75rem] font-bold text-amber-2">
            ⚠️ {lawyerRefs.length} référence(s) à confirmer par l'avocat
          </div>
          <div className="text-[0.7rem] text-amber-300 mt-1">
            Ces références ont été citées par Claude hors du contexte Légifrance fourni. Elles ne bloquent pas l'envoi mais doivent être validées par l'avocat sur legifrance.gouv.fr.
          </div>
        </div>
      )}

      {/* Send blocked warning */}
      {!can_send && blocking_reason && (
        <div className="mt-3 rounded-[9px] p-3 bg-destructive/[0.12] border border-destructive/30">
          <div className="font-syne text-[0.75rem] font-bold text-red-2">
            🚫 Validation et envoi bloqués
          </div>
          <div className="text-[0.7rem] text-red-300 mt-1">
            {blocking_reason}
          </div>
        </div>
      )}

      {/* Verification timestamp footer */}
      <div className="mt-3 text-[0.6rem] text-muted-foreground font-syne text-right space-y-0.5">
        {verifiedRefs.length > 0 && verificationDate && (
          <div>
            Les références ✅ ont été vérifiées sur Légifrance en temps réel le {verificationDate}.
          </div>
        )}
        {lawyerRefs.length > 0 && (
          <div>
            Les références ⚠️ sont sous votre responsabilité d'avocat.
          </div>
        )}
        {result.generation_label && (
          <div>{result.generation_label}</div>
        )}
      </div>
    </div>
  );
};
