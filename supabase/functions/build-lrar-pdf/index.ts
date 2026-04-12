import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";
import { PDFDocument, StandardFonts, rgb } from "https://esm.sh/pdf-lib@1.17.1";
import { assertDossierAccess, HttpError, requireAuthenticatedContext } from "../_shared/security.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

function getSupabaseAdmin() {
  return createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    { auth: { persistSession: false } }
  );
}

function jsonResponse(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

// ── Fetch PDF from trusted Supabase Storage only ────────────────────────────

type StorageConstraint = {
  bucket: string;
  pathPrefix: string;
};

type StorageRef = {
  bucket: string;
  path: string;
};

type OptionalPieceInput = {
  id?: string;
};

function parseStorageRef(
  source: string,
  defaultBucket: string,
): StorageRef {
  if (!source || typeof source !== "string") {
    throw new HttpError(400, "PDF source manquante");
  }

  if (!source.startsWith("http://") && !source.startsWith("https://")) {
    return { bucket: defaultBucket, path: normalizeStoragePath(source) };
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  if (!supabaseUrl) {
    throw new HttpError(500, "SUPABASE_URL not configured");
  }

  const parsed = new URL(source);
  const expectedHost = new URL(supabaseUrl).host;
  if (parsed.host !== expectedHost) {
    throw new HttpError(400, "PDF source externe refusee");
  }

  const match = parsed.pathname.match(/^\/storage\/v1\/object\/(?:sign|public|authenticated)\/([^/]+)\/(.+)$/);
  if (!match) {
    throw new HttpError(400, "URL de stockage Supabase invalide");
  }

  return {
    bucket: decodeURIComponent(match[1]),
    path: normalizeStoragePath(decodeURIComponent(match[2])),
  };
}

function normalizeStoragePath(path: string): string {
  const normalized = path.replace(/^\/+/, "");
  if (
    !normalized ||
    normalized.includes("..") ||
    normalized.includes("\\") ||
    normalized.startsWith("http:") ||
    normalized.startsWith("https:") ||
    normalized.startsWith("file:") ||
    normalized.startsWith("data:")
  ) {
    throw new HttpError(400, "Chemin de fichier invalide");
  }

  return normalized;
}

function assertAllowedStorageRef(ref: StorageRef, constraints: StorageConstraint[]) {
  const allowed = constraints.some((constraint) =>
    ref.bucket === constraint.bucket && ref.path.startsWith(constraint.pathPrefix)
  );

  if (!allowed) {
    throw new HttpError(403, "Acces refuse au fichier PDF");
  }
}

async function fetchPdfFromTrustedStorage(
  supabase: ReturnType<typeof getSupabaseAdmin>,
  source: string,
  defaultBucket: string,
  constraints: StorageConstraint[],
): Promise<Uint8Array> {
  const ref = parseStorageRef(source, defaultBucket);
  assertAllowedStorageRef(ref, constraints);

  const { data, error } = await supabase.storage
    .from(ref.bucket)
    .createSignedUrl(ref.path, 3600);

  if (error || !data?.signedUrl) {
    throw new Error(`Storage URL failed: ${ref.bucket}/${ref.path}`);
  }

  const res = await fetch(data.signedUrl);
  if (!res.ok) {
    throw new Error(`Failed to fetch PDF from storage (${res.status})`);
  }

  return new Uint8Array(await res.arrayBuffer());
}

function extractSelectedPieceIds(optionalPieces: unknown, dossierSelection: unknown): string[] {
  const ids = new Set<string>();

  if (Array.isArray(dossierSelection)) {
    for (const id of dossierSelection) {
      if (typeof id === "string") ids.add(id);
    }
  }

  if (Array.isArray(optionalPieces)) {
    for (const piece of optionalPieces as OptionalPieceInput[]) {
      if (typeof piece?.id === "string") ids.add(piece.id);
    }
  }

  return [...ids];
}

// ── Create separator page ───────────────────────────────────────────────────

async function createSeparatorPage(
  pieceNumber: number,
  title: string
): Promise<PDFDocument> {
  const doc = await PDFDocument.create();
  const page = doc.addPage([595.28, 841.89]); // A4
  const font = await doc.embedFont(StandardFonts.HelveticaBold);
  const { height } = page.getSize();

  const label = `PIÈCE N°${pieceNumber}`;
  const labelWidth = font.widthOfTextAtSize(label, 28);
  page.drawText(label, {
    x: (595.28 - labelWidth) / 2,
    y: height / 2 + 40,
    size: 28,
    font,
    color: rgb(0.1, 0.1, 0.1),
  });

  const titleWidth = font.widthOfTextAtSize(title, 16);
  page.drawText(title, {
    x: (595.28 - titleWidth) / 2,
    y: height / 2 - 10,
    size: 16,
    font,
    color: rgb(0.3, 0.3, 0.3),
  });

  return doc;
}

// ── Create cover page with inventory ────────────────────────────────────────

async function createCoverPage(
  pieces: { number: number; title: string; pages: number }[],
  dossierRef: string,
  clientName: string
): Promise<PDFDocument> {
  const doc = await PDFDocument.create();
  const page = doc.addPage([595.28, 841.89]);
  const fontBold = await doc.embedFont(StandardFonts.HelveticaBold);
  const fontRegular = await doc.embedFont(StandardFonts.Helvetica);
  const { height } = page.getSize();

  let y = height - 80;

  // Title
  const title = "INVENTAIRE DES PIÈCES";
  const titleW = fontBold.widthOfTextAtSize(title, 22);
  page.drawText(title, { x: (595.28 - titleW) / 2, y, size: 22, font: fontBold, color: rgb(0.1, 0.1, 0.1) });
  y -= 40;

  // Dossier ref
  page.drawText(`Dossier : ${dossierRef}`, { x: 60, y, size: 12, font: fontRegular, color: rgb(0.3, 0.3, 0.3) });
  y -= 20;
  page.drawText(`Client : ${clientName}`, { x: 60, y, size: 12, font: fontRegular, color: rgb(0.3, 0.3, 0.3) });
  y -= 40;

  // Separator line
  page.drawLine({ start: { x: 60, y }, end: { x: 535, y }, thickness: 1, color: rgb(0.7, 0.7, 0.7) });
  y -= 30;

  // Table header
  page.drawText("N°", { x: 60, y, size: 11, font: fontBold, color: rgb(0.2, 0.2, 0.2) });
  page.drawText("Intitulé de la pièce", { x: 100, y, size: 11, font: fontBold, color: rgb(0.2, 0.2, 0.2) });
  page.drawText("Pages", { x: 480, y, size: 11, font: fontBold, color: rgb(0.2, 0.2, 0.2) });
  y -= 20;

  page.drawLine({ start: { x: 60, y: y + 5 }, end: { x: 535, y: y + 5 }, thickness: 0.5, color: rgb(0.8, 0.8, 0.8) });

  // Rows
  for (const piece of pieces) {
    y -= 22;
    if (y < 80) break; // overflow protection
    page.drawText(`${piece.number}`, { x: 65, y, size: 10, font: fontBold, color: rgb(0.2, 0.2, 0.2) });
    page.drawText(piece.title, { x: 100, y, size: 10, font: fontRegular, color: rgb(0.3, 0.3, 0.3) });
    page.drawText(`${piece.pages}`, { x: 490, y, size: 10, font: fontRegular, color: rgb(0.3, 0.3, 0.3) });
  }

  // Total
  y -= 30;
  page.drawLine({ start: { x: 60, y: y + 10 }, end: { x: 535, y: y + 10 }, thickness: 1, color: rgb(0.7, 0.7, 0.7) });
  const totalPages = pieces.reduce((sum, p) => sum + p.pages, 0);
  page.drawText(`Total : ${pieces.length} pièces — ${totalPages} pages`, {
    x: 60, y: y - 5, size: 11, font: fontBold, color: rgb(0.1, 0.1, 0.1),
  });

  return doc;
}

// ── Add page numbers to final PDF ───────────────────────────────────────────

async function addPageNumbers(pdfDoc: PDFDocument): Promise<void> {
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const pages = pdfDoc.getPages();
  const total = pages.length;

  for (let i = 0; i < total; i++) {
    const page = pages[i];
    const { width } = page.getSize();
    const text = `${i + 1} / ${total}`;
    const textWidth = font.widthOfTextAtSize(text, 9);
    page.drawText(text, {
      x: (width - textWidth) / 2,
      y: 25,
      size: 9,
      font,
      color: rgb(0.5, 0.5, 0.5),
    });
  }
}

// ── Main handler ────────────────────────────────────────────────────────────

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const {
      dossierId,
      recoursSignedPdfUrl,
      preuveDepotPdfUrl,
      demandeMotifsPdfUrl,
      optionalPieces,
    } = await req.json();

    if (!dossierId) {
      return jsonResponse({ error: "Missing required field: dossierId" }, 400);
    }

    const supabase = getSupabaseAdmin();
    const authHeader = req.headers.get("Authorization");
    const supabaseUser = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_ANON_KEY") ?? "",
      {
        auth: { persistSession: false },
        global: authHeader ? { headers: { Authorization: authHeader } } : undefined,
      },
    );
    const authContext = await requireAuthenticatedContext(req, supabase, supabaseUser);

    const { data: dossier, error: dossierError } = await supabase
      .from("dossiers")
      .select("*")
      .eq("id", dossierId)
      .single();

    if (dossierError || !dossier) {
      return jsonResponse({ error: "Dossier introuvable" }, 404);
    }

    assertDossierAccess(authContext, dossier);

    const mergedPdf = await PDFDocument.create();
    const dossierRef = dossier.dossier_ref;
    const clientName = `${dossier.client_first_name || ""} ${dossier.client_last_name || ""}`.trim() || "Client";
    const refusType = dossier.refus_type;
    const allowedDossierFiles = [{ bucket: "dossiers", pathPrefix: `${dossierId}/` }];
    const allowedRecoursFiles = [
      ...allowedDossierFiles,
      { bucket: "signature-certificates", pathPrefix: `${dossier.user_id}/` },
    ];

    // Build inventory
    const inventory: { number: number; title: string; pages: number; pdfBytes: Uint8Array }[] = [];

    // Piece 1 — Lettre de recours
    const recoursSource = recoursSignedPdfUrl || dossier.url_lettre_definitive || dossier.url_lettre_neutre;
    if (!recoursSource) {
      return jsonResponse({ error: "Lettre de recours signee introuvable" }, 400);
    }

    const recoursPdf = await fetchPdfFromTrustedStorage(supabase, recoursSource, "dossiers", allowedRecoursFiles);
    const recoursDoc = await PDFDocument.load(recoursPdf);
    inventory.push({ number: 1, title: "Lettre de recours gracieux", pages: recoursDoc.getPageCount(), pdfBytes: recoursPdf });

    // Piece 2 — Décision de refus or Preuve de dépôt + Demande de motifs
    if (refusType === "implicite") {
      if (preuveDepotPdfUrl) {
        const pdf = await fetchPdfFromTrustedStorage(supabase, preuveDepotPdfUrl, "dossiers", allowedDossierFiles);
        const doc = await PDFDocument.load(pdf);
        inventory.push({ number: 2, title: "Preuve de dépôt de la demande initiale", pages: doc.getPageCount(), pdfBytes: pdf });
      }
      if (demandeMotifsPdfUrl) {
        const pdf = await fetchPdfFromTrustedStorage(supabase, demandeMotifsPdfUrl, "dossiers", allowedDossierFiles);
        const doc = await PDFDocument.load(pdf);
        inventory.push({ number: 3, title: "Demande de communication des motifs", pages: doc.getPageCount(), pdfBytes: pdf });
      }
    } else {
      if (dossier.url_decision_refus) {
        const pdf = await fetchPdfFromTrustedStorage(supabase, dossier.url_decision_refus, "dossiers", allowedDossierFiles);
        const doc = await PDFDocument.load(pdf);
        inventory.push({ number: 2, title: "Décision de refus de visa", pages: doc.getPageCount(), pdfBytes: pdf });
      }
    }

    // Optional pieces
    const startNum = inventory.length + 1;
    const selectedPieceIds = extractSelectedPieceIds(optionalPieces, dossier.pieces_selectionnees_ids);
    if (selectedPieceIds.length > 0) {
      const { data: pieces, error: piecesError } = await supabase
        .from("pieces_justificatives")
        .select("id, nom_piece, url_fichier_original, url_fichier_corrige, statut_ocr")
        .eq("dossier_id", dossierId)
        .in("id", selectedPieceIds);

      if (piecesError) {
        throw piecesError;
      }

      for (let i = 0; i < (pieces || []).length; i++) {
        const piece = pieces![i];
        if (piece.statut_ocr === "rejected" || piece.statut_ocr === "rejete") continue;
        const source = piece.url_fichier_corrige || piece.url_fichier_original;
        if (!source) continue;
        const pdf = await fetchPdfFromTrustedStorage(supabase, source, "dossiers", allowedDossierFiles);
        const doc = await PDFDocument.load(pdf);
        inventory.push({
          number: startNum + i,
          title: piece.nom_piece,
          pages: doc.getPageCount(),
          pdfBytes: pdf,
        });
      }
    }

    // 1. Create cover page
    const coverDoc = await createCoverPage(
      inventory.map((p) => ({ number: p.number, title: p.title, pages: p.pages })),
      dossierRef,
      clientName || "Client"
    );
    const coverPages = await mergedPdf.copyPages(coverDoc, coverDoc.getPageIndices());
    coverPages.forEach((p) => mergedPdf.addPage(p));

    // 2. Merge each piece with separator
    for (const piece of inventory) {
      // Add separator page
      const sepDoc = await createSeparatorPage(piece.number, piece.title);
      const sepPages = await mergedPdf.copyPages(sepDoc, sepDoc.getPageIndices());
      sepPages.forEach((p) => mergedPdf.addPage(p));

      // Add piece pages
      const pieceDoc = await PDFDocument.load(piece.pdfBytes);
      const piecePages = await mergedPdf.copyPages(pieceDoc, pieceDoc.getPageIndices());
      piecePages.forEach((p) => mergedPdf.addPage(p));
    }

    // 3. Add page numbers
    await addPageNumbers(mergedPdf);

    // 4. Save the merged PDF
    const mergedBytes = await mergedPdf.save();
    const storagePath = `${dossierId}/lrar_complet_${dossierRef}.pdf`;

    const { error: uploadError } = await supabase.storage
      .from("dossiers")
      .upload(storagePath, mergedBytes, {
        contentType: "application/pdf",
        upsert: true,
      });

    if (uploadError) {
      console.error("[BUILD-LRAR] Upload error:", uploadError);
      return jsonResponse({ error: "Failed to upload merged PDF", details: uploadError.message }, 500);
    }

    // Create a signed URL for MySendingBox
    const { data: urlData } = await supabase.storage
      .from("dossiers")
      .createSignedUrl(storagePath, 7200);

    const totalPages = mergedPdf.getPageCount();
    console.log(`[BUILD-LRAR] Merged PDF: ${totalPages} pages, stored at ${storagePath}`);

    return jsonResponse({
      storagePath,
      signedUrl: urlData?.signedUrl,
      totalPages,
      inventory: inventory.map((p) => ({
        number: p.number,
        title: p.title,
        pages: p.pages,
      })),
    });
  } catch (error) {
    console.error("[BUILD-LRAR] Error:", error);
    if (error instanceof HttpError) {
      return jsonResponse({ error: error.message }, error.status);
    }
    return jsonResponse({ error: error.message || "Internal server error" }, 500);
  }
});
