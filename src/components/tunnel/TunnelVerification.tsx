import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ArrowLeft, ArrowRight, CheckCircle2, AlertTriangle, UserCheck, UserX } from "lucide-react";
import { TunnelOcrData, TunnelIdentityData } from "@/hooks/useTunnelState";

interface TunnelVerificationProps {
  ocrData: TunnelOcrData;
  identity: TunnelIdentityData;
  onUpdate: (data: TunnelOcrData) => void;
  onUpdateIdentity: (data: Partial<TunnelIdentityData>) => void;
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


function normalize(str: string): string {
  return str
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/['-]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function fuzzyMatch(a: string, b: string): boolean {
  if (!a || !b) return false;
  const na = normalize(a);
  const nb = normalize(b);
  if (na === nb) return true;
  if (na.includes(nb) || nb.includes(na)) return true;
  // Check individual parts (for compound names)
  const partsA = na.split(" ");
  const partsB = nb.split(" ");
  return partsA.some(p => partsB.includes(p));
}

type CoherenceLevel = "ok" | "warning" | "error" | "no_check";

interface CoherenceResult {
  level: CoherenceLevel;
  message: string;
  suggestion?: string;
}

function checkIdentityCoherence(
  identity: TunnelIdentityData,
  ocrNom: string,
  ocrPrenom: string
): CoherenceResult {
  const hasOcrNom = !!ocrNom.trim();
  const hasOcrPrenom = !!ocrPrenom.trim();
  const hasIdentityNom = !!identity.lastName.trim();
  const hasIdentityPrenom = !!identity.firstName.trim();

  // Case 8: OCR couldn't extract name
  if (!hasOcrNom && !hasOcrPrenom) {
    return {
      level: "no_check",
      message: "Le nom du demandeur n'a pas pu être extrait du document. Vérifiez que vos informations d'identité sont correctes.",
    };
  }

  // Case 5: Both only have nom, no prenom, and they match
  if (hasOcrNom && !hasOcrPrenom && hasIdentityNom && !hasIdentityPrenom) {
    if (fuzzyMatch(identity.lastName, ocrNom)) {
      return { level: "ok", message: "Identité confirmée." };
    }
  }

  // Case 1: Both nom and prenom match
  const nomMatch = !hasOcrNom || fuzzyMatch(identity.lastName, ocrNom);
  const prenomMatch = !hasOcrPrenom || fuzzyMatch(identity.firstName, ocrPrenom);

  // Only "ok" if both fields are actually provided and match
  // If OCR has prenom but user didn't enter one, we need to warn (Case 2)
  if (nomMatch && hasIdentityPrenom && prenomMatch) {
    return { level: "ok", message: "Identité confirmée." };
  }

  // Also ok if OCR has no prenom and user has no prenom, but nom matches
  if (nomMatch && !hasOcrPrenom && !hasIdentityPrenom) {
    return { level: "ok", message: "Identité confirmée." };
  }

  // Case 3: Inverted (prenom in nom field or vice versa)
  const invertedNom = hasOcrPrenom && fuzzyMatch(identity.lastName, ocrPrenom);
  const invertedPrenom = hasOcrNom && hasIdentityPrenom && fuzzyMatch(identity.firstName, ocrNom);
  if (invertedNom && invertedPrenom) {
    return {
      level: "warning",
      message: `Il semble que le nom et le prénom soient inversés. La décision indique : ${ocrPrenom} ${ocrNom}.`,
      suggestion: "Vérifiez et corrigez si nécessaire.",
    };
  }

  // Case 9: firstName field contains the nom from OCR (prenom in wrong field)
  if (hasOcrNom && hasIdentityPrenom && !hasIdentityNom && fuzzyMatch(identity.firstName, ocrNom)) {
    return {
      level: "warning",
      message: `Votre prénom "${identity.firstName}" correspond au nom sur la décision. Avez-vous inversé nom et prénom ?`,
      suggestion: "Vérifiez et corrigez si nécessaire.",
    };
  }

  // Case 2: Identity has only nom, OCR has both — needs confirmation
  if (hasOcrNom && hasOcrPrenom && hasIdentityNom && !hasIdentityPrenom && nomMatch) {
    return {
      level: "warning",
      message: `Votre nom correspond, mais la décision mentionne aussi un prénom : "${ocrPrenom}". Est-ce bien vous ?`,
      suggestion: "Si oui, vous pouvez ajouter ce prénom à votre identité pour éviter toute ambiguïté.",
    };
  }

  // Case 6: Orthographic differences (accents, hyphens)
  if (hasOcrNom && hasIdentityNom) {
    const simNom = normalize(identity.lastName) !== normalize(ocrNom) && 
      (normalize(identity.lastName).replace(/\s/g, "") === normalize(ocrNom).replace(/\s/g, ""));
    if (simNom) {
      return {
        level: "warning",
        message: `Légère différence d'orthographe détectée : "${ocrNom}" (décision) vs "${identity.lastName}" (identité).`,
        suggestion: "Utilisez l'orthographe exacte de votre passeport.",
      };
    }
  }

  // Case 7: Compound name partially entered
  if (hasOcrPrenom && hasIdentityPrenom) {
    const ocrParts = normalize(ocrPrenom).split(" ");
    const idParts = normalize(identity.firstName).split(" ");
    if (ocrParts.length > 1 && idParts.length < ocrParts.length && idParts.some(p => ocrParts.includes(p))) {
      return {
        level: "warning",
        message: `La décision indique "${ocrPrenom}" comme prénom. Vous avez saisi "${identity.firstName}".`,
        suggestion: "Entrez votre prénom complet tel qu'il figure sur votre passeport.",
      };
    }
  }

  // Case 4: Total mismatch
  if (hasOcrNom && hasIdentityNom && !nomMatch) {
    return {
      level: "error",
      message: `Le nom sur la décision (${ocrNom}${hasOcrPrenom ? " " + ocrPrenom : ""}) ne correspond pas à votre identité (${identity.lastName}${hasIdentityPrenom ? " " + identity.firstName : ""}).`,
      suggestion: "Vérifiez que vous avez importé votre propre décision de refus.",
    };
  }

  // Fallback warning
  return {
    level: "warning",
    message: `Vérifiez la correspondance : décision (${ocrNom || "?"} ${ocrPrenom || "?"}) vs identité saisie (${identity.lastName} ${identity.firstName || ""}).`,
    suggestion: "Corrigez si nécessaire.",
  };
}

export default function TunnelVerification({ ocrData, identity, onUpdate, onUpdateIdentity, onNext, onBack }: TunnelVerificationProps) {
  const [editData, setEditData] = useState<TunnelOcrData>({ ...ocrData });
  const [coherenceAcknowledged, setCoherenceAcknowledged] = useState(false);

  const coherence = checkIdentityCoherence(identity, editData.demandeurNom, editData.demandeurPrenom);

  const update = (partial: Partial<TunnelOcrData>) => {
    const updated = { ...editData, ...partial };
    setEditData(updated);
  };

  const updatePassport = (value: string) => {
    const passport = value.toUpperCase().replace(/\s+/g, "");
    onUpdateIdentity({ passportNumber: passport });
    update({ demandeurPasseport: passport });
  };


  const handleConfirm = () => {
    onUpdate(editData);
    onNext();
  };

  const hasMotifs = editData.motifsRefus.length > 0;
  const hasDate = editData.dateNotificationRefus.trim().length > 0;
  const coherenceBlocking = coherence.level === "error" && !coherenceAcknowledged;
  const canContinue = hasMotifs && hasDate && !coherenceBlocking;

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

          {/* Identity coherence alert */}
          {coherence.level !== "ok" && (
            <div className={`rounded-xl p-4 mb-6 border ${
              coherence.level === "error" 
                ? "bg-destructive/10 border-destructive/30" 
                : coherence.level === "warning"
                ? "bg-amber-500/10 border-amber-500/30"
                : "bg-muted/50 border-border"
            }`}>
              <div className="flex items-start gap-3">
                {coherence.level === "error" ? (
                  <UserX className="w-5 h-5 text-destructive shrink-0 mt-0.5" />
                ) : coherence.level === "warning" ? (
                  <AlertTriangle className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
                ) : (
                  <UserCheck className="w-5 h-5 text-muted-foreground shrink-0 mt-0.5" />
                )}
                <div className="space-y-2 flex-1">
                  <p className={`text-sm font-medium ${
                    coherence.level === "error" ? "text-destructive" 
                    : coherence.level === "warning" ? "text-amber-400" 
                    : "text-muted-foreground"
                  }`}>
                    {coherence.level === "error" ? "Incohérence d'identité" : "Vérification d'identité"}
                  </p>
                  <p className="text-sm text-foreground/80">{coherence.message}</p>
                  {coherence.suggestion && (
                    <p className="text-xs text-muted-foreground">{coherence.suggestion}</p>
                  )}
                  
                  {/* Quick fix buttons for name issues */}
                  {(coherence.level === "error" || coherence.level === "warning") && editData.demandeurNom && (
                    <div className="flex flex-col gap-2 mt-3">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          onUpdateIdentity({
                            lastName: editData.demandeurNom,
                            ...(editData.demandeurPrenom ? { firstName: editData.demandeurPrenom } : {}),
                          });
                        }}
                        className="text-xs"
                      >
                        <UserCheck className="w-3.5 h-3.5 mr-1.5" />
                        Utiliser le nom de la décision : {editData.demandeurNom} {editData.demandeurPrenom}
                      </Button>
                      {coherence.level === "error" && (
                        <button
                          onClick={() => setCoherenceAcknowledged(true)}
                          className="text-xs text-muted-foreground underline hover:text-foreground transition-colors text-left"
                        >
                          J'ai vérifié, je confirme mon identité telle que saisie
                        </button>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {coherence.level === "ok" && (
            <div className="rounded-xl p-3 mb-6 border border-emerald-500/30 bg-emerald-500/10 flex items-center gap-2">
              <UserCheck className="w-4 h-4 text-emerald-400" />
              <p className="text-sm text-emerald-400">{coherence.message}</p>
            </div>
          )}

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

          {/* Passeport */}
          <div className="space-y-2 mb-5">
            <Label className="text-xs text-muted-foreground">N° de passeport</Label>
            <Input
              value={identity.passportNumber || editData.demandeurPasseport || ""}
              onChange={(e) => updatePassport(e.target.value)}
              placeholder="Ex : A00123456"
              className="h-12"
            />
            {!identity.passportNumber && !editData.demandeurPasseport && (
              <p className="text-xs text-amber-400 flex items-center gap-1">
                <AlertTriangle className="w-3 h-3" />
                Ajoutez le numéro pour éviter “Passeport n° Non communiqué” dans la lettre.
              </p>
            )}
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

          {!hasMotifs && (
            <p className="text-xs text-amber-400 flex items-center gap-1 mb-6">
              <AlertTriangle className="w-3 h-3" />
              Aucun motif de refus n'a été détecté sur la décision.
            </p>
          )}

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
