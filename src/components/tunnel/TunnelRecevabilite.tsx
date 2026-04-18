import { useState, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ArrowRight, ArrowLeft, AlertTriangle, CheckCircle2 } from "lucide-react";

interface TunnelRecevabiliteProps {
  dateRefus: string;
  onUpdate: (date: string) => void;
  onNext: () => void;
  onBack: () => void;
}

export default function TunnelRecevabilite({ dateRefus, onUpdate, onNext, onBack }: TunnelRecevabiliteProps) {
  const [touched, setTouched] = useState(false);

  const today = new Date().toISOString().split("T")[0];

  const { joursEcoules, joursRestants, status } = useMemo(() => {
    // Ne rien évaluer tant que la date n'est pas complète (YYYY-MM-DD) et plausible
    if (!dateRefus || !/^\d{4}-\d{2}-\d{2}$/.test(dateRefus)) {
      return { joursEcoules: 0, joursRestants: 30, status: "empty" as const };
    }
    const d = new Date(dateRefus);
    if (isNaN(d.getTime()) || d.getFullYear() < 2020) {
      return { joursEcoules: 0, joursRestants: 30, status: "empty" as const };
    }
    const now = new Date();
    d.setHours(0, 0, 0, 0);
    now.setHours(0, 0, 0, 0);
    const diff = Math.floor((now.getTime() - d.getTime()) / (1000 * 60 * 60 * 24));
    const restants = 30 - diff;
    if (diff < 0) return { joursEcoules: diff, joursRestants: restants, status: "future" as const };
    if (diff > 30) return { joursEcoules: diff, joursRestants: restants, status: "expired" as const };
    return { joursEcoules: diff, joursRestants: restants, status: "ok" as const };
  }, [dateRefus]);

  const canAdvance = status === "ok";

  return (
    <div className="fixed inset-0 bg-background flex flex-col items-center justify-center px-6 overflow-hidden">
      <div className="absolute w-[600px] h-[600px] -top-[250px] -right-[150px] rounded-full bg-[radial-gradient(circle,rgba(26,80,220,0.08)_0%,transparent_70%)] pointer-events-none" />

      <div className="absolute top-6 left-6 right-6 flex items-center justify-between">
        <button onClick={onBack} className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors">
          <ArrowLeft className="w-4 h-4" />
          Retour
        </button>
        <span className="text-xs text-muted-foreground font-dm">Étape 1 sur 4</span>
      </div>

      <div className="w-full max-w-[460px] animate-in fade-in slide-in-from-bottom-4 duration-500">
        <h2 className="font-fraunces text-[clamp(1.3rem,3vw,1.9rem)] text-cream text-center mb-3 leading-tight">
          À quelle date avez-vous reçu la lettre de refus de visa ?
        </h2>
        <p className="text-sm text-muted-foreground text-center mb-8">
          Vous disposez de <strong className="text-foreground">30 jours calendaires</strong> à compter de la notification pour exercer un recours.
        </p>

        <div className="space-y-3">
          <Label htmlFor="dateRefus" className="text-sm text-muted-foreground">Date de réception</Label>
          <Input
            id="dateRefus"
            type="date"
            value={dateRefus}
            onChange={(e) => { onUpdate(e.target.value); setTouched(true); }}
            onBlur={() => setTouched(true)}
            max={today}
            min="2020-01-01"
            className="h-13 text-base"
            autoFocus
          />
        </div>

        {dateRefus && status === "ok" && (
          <div className="mt-5 flex items-start gap-3 rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-4">
            <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" />
            <div className="text-sm">
              <p className="font-syne font-semibold text-emerald-300">Recours recevable</p>
              <p className="text-muted-foreground mt-1">
                Il vous reste <strong className="text-foreground">{joursRestants} jour{joursRestants > 1 ? "s" : ""}</strong> pour déposer votre recours.
              </p>
            </div>
          </div>
        )}

        {dateRefus && status === "future" && touched && (
          <div className="mt-5 flex items-start gap-3 rounded-xl border border-amber-500/30 bg-amber-500/10 p-4">
            <AlertTriangle className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
            <div className="text-sm">
              <p className="font-syne font-semibold text-amber-300">Date invalide</p>
              <p className="text-muted-foreground mt-1">La date saisie est dans le futur. Merci de saisir la date à laquelle vous avez réellement reçu le refus.</p>
            </div>
          </div>
        )}

        {dateRefus && status === "expired" && (
          <div className="mt-5 rounded-xl border border-destructive/40 bg-destructive/10 p-5">
            <div className="flex items-start gap-3">
              <AlertTriangle className="w-5 h-5 text-destructive shrink-0 mt-0.5" />
              <div className="text-sm">
                <p className="font-syne font-semibold text-destructive">Délai de recours dépassé</p>
                <p className="text-muted-foreground mt-2 leading-relaxed">
                  Vous avez reçu cette décision il y a <strong className="text-foreground">{joursEcoules} jours</strong>. Le délai légal de 30 jours pour exercer un recours est malheureusement expiré.
                </p>
                <p className="text-muted-foreground mt-2 leading-relaxed">
                  Nous ne pouvons pas poursuivre la procédure de contestation pour ce refus.
                </p>
              </div>
            </div>
          </div>
        )}

        <Button
          onClick={onNext}
          disabled={!canAdvance}
          className="w-full h-13 mt-8 text-base font-syne font-bold rounded-2xl gap-2"
        >
          Continuer
          <ArrowRight className="w-5 h-5" />
        </Button>
      </div>
    </div>
  );
}
