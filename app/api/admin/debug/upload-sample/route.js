import { uploadToFileSearchStore } from "../../../../../lib/fileSearch";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request) {
  const body = await request.json().catch(() => ({}));
  const text = String(
    body.text ||
      "SAMPLE_DOC: utilitarianism vs kantian deontology; HR ethics: conflicts of interest."
  );
  const filename = String(body.filename || `debug_sample_${Date.now()}.txt`);

  const op = await uploadToFileSearchStore({
    buffer: Buffer.from(text, "utf8"),
    filename,
    mimeType: "text/plain"
  });

  return Response.json({ ok: true, filename, operation: op?.name || null, done: Boolean(op?.done) });
}
