import { useState, useEffect, useCallback, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Eyebrow, BigTitle, Desc, Box, SectionLabel } from "@/components/ui-custom";
import { toast } from "sonner";
import type { Database } from "@/integrations/supabase/types";

type DossierUpdate = Database["public"]["Tables"]["dossiers"]["Update"];

interface OptionalPiece {
  id: string;
  title: string;
  pages: number;
  pdfUrl: string;
  uploadedAt?: string;
}

interface MandatoryPiece {
  title: string;
  pages: number;
  date?: string;
}

interface LrarCompositionProps {
  dossierRef: string;
  dossierId: string;
  clientName: string;
  clientFirstName: string;
  clientLastName: string;
  visaType: string;
  mandatoryPieces: MandatoryPiece[];
  optionalPieces: OptionalPiece[];
  onConfirm: (data: {
    selectedPieceIds: string[];
    totalPages: number;
    totalCost: number;
    mandatoryPages: number;
    optionalPages: number;
  }) => void;
  onBack: () => void;
}

export function LrarComposition({
  dossierRef,
  dossierId,
  clientName,
  clientFirstName,
  clientLastName,
  visaType,
  mandatoryPieces,
  optionalPieces,
  onConfirm,
  onBack,
}: LrarCompositionProps) {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [totalPricing, setTotalPricing] = useState<number | null>(null);
  const [mandatoryOnlyPricing, setMandatoryOnlyPricing] = useState<number | null>(null);
  const [pricingLoading, setPricingLoading] = useState(false);
  const [consentChecked, setConsentChecked] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const mandatoryPages = useMemo(
    () => mandatoryPieces.reduce((s, p) => s + p.pages, 0),
    [mandatoryPieces]
  );

  const selectedOptionalPages = useMemo(
    () => optionalPieces.filter((p) => selectedIds.has(p.id)).reduce((s, p) => s + p.pages, 0),
    [optionalPieces, selectedIds]
  );

  const totalPages = mandatoryPages + selectedOptionalPages;
  const hasOptionalSelected = selectedIds.size > 0;

  // Fetch pricing
  const fetchPricing = useCallback(async (pageCount: number) => {
    if (pageCount < 1) return null;
    try {
      const { data, error } = await supabase.functions.invoke("msb-pricing", {
        body: { page_count: pageCount },
      });
      if (error) throw error;
      return typeof data?.price === "number"
        ? data.price
        : (data?.total ?? data?.price_excluding_tax ?? 0);
    } catch (err) {
      console.error("Pricing error:", err);
      return null;
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    setPricingLoading(true);

    const load = async () => {
      const [total, mandOnly] = await Promise.all([
        fetchPricing(totalPages),
        hasOptionalSelected ? fetchPricing(mandatoryPages) : Promise.resolve(null),
      ]);
      if (cancelled) return;
      setTotalPricing(total);
      setMandatoryOnlyPricing(mandOnly);
      setPricingLoading(false);
    };
    load();
    return () => { cancelled = true; };
  }, [totalPages, mandatoryPages, hasOptionalSelected, fetchPricing]);

  const supplementCost = useMemo(() => {
    if (totalPricing === null || mandatoryOnlyPricing === null) return null;
    return Math.max(0, totalPricing - mandatoryOnlyPricing);
  }, [totalPricing, mandatoryOnlyPricing]);

  const togglePiece = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
    setConsentChecked(false);
  };

  const toggleAll = () => {
    if (selectedIds.size === optionalPieces.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(optionalPieces.map((p) => p.id)));
    }
    setConsentChecked(false);
  };

  const handleConfirm = async () => {
    if (hasOptionalSelected && !consentChecked) {
      toast.error("Veuillez accepter le consentement au supplément avant de continuer.");
      return;
    }
    setSubmitting(true);
    try {
      const dossierPatch: DossierUpdate = {
        pieces_selectionnees_ids: Array.from(selectedIds),
        pieces_obligatoires_pages: mandatoryPages,
        pieces_optionnelles_pages: selectedOptionalPages,
        cout_mysendingbox_total: totalPricing ?? 0,
        consentement_supplement: hasOptionalSelected ? consentChecked : true,
        lrar_status: "composition_lrar_validee",
      };
      // Save selection to dossier
      await supabase
        .from("dossiers")
        .update(dossierPatch)
        .eq("id", dossierId);

      onConfirm({
        selectedPieceIds: Array.from(selectedIds),
        totalPages,
        totalCost: totalPricing ?? 0,
        mandatoryPages,
        optionalPages: selectedOptionalPages,
      });
    } catch (err) {
      console.error("Confirm error:", err);
      toast.error("Une erreur est survenue. Réessayez.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div>
      <Eyebrow>Composition LRAR</Eyebrow>
      <BigTitle>Composition de votre envoi LRAR</BigTitle>
      <Desc>
        Sélectionnez les pièces à joindre à votre envoi recommandé. Les pièces obligatoires sont
        toujours incluses.
      </Desc>

      {/* ── SECTION 1 — Pièces obligatoires ── */}
      <SectionLabel>Pièces obligatoires (non décochables)</SectionLabel>
      <div className="space-y-2 mb-6">
        {mandatoryPieces.map((piece, idx) => (
          <div
            key={idx}
            className="bg-muted/30 border border-border rounded-xl p-4 flex items-center gap-3 opacity-80"
          >
            <div className="w-5 h-5 rounded bg-muted flex items-center justify-center text-xs">
              🔒
            </div>
            <div className="flex-1">
              <div className="font-syne font-bold text-sm">{piece.title}</div>
              <div className="text-xs text-muted-foreground">
                {piece.pages} page{piece.pages > 1 ? "s" : ""}
                {piece.date && ` · ${piece.date}`}
              </div>
            </div>
            <span className="text-xs font-syne font-semibold text-muted-foreground">
              Obligatoire — Incluse
            </span>
          </div>
        ))}
      </div>

      {/* ── SECTION 2 — Pièces optionnelles ── */}
      {optionalPieces.length > 0 && (
        <>
          <SectionLabel>Pièces optionnelles</SectionLabel>
          <Box variant="info" title="ℹ️ Pièces complémentaires">
            Ces pièces renforcent votre dossier. Leur envoi par LRAR est optionnel. Chaque pièce
            ajoutée augmente le coût d'impression MySendingBox.
          </Box>

          <div className="space-y-2 mb-3">
            {optionalPieces.map((piece) => (
              <div
                key={piece.id}
                className={`border rounded-xl p-4 flex items-center gap-3 cursor-pointer transition-all ${
                  selectedIds.has(piece.id)
                    ? "border-primary/40 bg-primary/[0.06]"
                    : "border-border bg-card hover:bg-accent/5"
                }`}
                onClick={() => togglePiece(piece.id)}
              >
                <Checkbox
                  checked={selectedIds.has(piece.id)}
                  onCheckedChange={() => togglePiece(piece.id)}
                  className="mt-0.5"
                />
                <div className="flex-1">
                  <div className="font-syne font-bold text-sm">{piece.title}</div>
                  <div className="text-xs text-muted-foreground">
                    {piece.pages} page{piece.pages > 1 ? "s" : ""}
                    {piece.uploadedAt && ` · Uploadée le ${piece.uploadedAt}`}
                  </div>
                </div>
              </div>
            ))}
          </div>

          <button
            onClick={toggleAll}
            className="text-xs text-primary hover:underline font-syne font-semibold mb-6 block"
          >
            {selectedIds.size === optionalPieces.length
              ? "☐ Tout désélectionner"
              : "☑ Tout sélectionner"}
          </button>
        </>
      )}

      {/* No optional selected warning */}
      {optionalPieces.length > 0 && selectedIds.size === 0 && (
        <Box variant="warn" title="ℹ️ Envoi des pièces obligatoires uniquement">
          Vous envoyez uniquement les pièces obligatoires. Votre recours est recevable. La
          commission disposera de la lettre, de la décision et du dossier déposé au Consulat. Vous
          pourrez transmettre des pièces complémentaires directement à la commission pendant le
          délai de 2 mois d'instruction.
        </Box>
      )}

      {/* ── SECTION 3 — Récapitulatif temps réel ── */}
      <Card className="mb-6">
        <CardHeader className="pb-3">
          <CardTitle className="font-syne text-base">Récapitulatif envoi LRAR</CardTitle>
        </CardHeader>
        <CardContent className="space-y-1">
          <div className="text-xs font-syne font-semibold text-muted-foreground uppercase tracking-wider mb-1">
            Pièces obligatoires
          </div>
          {mandatoryPieces.map((p, i) => (
            <div key={i} className="flex justify-between text-sm">
              <span>{p.title}</span>
              <span className="text-muted-foreground">{p.pages} p.</span>
            </div>
          ))}

          {hasOptionalSelected && (
            <>
              <div className="border-t border-border my-2" />
              <div className="text-xs font-syne font-semibold text-muted-foreground uppercase tracking-wider mb-1">
                Pièces optionnelles sélectionnées
              </div>
              {optionalPieces
                .filter((p) => selectedIds.has(p.id))
                .map((p) => (
                  <div key={p.id} className="flex justify-between text-sm">
                    <span>{p.title}</span>
                    <span className="text-muted-foreground">{p.pages} p.</span>
                  </div>
                ))}
            </>
          )}

          <div className="border-t border-border my-2" />
          <div className="flex justify-between font-syne font-bold">
            <span>Total pages</span>
            <span>{totalPages}</span>
          </div>
          <div className="flex justify-between font-syne font-bold text-lg">
            <span>Coût MySendingBox</span>
            <span>
              {pricingLoading ? (
                <span className="text-sm text-muted-foreground animate-pulse">Calcul…</span>
              ) : totalPricing !== null ? (
                `${totalPricing.toFixed(2)} €`
              ) : (
                <span className="text-sm text-muted-foreground">—</span>
              )}
            </span>
          </div>
          <div className="text-xs text-muted-foreground">
            Calculé via l'API MySendingBox en temps réel
          </div>
        </CardContent>
      </Card>

      {/* ── Consent for supplement ── */}
      {hasOptionalSelected && (
        <label className="flex items-start gap-3 p-4 rounded-xl border border-border bg-card cursor-pointer select-none mb-6">
          <Checkbox
            checked={consentChecked}
            onCheckedChange={(checked) => setConsentChecked(checked === true)}
            className="mt-0.5"
          />
          <span className="text-xs text-muted-foreground leading-relaxed">
            Je comprends que l'ajout de{" "}
            <strong className="text-foreground">
              {selectedIds.size} pièce{selectedIds.size > 1 ? "s" : ""} optionnelle
              {selectedIds.size > 1 ? "s" : ""}
            </strong>{" "}
            entraîne un supplément de{" "}
            <strong className="text-foreground">
              {supplementCost !== null ? `${supplementCost.toFixed(2)} €` : "…"}
            </strong>{" "}
            dû au coût d'impression MySendingBox (
            <strong className="text-foreground">{totalPages} pages</strong> au total).
          </span>
        </label>
      )}

      {/* ── Sender info ── */}
      <div className="bg-muted/20 border border-border rounded-xl p-4 mb-6 text-xs text-muted-foreground">
        <div className="font-syne font-bold text-sm text-foreground mb-1">📮 Expéditeur</div>
        <p>
          {clientFirstName} {clientLastName} c/o CAPDEMARCHES
          <br />
          105 rue des Moines
          <br />
          75017 Paris — FRANCE
        </p>
      </div>

      {/* ── Action buttons ── */}
      <div className="flex gap-3">
        <Button variant="outline" onClick={onBack}>
          ← Retour
        </Button>
        <Button
          onClick={handleConfirm}
          disabled={submitting || pricingLoading || (hasOptionalSelected && !consentChecked)}
          className="flex-1"
        >
          {submitting
            ? "Traitement…"
            : `Confirmer et payer ${totalPricing !== null ? `${totalPricing.toFixed(2)} €` : ""}`}
        </Button>
      </div>
    </div>
  );
}
