# App detector YOLO

Esta app usa el modelo local `models/best04052026.pt` para detectar las clases entrenadas:

- `contenido_correcto`
- `contenido_incorrecto`
- `correcto`
- `sello_correcto`
- `sello_incorrecto`
- `tapa_correcta`
- `tapa_incorrecta`

## Ejecutar

Desde esta carpeta:

```powershell
python app.py
```

Luego abre:

```text
http://127.0.0.1:5000
```

## Uso

Pulsa `Detectar` y acepta el permiso de camara del navegador. La app toma frames de la camara continuamente, los manda al modelo y actualiza la interfaz con:

- Imagen anotada con cajas.
- Todas las etiquetas detectadas en el frame actual.
- Confianza y coordenadas.
- Mensaje `No detecta nada` cuando no hay detecciones con la confianza seleccionada.

Si detecta varias etiquetas al mismo tiempo, las muestra juntas en el estado principal y detalladas en la tabla.

## Cambiar modelo o confianza

Por defecto usa `models/best04052026.pt`. Para usar otro archivo:

```powershell
$env:YOLO_MODEL_PATH="models/best.pt"
python app.py
```

Para cambiar la confianza inicial:

```powershell
$env:YOLO_CONFIDENCE="0.45"
python app.py
```
