import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ArrowLeft, ArrowRight, CheckCircle2, AlertTriangle } from "lucide-react";
import { TunnelOcrData } from "@/hooks/useTunnelState";

interface TunnelVerificationProps {
  ocrData: TunnelOcrData;
  onUpdate: (data: TunnelOcrData) => void;
  onNext: () => void;
  onBack: () => void;
}

const VISA_LABELS: Record<string, string> = {
  court_sejour: "Court séjour Schengen",
  etudiant: "Long séjour étudiant",
  conjoint_francais: "Conjoint de Français",
  salarie: "Long séjour salarié",
  passeport_talent: "Passeport talent",
  visiteur: "Visiteur / Parent enfant FR",
  autre: "Autre",
};

const MOTIF_LABELS: Record<string, string> = {
  A: "Document de voyage non valide",
  B: "But du séjour non justifié",
  C: "Ressources insuffisantes",
  D: "Assurance absente ou insuffisante",
  E: "Hébergement non justifié",
  F: "Doute sur la volonté de retour",
  G: "Signalement SIS",
  H: "Menace pour l'ordre public",
  I: "Séjour irrégulier antérieur",
  J: "Intention matrimoniale non établie",
  K: "Dossier incomplet",
  L: "Appréciation globale défavorable",
};

export default function TunnelVerification({ ocrData, onUpdate, onNext, onBack }: TunnelVerificationProps) {
  const [editData, setEditData] = useState<TunnelOcrData>({ ...ocrData });

  const update = (partial: Partial<TunnelOcrData>) => {
    const updated = { ...editData, ...partial };
    setEditData(updated);
  };

  const toggleMotif = (code: string) => {
    const motifs = editData.motifsRefus.includes(code)
      ? editData.motifsRefus.filter((m) => m !== code)
      : [...editData.motifsRefus, code];
    update({ motifsRefus: motifs });
  };

  const handleConfirm = () => {
    onUpdate(editData);
    onNext();
  };

  const hasMotifs = editData.motifsRefus.length > 0;
  const hasDate = editData.dateNotificationRefus.trim().length > 0;
  const canContinue = hasMotifs && hasDate;

  return (
    <div className="fixed inset-0 bg-background flex flex-col overflow-y-auto">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-background/95 backdrop-blur-sm border-b border-border px-6 py-4 flex items-center justify-between">
        <button onClick={onBack} className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors">
          <ArrowLeft className="w-4 h-4" />
          Retour
        </button>
        <span className="text-xs text-muted-foreground font-dm">Étape 3 sur 7</span>
      </div>

      <div className="flex-1 flex flex-col items-center px-6 py-8">
        <div className="w-full max-w-[480px] animate-in fade-in slide-in-from-bottom-4 duration-500">
          <div className="flex items-center gap-2 mb-2">
            <CheckCircle2 className="w-6 h-6 text-emerald-400" />
            <h2 className="font-fraunces text-xl text-cream">Vérifiez que ces informations sont exactes</h2>
          </div>
          <p className="text-sm text-muted-foreground mb-6">
            Corrigez si nécessaire les données extraites de votre décision.
          </p>

          {/* Type de visa */}
          <div className="space-y-2 mb-5">
            <Label className="text-xs text-muted-foreground">Type de visa</Label>
            <select
              className="w-full h-12 bg-background border border-border rounded-xl px-3 text-sm text-foreground"
              value={editData.visaType}
              onChange={(e) => update({ visaType: e.target.value })}
            >
              {Object.entries(VISA_LABELS).map(([k, v]) => (
                <option key={k} value={k}>{v}</option>
              ))}
            </select>
          </div>

          {/* Consulat */}
          <div className="grid grid-cols-2 gap-3 mb-5">
            <div className="space-y-2">
              <Label className="text-xs text-muted-foreground">Consulat</Label>
              <Input
                value={editData.consulatNom}
                onChange={(e) => update({ consulatNom: e.target.value })}
                placeholder="Nom du consulat"
                className="h-12"
              />
            </div>
            <div className="space-y-2">
              <Label className="text-xs text-muted-foreground">Ville</Label>
              <Input
                value={editData.consulatVille}
                onChange={(e) => update({ consulatVille: e.target.value })}
                placeholder="Ville"
                className="h-12"
              />
            </div>
          </div>

          {/* Date de notification */}
          <div className="space-y-2 mb-5">
            <Label className="text-xs text-muted-foreground">Date de notification du refus</Label>
            <Input
              value={editData.dateNotificationRefus}
              onChange={(e) => update({ dateNotificationRefus: e.target.value })}
              placeholder="JJ/MM/AAAA"
              className="h-12"
            />
            {!hasDate && (
              <p className="text-xs text-amber-400 flex items-center gap-1">
                <AlertTriangle className="w-3 h-3" />
                La date est nécessaire pour vérifier le délai de recours.
              </p>
            )}
          </div>

          {/* N° décision */}
          <div className="space-y-2 mb-5">
            <Label className="text-xs text-muted-foreground">N° de décision (optionnel)</Label>
            <Input
              value={editData.numeroDecision}
              onChange={(e) => update({ numeroDecision: e.target.value })}
              placeholder="Ex : 2024/1234"
              className="h-12"
            />
          </div>

          {/* Motifs de refus */}
          <div className="space-y-2 mb-8">
            <Label className="text-xs text-muted-foreground">Motifs de refus cochés</Label>
            <div className="flex flex-wrap gap-2">
              {Object.entries(MOTIF_LABELS).map(([code, label]) => {
                const selected = editData.motifsRefus.includes(code);
                return (
                  <button
                    key={code}
                    onClick={() => toggleMotif(code)}
                    className={`text-xs font-syne font-semibold px-3 py-2 rounded-lg border transition-all ${
                      selected
                        ? "bg-primary/20 border-primary/40 text-primary"
                        : "border-border text-muted-foreground hover:border-foreground/30"
                    }`}
                  >
                    {code} — {label}
                  </button>
                );
              })}
            </div>
            {!hasMotifs && (
              <p className="text-xs text-amber-400 flex items-center gap-1">
                <AlertTriangle className="w-3 h-3" />
                Sélectionnez au moins un motif de refus.
              </p>
            )}
          </div>

          <Button
            onClick={handleConfirm}
            disabled={!canContinue}
            className="w-full h-13 text-base font-syne font-bold rounded-2xl gap-2"
          >
            Confirmer ces informations
            <ArrowRight className="w-5 h-5" />
          </Button>
        </div>
      </div>
    </div>
  );
}
