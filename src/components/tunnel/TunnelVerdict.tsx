import { Button } from "@/components/ui/button";
import { ArrowRight, ArrowLeft, ShieldCheck, AlertOctagon } from "lucide-react";
import { TunnelOcrData } from "@/hooks/useTunnelState";
import { getMotifLabel } from "@/lib/motifs";

interface TunnelVerdictProps {
  ocrData: TunnelOcrData;
  onNext: () => void;
  onBack: () => void;
}

function computeDelaiRestant(dateStr: string): number | null {
  const parts = dateStr.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (!parts) return null;
  const notif = new Date(parseInt(parts[3]), parseInt(parts[2]) - 1, parseInt(parts[1]));
  const deadline = new Date(notif);
  deadline.setDate(deadline.getDate() + 30);
  return Math.ceil((deadline.getTime() - Date.now()) / 86400000);
}

export default function TunnelVerdict({ ocrData, onNext, onBack }: TunnelVerdictProps) {
  const rawDelai = ocrData.dateNotificationRefus ? computeDelaiRestant(ocrData.dateNotificationRefus) : null;
  // Le délai légal est de 30 jours calendaires. Si > 30, la date OCR est probablement erronée (date future ou mal lue).
  const dateIncoherente = rawDelai !== null && rawDelai > 30;
  const delaiRestant = rawDelai !== null ? Math.min(rawDelai, 30) : null;
  const isExpired = rawDelai !== null && rawDelai < 0;
  const isUrgent = delaiRestant !== null && delaiRestant >= 0 && delaiRestant <= 7;

  if (isExpired) {
    return (
      <div className="fixed inset-0 bg-background flex flex-col items-center justify-center px-6">
        <div className="absolute top-6 left-6">
          <button onClick={onBack} className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors">
            <ArrowLeft className="w-4 h-4" />
            Retour
          </button>
        </div>

        <div className="w-full max-w-[440px] text-center animate-in fade-in slide-in-from-bottom-4 duration-500">
          <AlertOctagon className="w-16 h-16 text-destructive mx-auto mb-4" />
          <h2 className="font-fraunces text-2xl text-cream mb-3">Délai de recours expiré</h2>
          <p className="text-sm text-muted-foreground mb-6 leading-relaxed">
            Le délai légal de 30 jours pour contester votre refus de visa est malheureusement dépassé
            depuis <span className="text-destructive font-semibold">{Math.abs(delaiRestant!)} jour{Math.abs(delaiRestant!) > 1 ? "s" : ""}</span>.
          </p>
          <p className="text-sm text-muted-foreground mb-8 leading-relaxed">
            Le recours gracieux n'est plus recevable. Nous vous conseillons de consulter un avocat
            spécialisé pour explorer d'autres options juridiques.
          </p>
          <Button variant="outline" onClick={onBack} className="h-12 px-8 rounded-2xl">
            ← Modifier la date
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-background flex flex-col items-center justify-center px-6">
      {/* Background */}
      <div className="absolute w-[500px] h-[500px] top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-[radial-gradient(circle,rgba(16,185,129,0.06)_0%,transparent_70%)] pointer-events-none" />

      <div className="absolute top-6 left-6 right-6 flex items-center justify-between">
        <button onClick={onBack} className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors">
          <ArrowLeft className="w-4 h-4" />
          Retour
        </button>
        <span className="text-xs text-muted-foreground font-dm">Étape 4 sur 7</span>
      </div>

      <div className="w-full max-w-[440px] text-center animate-in fade-in slide-in-from-bottom-4 duration-700">
        <ShieldCheck className="w-16 h-16 text-emerald-400 mx-auto mb-4" />

        <h2 className="font-fraunces text-[clamp(1.3rem,3.5vw,2rem)] text-cream mb-3 leading-tight">
          Ce motif peut être annulé
        </h2>

        <p className="text-base text-muted-foreground mb-6 leading-relaxed">
          Rien n'est perdu, vous pouvez encore obtenir votre visa.
        </p>

        {/* Motifs summary */}
        <div className="bg-panel border border-border rounded-xl p-4 mb-6 text-left">
          <p className="text-xs font-syne font-bold text-muted-foreground uppercase tracking-wider mb-3">
            Motifs identifiés ({ocrData.motifsRefus.length})
          </p>
          <div className="space-y-2">
            {ocrData.motifsRefus.map((code) => (
              <div key={code} className="flex items-start gap-2">
                <span className="text-xs font-mono font-bold text-primary bg-primary/10 px-1.5 py-0.5 rounded mt-0.5">{code}</span>
                <span className="text-sm text-foreground">{getMotifLabel(code)}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Délai warning */}
        {isUrgent && delaiRestant !== null && (
          <div className="bg-amber-500/10 border border-amber-500/30 rounded-xl p-3 mb-6 flex items-center gap-2">
            <span className="text-lg">⚠️</span>
            <p className="text-sm text-amber-300">
              <span className="font-bold">Attention :</span> il vous reste <span className="font-bold">{delaiRestant} jour{delaiRestant > 1 ? "s" : ""}</span> pour contester.
            </p>
          </div>
        )}

        {delaiRestant !== null && !isUrgent && (
          <p className="text-xs text-muted-foreground mb-6">
            📅 Il vous reste <span className="text-emerald-400 font-semibold">{delaiRestant} jours</span> pour contester.
          </p>
        )}

        <Button
          onClick={onNext}
          size="lg"
          className="w-full h-14 text-base font-syne font-bold rounded-2xl gap-2"
        >
          Continuer ma contestation
          <ArrowRight className="w-5 h-5" />
        </Button>
      </div>
    </div>
  );
}
