import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ArrowRight, ArrowLeft, Check, ChevronsUpDown } from "lucide-react";
import { TunnelIdentityData } from "@/hooks/useTunnelState";
import { NATIONALITIES } from "@/lib/nationalities";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { cn } from "@/lib/utils";
interface TunnelIdentityProps {
  identity: TunnelIdentityData;
  onUpdate: (data: Partial<TunnelIdentityData>) => void;
  onNext: () => void;
  onBack: () => void;
}

type SubStep = "name" | "birth" | "passport";

export default function TunnelIdentity({ identity, onUpdate, onNext, onBack }: TunnelIdentityProps) {
  const [subStep, setSubStep] = useState<SubStep>("name");

  const canAdvanceName = identity.firstName.trim().length >= 2 && identity.lastName.trim().length >= 2;
  const canAdvanceBirth = identity.dateNaissance.trim().length > 0 && identity.lieuNaissance.trim().length > 0 && identity.nationalite.trim().length > 0;
  const canAdvancePassport = identity.passportNumber.trim().length >= 5;

  const handleNext = () => {
    if (subStep === "name") setSubStep("birth");
    else if (subStep === "birth") setSubStep("passport");
    else onNext();
  };

  const handleBack = () => {
    if (subStep === "name") onBack();
    else if (subStep === "birth") setSubStep("name");
    else setSubStep("birth");
  };

  const canAdvance = subStep === "name" ? canAdvanceName : subStep === "birth" ? canAdvanceBirth : canAdvancePassport;

  const titles: Record<SubStep, string> = {
    name: "Comment vous appelez-vous ?",
    birth: "Informations de naissance",
    passport: "Numéro de passeport",
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
                placeholder="Ex : Jean"
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
                placeholder="Ex : DUPONT"
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
              <Select
                value={identity.nationalite}
                onValueChange={(value) => onUpdate({ nationalite: value })}
              >
                <SelectTrigger className="h-12 text-base">
                  <SelectValue placeholder="Sélectionnez votre nationalité" />
                </SelectTrigger>
                <SelectContent className="max-h-[280px]">
                  {NATIONALITIES.map((n) => (
                    <SelectItem key={n.code} value={n.label}>
                      <span className="flex items-center gap-2">
                        <span className="text-lg">{n.flag}</span>
                        <span>{n.label}</span>
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
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
