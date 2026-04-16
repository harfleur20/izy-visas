import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ArrowRight, ArrowLeft, Check, ChevronsUpDown } from "lucide-react";
import { TunnelIdentityData } from "@/hooks/useTunnelState";
import { NATIONALITIES } from "@/lib/nationalities";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { cn } from "@/lib/utils";
import { PhoneInput, isValidPhoneNumber } from "@/components/PhoneInput";

interface TunnelIdentityProps {
  identity: TunnelIdentityData;
  onUpdate: (data: Partial<TunnelIdentityData>) => void;
  onNext: () => void;
  onBack: () => void;
}

type SubStep = "name" | "birth" | "passport" | "contact";

export default function TunnelIdentity({ identity, onUpdate, onNext, onBack }: TunnelIdentityProps) {
  const [subStep, setSubStep] = useState<SubStep>("name");
  const [natOpen, setNatOpen] = useState(false);

  const canAdvanceName = identity.firstName.trim().length >= 2 && identity.lastName.trim().length >= 2;
  const canAdvanceBirth = identity.dateNaissance.trim().length > 0 && identity.lieuNaissance.trim().length > 0 && identity.nationalite.trim().length > 0;
  const canAdvancePassport = identity.passportNumber.trim().length >= 5;
  const isEmailValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(identity.email);
  const isPhoneValid = identity.phone.length === 0 || isValidPhoneNumber(identity.phone);
  const canAdvanceContact = isEmailValid && isPhoneValid;

  const handleNext = () => {
    if (subStep === "name") setSubStep("birth");
    else if (subStep === "birth") setSubStep("passport");
    else if (subStep === "passport") setSubStep("contact");
    else onNext();
  };

  const handleBack = () => {
    if (subStep === "name") onBack();
    else if (subStep === "birth") setSubStep("name");
    else if (subStep === "passport") setSubStep("birth");
    else setSubStep("passport");
  };

  const canAdvance =
    subStep === "name" ? canAdvanceName
    : subStep === "birth" ? canAdvanceBirth
    : subStep === "passport" ? canAdvancePassport
    : canAdvanceContact;

  const titles: Record<SubStep, string> = {
    name: "Comment vous appelez-vous ?",
    birth: "Informations de naissance",
    passport: "Numéro de passeport",
    contact: "Vos coordonnées",
  };

  return (
    <div className="fixed inset-0 bg-background flex flex-col items-center justify-center px-6 overflow-hidden">
      {/* Background orbs */}
      <div className="absolute w-[600px] h-[600px] -top-[250px] -right-[150px] rounded-full bg-[radial-gradient(circle,rgba(26,80,220,0.08)_0%,transparent_70%)] pointer-events-none" />

      {/* Step indicator */}
      <div className="absolute top-6 left-6 right-6 flex items-center justify-between">
        <button onClick={handleBack} className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors">
          <ArrowLeft className="w-4 h-4" />
          Retour
        </button>
        <span className="text-xs text-muted-foreground font-dm">Étape 1 sur 7</span>
      </div>

      <div className="w-full max-w-[420px] animate-in fade-in slide-in-from-bottom-4 duration-500">
        <h2 className="font-fraunces text-[clamp(1.2rem,3vw,1.8rem)] text-cream text-center mb-8 leading-tight">
          {titles[subStep]}
        </h2>

        {subStep === "name" && (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="firstName" className="text-sm text-muted-foreground">Prénom</Label>
              <Input
                id="firstName"
                value={identity.firstName}
                onChange={(e) => onUpdate({ firstName: e.target.value })}
                placeholder="Ex : Amadou"
                className="h-12 text-base"
                autoFocus
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="lastName" className="text-sm text-muted-foreground">Nom</Label>
              <Input
                id="lastName"
                value={identity.lastName}
                onChange={(e) => onUpdate({ lastName: e.target.value.toUpperCase() })}
                placeholder="Ex : NDIAYE"
                className="h-12 text-base"
              />
            </div>
          </div>
        )}

        {subStep === "birth" && (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="dateNaissance" className="text-sm text-muted-foreground">Date de naissance</Label>
              <Input
                id="dateNaissance"
                type="date"
                value={identity.dateNaissance}
                onChange={(e) => onUpdate({ dateNaissance: e.target.value })}
                className="h-12 text-base"
                autoFocus
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="lieuNaissance" className="text-sm text-muted-foreground">Lieu de naissance</Label>
              <Input
                id="lieuNaissance"
                value={identity.lieuNaissance}
                onChange={(e) => onUpdate({ lieuNaissance: e.target.value })}
                placeholder="Ex : Douala"
                className="h-12 text-base"
              />
            </div>
            <div className="space-y-2">
              <Label className="text-sm text-muted-foreground">Nationalité</Label>
              <Popover open={natOpen} onOpenChange={setNatOpen}>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    role="combobox"
                    aria-expanded={natOpen}
                    className="w-full h-12 justify-between text-base font-normal"
                  >
                    {identity.nationalite ? (
                      <span className="flex items-center gap-2">
                        <span className="text-lg">{NATIONALITIES.find(n => n.label === identity.nationalite)?.flag}</span>
                        <span>{identity.nationalite}</span>
                      </span>
                    ) : (
                      <span className="text-muted-foreground">Sélectionnez votre nationalité</span>
                    )}
                    <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0" align="start">
                  <Command>
                    <CommandInput placeholder="Rechercher un pays…" />
                    <CommandList>
                      <CommandEmpty>Aucun résultat.</CommandEmpty>
                      <CommandGroup>
                        {NATIONALITIES.map((n) => (
                          <CommandItem
                            key={n.code}
                            value={`${n.flag} ${n.label}`}
                            onSelect={() => {
                              onUpdate({ nationalite: n.label });
                              setNatOpen(false);
                            }}
                          >
                            <Check className={cn("mr-2 h-4 w-4", identity.nationalite === n.label ? "opacity-100" : "opacity-0")} />
                            <span className="text-lg mr-2">{n.flag}</span>
                            {n.label}
                          </CommandItem>
                        ))}
                      </CommandGroup>
                    </CommandList>
                  </Command>
                </PopoverContent>
              </Popover>
            </div>
          </div>
        )}

        {subStep === "passport" && (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="passportNumber" className="text-sm text-muted-foreground">Numéro de passeport</Label>
              <Input
                id="passportNumber"
                value={identity.passportNumber}
                onChange={(e) => onUpdate({ passportNumber: e.target.value.toUpperCase() })}
                placeholder="Ex : PA123456"
                className="h-12 text-base font-mono tracking-wider"
                autoFocus
              />
            </div>
            <p className="text-xs text-muted-foreground leading-relaxed">
              Ce numéro figure sur la page d'identité de votre passeport.
            </p>
          </div>
        )}

        {subStep === "contact" && (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email" className="text-sm text-muted-foreground">Adresse email</Label>
              <Input
                id="email"
                type="email"
                value={identity.email}
                onChange={(e) => onUpdate({ email: e.target.value })}
                placeholder="Ex : amadou@email.com"
                className="h-12 text-base"
                autoFocus
              />
              {identity.email.length > 0 && !isEmailValid && (
                <p className="text-destructive text-xs">Adresse email invalide</p>
              )}
            </div>
            <div className="space-y-2">
              <Label className="text-sm text-muted-foreground">Numéro de téléphone <span className="text-muted-foreground/60">(optionnel)</span></Label>
              <PhoneInput
                value={identity.phone}
                onChange={(v) => onUpdate({ phone: v })}
                error={identity.phone.length > 4 && !isPhoneValid ? "Numéro invalide" : undefined}
              />
            </div>
            <p className="text-xs text-muted-foreground leading-relaxed">
              Ces informations apparaîtront sur votre lettre de contestation.
            </p>
          </div>
        )}

        <Button
          onClick={handleNext}
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
