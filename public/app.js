const dropzone = document.getElementById("dropzone");
const fileInput = document.getElementById("file-input");
const previewImg = document.getElementById("preview-img");
const dropzoneInner = document.getElementById("dropzone-inner");
const optionsEl = document.getElementById("options");
const formatSelect = document.getElementById("format-select");
const qualityRow = document.getElementById("quality-row");
const qualityRange = document.getElementById("quality-range");
const qualityValue = document.getElementById("quality-value");
const maxWidthInput = document.getElementById("maxwidth-input");
const convertBtn = document.getElementById("convert-btn");
const resetBtn = document.getElementById("reset-btn");
const msgEl = document.getElementById("msg");
const resultEl = document.getElementById("result");
const downloadLink = document.getElementById("download-link");

let selectedFile = null;

dropzone.addEventListener("click", () => fileInput.click());

["dragenter", "dragover"].forEach((evt) => {
  dropzone.addEventListener(evt, (e) => {
    e.preventDefault();
    dropzone.classList.add("is-dragover");
  });
});
["dragleave", "drop"].forEach((evt) => {
  dropzone.addEventListener(evt, (e) => {
    e.preventDefault();
    dropzone.classList.remove("is-dragover");
  });
});
dropzone.addEventListener("drop", (e) => {
  const file = e.dataTransfer.files?.[0];
  if (file) selectFile(file);
});

fileInput.addEventListener("change", () => {
  const file = fileInput.files?.[0];
  if (file) selectFile(file);
});

function selectFile(file) {
  if (!file.type.startsWith("image/")) {
    setMsg("Bitte eine Bilddatei auswählen.", "error");
    return;
  }
  selectedFile = file;
  const url = URL.createObjectURL(file);
  previewImg.src = url;
  previewImg.hidden = false;
  dropzoneInner.hidden = true;
  optionsEl.hidden = false;
  resultEl.hidden = true;
  setMsg("");
}

formatSelect.addEventListener("change", updateQualityVisibility);
updateQualityVisibility();

function updateQualityVisibility() {
  // Photon unterstützt eine einstellbare Qualität nur beim JPEG-Export.
  // Bei PNG (verlustfrei) und WebP (feste Kompression in dieser
  // Bibliothek) hätte der Regler keinerlei Effekt.
  qualityRow.hidden = formatSelect.value !== "jpeg";
}

qualityRange.addEventListener("input", () => {
  qualityValue.textContent = qualityRange.value;
});

resetBtn.addEventListener("click", resetAll);

function resetAll() {
  selectedFile = null;
  fileInput.value = "";
  previewImg.src = "";
  previewImg.hidden = true;
  dropzoneInner.hidden = false;
  optionsEl.hidden = true;
  resultEl.hidden = true;
  setMsg("");
}

convertBtn.addEventListener("click", async () => {
  if (!selectedFile) return;

  convertBtn.disabled = true;
  setMsg("Konvertiere …");
  resultEl.hidden = true;

  const fd = new FormData();
  fd.append("file", selectedFile);
  fd.append("format", formatSelect.value);
  fd.append("quality", qualityRange.value);
  if (maxWidthInput.value) fd.append("maxWidth", maxWidthInput.value);

  try {
    const res = await fetch("/api/convert", { method: "POST", body: fd });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.error || `Fehler (${res.status})`);
    }
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const disposition = res.headers.get("content-disposition") || "";
    const match = disposition.match(/filename="([^"]+)"/);
    downloadLink.href = url;
    downloadLink.download = match ? match[1] : `konvertiert.${formatSelect.value}`;
    resultEl.hidden = false;
    setMsg("");
  } catch (err) {
    setMsg(err.message, "error");
  } finally {
    convertBtn.disabled = false;
  }
});

function setMsg(text, kind) {
  msgEl.textContent = text;
  msgEl.className = "msg" + (kind ? " is-" + kind : "");
}
