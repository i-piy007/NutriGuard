
# NutriGuard

NutriGuard is a lightweight nutrition assistant: a React Native (Expo) mobile frontend paired with a Python FastAPI backend. The app helps compute macro plans, persist user targets, and supports food image/ingredient scanning workflows.

Key points
- **Frontend:** Expo (React Native) app in `FrontEnd/NutriGuard`.
- **Backend:** FastAPI app in `BackEnd` (single-file `Main.py` with SQLite persistence `data.db`).
- **API client:** `FrontEnd/NutriGuard/utils/api.ts` points to the backend URL (default: `https://nutriguard-n98n.onrender.com`, configurable via `EXPO_PUBLIC_API_URL`).

Quick start

1) Backend (development)

 - Create and activate a Python venv, then install dependencies:

 ```powershell
 cd BackEnd
 python -m venv .venv
 .\.venv\Scripts\Activate.ps1
 pip install -r requirements.txt
 ```

 - Set environment variables (optional / recommended):
	 - `OPENROUTER_API_KEY`, `CALORIENINJAS_API_KEY`, `SPOONACULAR_API_KEY` (for external integrations)
	 - `JWT_SECRET` (default is insecure — set in production)
	 - `PUBLIC_URL` (optional)

 - Run the backend server:

 ```powershell
 uvicorn Main:app --reload --host 0.0.0.0 --port 8000
 ```

2) Frontend (Expo)

 - Install and run the Expo app:

 ```powershell
 cd FrontEnd\NutriGuard
 npm install
 npm run start
 # or use `expo start` directly
 ```

 - If your backend runs locally, point the app to it by setting `EXPO_PUBLIC_API_URL`.

What’s included
- `BackEnd/Main.py` — FastAPI endpoints (macro plan, user targets, history, image endpoints).
- `BackEnd/requirements.txt` — Python dependencies (FastAPI, Uvicorn, httpx, OpenAI client, etc.).
- `FrontEnd/NutriGuard` — Expo app with screens: login, onboarding, dashboard, camera/scan flows, history, profile.

Notes & tips
- SQLite database file `data.db` lives in the `BackEnd` folder and persists user data.
- Dev helper: set `DEV_ADMIN_BYPASS=1` (dev only) to create/get an admin token via the `/admin/bypass` endpoint.
- For production, restrict CORS, set secure `JWT_SECRET`, and configure proper API keys.

Contributing
- Open issues or PRs. Keep changes small and focused; document run steps if you add infra.

License
- Add a LICENSE file if you plan to open-source this project.

