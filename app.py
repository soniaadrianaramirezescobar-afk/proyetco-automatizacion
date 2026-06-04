import base64
import io
import os
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent
os.environ.setdefault("YOLO_CONFIG_DIR", str(BASE_DIR / ".ultralytics"))

import cv2
import numpy as np
from flask import Flask, jsonify, render_template, request
from PIL import Image
from ultralytics import YOLO


DEFAULT_MODEL = BASE_DIR / "models" / "best04052026.pt"
MODEL_PATH = Path(os.environ.get("YOLO_MODEL_PATH", DEFAULT_MODEL))
CONFIDENCE_DEFAULT = float(os.environ.get("YOLO_CONFIDENCE", "0.35"))

app = Flask(__name__)
model = YOLO(str(MODEL_PATH))


def image_from_request():
    if "image" in request.files:
        return Image.open(request.files["image"].stream).convert("RGB")

    payload = request.get_json(silent=True) or {}
    image_data = payload.get("image")
    if image_data:
        if "," in image_data:
            image_data = image_data.split(",", 1)[1]
        raw = base64.b64decode(image_data)
        return Image.open(io.BytesIO(raw)).convert("RGB")

    raise ValueError("No se recibio ninguna imagen.")


def encode_image(image_rgb):
    ok, buffer = cv2.imencode(".jpg", cv2.cvtColor(image_rgb, cv2.COLOR_RGB2BGR))
    if not ok:
        raise ValueError("No se pudo codificar la imagen resultante.")
    return base64.b64encode(buffer).decode("utf-8")


def run_detection(image, confidence):
    frame = np.array(image)
    result = model.predict(
        frame,
        conf=confidence,
        iou=0.8,
        max_det=50,
        agnostic_nms=False,
        verbose=False,
    )[0]
    annotated = result.plot()

    detections = []
    for box in result.boxes:
        cls = int(box.cls[0])
        label = result.names.get(cls, str(cls))
        conf = float(box.conf[0])
        x1, y1, x2, y2 = [int(v) for v in box.xyxy[0].tolist()]
        detections.append(
            {
                "label": label,
                "confidence": round(conf, 4),
                "x1": x1,
                "y1": y1,
                "x2": x2,
                "y2": y2,
            }
        )

    return annotated, detections


@app.get("/")
def index():
    names = getattr(model, "names", {})
    labels = [names[k] for k in sorted(names)] if isinstance(names, dict) else list(names)
    return render_template(
        "index.html",
        model_path=str(MODEL_PATH.relative_to(BASE_DIR) if MODEL_PATH.is_relative_to(BASE_DIR) else MODEL_PATH),
        labels=labels,
        confidence=CONFIDENCE_DEFAULT,
    )


@app.post("/api/detect")
def detect():
    try:
        confidence = float(request.form.get("confidence") or (request.get_json(silent=True) or {}).get("confidence") or CONFIDENCE_DEFAULT)
        confidence = max(0.01, min(confidence, 0.99))
        image = image_from_request()
        annotated, detections = run_detection(image, confidence)
        return jsonify(
            {
                "ok": True,
                "detections": detections,
                "count": len(detections),
                "annotated_image": f"data:image/jpeg;base64,{encode_image(annotated)}",
            }
        )
    except Exception as exc:
        return jsonify({"ok": False, "error": str(exc)}), 400


if __name__ == "__main__":
    app.run(host="127.0.0.1", port=5000, debug=False)
