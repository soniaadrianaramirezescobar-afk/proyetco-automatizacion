const imageInput = document.querySelector("#imageInput");
const inputPreview = document.querySelector("#inputPreview");
const outputPreview = document.querySelector("#outputPreview");
const inputEmpty = document.querySelector("#inputEmpty");
const outputEmpty = document.querySelector("#outputEmpty");
const detectUpload = document.querySelector("#detectUpload");
const startCamera = document.querySelector("#startCamera");
const captureFrame = document.querySelector("#captureFrame");
const stopLive = document.querySelector("#stopLive");
const cameraBox = document.querySelector("#cameraBox");
const video = document.querySelector("#video");
const confidence = document.querySelector("#confidence");
const confidenceValue = document.querySelector("#confidenceValue");
const detectionsBody = document.querySelector("#detectionsBody");
const summary = document.querySelector("#summary");
const statusBox = document.querySelector("#status");
const liveState = document.querySelector("#liveState");

let currentFile = null;
let stream = null;
let liveMode = false;
let liveBusy = false;
let liveTimer = null;
const liveCanvas = document.createElement("canvas");
const liveCtx = liveCanvas.getContext("2d");

function setStatus(text, isError = false) {
  statusBox.textContent = text;
  statusBox.classList.toggle("error", isError);
}

function showPreview(img, empty, src) {
  img.src = src;
  img.classList.add("active");
  empty.classList.add("hidden");
}

function resetResults() {
  outputPreview.classList.remove("active");
  outputEmpty.classList.remove("hidden");
  summary.textContent = "0 objetos";
  detectionsBody.innerHTML = '<tr><td colspan="3">Sin resultados todavia.</td></tr>';
  setLiveState("No detecta nada", false);
}

function setLiveState(text, detected) {
  liveState.textContent = text;
  liveState.classList.toggle("detected", detected);
}

function renderDetections(detections) {
  summary.textContent = `${detections.length} objeto${detections.length === 1 ? "" : "s"}`;
  if (!detections.length) {
    detectionsBody.innerHTML = '<tr><td colspan="3">No detecta nada.</td></tr>';
    setLiveState("No detecta nada", false);
    return;
  }

  const labels = detections.map((item) => item.label).join(", ");
  setLiveState(`Detecta: ${labels}`, true);
  detectionsBody.innerHTML = detections.map((item) => {
    const pct = (item.confidence * 100).toFixed(1);
    const coords = `${item.x1}, ${item.y1}, ${item.x2}, ${item.y2}`;
    return `<tr><td>${item.label}</td><td>${pct}%</td><td>${coords}</td></tr>`;
  }).join("");
}

async function sendDetection(body, isForm = true, live = false) {
  if (!live) {
    setStatus("Detectando...");
  }
  detectUpload.disabled = true;
  captureFrame.disabled = liveMode;

  const options = isForm
    ? { method: "POST", body }
    : { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) };

  try {
    const response = await fetch("/api/detect", options);
    const data = await response.json();
    if (!response.ok || !data.ok) {
      throw new Error(data.error || "Error en la deteccion.");
    }
    showPreview(outputPreview, outputEmpty, data.annotated_image);
    renderDetections(data.detections);
    setStatus(liveMode ? "En vivo" : "Completado");
  } catch (error) {
    setStatus(error.message, true);
  } finally {
    detectUpload.disabled = false;
    captureFrame.disabled = false;
  }
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

async function detectLiveFrame() {
  if (!liveMode || liveBusy) return;
  if (!video.videoWidth) {
    liveTimer = window.setTimeout(detectLiveFrame, 150);
    return;
  }

  liveBusy = true;
  const dataUrl = frameAsDataUrl();
  showPreview(inputPreview, inputEmpty, dataUrl);
  await sendDetection({ image: dataUrl, confidence: confidence.value }, false, true);
  liveBusy = false;

  if (liveMode) {
    liveTimer = window.setTimeout(detectLiveFrame, 250);
  }
}

function stopLiveDetection() {
  liveMode = false;
  liveBusy = false;
  window.clearTimeout(liveTimer);
  captureFrame.textContent = "Deteccion en vivo";
  startCamera.disabled = false;
  setStatus("Camara detenida");
}

imageInput.addEventListener("change", () => {
  const [file] = imageInput.files;
  if (!file) return;
  currentFile = file;
  showPreview(inputPreview, inputEmpty, URL.createObjectURL(file));
  resetResults();
  setStatus("Imagen cargada");
});

confidence.addEventListener("input", () => {
  confidenceValue.textContent = Number(confidence.value).toFixed(2);
});

detectUpload.addEventListener("click", () => {
  if (!currentFile) {
    setStatus("Selecciona una imagen primero", true);
    return;
  }
  const form = new FormData();
  form.append("image", currentFile);
  form.append("confidence", confidence.value);
  sendDetection(form);
});

startCamera.addEventListener("click", async () => {
  try {
    if (!stream) {
      stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
      video.srcObject = stream;
    }
    cameraBox.classList.add("active");
    setStatus("Camara activa");
  } catch (error) {
    setStatus("No se pudo abrir la camara", true);
  }
});

captureFrame.addEventListener("click", async () => {
  if (!stream) {
    setStatus("Activa la camara primero", true);
    return;
  }

  currentFile = null;
  resetResults();
  liveMode = true;
  captureFrame.textContent = "Detectando...";
  startCamera.disabled = true;
  setStatus("En vivo");
  detectLiveFrame();
});

stopLive.addEventListener("click", () => {
  stopLiveDetection();
  if (stream) {
    stream.getTracks().forEach((track) => track.stop());
    stream = null;
    video.srcObject = null;
  }
  cameraBox.classList.remove("active");
});
