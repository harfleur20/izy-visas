import { Eyebrow, BigTitle, Desc, Box } from "@/components/ui-custom";
import { ComplianceReportPanel, type GenerationResult } from "@/components/ComplianceReport";

interface LetterPreviewProps {
  result: GenerationResult;
  loading: boolean;
  onGenerate: () => void;
  onRegenerate: () => void;
  onChooseOption: () => void;
  onBack: () => void;
  canGenerate: boolean;
}

export const LetterPreview = ({
  result,
  loading,
  onGenerate,
  onRegenerate,
  onChooseOption,
  onBack,
  canGenerate,
}: LetterPreviewProps) => {
  return (
    <div>
      <Eyebrow>Lettre de recours</Eyebrow>
      <BigTitle>{result ? "Votre lettre de recours est prête" : "Générer votre lettre"}</BigTitle>
      <Desc>
        {result
          ? "Lisez attentivement votre lettre avant de choisir comment l'envoyer."
          : "Cliquez ci-dessous pour générer votre lettre de recours à partir des données de votre dossier."
        }
      </Desc>

      {!result && !loading && (
        <div className="text-center py-12">
          <p className="text-muted-foreground mb-4">Cette lettre contient tous vos arguments juridiques. Les marqueurs de signataire seront complétés après votre choix de mode d'envoi.</p>
          <button
            className="font-syne font-bold text-[0.78rem] px-6 py-3 rounded-[7px] bg-primary-hover text-foreground hover:bg-[#5585ff] transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            onClick={onGenerate}
            disabled={!canGenerate}
          >
            🔍 Générer ma lettre
          </button>
        </div>
      )}

      {loading && (
        <div className="text-center py-12">
          <div className="animate-spin h-8 w-8 border-4 border-primary-hover border-t-transparent rounded-full mx-auto mb-4" />
          <p className="text-muted-foreground text-sm">Génération en cours… Récupération des données, vérification des références juridiques via OpenLégi…</p>
        </div>
      )}

      {result && (
        <>
          <Box variant="info" title="ℹ️ Lettre neutre">
            Cette lettre contient tous vos arguments juridiques. Le signataire sera complété après votre choix de mode d'envoi.
          </Box>

          {/* Letter content - first page preview */}
          <div className="bg-panel border border-border rounded-xl p-5 text-[0.79rem] text-muted-foreground leading-relaxed mb-4 max-h-[500px] overflow-y-auto whitespace-pre-wrap">
            {result.letter}
          </div>

          {/* Compliance Report */}
          <ComplianceReportPanel result={result} />

          {/* Action buttons */}
          <div className="flex gap-2.5 mt-7 flex-wrap">
            <button className="font-syne font-bold text-[0.78rem] px-5 py-2.5 rounded-[7px] bg-foreground/[0.07] text-muted-foreground border border-border-2 transition-all" onClick={onBack}>← Retour</button>
            <button
              className="font-syne font-bold text-[0.78rem] px-5 py-2.5 rounded-[7px] bg-primary/[0.18] text-primary-hover border border-primary-hover/30 transition-all"
              onClick={() => { window.scrollTo({ top: 0, behavior: "smooth" }); onRegenerate(); }}
              disabled={loading}
            >
              🔄 Régénérer
            </button>
            <button
              className="font-syne font-bold text-[0.78rem] px-5 py-2.5 rounded-[7px] bg-primary/[0.18] text-primary-hover border border-primary-hover/30 transition-all"
              onClick={() => {
                const blob = new Blob([result.letter], { type: "text/plain;charset=utf-8" });
                const url = URL.createObjectURL(blob);
                const a = document.createElement("a");
                a.href = url;
                a.download = `brouillon_recours.txt`;
                a.click();
                URL.revokeObjectURL(url);
              }}
            >
              📥 Télécharger le brouillon
            </button>
            <button
              className={`font-syne font-bold text-[0.78rem] px-5 py-2.5 rounded-[7px] transition-all ${
                result.can_send
                  ? "bg-primary-hover text-foreground hover:bg-[#5585ff]"
                  : "bg-muted text-muted-foreground cursor-not-allowed opacity-50"
              }`}
              disabled={!result.can_send}
              onClick={onChooseOption}
            >
              {result.can_send ? "→ Choisir mon mode d'envoi" : "🚫 Validation bloquée — Corrections requises"}
            </button>
          </div>
        </>
      )}

      {!result && !loading && (
        <div className="flex gap-2.5 mt-7">
          <button className="font-syne font-bold text-[0.78rem] px-5 py-2.5 rounded-[7px] bg-foreground/[0.07] text-muted-foreground border border-border-2 transition-all" onClick={onBack}>← Retour</button>
        </div>
      )}
    </div>
  );
};
