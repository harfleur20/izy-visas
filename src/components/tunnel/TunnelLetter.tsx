import { useState, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { ArrowRight, ArrowLeft, FileText, Loader2 } from "lucide-react";
import { toast } from "sonner";
import type { TunnelOcrData, TunnelIdentityData, TunnelPieceFile } from "@/hooks/useTunnelState";

interface TunnelLetterProps {
  identity: TunnelIdentityData;
  ocrData: TunnelOcrData;
  pieces: TunnelPieceFile[];
  letterContent: string | null;
  onLetterGenerated: (content: string) => void;
  onNext: () => void;
  onBack: () => void;
}

export default function TunnelLetter({
  identity, ocrData, pieces, letterContent, onLetterGenerated, onNext, onBack,
}: TunnelLetterProps) {
  const [loading, setLoading] = useState(false);

  const generate = useCallback(async () => {
    setLoading(true);
    try {
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
      const anonKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

      const res = await fetch(`${supabaseUrl}/functions/v1/generate-recours`, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${anonKey}`,
          "apikey": anonKey,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          tunnel_mode: true,
          identity: {
            firstName: identity.firstName,
            lastName: identity.lastName,
            dateNaissance: identity.dateNaissance,
            lieuNaissance: identity.lieuNaissance,
            nationalite: identity.nationalite,
            passportNumber: identity.passportNumber,
            phone: identity.phone,
            email: identity.email,
          },
          ocr: {
            visaType: ocrData.visaType,
            typeVisaTexteOriginal: ocrData.typeVisaTexteOriginal,
            consulatNom: ocrData.consulatNom,
            consulatVille: ocrData.consulatVille,
            consulatPays: ocrData.consulatPays,
            dateNotificationRefus: ocrData.dateNotificationRefus,
            motifsRefus: ocrData.motifsRefus,
            motifsTexteOriginal: ocrData.motifsTexteOriginal,
            numeroDecision: ocrData.numeroDecision,
            destinataireRecours: ocrData.destinataireRecours,
          },
          pieces: pieces.map((p) => ({
            nomPiece: p.nomPiece,
            typePiece: p.typePiece,
            pages: 1,
          })),
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        if (data?.missing_fields) {
          toast.error(`Éléments manquants : ${data.missing_fields.join(", ")}`, { duration: 6000 });
        } else {
          toast.error(data?.error || "Erreur lors de la génération");
        }
        return;
      }

      onLetterGenerated(data.letter);

      if (data.can_send) {
        toast.success("Lettre générée — références validées ✓");
      } else {
        toast.warning("Lettre générée avec des avertissements");
      }
    } catch (err) {
      console.error("Generate error:", err);
      toast.error("Erreur lors de la génération du recours");
    } finally {
      setLoading(false);
    }
  }, [identity, ocrData, pieces, onLetterGenerated]);

  return (
    <div className="fixed inset-0 bg-background overflow-y-auto">
      <div className="max-w-[520px] mx-auto px-5 py-8 pb-32">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <button onClick={onBack} className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors">
            <ArrowLeft className="w-4 h-4" /> Retour
          </button>
          <span className="text-xs text-muted-foreground font-dm">Étape 6 sur 7</span>
        </div>

        <h2 className="font-fraunces text-[clamp(1.3rem,3.5vw,1.8rem)] text-cream mb-2 leading-tight">
          {letterContent ? "Votre lettre de contestation" : "Générez votre lettre de contestation"}
        </h2>
        <p className="text-sm text-muted-foreground mb-6 leading-relaxed">
          {letterContent
            ? "Voici un aperçu de votre lettre. Le contenu complet sera accessible après paiement."
            : "Nous allons générer une lettre de contestation juridiquement argumentée à partir de vos données."
          }
        </p>

        {/* Generate button */}
        {!letterContent && !loading && (
          <div className="text-center py-12">
            <FileText className="w-16 h-16 text-primary/40 mx-auto mb-4" />
            <p className="text-sm text-muted-foreground mb-6 max-w-xs mx-auto">
              Cette lettre contiendra vos arguments juridiques, les références légales vérifiées et l'inventaire de vos pièces.
            </p>
            <Button
              onClick={generate}
              size="lg"
              className="h-14 px-8 text-base font-syne font-bold rounded-2xl gap-2"
            >
              <FileText className="w-5 h-5" />
              Générer ma lettre
            </Button>
          </div>
        )}

        {/* Loading */}
        {loading && (
          <div className="text-center py-16">
            <Loader2 className="w-10 h-10 text-primary animate-spin mx-auto mb-4" />
            <p className="text-sm text-muted-foreground mb-2">Génération en cours…</p>
            <p className="text-xs text-muted-foreground/70">
              Récupération des textes juridiques, vérification des références, rédaction…
            </p>
          </div>
        )}

        {/* Letter preview (locked) */}
        {letterContent && (
          <>
            <div className="relative mb-6">
              <div
                className="bg-panel border border-border rounded-xl p-5 text-[0.79rem] text-muted-foreground leading-relaxed whitespace-pre-wrap select-none max-h-[220px] overflow-hidden"
                style={{ userSelect: "none", WebkitUserSelect: "none" }}
              >
                {letterContent}
              </div>

              {/* Gradient overlay */}
              <div
                className="absolute inset-0 top-[120px] rounded-b-xl flex flex-col items-center justify-end pb-5 cursor-pointer"
                style={{ background: "linear-gradient(to bottom, transparent 0%, hsl(var(--background)) 70%)" }}
                onClick={onNext}
              >
                <div className="bg-primary/15 border border-primary/30 rounded-lg px-5 py-3 text-center backdrop-blur-sm">
                  <p className="font-syne font-bold text-[0.82rem] text-primary mb-0.5">🔒 Contenu protégé</p>
                  <p className="text-[0.7rem] text-muted-foreground">Finalisez pour accéder à l'intégralité de la lettre</p>
                </div>
              </div>
            </div>

            {/* Summary card */}
            <div className="bg-panel border border-border rounded-xl p-4 mb-6">
              <p className="text-xs font-syne font-bold text-muted-foreground uppercase tracking-wider mb-2">Contenu de votre recours</p>
              <ul className="space-y-1.5 text-sm text-foreground">
                <li className="flex items-center gap-2">
                  <span className="text-green-500">✓</span> Arguments juridiques personnalisés
                </li>
                <li className="flex items-center gap-2">
                  <span className="text-green-500">✓</span> Références légales vérifiées
                </li>
                <li className="flex items-center gap-2">
                  <span className="text-green-500">✓</span> {pieces.length} pièce{pieces.length > 1 ? "s" : ""} justificative{pieces.length > 1 ? "s" : ""}
                </li>
                <li className="flex items-center gap-2">
                  <span className="text-green-500">✓</span> Motifs de refus contestés ({ocrData.motifsRefus.length})
                </li>
              </ul>
            </div>
          </>
        )}

        {/* Bottom bar */}
        {letterContent && (
          <div className="fixed bottom-0 left-0 right-0 bg-background/95 backdrop-blur-md border-t border-border px-5 py-4">
            <div className="max-w-[520px] mx-auto flex gap-3">
              <Button
                variant="outline"
                onClick={generate}
                disabled={loading}
                className="h-12 rounded-xl font-syne font-bold"
              >
                🔄 Régénérer
              </Button>
              <Button
                onClick={onNext}
                size="lg"
                className="flex-1 h-12 text-base font-syne font-bold rounded-xl gap-2"
              >
                Continuer
                <ArrowRight className="w-5 h-5" />
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
