import { PhotonImage, resize, SamplingFilter } from "@cf-wasm/photon";

const ALLOWED_OUTPUT = ["jpeg", "png", "webp"];
const MAX_UPLOAD_BYTES = 15 * 1024 * 1024; // 15 MB – konservativ wegen 128MB-Speicherlimit des Workers

function corsHeaders() {
  return {
    "access-control-allow-origin": "*",
    "access-control-allow-methods": "POST, OPTIONS",
    "access-control-allow-headers": "content-type",
  };
}

function errorResponse(message, status = 400) {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", ...corsHeaders() },
  });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (request.method === "OPTIONS") {
      return new Response(null, { headers: corsHeaders() });
    }

    if (url.pathname === "/api/convert" && request.method === "POST") {
      return handleConvert(request);
    }

    // alles andere: statische Dateien aus /public ausliefern
    return env.ASSETS.fetch(request);
  },
};

async function handleConvert(request) {
  const contentLength = Number(request.headers.get("content-length") || 0);
  if (contentLength && contentLength > MAX_UPLOAD_BYTES) {
    return errorResponse(
      `Datei zu groß (max. ${Math.floor(MAX_UPLOAD_BYTES / 1024 / 1024)} MB).`,
      413
    );
  }

  let form;
  try {
    form = await request.formData();
  } catch {
    return errorResponse("Ungültige Anfrage (kein multipart/form-data).");
  }

  const file = form.get("file");
  const targetFormat = (form.get("format") || "").toString().toLowerCase();
  const quality = Number(form.get("quality") || 85);
  const maxWidth = form.get("maxWidth") ? Number(form.get("maxWidth")) : null;

  if (!(file instanceof File)) {
    return errorResponse("Kein Datei-Feld 'file' gefunden.");
  }
  if (!ALLOWED_OUTPUT.includes(targetFormat)) {
    return errorResponse(`Zielformat muss eines von: ${ALLOWED_OUTPUT.join(", ")} sein.`);
  }
  if (file.size > MAX_UPLOAD_BYTES) {
    return errorResponse(
      `Datei zu groß (max. ${Math.floor(MAX_UPLOAD_BYTES / 1024 / 1024)} MB).`,
      413
    );
  }

  let inputImage;
  let resized;
  try {
    const inputBytes = new Uint8Array(await file.arrayBuffer());
    inputImage = PhotonImage.new_from_byteslice(inputBytes);

    let working = inputImage;
    if (maxWidth && maxWidth > 0 && inputImage.get_width() > maxWidth) {
      const ratio = maxWidth / inputImage.get_width();
      const newHeight = Math.round(inputImage.get_height() * ratio);
      resized = resize(inputImage, maxWidth, newHeight, SamplingFilter.Lanczos3);
      working = resized;
    }

    const outputBytes = encode(working, targetFormat, quality);
    const outName = renameExtension(file.name, targetFormat);

    return new Response(outputBytes, {
      status: 200,
      headers: {
        "content-type": mimeType(targetFormat),
        "content-disposition": `attachment; filename="${outName}"`,
        ...corsHeaders(),
      },
    });
  } catch (err) {
    return errorResponse("Konvertierung fehlgeschlagen: " + err.message, 500);
  } finally {
    // Photon-Objekte liegen im WASM-Speicher und müssen manuell freigegeben werden.
    inputImage?.free();
    resized?.free();
  }
}

function encode(image, format, quality) {
  switch (format) {
    case "jpeg":
      return image.get_bytes_jpeg(clampQuality(quality));
    case "webp":
      return image.get_bytes_webp();
    case "png":
    default:
      return image.get_bytes();
  }
}

function clampQuality(q) {
  if (Number.isNaN(q)) return 85;
  return Math.min(100, Math.max(1, Math.round(q)));
}

function mimeType(format) {
  return { jpeg: "image/jpeg", png: "image/png", webp: "image/webp" }[format];
}

function renameExtension(name, format) {
  const ext = { jpeg: "jpg", png: "png", webp: "webp" }[format];
  const base = (name || "bild").replace(/\.[^.]+$/, "");
  return `${base}.${ext}`;
}
