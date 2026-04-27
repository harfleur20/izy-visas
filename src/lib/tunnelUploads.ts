import { supabase } from "@/integrations/supabase/client";
import type { TunnelPieceFile } from "@/hooks/useTunnelState";

type TunnelUploadSummary = {
  failed: number;
  uploaded: number;
};

export async function uploadTunnelPiecesToDossier(dossierId: string, pieces: TunnelPieceFile[]): Promise<TunnelUploadSummary> {
  if (pieces.length === 0) {
    return { uploaded: 0, failed: 0 };
  }

  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session?.user) {
    return { uploaded: 0, failed: pieces.length };
  }

  const results = await Promise.allSettled(
    pieces.map((piece) => {
      const formData = new FormData();
      formData.append("file", piece.file);
      formData.append("dossier_id", dossierId);
      formData.append("user_id", session.user.id);
      formData.append("nom_piece", piece.nomPiece);
      formData.append("type_piece", piece.typePiece || "obligatoire");

      return supabase.functions.invoke("check-document-ocr", {
        headers: {
          Authorization: `Bearer ${session.access_token}`,
        },
        body: formData,
      });
    }),
  );

  const uploaded = results.filter((result) => result.status === "fulfilled").length;
  return {
    uploaded,
    failed: results.length - uploaded,
  };
}
