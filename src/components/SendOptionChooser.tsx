import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Eyebrow, BigTitle, Desc, Box } from "@/components/ui-custom";

interface Tarification {
  generation_lettre_eur: number;
  envoi_mysendingbox_eur: number;
  honoraires_avocat_eur: number;
}

interface SendOptionChooserProps {
  dossierRef: string;
  dateNotification?: string;
  onSelect: (option: "A" | "B" | "C") => void;
  onBack: () => void;
  loading?: boolean;
}

export const SendOptionChooser = ({ dossierRef, dateNotification, onSelect, onBack, loading = false }: SendOptionChooserProps) => {
  const [tarifs, setTarifs] = useState<Tarification | null>(null);
  const [daysLeft, setDaysLeft] = useState<number | null>(null);

  useEffect(() => {
    const fetchTarifs = async () => {
      const { data } = await supabase.from("tarification").select("*").limit(1).single();
      if (data) setTarifs(data as unknown as Tarification);
    };
    fetchTarifs();
  }, []);

  useEffect(() => {
    if (dateNotification) {
      const notif = new Date(dateNotification);
      const deadline = new Date(notif);
      deadline.setDate(deadline.getDate() + 30);
      const diff = Math.ceil((deadline.getTime() - Date.now()) / 86400000);
      setDaysLeft(diff);
    }
  }, [dateNotification]);

  const genPrice = tarifs?.generation_lettre_eur || 49;
  const msbPrice = tarifs?.envoi_mysendingbox_eur || 30;
  const avocatPrice = tarifs?.honoraires_avocat_eur || 70;

  const totalA = genPrice;
  const totalB = genPrice + msbPrice;
  const totalC = genPrice + msbPrice + avocatPrice;

  return (
    <div>
      <Eyebrow>Choix du mode d'envoi</Eyebrow>
      <BigTitle>Comment souhaitez-vous envoyer votre recours ?</BigTitle>
      <Desc>Votre lettre est prête. Choisissez votre mode d'envoi.</Desc>

      {/* Option A — Téléchargement */}
      {loading && (
        <Box variant="info" title="Finalisation de la lettre">
          Préparation du PDF définitif avant paiement…
        </Box>
      )}

      <div className={`bg-panel border border-border rounded-xl p-5 mb-4 transition-all group ${loading ? "opacity-60 pointer-events-none" : "cursor-pointer hover:border-primary-hover/40"}`} onClick={() => onSelect("A")}>
        <div className="flex gap-4 items-start">
          <div className="text-3xl flex-shrink-0">📥</div>
          <div className="flex-1">
            <h3 className="font-syne font-bold text-sm mb-1">Je télécharge et j'envoie moi-même</h3>
            <p className="text-xs text-muted-foreground leading-relaxed mb-3">
              Je signe ma lettre électroniquement et je la télécharge en PDF. Je l'envoie par lettre recommandée depuis un bureau de poste.
            </p>
            <div className="grid grid-cols-2 gap-2 text-xs text-muted-foreground">
              <div>✓ Solution économique<br />✓ Contrôle total</div>
              <div>⚠️ Envoi en recommandé à gérer<br />⚠️ Déplacement requis</div>
            </div>
          </div>
          <div className="text-right flex-shrink-0">
            <div className="font-syne font-extrabold text-xl">{totalA.toFixed(0)}€</div>
          </div>
        </div>
        <button className="mt-3 font-syne font-bold text-xs px-4 py-2 rounded-lg bg-foreground/[0.07] text-muted-foreground border border-border-2 group-hover:bg-primary-hover/10 group-hover:text-primary-hover group-hover:border-primary-hover/30 transition-all">
          Choisir cette option →
        </button>
      </div>

      {/* Option B — MySendingBox */}
      <div className={`bg-gradient-to-br from-post-dark/20 to-gold-3/[0.08] border-[1.5px] border-post-dark/35 rounded-[14px] p-5 mb-4 transition-all group ${loading ? "opacity-60 pointer-events-none" : "cursor-pointer hover:border-primary-hover/50"}`} onClick={() => onSelect("B")}>
        <div className="flex gap-4 items-start">
          <div className="flex flex-col items-center gap-0.5 flex-shrink-0">
            <div className="bg-post-dark text-post font-syne font-extrabold text-sm px-2.5 py-1 rounded-t">LA POSTE</div>
            <div className="bg-post text-post-dark font-syne font-extrabold text-[0.65rem] px-2.5 py-0.5 rounded-b tracking-wider">MYSENDINGBOX</div>
          </div>
          <div className="flex-1">
            <h3 className="font-syne font-bold text-sm mb-1">IZY envoie par courrier recommandé</h3>
            <p className="text-xs text-muted-foreground leading-relaxed mb-3">
              Je signe ma lettre électroniquement et IZY l'envoie automatiquement en LRAR via MySendingBox.
            </p>
            <div className="grid grid-cols-2 gap-2 text-xs text-muted-foreground">
              <div>✓ Aucun déplacement<br />✓ Envoi garanti J+1<br />✓ Numéro de suivi LRAR</div>
              <div>✓ Accusé de réception archivé<br />✓ Notification WhatsApp à chaque étape</div>
            </div>
          </div>
          <div className="text-right flex-shrink-0">
            <div className="font-syne font-extrabold text-xl">{totalB.toFixed(0)}€</div>
          </div>
        </div>
        <button className="mt-3 font-syne font-bold text-xs px-4 py-2 rounded-lg bg-primary-hover text-foreground hover:bg-[#5585ff] transition-all">
          Choisir cette option →
        </button>
      </div>

      {/* Option C — Avocat */}
      <div className={`bg-gradient-to-br from-primary/10 to-gold/[0.07] border-[1.5px] border-gold-2/35 rounded-[14px] p-5 mb-4 relative overflow-hidden transition-all group ${loading ? "opacity-60 pointer-events-none" : "cursor-pointer hover:border-gold-2/60"}`} onClick={() => onSelect("C")}>
        <div className="absolute top-3 right-3 bg-gold-2 text-background font-syne text-[0.58rem] font-extrabold px-2 py-0.5 rounded tracking-wider">RECOMMANDÉ</div>
        <div className="flex gap-4 items-start">
          <div className="text-3xl flex-shrink-0">⚖️</div>
          <div className="flex-1">
            <h3 className="font-syne font-bold text-[0.95rem] mb-1">Un avocat relit, signe et envoie</h3>
            <p className="text-xs text-gold leading-relaxed mb-3">
              Un avocat partenaire IZY relit votre lettre, la corrige si nécessaire, la signe en son nom et l'envoie par courrier recommandé.
            </p>
            <div className="grid grid-cols-2 gap-2 text-xs text-muted-foreground">
              <div>✓ Lettre signée par un avocat<br />✓ Relecture juridique complète<br />✓ Arguments renforcés si nécessaire</div>
              <div>✓ Envoi LRAR garanti<br />✓ Meilleure crédibilité devant la commission</div>
            </div>
          </div>
          <div className="text-right flex-shrink-0">
            <div className="font-syne font-extrabold text-xl">{totalC.toFixed(0)}€</div>
          </div>
        </div>
        <button className="mt-3 font-syne font-bold text-xs px-4 py-2 rounded-lg bg-gold text-foreground hover:bg-gold-2 transition-all">
          Choisir cette option →
        </button>
      </div>

      {/* Deadline warning */}
      {daysLeft !== null && daysLeft > 0 && (
        <Box variant={daysLeft <= 7 ? "alert" : "info"} title={`⏰ Il vous reste ${daysLeft} jour${daysLeft > 1 ? "s" : ""} pour déposer votre recours`}>
          Choisissez et payez maintenant pour respecter ce délai.
        </Box>
      )}

      <div className="flex gap-2.5 mt-7">
        <button className="font-syne font-bold text-[0.78rem] px-5 py-2.5 rounded-[7px] bg-foreground/[0.07] text-muted-foreground border border-border-2 transition-all" onClick={onBack}>← Retour</button>
      </div>
    </div>
  );
};
