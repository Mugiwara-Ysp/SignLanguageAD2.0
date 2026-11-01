# SignLanguageAD1 - Indian Sign Language to English Translator

SignLanguageAD1 is a responsive web app for camera-based Indian Sign Language (ISL) translation demonstrations. The
frontend is built with React, Vite and Tailwind CSS. It is prepared to connect to a separate Python FastAPI backend
using MediaPipe and a trained ISL classifier when those models are available.

> **Status:** A five-class GRU has been trained locally from genuine webcam sequences. Its current 16-sample random
> holdout comes from the same single recording session and scored 16/16; this is a same-session pilot only, not
> independent or real-world accuracy. The Python backend is not deployed. Local webcam testing is required before
> claiming the demonstration works for live signs. Typed words are never presented as sign predictions.

## Features

- **Camera:** live webcam preview, Start Camera / Stop Camera, permission handling and clear status messages.
- **Translation:** manual English word entry for a demo sentence, Clear Sentence, and Read Aloud using the browser's
  text-to-speech. Typed words are never presented as sign-recognition predictions.
- **Gesture collection:** record real webcam examples for exactly five labels (`HELLO`, `THANK_YOU`, `YES`, `NO`,
  `PLEASE`). Each sample contains 12 ordered MediaPipe landmark frames to preserve movement as well as static poses.
  The backend saves labeled JSONL data across recording sessions; no sample is created without a successful hand
  detection in every frame.
- **Recognition:** a five-class GRU model and local 12-frame FastAPI inference path are implemented. The saved
  model is a limited same-session pilot; collect independent sessions before relying on or deploying it.
- **Instructions:** how to position your hands, how to start and stop translation, and current limitations.
- **About:** project details.

## Project structure

```
.
├── src/                    React frontend
│   ├── components/         UI sections (camera, translation, instructions, about) and shared UI
│   ├── hooks/              Camera, recognition, sentence and speech logic
│   ├── services/           Calls to the backend API
│   └── lib/                Frame capture helper
├── backend/                Python FastAPI recognition server
│   ├── app/
│   │   ├── main.py         Health, recognition, landmark-check and collection routes
│   │   ├── collection.py   Fixed five-label JSONL dataset storage
│   │   ├── sequence_model.py GRU inference and input/UNKNOWN validation
│   │   ├── training.py     Dataset validation, grouped splits and metrics
│   │   ├── recognizer.py   Model loading and prediction
│   │   ├── landmarks.py    MediaPipe hand landmarks and feature normalization
│   │   ├── config.py       Environment settings
│   │   └── schemas.py      Request and response models
│   ├── train_model.py      Session-grouped training and evaluation CLI
│   ├── tests/              Sequence pipeline unit tests
│   ├── models/             Place the MediaPipe hand landmarker here (not committed)
│   ├── data/               Collected landmark sequences (not committed)
│   └── requirements.txt
├── .env.example            Frontend configuration template
└── README.md
```

## Requirements

- Node.js 20.19+ or 22.12+ (frontend, required by Vite 7)
- Python 3.10 to 3.12 (backend, required by MediaPipe and CPU PyTorch)
- A modern browser: Chrome, Edge, Firefox or Safari

## Run the frontend

```bash
npm install
npm run dev
```

Open the address shown in the terminal (usually http://localhost:5173). Camera access requires either `localhost` or an
HTTPS address.

To point the frontend at a different backend address, copy `.env.example` to `.env` and change `VITE_API_URL`.

## Run the backend

From the project root:

```bash
cd backend
python -m venv .venv
source .venv/bin/activate        # Windows: .venv\Scripts\activate
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
```

Check that it is running at http://localhost:8000/health. The response reports whether the model is configured.

Without a trained GRU artifact, label mapping, preprocessing config, or hand-landmarker file, the health check reports
`model_configured: false`; `/api/recognize` accepts exactly 12 frames and returns `status: "not_configured"`.
The frontend displays this clearly.

## Collecting the first five gestures

The collector stores **real webcam recordings only**. It supports exactly these labels: `HELLO`, `THANK_YOU`, `YES`,
`NO`, and `PLEASE`. The initial collection target is 200 samples per label; the UI shows counts and progress for all
five labels. It does not impose a hard limit at 200.

1. Download the official MediaPipe Hand Landmarker task model and place it at
   `backend/models/hand_landmarker.task`:

   ```powershell
   New-Item -ItemType Directory -Force backend\models | Out-Null
   Invoke-WebRequest `
     -Uri "https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/latest/hand_landmarker.task" `
     -OutFile backend\models\hand_landmarker.task
   ```

2. Start the backend and frontend as described above. For local collection, set `VITE_API_URL=http://localhost:8000`
   in the frontend's `.env`, and allow the frontend's exact origin in `ISL_CORS_ORIGINS` (default:
   `http://localhost:5173`).
3. In the app, press **Start Camera**, go to **Gesture data collection**, select one of the five labels, and press
   **Record one sample**. Perform the complete gesture during the capture. Each sample is 12 frames captured about
   120 ms apart; the backend rejects the entire sample if it cannot detect a hand in any frame.
4. Repeat for each label. Reloading the app starts a new recording session; counts and samples remain in the backend
   dataset across sessions. Define one consistent gesture for each label and do not mix different signs under one
   label. Vary position, speed, and lighting naturally. Hold static signs during the recording; perform the full
   motion for movement-based signs.

Normalized landmark sequences (not camera images) are appended to
`backend/data/gesture_samples.jsonl`. Override the location with `ISL_DATASET_PATH`. The generated dataset is ignored
by Git because it contains biometric-derived training data. Back it up securely; a cloud host needs persistent storage
mounted at that path or its filesystem may discard samples on restart.

Collection requires `backend/models/hand_landmarker.task` and reports a clear blocker if it is missing. Use
**Check hand landmarks** to analyze one current camera frame without saving a sample; only **Record one sample**
writes labeled data. The training command and sequence-GRU inference pipeline are implemented below. They do not
enable recognition until a valid model has been trained and evaluated using independent recording sessions.

For privacy and data integrity, use the backend locally or behind access control during collection. The collection
endpoints do not authenticate callers; CORS is not an authentication mechanism.

## Connecting the frontend to the backend

The frontend reads the backend address from `VITE_API_URL`. For local development, copy `.env.example` to `.env` to
use `http://localhost:8000`. For a hosted frontend, set `VITE_API_URL` to the public backend URL in the frontend
host's environment; if it is missing, the app reports that configuration is required instead of trying localhost.
Vite reads this value when the frontend starts or is built, so restart `npm run dev` (or rebuild) after changing it.

The backend only accepts browser requests from origins listed in `ISL_CORS_ORIGINS`. The origin is the scheme, host and
port of the site, with no path, for example `https://your-app.example.com`. Add the address of every site that will show
the dashboard, including preview addresses. Using a site that is not on the list shows "Could not reach the recognition
server" in the app, even when the backend is running.

Run the backend on another terminal for local use:

```bash
cd backend
ISL_CORS_ORIGINS=http://localhost:5173 uvicorn app.main:app --port 8000
```

## Deploying the frontend to Cloudflare Pages

The static frontend can be deployed independently of the Python backend:

1. Push the project to a GitHub repository. Keep `package-lock.json`; do not commit `.env`, model files, `node_modules/`,
   or `dist/` (these are covered by `.gitignore`).
2. In Cloudflare, create a **Pages** project and connect the GitHub repository.
3. Use the project root as the **Root directory**, `npm run build` as the **Build command**, and `dist` as the **Build
   output directory**.
4. Choose a compatible Node.js version (20.19+ or 22.12+) in the Pages build environment.
5. Add `VITE_API_URL` as a Pages build environment variable only after the backend has a public HTTPS URL. It must be
   set for both Production and Preview builds if both should connect to that backend. Since Vite embeds values at build
   time, trigger a new deployment after changing it.
6. Publish the Pages site over HTTPS. Browsers require a secure context (or localhost) for webcam access.

The app remains usable for manual sentence demonstrations if `VITE_API_URL` is unset, but it clearly reports that the
recognition backend is not configured. Do not set it to `localhost` for a hosted Pages deployment.

## Deploying the backend

**Backend status: not yet deployed.** The Python FastAPI service is separate from Cloudflare Pages. No trained ISL
classifier or MediaPipe hand-landmarker model is included, so real recognition cannot work until both are supplied and
the backend is deployed.

A hosted dashboard cannot reach a backend that runs only on your computer. To use the hosted site, deploy the `backend/`
folder to a Python hosting service (for example Render, Railway or Fly.io) with:

- **Root directory:** `backend`
- **Install command:** `pip install -r requirements.txt`
- **Start command:** `uvicorn app.main:app --host 0.0.0.0 --port $PORT --workers 1`
- **Environment variables:** set `ISL_CORS_ORIGINS` to the exact Cloudflare Pages site origin (scheme and host, no path), plus
  model paths if you use non-default locations (see the table below)

In Cloudflare Pages build settings, set `VITE_API_URL` to the deployed backend address (for example
`https://signlanguage-api.example.onrender.com`) with no trailing slash. Rebuild the frontend after changing it. The
backend is hosted separately and cannot be reached through `localhost` from a hosted frontend.

Check the deployed backend with `https://<your-backend>/health`. It should return JSON with `"status": "ok"`.

The full deployment guide, including dependencies, model files, CORS and troubleshooting, is in `backend/DEPLOY.md`.

## Training the five-gesture GRU

The training program validates every JSONL record. By default it requires disjoint session-grouped train, validation,
and test folds containing all five labels. The minimum is three distinct recording sessions, with all five labels
represented in each resulting split. Individual frames use the exact same MediaPipe wrist-relative, scale-normalized
coordinates in training and inference.

The current dataset has 79 valid sequences, all from one recording session. An explicit same-session pilot has been
trained with a stratified random split: 47 training, 16 validation, and 16 test samples; the test set scored 16/16
(100%) on this tiny same-session holdout. This result is not session-independent or real-world accuracy. The shipped
pilot model is fit on the combined 63 training+validation examples after selecting the epoch count; the 16 test
examples remain held out from model weights. Record all five labels in at least three separate app sessions before
running the default grouped evaluation. Vary genuine performances and, where possible, signers. Three sessions are a
minimum for a first grouped check, not evidence of broad generalization.

Install the backend dependencies, then run from the `backend/` directory:

```powershell
.\.venv\Scripts\python.exe -m pip install -r requirements.txt
.\.venv\Scripts\python.exe -m unittest discover -s tests -v
.\.venv\Scripts\python.exe train_model.py --same-session-pilot --overwrite
```

`--same-session-pilot` is an explicit opt-in and tags metrics/artifacts as same-session, non-independent. Omit it
after collecting at least three sessions to require the grouped split. Training saves:

- `models/gesture_gru.pt` — CPU PyTorch GRU weights and architecture.
- `models/gesture_labels.json` — the fixed five-label order and mapping.
- `models/gesture_preprocessing.json` — sequence dimensions and landmark normalization.
- `models/gesture_evaluation.json` — held-out confusion matrix, per-class precision/recall/F1, and split/session IDs.

Existing artifacts are not overwritten unless `--overwrite` is explicitly supplied. Back up model artifacts securely;
they are excluded by `.gitignore`. The classifier has five trained classes. `UNKNOWN` is a confidence-threshold
rejection (`ISL_CONFIDENCE_THRESHOLD`, default `0.7`), not a separately trained open-set class, so it cannot guarantee
rejection of every unseen gesture.

Recognition receives exactly 12 webcam image frames at `/api/recognize`, extracts normalized landmarks per frame, and
passes a `(12, 63)` tensor to the GRU. If any frame lacks a hand, the whole sequence returns `no_hand`. A below-threshold
prediction returns `UNKNOWN`; it is never added to the sentence.

| Variable | Default | Purpose |
| --- | --- | --- |
| `ISL_MODEL_PATH` | `backend/models/gesture_gru.pt` | GRU state dict and architecture |
| `ISL_LABEL_MAPPING_PATH` | `backend/models/gesture_labels.json` | Fixed five-class mapping |
| `ISL_PREPROCESSING_PATH` | `backend/models/gesture_preprocessing.json` | Input normalization and sequence shape |
| `HAND_LANDMARKER_PATH` | `backend/models/hand_landmarker.task` | MediaPipe hand model |
| `ISL_CONFIDENCE_THRESHOLD` | `0.7` | Minimum softmax confidence; otherwise return `UNKNOWN` |
| `ISL_CORS_ORIGINS` | `http://localhost:5173,http://127.0.0.1:5173` | Frontend origins allowed to call the API |

## Build for production

```bash
npm run build
npm run preview
```

The production files are written to `dist/`.

## Publish to GitHub

**Download the project as a ZIP**

1. In Bolt, open your project.
2. In the top left of the screen, click the project title, then click **Download**.
3. Unzip the downloaded file. The folder contains all source code.

**Upload to GitHub without the command line**

1. Sign in at https://github.com and click **New** to create a repository. Name it `SignLanguageAD1`. Do not add a README or
   .gitignore there, since the project already has them.
2. Open the new repository, click **Add file**, then **Upload files**.
3. Drag the unzipped project contents (not the outer folder) into the upload area and click **Commit changes**.

**Or publish with Git on the command line**

```bash
cd SignLanguageAD1
git init
git add .
git commit -m "Initial release of SignLanguageAD1"
git branch -M main
git remote add origin https://github.com/<your-username>/SignLanguageAD1.git
git push -u origin main
```

Files excluded by `.gitignore` (such as `node_modules/`, `dist/`, `.env`, the Python virtual environment and model files)
are not uploaded. Share model files separately if your team needs them.

## Limitations

- Word recognition works only with a trained ISL model that you connect. This project does not include one.
- Only the signs the model was trained on can be recognized. The app does not cover all of ISL.
- The pipeline tracks one hand at a time.
- Accuracy depends on lighting, camera angle, clothing and background.
- Output is word by word and is not grammar-corrected.
- This tool does not replace a qualified sign language interpreter.

## License

Add a license for your project before publishing publicly.
