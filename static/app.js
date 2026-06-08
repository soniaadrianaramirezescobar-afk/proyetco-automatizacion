const video = document.querySelector("#video");
const droidPreview = document.querySelector("#droidPreview");
const cameraStage = document.querySelector(".camera-stage");
const liveOverlay = document.querySelector("#liveOverlay");
const outputPreview = document.querySelector("#outputPreview");
const outputEmpty = document.querySelector("#outputEmpty");
const detectLive = document.querySelector("#detectLive");
const stopLive = document.querySelector("#stopLive");
const testImage = document.querySelector("#testImage");
const testImageName = document.querySelector("#testImageName");
const detectImage = document.querySelector("#detectImage");
const confidence = document.querySelector("#confidence");
const confidenceValue = document.querySelector("#confidenceValue");
const detectionsBody = document.querySelector("#detectionsBody");
const summary = document.querySelector("#summary");
const statusBox = document.querySelector("#status");
const liveState = document.querySelector("#liveState");
const chartCanvas = document.querySelector("#detectionsChart");
const chartEmpty = document.querySelector("#chartEmpty");
const chartLegend = document.querySelector("#chartLegend");
const chartTotal = document.querySelector("#chartTotal");
const sealBadge = document.querySelector("#sealBadge");
const qrStatus = document.querySelector("#qrStatus");
const qrLink = document.querySelector("#qrLink");
const seriesValue = document.querySelector("#seriesValue");
const ocrStatus = document.querySelector("#ocrStatus");

let stream = null;
let liveMode = false;
let liveBusy = false;
let imageBusy = false;
let liveTimer = null;
let frameCount = 0;
let lastSeries = [];
let lastRawText = "";
const unmirrorCamera = false;
let qrDetector = null;
const liveCanvas = document.createElement("canvas");
const liveCtx = liveCanvas.getContext("2d");
const overlayCtx = liveOverlay.getContext("2d");
const chartCtx = chartCanvas.getContext("2d");
const chartColors = [
  "#0b2d5c",
  "#d9a441",
  "#5aa7d8",
  "#f2d17b",
  "#1e5f99",
  "#c77d2b",
  "#7cc6e8",
];
const LIVE_FRAME_WIDTH = 640;
const LIVE_JPEG_QUALITY = 0.82;
const LIVE_INTERVAL_MS = 120;
const SEAL_ANALYSIS_EVERY = 8;
let lastDetections = [];
let lastFrameSize = { width: LIVE_FRAME_WIDTH, height: 312 };
const detectionColors = ["#00e5ff", "#ffd23f", "#35ff8d", "#ff4d6d", "#b47cff", "#ff8a3d", "#ffffff"];

try {
  if ("BarcodeDetector" in window) {
    qrDetector = new BarcodeDetector({ formats: ["qr_code"] });
  }
} catch (error) {
  qrDetector = null;
}

function setStatus(text, isError = false) {
  statusBox.textContent = text;
  statusBox.classList.toggle("error", isError);
}

function setLiveState(text, detected) {
  liveState.textContent = text;
  liveState.classList.toggle("detected", detected);
}

function resetResults() {
  lastDetections = [];
  clearOverlay();
  outputPreview.classList.remove("active");
  outputEmpty.classList.remove("hidden");
  summary.textContent = "0 objetos";
  detectionsBody.innerHTML = '<tr><td colspan="3">Sin resultados todavia.</td></tr>';
  frameCount = 0;
  lastSeries = [];
  lastRawText = "";
  setLiveState("No detecta nada", false);
  renderSealInfo(null);
  renderChart([]);
}

function showOutput(src) {
  cameraStage.classList.remove("active");
  video.classList.remove("active");
  droidPreview.classList.remove("active");
  clearOverlay();
  outputPreview.src = src;
  outputPreview.classList.add("active");
  outputEmpty.classList.add("hidden");
}

function showLiveCamera() {
  cameraStage.classList.add("active");
  video.classList.remove("active");
  droidPreview.classList.add("active");
  outputPreview.classList.remove("active");
  outputEmpty.classList.add("hidden");
  drawOverlay();
}

function clearOverlay() {
  overlayCtx.clearRect(0, 0, liveOverlay.width || 0, liveOverlay.height || 0);
}

function drawOverlay() {
  const liveSource = droidPreview.classList.contains("active") ? droidPreview : video;
  const sourceReady = liveSource === droidPreview
    ? Boolean(droidPreview.naturalWidth)
    : Boolean(video.videoWidth);

  if (!liveSource.classList.contains("active") || !sourceReady || !lastFrameSize.width) {
    clearOverlay();
    return;
  }

  const rect = liveSource.getBoundingClientRect();
  const displayWidth = Math.max(1, Math.round(rect.width));
  const displayHeight = Math.max(1, Math.round(rect.height));
  if (liveOverlay.width !== displayWidth || liveOverlay.height !== displayHeight) {
    liveOverlay.width = displayWidth;
    liveOverlay.height = displayHeight;
  }

  clearOverlay();
  const scale = Math.min(displayWidth / lastFrameSize.width, displayHeight / lastFrameSize.height);
  const renderedWidth = lastFrameSize.width * scale;
  const renderedHeight = lastFrameSize.height * scale;
  const offsetX = (displayWidth - renderedWidth) / 2;
  const offsetY = (displayHeight - renderedHeight) / 2;

  overlayCtx.lineWidth = 5;
  overlayCtx.font = "900 16px Segoe UI, Arial";
  overlayCtx.textBaseline = "top";

  lastDetections.forEach((item, index) => {
    const x = offsetX + item.x1 * scale;
    const y = offsetY + item.y1 * scale;
    const w = (item.x2 - item.x1) * scale;
    const h = (item.y2 - item.y1) * scale;
    const label = `${item.label} ${(item.confidence * 100).toFixed(0)}%`;
    const color = detectionColors[index % detectionColors.length];

    overlayCtx.strokeStyle = "rgba(0, 0, 0, 0.7)";
    overlayCtx.strokeRect(x + 2, y + 2, w, h);
    overlayCtx.strokeStyle = color;
    overlayCtx.strokeRect(x, y, w, h);

    const textWidth = overlayCtx.measureText(label).width + 18;
    const textHeight = 30;
    const labelY = Math.max(0, y - textHeight);
    overlayCtx.fillStyle = "rgba(0, 0, 0, 0.78)";
    overlayCtx.fillRect(x, labelY, textWidth, textHeight);
    overlayCtx.fillStyle = color;
    overlayCtx.fillRect(x, labelY, 6, textHeight);
    overlayCtx.fillStyle = "#ffffff";
    overlayCtx.fillText(label, x + 12, labelY + 5);
  });
}

function summarizeLabels(detections) {
  const counts = new Map();
  detections.forEach((item) => {
    counts.set(item.label, (counts.get(item.label) || 0) + 1);
  });

  return Array.from(counts.entries())
    .map(([label, count]) => count > 1 ? `${label} x${count}` : label)
    .join(", ");
}

function groupDetections(detections) {
  const counts = new Map();
  detections.forEach((item) => {
    counts.set(item.label, (counts.get(item.label) || 0) + 1);
  });

  return Array.from(counts.entries())
    .map(([label, count]) => ({ label, count }))
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
}

function renderChart(detections) {
  const grouped = groupDetections(detections);
  const total = detections.length;
  const width = chartCanvas.width;
  const height = chartCanvas.height;
  const centerX = width / 2;
  const centerY = height / 2;
  const radius = Math.min(width, height) / 2 - 12;

  chartCtx.clearRect(0, 0, width, height);
  chartTotal.textContent = `${total} total`;

  if (!total) {
    chartEmpty.classList.remove("hidden");
    chartLegend.innerHTML = '<div class="legend-empty">No hay etiquetas detectadas.</div>';
    return;
  }

  chartEmpty.classList.add("hidden");
  let start = -Math.PI / 2;

  grouped.forEach((item, index) => {
    const slice = (item.count / total) * Math.PI * 2;
    chartCtx.beginPath();
    chartCtx.moveTo(centerX, centerY);
    chartCtx.arc(centerX, centerY, radius, start, start + slice);
    chartCtx.closePath();
    chartCtx.fillStyle = chartColors[index % chartColors.length];
    chartCtx.fill();
    start += slice;
  });

  chartCtx.beginPath();
  chartCtx.arc(centerX, centerY, radius * 0.52, 0, Math.PI * 2);
  chartCtx.fillStyle = "#ffffff";
  chartCtx.fill();
  chartCtx.fillStyle = "#0b2d5c";
  chartCtx.font = "800 24px Segoe UI, Arial";
  chartCtx.textAlign = "center";
  chartCtx.textBaseline = "middle";
  chartCtx.fillText(String(total), centerX, centerY - 7);
  chartCtx.fillStyle = "#667085";
  chartCtx.font = "700 12px Segoe UI, Arial";
  chartCtx.fillText("detecciones", centerX, centerY + 15);

  chartLegend.innerHTML = grouped.map((item, index) => {
    const pct = ((item.count / total) * 100).toFixed(1);
    const color = chartColors[index % chartColors.length];
    return `
      <div class="legend-item">
        <span class="legend-dot" style="background:${color}"></span>
        <span class="legend-name">${item.label}</span>
        <strong>${item.count}</strong>
        <em>${pct}%</em>
      </div>
    `;
  }).join("");
}

function renderDetections(detections) {
  summary.textContent = `${detections.length} objeto${detections.length === 1 ? "" : "s"}`;
  renderChart(detections);
  if (!detections.length) {
    detectionsBody.innerHTML = '<tr><td colspan="3">No detecta nada.</td></tr>';
    setLiveState("No detecta nada", false);
    return;
  }

  setLiveState(`Detecta: ${summarizeLabels(detections)}`, true);
  detectionsBody.innerHTML = detections.map((item) => {
    const pct = (item.confidence * 100).toFixed(1);
    const coords = `${item.x1}, ${item.y1}, ${item.x2}, ${item.y2}`;
    return `<tr><td>${item.label}</td><td>${pct}%</td><td>${coords}</td></tr>`;
  }).join("");
}

function renderSealInfo(seal) {
  sealBadge.classList.remove("ok", "warn");
  qrLink.removeAttribute("href");
  qrLink.textContent = "Sin enlace detectado";

  if (!seal) {
    sealBadge.textContent = "Pendiente";
    qrStatus.textContent = "Sin lectura";
    seriesValue.textContent = "Sin lectura";
    ocrStatus.textContent = "Esperando imagen.";
    return;
  }

  const qr = seal.qr_codes && seal.qr_codes.length ? seal.qr_codes[0] : null;
  sealBadge.textContent = seal.seal_status || "Sello por verificar";
  sealBadge.classList.add(seal.qr_ok ? "ok" : "warn");
  qrStatus.textContent = qr ? (seal.qr_ok ? "QR correcto" : "QR no coincide") : "QR no detectado";

  if (qr) {
    qrLink.href = qr.value;
    qrLink.textContent = qr.value;
  }

  if (seal.series && seal.series.length) {
    lastSeries = seal.series;
    lastRawText = seal.raw_text || "";
    seriesValue.textContent = seal.series.join(", ");
  } else if (!seal.text_checked && lastSeries.length) {
    seriesValue.textContent = lastSeries.join(", ");
  } else {
    seriesValue.textContent = "Sin lectura";
  }

  if (!seal.text_checked && lastSeries.length) {
    ocrStatus.textContent = lastRawText ? `Texto OCR: ${lastRawText}` : "Serie encontrada previamente.";
  } else if (!seal.text_checked) {
    ocrStatus.textContent = "OCR esperando siguiente lectura.";
  } else {
    ocrStatus.textContent = seal.ocr_error || (seal.raw_text ? `Texto OCR: ${seal.raw_text}` : "No se detecto serie numerica.");
  }
}

async function readQrCodesFromCanvas() {
  if (!qrDetector) return [];

  try {
    const codes = await qrDetector.detect(liveCanvas);
    return codes
      .map((code) => code.rawValue)
      .filter(Boolean);
  } catch (error) {
    return [];
  }
}

async function framePayload() {
  const sourceWidth = video.videoWidth || 640;
  const sourceHeight = video.videoHeight || 480;
  const targetWidth = Math.min(LIVE_FRAME_WIDTH, sourceWidth || LIVE_FRAME_WIDTH);
  const targetHeight = Math.round((sourceHeight / sourceWidth) * targetWidth);

  liveCanvas.width = targetWidth;
  liveCanvas.height = targetHeight;
  liveCtx.setTransform(1, 0, 0, 1, 0, 0);
  liveCtx.clearRect(0, 0, targetWidth, targetHeight);

  if (unmirrorCamera) {
    liveCtx.translate(targetWidth, 0);
    liveCtx.scale(-1, 1);
  }

  liveCtx.drawImage(video, 0, 0, targetWidth, targetHeight);
  liveCtx.setTransform(1, 0, 0, 1, 0, 0);
  const qrCodes = await readQrCodesFromCanvas();
  return {
    image: liveCanvas.toDataURL("image/jpeg", LIVE_JPEG_QUALITY),
    qrCodes,
    width: targetWidth,
    height: targetHeight,
  };
}

async function sendLiveFrame() {
  frameCount += 1;
  const analyzeSeal = frameCount % SEAL_ANALYSIS_EVERY === 0;
  const readText = frameCount % (SEAL_ANALYSIS_EVERY * 3) === 0;
  showLiveCamera();

  const response = await fetch("/api/live_droidcam", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      confidence: confidence.value,
      qr_codes: [],
      analyze_seal: analyzeSeal,
      read_text: readText,
      return_annotated: false,
    }),
  });

  const data = await response.json();
  if (!response.ok || !data.ok) {
    throw new Error(data.error || "Error en la deteccion.");
  }

  lastFrameSize = { width: data.width || LIVE_FRAME_WIDTH, height: data.height || 480 };
  if (data.frame_image) {
    droidPreview.src = data.frame_image;
  }
  lastDetections = data.detections;
  drawOverlay();
  renderDetections(data.detections);
  if (data.seal) {
    renderSealInfo(data.seal);
  }
}

async function detectLiveFrame() {
  if (!liveMode || liveBusy) return;

  liveBusy = true;
  try {
    await sendLiveFrame();
    setStatus("En vivo");
  } catch (error) {
    setStatus(error.message, true);
  } finally {
    liveBusy = false;
  }

  if (liveMode) {
    liveTimer = window.setTimeout(detectLiveFrame, LIVE_INTERVAL_MS);
  }
}

async function openCameraStream() {
  const preferred = {
    video: {
      width: { ideal: 1280 },
      height: { ideal: 720 },
      frameRate: { ideal: 8, max: 10 },
      facingMode: { ideal: "environment" },
    },
    audio: false,
  };

  try {
    return await navigator.mediaDevices.getUserMedia(preferred);
  } catch (error) {
    return navigator.mediaDevices.getUserMedia({ video: true, audio: false });
  }
}

function waitForVideoReady() {
  if (video.videoWidth && video.videoHeight) {
    return Promise.resolve();
  }

  return new Promise((resolve, reject) => {
    const timeout = window.setTimeout(() => {
      cleanup();
      reject(new Error("La camara no entrego imagen."));
    }, 5000);

    function cleanup() {
      window.clearTimeout(timeout);
      video.removeEventListener("loadedmetadata", onReady);
      video.removeEventListener("canplay", onReady);
    }

    function onReady() {
      cleanup();
      resolve();
    }

    video.addEventListener("loadedmetadata", onReady, { once: true });
    video.addEventListener("canplay", onReady, { once: true });
  });
}

async function startLiveDetection() {
  if (liveMode) return;

  try {
    resetResults();
    liveMode = true;
    detectLive.disabled = true;
    setStatus("Conectando DroidCam");
    showLiveCamera();
    detectLiveFrame();
  } catch (error) {
    setStatus(error.message || "No se pudo abrir DroidCam", true);
  }
}

function stopLiveDetection() {
  liveMode = false;
  liveBusy = false;
  window.clearTimeout(liveTimer);
  detectLive.disabled = false;
  setStatus("DroidCam detenido");

  if (stream) {
    stream.getTracks().forEach((track) => track.stop());
    stream = null;
    video.srcObject = null;
  }

  video.classList.remove("active");
  droidPreview.classList.remove("active");
  droidPreview.removeAttribute("src");
  cameraStage.classList.remove("active");
  clearOverlay();
  outputPreview.classList.remove("active");
  outputEmpty.classList.remove("hidden");
}

async function detectSelectedImage() {
  if (imageBusy) return;

  const file = testImage.files && testImage.files[0];
  if (!file) {
    setStatus("Elige una foto primero", true);
    return;
  }

  liveMode = false;
  liveBusy = false;
  window.clearTimeout(liveTimer);
  detectLive.disabled = false;

  const formData = new FormData();
  formData.append("image", file);
  formData.append("confidence", confidence.value);
  formData.append("analyze_seal", "true");
  formData.append("read_text", "true");
  formData.append("return_annotated", "true");

  try {
    imageBusy = true;
    detectImage.disabled = true;
    setStatus("Analizando foto");
    const response = await fetch("/api/detect", {
      method: "POST",
      body: formData,
    });

    const data = await response.json();
    if (!response.ok || !data.ok) {
      throw new Error(data.error || "Error en la deteccion.");
    }

    if (data.annotated_image) {
      showOutput(data.annotated_image);
    }
    renderDetections(data.detections);
    renderSealInfo(data.seal || null);
    setStatus(data.detections.length ? "Foto detectada" : "Foto sin detecciones", !data.detections.length);
  } catch (error) {
    setStatus(error.message || "No se pudo analizar la foto", true);
  } finally {
    imageBusy = false;
    detectImage.disabled = false;
  }
}

confidence.addEventListener("input", () => {
  confidenceValue.textContent = Number(confidence.value).toFixed(2);
});

testImage.addEventListener("change", () => {
  const file = testImage.files && testImage.files[0];
  testImageName.textContent = file ? file.name : "Elegir imagen";
});

detectLive.addEventListener("click", startLiveDetection);
stopLive.addEventListener("click", stopLiveDetection);
detectImage.addEventListener("click", detectSelectedImage);
droidPreview.addEventListener("load", drawOverlay);
window.addEventListener("resize", drawOverlay);
