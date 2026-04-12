import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import { Eyebrow, BigTitle, Box } from "@/components/ui-custom";

interface LrarTrackingSuiviProps {
  dossierId: string;
  dossierRef: string;
}

const STEPS = [
  { key: "lrar_envoye", label: "Pris en charge", icon: "📦" },
  { key: "lrar_cree", label: "Imprimé", icon: "🖨️" },
  { key: "depose_poste", label: "Déposé La Poste", icon: "📮" },
  { key: "en_transit", label: "En transit", icon: "🚚" },
  { key: "livre", label: "Livré et signé", icon: "✅" },
] as const;

const STATUS_INDEX: Record<string, number> = {
  pending: -1,
  lrar_envoye: 0,
  lrar_cree: 1,
  depose_poste: 2,
  en_transit: 3,
  attente_retrait: 3,
  livre: 4,
  ar_signe: 4,
  retourne: -2,
  adresse_incorrecte: -2,
  erreur: -2,
};

export function LrarTrackingSuivi({ dossierId, dossierRef }: LrarTrackingSuiviProps) {
  const [dossier, setDossier] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      const { data } = await supabase
        .from("dossiers")
        .select("lrar_status, tracking_number, sent_at, delivered_at, recipient_name, dossier_ref")
        .eq("id", dossierId)
        .single();
      setDossier(data);
      setLoading(false);
    };
    load();

    // Realtime subscription
    const channel = supabase
      .channel(`lrar-tracking-${dossierId}`)
      .on("postgres_changes", {
        event: "UPDATE",
        schema: "public",
        table: "dossiers",
        filter: `id=eq.${dossierId}`,
      }, (payload) => {
        setDossier((prev: any) => ({ ...prev, ...payload.new }));
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [dossierId]);

  if (loading) {
    return (
      <div className="text-center py-12 text-muted-foreground">
        <div className="animate-spin h-8 w-8 border-4 border-primary border-t-transparent rounded-full mx-auto mb-4" />
        <p className="text-sm">Chargement du suivi…</p>
      </div>
    );
  }

  if (!dossier || dossier.lrar_status === "pending") {
    return (
      <div>
        <Eyebrow>Suivi LRAR</Eyebrow>
        <BigTitle>En attente d'envoi</BigTitle>
        <Box variant="alert" title="📬 Votre LRAR n'a pas encore été envoyée">
          Complétez les étapes précédentes pour déclencher l'envoi.
        </Box>
      </div>
    );
  }

  const statusIdx = STATUS_INDEX[dossier.lrar_status] ?? -1;
  const isError = statusIdx === -2;
  const progressPercent = isError ? 0 : Math.max(0, ((statusIdx + 1) / STEPS.length) * 100);

  // Compute estimated decision date (60 days after delivery)
  const deliveredAt = dossier.delivered_at ? new Date(dossier.delivered_at) : null;
  const sentAt = dossier.sent_at ? new Date(dossier.sent_at) : null;
  const decisionDate = deliveredAt
    ? new Date(deliveredAt.getTime() + 60 * 86400000)
    : sentAt
      ? new Date(sentAt.getTime() + 62 * 86400000) // ~60 + 2 days transit
      : null;

  const daysElapsed = sentAt ? Math.ceil((Date.now() - sentAt.getTime()) / 86400000) : 0;
  const daysRemaining = decisionDate ? Math.max(0, Math.ceil((decisionDate.getTime() - Date.now()) / 86400000)) : null;

  return (
    <div>
      <Eyebrow>Suivi LRAR</Eyebrow>
      <BigTitle>Suivi de votre envoi</BigTitle>

      {/* Error status */}
      {isError && (
        <Box variant="alert" title={`🚨 Problème détecté — ${dossier.lrar_status}`}>
          {dossier.lrar_status === "retourne"
            ? "Votre courrier a été retourné. L'équipe IZY vous contacte dans les 2 heures."
            : dossier.lrar_status === "adresse_incorrecte"
              ? "Adresse incorrecte. La LRAR n'a pas pu être distribuée."
              : "Un incident postal est survenu. L'équipe IZY prend en charge un renvoi immédiat."}
        </Box>
      )}

      {/* Delivered success */}
      {(dossier.lrar_status === "livre" || dossier.lrar_status === "ar_signe") && deliveredAt && (
        <Box variant="ok" title={`✓ LRAR livré — ${deliveredAt.toLocaleDateString("fr-FR")} · Signé par la CRRV`}>
          Accusé de réception archivé. Le délai de 2 mois d'instruction commence à courir.
          {decisionDate && ` Décision attendue avant le ${decisionDate.toLocaleDateString("fr-FR")}.`}
        </Box>
      )}

      {/* 5-step progress bar */}
      {!isError && (
        <div className="mb-6">
          <Progress value={progressPercent} className="h-2 mb-3" />
          <div className="flex justify-between">
            {STEPS.map((s, i) => {
              const isDone = i <= statusIdx;
              const isCurrent = i === statusIdx;
              return (
                <div key={s.key} className="flex flex-col items-center gap-1">
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm border-2 transition-all ${
                    isDone
                      ? "border-primary bg-primary text-primary-foreground"
                      : "border-border bg-background text-muted-foreground"
                  } ${isCurrent ? "ring-2 ring-primary/30 ring-offset-2 ring-offset-background" : ""}`}>
                    {isDone ? "✓" : s.icon}
                  </div>
                  <span className={`text-[0.65rem] font-syne font-bold text-center max-w-[70px] leading-tight ${isDone ? "text-foreground" : "text-muted-foreground"}`}>
                    {s.label}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Tracking info */}
      <div className="bg-panel border border-border rounded-xl p-5 space-y-3 mb-5">
        <h3 className="font-syne font-bold text-sm">📋 Informations de suivi</h3>

        {dossier.tracking_number && (
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">N° LRAR</span>
            <code className="font-mono text-sm bg-muted px-2 py-1 rounded">{dossier.tracking_number}</code>
          </div>
        )}

        {sentAt && (
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">Date d'envoi</span>
            <span className="text-sm">{sentAt.toLocaleDateString("fr-FR")}</span>
          </div>
        )}

        {deliveredAt && (
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">Date de livraison</span>
            <span className="text-sm text-green-600 font-medium">{deliveredAt.toLocaleDateString("fr-FR")}</span>
          </div>
        )}

        {!deliveredAt && sentAt && (
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">Livraison estimée</span>
            <span className="text-sm">{new Date(sentAt.getTime() + 2 * 86400000).toLocaleDateString("fr-FR")} (J+2 ouvrés)</span>
          </div>
        )}

        {decisionDate && (
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">Décision CRRV attendue avant</span>
            <span className="text-sm font-syne font-bold text-accent">{decisionDate.toLocaleDateString("fr-FR")}</span>
          </div>
        )}

        {daysRemaining !== null && daysRemaining > 0 && (
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">Délai restant</span>
            <span className="text-sm font-syne font-bold">J+{daysElapsed} · {daysRemaining} jours restants</span>
          </div>
        )}
      </div>

      {/* Action buttons */}
      <div className="flex gap-2.5 flex-wrap">
        {dossier.tracking_number && (
          <Button variant="outline" size="sm" asChild>
            <a
              href={`https://www.laposte.fr/outils/suivre-vos-envois?code=${dossier.tracking_number}`}
              target="_blank"
              rel="noopener noreferrer"
            >
              📍 Suivre sur laposte.fr
            </a>
          </Button>
        )}

        {(dossier.lrar_status === "livre" || dossier.lrar_status === "ar_signe") && (
          <Button variant="outline" size="sm">
            ⬇️ Télécharger l'AR
          </Button>
        )}
      </div>
    </div>
  );
}
