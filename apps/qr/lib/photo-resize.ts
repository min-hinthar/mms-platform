import { fitWithin, PHOTO_MAX_BYTES, PHOTO_MAX_EDGE } from "./menu-studio-rules";

/**
 * Menu studio — a dish photo, made small ON THE PHONE before it is sent (owner, 2026-10-24: "iOS
 * photo upload"). An iPhone hands `<input type="file" accept="image/*">` a 12–48 MP shot (Safari
 * converts HEIC to JPEG for that input), several MB each — over the Server Action's body limit and
 * far past what a 3× phone draws at the item sheet's hero. This decodes it (the browser applies the
 * EXIF orientation), draws it at most `PHOTO_MAX_EDGE` on its longest side (`fitWithin`), and
 * re-encodes JPEG — stepping the quality down if a detailed shot is still over the limit.
 *
 * BROWSER-ONLY (canvas, createImageBitmap / Image). The size rule is `fitWithin`, pure and tested;
 * this is its wiring, exercised on a device. A photo it cannot decode answers null and the sheet says
 * so (`studio.err.read`) — never a broken upload.
 */
export async function resizePhoto(file: Blob, maxEdge = PHOTO_MAX_EDGE): Promise<Blob | null> {
  let source: ImageBitmap | HTMLImageElement | null = null;
  let url: string | null = null;
  try {
    if (typeof createImageBitmap === "function") {
      source = await createImageBitmap(file);
    } else {
      url = URL.createObjectURL(file);
      const img = new Image();
      img.decoding = "async";
      img.src = url;
      await img.decode();
      source = img;
    }
    const width = "naturalWidth" in source ? source.naturalWidth : source.width;
    const height = "naturalHeight" in source ? source.naturalHeight : source.height;
    if (!width || !height) return null;
    const { w, h } = fitWithin(width, height, maxEdge);
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(source, 0, 0, w, h);
    for (const quality of [0.85, 0.75, 0.6]) {
      const blob = await new Promise<Blob | null>((res) =>
        canvas.toBlob(res, "image/jpeg", quality),
      );
      if (blob && blob.size <= PHOTO_MAX_BYTES * 0.7) return blob;
    }
    return null;
  } catch {
    // Deliberate: an undecodable file (a RAW, a corrupt download) is "couldn't open that photo",
    // said by the sheet — the caller reads null.
    return null;
  } finally {
    if (source && "close" in source) source.close();
    if (url) URL.revokeObjectURL(url);
  }
}
