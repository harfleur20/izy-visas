import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { DocumentUploader, type UploadedPiece } from "@/components/DocumentUploader";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { ChevronDown, ChevronUp, FileText, Plus } from "lucide-react";
import type { Database } from "@/integrations/supabase/types";

type PieceJustificative = Database["public"]["Tables"]["pieces_justificatives"]["Row"];

interface PiecesComplementairesProps {
  dossierId: string;
  dossierRef: string;
  userId: string;
  optionChoisie?: string | null;
}

export function PiecesComplementaires({
  dossierId,
  dossierRef,
  userId,
  optionChoisie,
}: PiecesComplementairesProps) {
  const [open, setOpen] = useState(false);
  const [existingPieces, setExistingPieces] = useState<PieceJustificative[]>([]);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [newPieces, setNewPieces] = useState<UploadedPiece[]>([]);
  const [loading, setLoading] = useState(false);

  // Load existing pieces + dossier selected IDs
  useEffect(() => {
    if (!open) return;

    const load = async () => {
      setLoading(true);

      const [{ data: pieces }, { data: dossier }] = await Promise.all([
        supabase
          .from("pieces_justificatives")
          .select("*")
          .eq("dossier_id", dossierId)
          .order("created_at", { ascending: true }),
        supabase
          .from("dossiers")
          .select("pieces_selectionnees_ids")
          .eq("id", dossierId)
          .single(),
      ]);

      setExistingPieces(pieces || []);

      // Parse selected IDs from LRAR composition
      const ids = dossier?.pieces_selectionnees_ids;
      if (Array.isArray(ids)) {
        setSelectedIds(ids.map(String));
      } else {
        setSelectedIds([]);
      }

      setLoading(false);
    };
    load();
  }, [dossierId, open]);

  // Pieces that were uploaded but NOT included in the LRAR
  const nonIncludedPieces = existingPieces.filter(
    (p) =>
      p.statut_ocr === "accepted" &&
      !selectedIds.includes(p.id) &&
      p.type_piece !== "obligatoire"
  );

  // Pieces uploaded as complementary (after LRAR sent)
  const complementaryPieces = existingPieces.filter(
    (p) => p.type_piece === "complementaire"
  );

  const handlePieceUploaded = useCallback((piece: UploadedPiece) => {
    setNewPieces((prev) => {
      // Remove any temp- entry when the real ID arrives
      const withoutTemp = piece.id.startsWith("temp-")
        ? prev
        : prev.filter((p) => !p.id.startsWith("temp-") || p.name !== piece.name);

      const idx = withoutTemp.findIndex((p) => p.id === piece.id);
      if (idx >= 0) {
        const updated = [...withoutTemp];
        updated[idx] = piece;
        return updated;
      }
      return [...withoutTemp, piece];
    });
  }, []);

  const handlePieceRemoved = useCallback(async (id: string) => {
    // Remove from UI immediately
    const piece = newPieces.find((p) => p.id === id);
    setNewPieces((prev) => prev.filter((p) => p.id !== id));

    // Skip DB/storage cleanup for temp pieces (not yet saved)
    if (id.startsWith("temp-")) return;

    try {
      // Get storage path before deleting DB record
      const { data: dbPiece } = await supabase
        .from("pieces_justificatives")
        .select("url_fichier_original")
        .eq("id", id)
        .single();

      // Delete from storage if file exists
      if (dbPiece?.url_fichier_original) {
        await supabase.storage
          .from("dossiers")
          .remove([dbPiece.url_fichier_original]);
      }

      // Delete DB record
      await supabase
        .from("pieces_justificatives")
        .delete()
        .eq("id", id);

      toast.success("Document supprimé");
    } catch (err) {
      console.error("Delete piece error:", err);
      toast.error("Erreur lors de la suppression");
    }
  }, [newPieces]);

  // Realtime listener for OCR results on new pieces
  useEffect(() => {
    if (newPieces.length === 0) return;

    const analyzingIds = newPieces
      .filter((p) => p.status === "analyzing")
      .map((p) => p.id);

    if (analyzingIds.length === 0) return;

    const channel = supabase
      .channel(`complementary-ocr-${dossierId}`)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "pieces_justificatives",
          filter: `dossier_id=eq.${dossierId}`,
        },
        (payload) => {
          const updated = payload.new as PieceJustificative;
          if (analyzingIds.includes(updated.id)) {
            const isAccepted = updated.statut_ocr === "accepted";
            const isRejected = updated.statut_ocr === "rejected";

            if (isAccepted || isRejected) {
              setNewPieces((prev) =>
                prev.map((p) =>
                  p.id === updated.id
                    ? {
                        ...p,
                        status: isAccepted ? "accepted" : "rejected",
                        score: updated.score_qualite || 0,
                        pages: updated.nombre_pages || 1,
                        rejectionMessage: updated.motif_rejet || undefined,
                      }
                    : p
                )
              );

              if (isAccepted) {
                toast.success(`${updated.nom_piece} — Pièce validée ✓`);
              }
            }
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [dossierId, newPieces]);

  const optionLabel =
    optionChoisie === "B" || optionChoisie === "C"
      ? "L'administrateur CapDémarches sera notifié pour les transmettre."
      : "Téléchargez-les et envoyez-les vous-même à la CRRV.";

  return (
    <div className="border border-border rounded-xl overflow-hidden">
      {/* Toggle header */}
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between px-5 py-4 bg-panel hover:bg-foreground/[0.04] transition-colors"
      >
        <div className="flex items-center gap-2.5">
          <Plus className="w-4 h-4 text-primary" />
          <span className="font-syne font-bold text-sm">
            Transmettre des pièces complémentaires
          </span>
          {complementaryPieces.length > 0 && (
            <span className="text-[0.65rem] px-2 py-0.5 rounded-full bg-primary/15 text-primary font-bold">
              {complementaryPieces.length} ajoutée{complementaryPieces.length > 1 ? "s" : ""}
            </span>
          )}
        </div>
        {open ? (
          <ChevronUp className="w-4 h-4 text-muted-foreground" />
        ) : (
          <ChevronDown className="w-4 h-4 text-muted-foreground" />
        )}
      </button>

      {/* Content */}
      {open && (
        <div className="px-5 pb-5 pt-2 space-y-5">
          {/* Context info */}
          <div className="bg-accent/10 border border-accent/20 rounded-lg p-4">
            <p className="text-xs text-muted-foreground leading-relaxed">
              📄 Pendant les <strong className="text-foreground">2 mois d'instruction</strong> par la CRRV,
              vous pouvez renforcer votre dossier avec de nouveaux documents.{" "}
              {optionLabel}
            </p>
          </div>

          {loading ? (
            <div className="text-center py-6">
              <div className="animate-spin h-6 w-6 border-2 border-primary border-t-transparent rounded-full mx-auto mb-2" />
              <p className="text-xs text-muted-foreground">Chargement…</p>
            </div>
          ) : (
            <>
              {/* Non-included existing pieces */}
              {nonIncludedPieces.length > 0 && (
                <div>
                  <h4 className="font-syne font-bold text-xs text-muted-foreground uppercase tracking-wider mb-2">
                    Pièces uploadées non incluses dans la LRAR
                  </h4>
                  <div className="space-y-2">
                    {nonIncludedPieces.map((p) => (
                      <div
                        key={p.id}
                        className="flex items-center gap-3 px-4 py-3 bg-background border border-border rounded-lg"
                      >
                        <FileText className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium truncate">{p.nom_piece}</p>
                          <p className="text-xs text-muted-foreground">
                            {p.nombre_pages || 1} page{(p.nombre_pages || 1) > 1 ? "s" : ""} · Score {p.score_qualite}/100
                          </p>
                        </div>
                        {optionChoisie === "A" && p.url_fichier_original && (
                          <Button
                            variant="outline"
                            size="sm"
                            className="text-xs"
                            onClick={async () => {
                              const { data } = await supabase.storage
                                .from("dossiers")
                                .createSignedUrl(p.url_fichier_original!, 300);
                              if (data?.signedUrl) window.open(data.signedUrl, "_blank");
                            }}
                          >
                            ⬇️ Télécharger
                          </Button>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Already submitted complementary pieces */}
              {complementaryPieces.length > 0 && (
                <div>
                  <h4 className="font-syne font-bold text-xs text-muted-foreground uppercase tracking-wider mb-2">
                    {isOptionA ? "Pièces complémentaires ajoutées" : "Pièces complémentaires déjà transmises"}
                  </h4>
                  <div className="space-y-2">
                    {complementaryPieces.map((p) => (
                      <div
                        key={p.id}
                        className="flex items-center gap-3 px-4 py-3 bg-success/5 border border-success/20 rounded-lg"
                      >
                        <FileText className="w-4 h-4 text-success flex-shrink-0" />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium truncate">{p.nom_piece}</p>
                          <p className="text-xs text-muted-foreground">
                            Ajoutée le {new Date(p.date_upload).toLocaleDateString("fr-FR")}
                          </p>
                        </div>
                        {isOptionA && p.url_fichier_original && (
                          <Button
                            variant="outline"
                            size="sm"
                            className="text-xs"
                            onClick={async () => {
                              const { data } = await supabase.storage
                                .from("dossiers")
                                .createSignedUrl(p.url_fichier_original!, 300);
                              if (data?.signedUrl) window.open(data.signedUrl, "_blank");
                            }}
                          >
                            ⬇️ Télécharger
                          </Button>
                        )}
                      </div>
                    ))}
                  </div>
                  {isOptionA && (
                    <p className="text-xs text-muted-foreground mt-2 italic">
                      Téléchargez chaque pièce et envoyez-la par courrier à la CRRV.
                    </p>
                  )}
                </div>
              )}

              {/* Upload new complementary pieces */}
              <div>
                <h4 className="font-syne font-bold text-xs text-muted-foreground uppercase tracking-wider mb-2">
                  Ajouter un nouveau document
                </h4>
                <DocumentUploader
                  dossierId={dossierId}
                  userId={userId}
                  typePiece="complementaire"
                  nomPiece={undefined}
                  onPieceUploaded={handlePieceUploaded}
                  onPieceRemoved={handlePieceRemoved}
                  pieces={newPieces}
                  maxFiles={10}
                />
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
