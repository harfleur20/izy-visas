import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";
import { PDFDocument, StandardFonts, rgb } from "npm:pdf-lib@1.17.1";

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

// ── Fetch PDF from URL or Storage ───────────────────────────────────────────

async function fetchPdf(url: string): Promise<Uint8Array> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to fetch PDF: ${url} (${res.status})`);
  return new Uint8Array(await res.arrayBuffer());
}

async function fetchStoragePdf(
  supabase: ReturnType<typeof getSupabaseAdmin>,
  bucket: string,
  path: string
): Promise<Uint8Array> {
  const { data, error } = await supabase.storage
    .from(bucket)
    .createSignedUrl(path, 3600);
  if (error || !data?.signedUrl) throw new Error(`Storage URL failed: ${path}`);
  return fetchPdf(data.signedUrl);
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
      dossierRef,
      clientName,
      visaType,
      refusType,
      recoursSignedPdfUrl,
      decisionRefusPdfUrl,
      preuveDepotPdfUrl,
      demandeMotifsPdfUrl,
      optionalPieces,
    } = await req.json();

    if (!dossierId || !dossierRef || !recoursSignedPdfUrl) {
      return jsonResponse({ error: "Missing required fields: dossierId, dossierRef, recoursSignedPdfUrl" }, 400);
    }

    const supabase = getSupabaseAdmin();
    const mergedPdf = await PDFDocument.create();

    // Build inventory
    const inventory: { number: number; title: string; pages: number; pdfBytes: Uint8Array }[] = [];

    // Piece 1 — Lettre de recours
    const recoursPdf = await fetchPdf(recoursSignedPdfUrl);
    const recoursDoc = await PDFDocument.load(recoursPdf);
    inventory.push({ number: 1, title: "Lettre de recours gracieux", pages: recoursDoc.getPageCount(), pdfBytes: recoursPdf });

    // Piece 2 — Décision de refus or Preuve de dépôt + Demande de motifs
    if (refusType === "implicite") {
      if (preuveDepotPdfUrl) {
        const pdf = await fetchPdf(preuveDepotPdfUrl);
        const doc = await PDFDocument.load(pdf);
        inventory.push({ number: 2, title: "Preuve de dépôt de la demande initiale", pages: doc.getPageCount(), pdfBytes: pdf });
      }
      if (demandeMotifsPdfUrl) {
        const pdf = await fetchPdf(demandeMotifsPdfUrl);
        const doc = await PDFDocument.load(pdf);
        inventory.push({ number: 3, title: "Demande de communication des motifs", pages: doc.getPageCount(), pdfBytes: pdf });
      }
    } else {
      if (decisionRefusPdfUrl) {
        const pdf = await fetchPdf(decisionRefusPdfUrl);
        const doc = await PDFDocument.load(pdf);
        inventory.push({ number: 2, title: "Décision de refus de visa", pages: doc.getPageCount(), pdfBytes: pdf });
      }
    }

    // Optional pieces
    const startNum = inventory.length + 1;
    if (optionalPieces && Array.isArray(optionalPieces)) {
      for (let i = 0; i < optionalPieces.length; i++) {
        const piece = optionalPieces[i];
        if (!piece.pdfUrl || !piece.title) continue;
        const pdf = await fetchPdf(piece.pdfUrl);
        const doc = await PDFDocument.load(pdf);
        inventory.push({
          number: startNum + i,
          title: piece.title,
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
    return jsonResponse({ error: error.message || "Internal server error" }, 500);
  }
});
