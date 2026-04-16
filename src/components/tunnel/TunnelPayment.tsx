import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { ArrowLeft, ArrowRight, Check, Download, Send, Scale, CreditCard, Smartphone } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

type SendOption = "A" | "B" | "C";
type PaymentMethod = "stripe" | "taramoney";

interface OptionCard {
  id: SendOption;
  label: string;
  description: string;
  icon: React.ReactNode;
}

const OPTIONS: OptionCard[] = [
  {
    id: "A",
    label: "Téléchargement",
    description: "Téléchargez votre lettre et envoyez-la vous-même",
    icon: <Download className="w-5 h-5" />,
  },
  {
    id: "B",
    label: "Envoi LRAR",
    description: "Nous imprimons et envoyons votre lettre recommandée",
    icon: <Send className="w-5 h-5" />,
  },
  {
    id: "C",
    label: "LRAR + Avocat",
    description: "Un avocat partenaire relit, signe et nous envoyons",
    icon: <Scale className="w-5 h-5" />,
  },
];

interface Tarifs {
  generation_lettre_eur: number;
  envoi_mysendingbox_eur: number;
  honoraires_avocat_eur: number;
}

function getPrice(option: SendOption, tarifs: Tarifs) {
  const base = tarifs.generation_lettre_eur;
  const lrar = option === "A" ? 0 : tarifs.envoi_mysendingbox_eur;
  const avocat = option === "C" ? tarifs.honoraires_avocat_eur : 0;
  return { base, lrar, avocat, total: base + lrar + avocat };
}

interface TunnelPaymentProps {
  paymentMethod: PaymentMethod;
  onOptionSelected: (option: string) => void;
  onPaymentMethodSelected: (method: PaymentMethod) => void;
  onNext: () => void;
  onBack: () => void;
}

export default function TunnelPayment({
  paymentMethod,
  onOptionSelected,
  onPaymentMethodSelected,
  onNext,
  onBack,
}: TunnelPaymentProps) {
  const [selected, setSelected] = useState<SendOption>("B");
  const [tarifs, setTarifs] = useState<Tarifs>({
    generation_lettre_eur: 49,
    envoi_mysendingbox_eur: 30,
    honoraires_avocat_eur: 70,
  });

  useEffect(() => {
    supabase
      .from("tarification")
      .select("generation_lettre_eur, envoi_mysendingbox_eur, honoraires_avocat_eur")
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle()
      .then(({ data }) => {
        if (data) {
          setTarifs({
            generation_lettre_eur: Number(data.generation_lettre_eur),
            envoi_mysendingbox_eur: Number(data.envoi_mysendingbox_eur),
            honoraires_avocat_eur: Number(data.honoraires_avocat_eur),
          });
        }
      });
  }, []);

  const price = getPrice(selected, tarifs);

  const handleContinue = () => {
    onOptionSelected(selected);
    onNext();
  };

  return (
    <div className="fixed inset-0 bg-background overflow-y-auto">
      <div className="min-h-full flex flex-col items-center px-4 py-8 sm:py-12">
        {/* Header */}
        <div className="w-full max-w-lg">
          <button
            onClick={onBack}
            className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors mb-6"
          >
            <ArrowLeft className="w-4 h-4" /> Retour
          </button>

          <div className="mb-2 flex items-center gap-2">
            <span className="text-xs font-syne font-bold text-gold-2 bg-gold-2/10 px-2 py-0.5 rounded-full">
              Étape 8/9
            </span>
          </div>
          <h1 className="font-fraunces text-2xl sm:text-3xl text-cream mb-2">
            Choisissez votre formule
          </h1>
          <p className="font-dm text-muted-foreground text-sm mb-8">
            Sélectionnez le niveau de service pour votre recours
          </p>
        </div>

        {/* Option cards */}
        <div className="w-full max-w-lg space-y-3 mb-8">
          {OPTIONS.map((opt) => {
            const optPrice = getPrice(opt.id, tarifs);
            const isSelected = selected === opt.id;
            return (
              <button
                key={opt.id}
                onClick={() => setSelected(opt.id)}
                className={`w-full text-left p-4 rounded-2xl border-2 transition-all ${
                  isSelected
                    ? "border-primary bg-primary/10"
                    : "border-border-2 bg-background-2 hover:border-muted"
                }`}
              >
                <div className="flex items-start gap-3">
                  <div
                    className={`mt-0.5 w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${
                      isSelected ? "bg-primary text-white" : "bg-background-3 text-muted-foreground"
                    }`}
                  >
                    {opt.icon}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-syne font-bold text-sm">
                        Option {opt.id} — {opt.label}
                      </span>
                      <span className="font-syne font-bold text-sm text-gold-2 whitespace-nowrap">
                        {optPrice.total} €
                      </span>
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">{opt.description}</p>
                  </div>
                  <div
                    className={`mt-1 w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 ${
                      isSelected ? "border-primary bg-primary" : "border-muted"
                    }`}
                  >
                    {isSelected && <Check className="w-3 h-3 text-white" />}
                  </div>
                </div>
              </button>
            );
          })}
        </div>

        {/* Payment method selector */}
        <div className="w-full max-w-lg mb-6">
          <h3 className="font-syne font-bold text-xs uppercase tracking-wider text-muted-foreground mb-3">
            Mode de paiement
          </h3>
          <div className="grid grid-cols-2 gap-3">
            <button
              onClick={() => onPaymentMethodSelected("stripe")}
              className={`p-3 rounded-xl border-2 transition-all flex items-center gap-2 ${
                paymentMethod === "stripe"
                  ? "border-primary bg-primary/10"
                  : "border-border-2 bg-background-2 hover:border-muted"
              }`}
            >
              <CreditCard className={`w-5 h-5 ${paymentMethod === "stripe" ? "text-primary" : "text-muted-foreground"}`} />
              <div className="text-left">
                <p className="font-syne font-bold text-xs">Carte bancaire</p>
                <p className="text-[10px] text-muted-foreground">Visa, Mastercard</p>
              </div>
            </button>
            <button
              onClick={() => onPaymentMethodSelected("taramoney")}
              className={`p-3 rounded-xl border-2 transition-all flex items-center gap-2 ${
                paymentMethod === "taramoney"
                  ? "border-primary bg-primary/10"
                  : "border-border-2 bg-background-2 hover:border-muted"
              }`}
            >
              <Smartphone className={`w-5 h-5 ${paymentMethod === "taramoney" ? "text-primary" : "text-muted-foreground"}`} />
              <div className="text-left">
                <p className="font-syne font-bold text-xs">Mobile Money</p>
                <p className="text-[10px] text-muted-foreground">WhatsApp, Dikalo</p>
              </div>
            </button>
          </div>
        </div>

        {/* Price breakdown */}
        <div className="w-full max-w-lg bg-background-2 rounded-2xl p-4 mb-8 border border-border-2">
          <h3 className="font-syne font-bold text-xs uppercase tracking-wider text-muted-foreground mb-3">
            Détail du prix
          </h3>
          <div className="space-y-2 text-sm font-dm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Génération de la lettre</span>
              <span>{price.base} €</span>
            </div>
            {price.lrar > 0 && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">Envoi LRAR recommandé</span>
                <span>{price.lrar} €</span>
              </div>
            )}
            {price.avocat > 0 && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">Honoraires avocat</span>
                <span>{price.avocat} €</span>
              </div>
            )}
            <div className="border-t border-border-2 pt-2 flex justify-between font-syne font-bold">
              <span>Total</span>
              <span className="text-gold-2">{price.total} €</span>
            </div>
          </div>
        </div>

        {/* CTA */}
        <div className="w-full max-w-lg">
          <Button
            onClick={handleContinue}
            size="lg"
            className="w-full h-14 text-base font-syne font-bold rounded-2xl gap-2 bg-primary hover:bg-primary-hover"
          >
            Créer mon compte & payer
            <ArrowRight className="w-5 h-5" />
          </Button>
          <p className="text-center text-xs text-muted-foreground mt-3">
            {paymentMethod === "stripe"
              ? "Paiement sécurisé par Stripe · Vous serez redirigé après inscription"
              : "Paiement via Mobile Money · Liens envoyés après inscription"}
          </p>
        </div>
      </div>
    </div>
  );
}
