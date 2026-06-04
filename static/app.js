const video = document.querySelector("#video");
const outputPreview = document.querySelector("#outputPreview");
const outputEmpty = document.querySelector("#outputEmpty");
const detectLive = document.querySelector("#detectLive");
const stopLive = document.querySelector("#stopLive");
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

let stream = null;
let liveMode = false;
let liveBusy = false;
let liveTimer = null;
const liveCanvas = document.createElement("canvas");
const liveCtx = liveCanvas.getContext("2d");
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

function setStatus(text, isError = false) {
  statusBox.textContent = text;
  statusBox.classList.toggle("error", isError);
}

function setLiveState(text, detected) {
  liveState.textContent = text;
  liveState.classList.toggle("detected", detected);
}

function resetResults() {
  outputPreview.classList.remove("active");
  outputEmpty.classList.remove("hidden");
  summary.textContent = "0 objetos";
  detectionsBody.innerHTML = '<tr><td colspan="3">Sin resultados todavia.</td></tr>';
  setLiveState("No detecta nada", false);
  renderChart([]);
}

function showOutput(src) {
  outputPreview.src = src;
  outputPreview.classList.add("active");
  outputEmpty.classList.add("hidden");
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

function frameAsDataUrl() {
  const sourceWidth = video.videoWidth || 640;
  const sourceHeight = video.videoHeight || 480;
  const targetWidth = 640;
  const targetHeight = Math.round((sourceHeight / sourceWidth) * targetWidth);

  liveCanvas.width = targetWidth;
  liveCanvas.height = targetHeight;
  liveCtx.drawImage(video, 0, 0, targetWidth, targetHeight);
  return liveCanvas.toDataURL("image/jpeg", 0.82);
}

async function sendLiveFrame() {
  const image = frameAsDataUrl();
  const response = await fetch("/api/detect", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ image, confidence: confidence.value }),
  });

  const data = await response.json();
  if (!response.ok || !data.ok) {
    throw new Error(data.error || "Error en la deteccion.");
  }

  showOutput(data.annotated_image);
  renderDetections(data.detections);
}

async function detectLiveFrame() {
  if (!liveMode || liveBusy) return;
  if (!video.videoWidth) {
    liveTimer = window.setTimeout(detectLiveFrame, 150);
    return;
  }

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
    liveTimer = window.setTimeout(detectLiveFrame, 250);
  }
}

async function startLiveDetection() {
  if (liveMode) return;

  try {
    if (!stream) {
      stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
      video.srcObject = stream;
    }

    resetResults();
    liveMode = true;
    detectLive.disabled = true;
    setStatus("En vivo");
    detectLiveFrame();
  } catch (error) {
    setStatus("No se pudo abrir la camara", true);
  }
}

function stopLiveDetection() {
  liveMode = false;
  liveBusy = false;
  window.clearTimeout(liveTimer);
  detectLive.disabled = false;
  setStatus("Camara detenida");

  if (stream) {
    stream.getTracks().forEach((track) => track.stop());
    stream = null;
    video.srcObject = null;
  }

  video.classList.remove("active");
  outputPreview.classList.remove("active");
  outputEmpty.classList.remove("hidden");
}

confidence.addEventListener("input", () => {
  confidenceValue.textContent = Number(confidence.value).toFixed(2);
});

detectLive.addEventListener("click", startLiveDetection);
stopLive.addEventListener("click", stopLiveDetection);
