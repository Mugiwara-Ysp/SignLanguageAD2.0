# Deploying the SignLanguageAD1 backend

The frontend is hosted separately (for example, on Cloudflare Pages). The Python recognition backend is a separate web
service. This guide covers what to deploy, how to configure it, and what is still missing.

## What gets deployed

Only the `backend/` folder is deployed. The frontend remains hosted separately; a hosted frontend cannot reach a
backend at `localhost`.

| File | Purpose |
| --- | --- |
| `app/main.py` | FastAPI application: health, recognition, non-saving landmark diagnostics, and collection routes with CORS |
| `app/collection.py` | Fixed five-label landmark-sequence dataset storage |
| `app/sequence_model.py` | 12x63 GRU inference, validation and confidence-based UNKNOWN rejection |
| `app/training.py` | Dataset validation and session-grouped evaluation splits/metrics |
| `train_model.py` | Dataset-driven GRU training and evaluation CLI |
| `app/config.py` | Environment settings and CORS origin validation |
| `app/recognizer.py` | Loads the trained classifier and MediaPipe hand landmarker, runs predictions |
| `app/landmarks.py` | MediaPipe hand landmark extraction and feature normalization |
| `app/schemas.py` | Request and response models |
| `requirements.txt` | Pinned Python dependencies |

## Dependencies

Python 3.10 to 3.12 is required. Use 3.11, which is the version these pins were chosen for.

Pinned in `requirements.txt`: FastAPI 0.115.6, Uvicorn 0.32.1, Pydantic 2.10.3, NumPy 1.26.4, Pillow 11.0.0,
scikit-learn 1.5.2, MediaPipe 0.10.21, and CPU-only PyTorch 2.6.0.

Install them on a clean Python 3.11 environment as part of the host build. The requirements file installs the CPU
PyTorch wheel from its official wheel index.

## Start command

From the `backend/` folder:

```bash
uvicorn app.main:app --host 0.0.0.0 --port $PORT --workers 1
```

Use one worker. Each worker loads the model into memory separately.

## MediaPipe model file (required for recognition and collection)

The backend starts without model files. Gesture collection and recognition both require:

1. `hand_landmarker.task`: the MediaPipe hand tracking model, downloaded from the MediaPipe model page.

The task model is kept locally and excluded from Git. Provide it to the host separately and set `HAND_LANDMARKER_PATH`
if stored somewhere other than `backend/models/hand_landmarker.task`. A local GRU pilot and its label/preprocessing
artifacts currently exist. Its 16/16 random test result is from the same single recording session and is not
independent or real-world accuracy. Do not rely on this pilot for generalization.

## Gesture data collection (first stage)

The collector accepts only the labels `HELLO`, `THANK_YOU`, `YES`, `NO`, and `PLEASE`. Its initial target is 200
samples per label. `GET /api/collection/status` reports the count for every label and the number of sessions.
`POST /api/collection/detect` checks one current frame and reports whether 21 landmarks / 63 normalized coordinates
were extracted; it does not save data.

For local camera troubleshooting, `POST /api/diagnostics/hand` accepts one raw image body (for example
`Content-Type: image/jpeg`) and reports decoded dimensions, RGB handling, and landmark/coordinate counts without
saving the image. This temporary diagnostic route is unauthenticated; remove it or protect it before exposing the
backend publicly.
`POST /api/collection/samples` accepts 12 ordered camera frames and a label; the backend uses MediaPipe to extract
normalized 63-value hand landmarks from every frame and appends the resulting sequence to JSONL only if all 12
frames contain a detected hand. This sequence format preserves movement as well as static poses.

By default, samples are stored at `backend/data/gesture_samples.jsonl`. Set `ISL_DATASET_PATH` to a persistent,
private volume on a hosted service; otherwise a host restart or redeploy may lose the recordings. The dataset is
ignored by Git because it contains biometric-derived training data.

Collection endpoints are unauthenticated. Keep this backend local or put it behind access control while recording;
CORS alone does not protect the dataset.

## Training and evaluation

From `backend/`, run:

```powershell
.\.venv\Scripts\python.exe -m pip install -r requirements.txt
.\.venv\Scripts\python.exe -m unittest discover -s tests -v
.\.venv\Scripts\python.exe train_model.py --same-session-pilot --overwrite
```

The trainer validates all records and, by default, uses three disjoint `StratifiedGroupKFold` recording-session folds.
Each train, validation, and test fold must contain all five labels. It stops before training if fewer than three
sessions exist or a grouped fold cannot represent every label. The explicit `--same-session-pilot` option enables
stratified random splits for exploratory same-session testing only; the metrics are marked non-independent. The
current model used 47 training, 16 validation, and 16 same-session test examples, scoring 16/16 on that small holdout.
The final model was then refit on the 63 train+validation samples. This is not a real-world accuracy claim.

A successful evaluation writes `gesture_gru.pt`, `gesture_labels.json`,
`gesture_preprocessing.json`, and `gesture_evaluation.json` under `backend/models/`; existing files are not replaced
without `--overwrite`.

The held-out confusion matrix and per-class precision/recall/F1 describe only the collected sessions and are not a
claim of broad signer-independent performance. `UNKNOWN` is a softmax confidence threshold, not an independently
trained open-set class.

## Environment variables

| Variable | Required | Example | Purpose |
| --- | --- | --- | --- |
| `ISL_CORS_ORIGINS` | Yes | `https://your-site.pages.dev` | Comma-separated exact origins allowed to call the API |
| `ISL_CORS_ORIGIN_REGEX` | No | `https://[a-z0-9-]+\.example\.com` | Optional, narrowly scoped regular expression for changing preview subdomains; prefer exact origins |
| `HAND_LANDMARKER_PATH` | If not default | `/data/models/hand_landmarker.task` | Path to the hand landmarker file |
| `ISL_MODEL_PATH` | If not default | `/data/models/gesture_gru.pt` | Path to evaluated GRU weights |
| `ISL_LABEL_MAPPING_PATH` | If not default | `/data/models/gesture_labels.json` | Five-label mapping |
| `ISL_PREPROCESSING_PATH` | If not default | `/data/models/gesture_preprocessing.json` | Feature preprocessing settings |
| `ISL_DATASET_PATH` | No | `/data/gesture_samples.jsonl` | Persistent JSONL path for labeled landmark sequences |
| `ISL_CONFIDENCE_THRESHOLD` | No | `0.7` | Minimum probability before a word is shown |
| `PORT` | Set by host | `8000` | Port the host expects the app to listen on |

The server refuses to start if `ISL_CORS_ORIGINS` contains `*` or an origin without `http://` or `https://`. In
production, configure the exact Cloudflare Pages origin in `ISL_CORS_ORIGINS`. Do not use `*` or a regex that matches
arbitrary origins.

### Finding the frontend origin

Open the deployed Cloudflare Pages site and copy the scheme and host from the address bar. For example, if the address
is `https://signlanguagead1.pages.dev/some/page`, the origin is `https://signlanguagead1.pages.dev`. Do not include the
path or a trailing slash. Add each production or preview origin that needs backend access to `ISL_CORS_ORIGINS`.

## Deploying (generic web service)

Most Python hosts (Render, Railway, Fly.io and similar) follow the same steps:

1. Create a new **Web Service** from your GitHub repository.
2. Set the **root directory** to `backend`.
3. Set the **build command** to `pip install -r requirements.txt`.
4. Set the **start command** to `uvicorn app.main:app --host 0.0.0.0 --port $PORT --workers 1`.
5. Set the Python version to 3.11 (on Render, use the `PYTHON_VERSION` variable with `3.11.9`).
6. Add the environment variables from the table above. Set `ISL_CORS_ORIGINS` to the exact Cloudflare Pages origin,
   including `https://` and excluding any path.
7. Provide `hand_landmarker.task` on the host. If collecting data, mount private persistent storage and set
   `ISL_DATASET_PATH`; protect the collection endpoints with host-level access control.
8. Deploy and note the public address, for example `https://signlanguage-api.example.com`.

## Connecting the frontend

In Cloudflare Pages build settings, set `VITE_API_URL` to the public backend address, with no trailing slash:

```
VITE_API_URL=https://signlanguage-api.example.com
```

Redeploy after changing it, because the value is embedded when the frontend is built.

## Verifying the deployment

Replace `<backend>` with your public address.

```bash
curl https://<backend>/health
```

Expected: JSON with `"status": "ok"`, `"service": "signlanguagead1-recognition"` and `"model_configured"`. It shows
`false` until the evaluated GRU model, its label/preprocessing artifacts, and the hand landmarker load.

Check CORS with the exact origin of your frontend:

```bash
curl -i -X OPTIONS https://<backend>/api/recognize \
  -H "Origin: https://abc123.example.com" \
  -H "Access-Control-Request-Method: POST" \
  -H "Access-Control-Request-Headers: content-type"
```

Expected: a `200` response containing `access-control-allow-origin: https://abc123.example.com`. If the header is
missing, the origin is not in `ISL_CORS_ORIGINS`.

## Troubleshooting

| Symptom in the app | Likely cause |
| --- | --- |
| "Could not reach the recognition server" | `VITE_API_URL` is wrong, the host is asleep or down, or CORS blocks the origin |
| "responded, but it is not the SignLanguageAD1 recognition backend" | `VITE_API_URL` points at another service |
| "Model not configured" | One or both model files are missing or failed to load; check the host logs |
| Start Translation does nothing | The health check failed; the message next to the status shows the reason |

## Current blockers

1. The current dataset has only one recording session; collect all five labels across at least three sessions before
   training and held-out evaluation.
2. No trained/evaluated GRU model artifacts exist yet, so recognition cannot work after deployment.
3. The local MediaPipe hand landmarker file must be provided to the host.
4. The exact Cloudflare Pages origin must be known and added to `ISL_CORS_ORIGINS`.
5. The Python backend is not deployed; recognition remains unavailable until its model assets and host are configured.
