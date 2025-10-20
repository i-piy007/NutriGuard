from fastapi import FastAPI, HTTPException, UploadFile, File, Header
from pydantic import BaseModel
from openai import OpenAI
import re
import os
import logging
import sqlite3
import hashlib
import jwt as pyjwt
from datetime import datetime, date
from typing import Optional, List, Dict, Any
import shutil
from pathlib import Path
import base64
import httpx
import requests

# Set up logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

OPENROUTER_API_KEY = os.getenv("OPENROUTER_API_KEY")
CALORIENINJAS_API_KEY = os.getenv("CALORIENINJAS_API_KEY")
logger.info(f"OPENROUTER_API_KEY set: {bool(OPENROUTER_API_KEY)}")
logger.info(f"CALORIENINJAS_API_KEY set: {bool(CALORIENINJAS_API_KEY)}")
PUBLIC_URL = os.getenv("PUBLIC_URL", "http://localhost:8000")
logger.info(f"PUBLIC_URL set: {PUBLIC_URL}")

# JWT secret for token signing
JWT_SECRET = os.getenv("JWT_SECRET", "change_this_secret")
logger.info(f"JWT secret set: {bool(JWT_SECRET and JWT_SECRET != 'change_this_secret')}")

# Defensive normalization for the CalorieNinjas key: strip whitespace/newlines which can cause invalid header values
if CALORIENINJAS_API_KEY:
    try:
        CALORIENINJAS_API_KEY = CALORIENINJAS_API_KEY.strip()
        logger.info("CALORIENINJAS_API_KEY stripped of whitespace/newlines")
    except Exception:
        logger.exception("Failed to normalize CALORIENINJAS_API_KEY")

client = OpenAI(
    base_url="https://openrouter.ai/api/v1",
    api_key=OPENROUTER_API_KEY,
)

app = FastAPI()


# --- Simple SQLite user + metrics storage ---
DB_PATH = Path("data.db")

def create_db():
    conn = sqlite3.connect(DB_PATH)
    cur = conn.cursor()
    # users: id, email(unique), password_hash
    cur.execute("""
    CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        email TEXT UNIQUE NOT NULL,
        username TEXT UNIQUE,
        password_hash TEXT NOT NULL,
        name TEXT
    )
    """)
    # metrics: id, user_id, day (YYYY-MM-DD), calories, protein, carbs, fat, sugar, fiber
    cur.execute("""
    CREATE TABLE IF NOT EXISTS metrics (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        day TEXT NOT NULL,
        calories REAL DEFAULT 0,
        protein REAL DEFAULT 0,
        carbs REAL DEFAULT 0,
        fat REAL DEFAULT 0,
        sugar REAL DEFAULT 0,
        fiber REAL DEFAULT 0,
        FOREIGN KEY(user_id) REFERENCES users(id)
    )
    """)
    # meals: id, metric_id, name, calories, protein, carbs, fat, sugar, fiber, raw_json
    cur.execute("""
    CREATE TABLE IF NOT EXISTS meals (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        metric_id INTEGER NOT NULL,
        name TEXT,
        calories REAL,
        protein REAL,
        carbs REAL,
        fat REAL,
        sugar REAL,
        fiber REAL,
        raw_json TEXT,
        FOREIGN KEY(metric_id) REFERENCES metrics(id)
    )
    """)
    conn.commit()
    conn.close()

    # Migration: ensure username column exists and has a UNIQUE index
    try:
        conn = sqlite3.connect(DB_PATH)
        cur = conn.cursor()
        cur.execute("PRAGMA table_info(users)")
        cols = [r[1] for r in cur.fetchall()]
        if 'username' not in cols:
            # Add the username column (nullable for existing rows)
            cur.execute("ALTER TABLE users ADD COLUMN username TEXT")
            conn.commit()
        # Create a unique index on username if it doesn't exist
        cur.execute("CREATE UNIQUE INDEX IF NOT EXISTS idx_users_username ON users(username)")
        conn.commit()

        # Populate username for existing users if empty: use part before @ from email or email itself
        cur.execute("SELECT id, email, username FROM users")
        rows = cur.fetchall()
        for r in rows:
            uid, email_val, uname = r
            if uname:
                continue
            base = email_val.split('@')[0] if email_val and '@' in email_val else email_val
            candidate = base or f'user{uid}'
            # ensure uniqueness: if candidate exists, append uid
            cur.execute("SELECT id FROM users WHERE username = ?", (candidate,))
            if cur.fetchone():
                candidate = f"{candidate}_{uid}"
            cur.execute("UPDATE users SET username = ? WHERE id = ?", (candidate, uid))
        conn.commit()
    except Exception:
        logger.exception('Error migrating/ensuring username column')
    finally:
        conn.close()


create_db()


def summarize(obj, max_words=10):
    """Return a short preview string for logging: first max_words of text or str(obj)."""
    try:
        s = str(obj)
    except Exception:
        return "<unserializable>"
    words = s.split()
    if len(words) <= max_words:
        return s
    return " ".join(words[:max_words]) + "..."

# Create public directory if it doesn't exist
public_dir = Path("public")
public_dir.mkdir(exist_ok=True)

# Mount static files
from fastapi.staticfiles import StaticFiles
app.mount("/public", StaticFiles(directory="public"), name="public")

class ImageRequest(BaseModel):
    image_url: str  # Now expects a URL to the image


# --- Auth helpers ---
def hash_password(password: str) -> str:
    return hashlib.sha256(password.encode("utf-8")).hexdigest()


def create_token(user_id: int, email: str, username: Optional[str] = None) -> str:
    payload = {"user_id": user_id, "email": email, "username": username, "iat": datetime.utcnow().timestamp()}
    # Use PyJWT encode — ensure the imported jwt module supports encode
    if not getattr(pyjwt, "encode", None):
        logger.error("Imported jwt module does not expose 'encode'. Is PyJWT installed?")
        raise RuntimeError("JWT encode not available. Install PyJWT instead of jwt package.")
    token = pyjwt.encode(payload, JWT_SECRET, algorithm="HS256")
    # PyJWT.encode may return bytes in some versions; coerce to str
    if isinstance(token, bytes):
        token = token.decode("utf-8")
    return token


def verify_token(token: str) -> Optional[Dict[str, Any]]:
    try:
        payload = pyjwt.decode(token, JWT_SECRET, algorithms=["HS256"])
        return payload
    except Exception:
        return None


def get_user_by_email(email: str) -> Optional[Dict[str, Any]]:
    conn = sqlite3.connect(DB_PATH)
    cur = conn.cursor()
    cur.execute("SELECT id, email, username, password_hash, name FROM users WHERE email = ?", (email,))
    row = cur.fetchone()
    conn.close()
    if not row:
        return None
    return {"id": row[0], "email": row[1], "username": row[2], "password_hash": row[3], "name": row[4]}


def create_user(email: str, password: str, name: Optional[str] = None) -> Dict[str, Any]:
    conn = sqlite3.connect(DB_PATH)
    cur = conn.cursor()
    pwd = hash_password(password)
    # Derive a username from email if not explicitly provided in the caller
    username = None
    try:
        username = email.split('@')[0] if email and '@' in email else email
    except Exception:
        username = email
    cur.execute("INSERT INTO users (email, username, password_hash, name) VALUES (?, ?, ?, ?)", (email, username, pwd, name))
    conn.commit()
    user_id = cur.lastrowid
    conn.close()
    return {"id": user_id, "email": email, "username": username, "name": name}


def get_or_create_metric_for_day(user_id: int, day: str) -> int:
    conn = sqlite3.connect(DB_PATH)
    cur = conn.cursor()
    cur.execute("SELECT id FROM metrics WHERE user_id = ? AND day = ?", (user_id, day))
    row = cur.fetchone()
    if row:
        metric_id = row[0]
    else:
        cur.execute("INSERT INTO metrics (user_id, day) VALUES (?, ?)", (user_id, day))
        metric_id = cur.lastrowid
        conn.commit()
    conn.close()
    return metric_id


def add_meal_to_metric(metric_id: int, meal: Dict[str, Any]):
    conn = sqlite3.connect(DB_PATH)
    cur = conn.cursor()
    cur.execute(
        "INSERT INTO meals (metric_id, name, calories, protein, carbs, fat, sugar, fiber, raw_json) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
        (
            metric_id,
            meal.get("name"),
            meal.get("calories"),
            meal.get("protein_g"),
            meal.get("carbohydrates_total_g"),
            meal.get("fat_total_g"),
            meal.get("sugar_g"),
            meal.get("fiber_g"),
            str(meal),
        ),
    )
    conn.commit()
    conn.close()


# --- Auth endpoints ---
class RegisterRequest(BaseModel):
    username: str
    password: str
    name: Optional[str] = None


@app.post("/register")
async def register(req: RegisterRequest):
    logger.info(f"[auth] Register attempt for username={req.username}")
    try:
        # check if username already exists
        conn = sqlite3.connect(DB_PATH)
        cur = conn.cursor()
        cur.execute("SELECT id FROM users WHERE username = ?", (req.username,))
        if cur.fetchone():
            conn.close()
            raise HTTPException(status_code=400, detail="User already exists")
        # create a synthetic email to preserve existing schema
        synthetic_email = f"{req.username}@local"
        user = create_user(synthetic_email, req.password, req.name)
        # ensure username is set correctly for the new user
        conn = sqlite3.connect(DB_PATH)
        cur = conn.cursor()
        cur.execute("UPDATE users SET username = ? WHERE id = ?", (req.username, user["id"]))
        conn.commit()
        conn.close()
        token = create_token(user["id"], user.get("email", synthetic_email), req.username)
        logger.info(f"[auth] Registered user id={user['id']} username={req.username}")
        logger.debug(f"[auth] Issued token for user id={user['id']}")
        return {"user": user, "token": token}
    except HTTPException:
        raise
    except sqlite3.IntegrityError as ie:
        logger.exception("SQLite integrity error during register")
        raise HTTPException(status_code=400, detail="User already exists")
    except Exception as e:
        logger.exception(f"Error in register: {e}")
        raise HTTPException(status_code=500, detail="Internal server error")


class LoginRequest(BaseModel):
    username: str
    password: str


@app.post("/login")
async def login(req: LoginRequest):
    logger.info(f"[auth] Login attempt for username={req.username}")
    try:
        # lookup by username
        conn = sqlite3.connect(DB_PATH)
        cur = conn.cursor()
        cur.execute("SELECT id, email, username, password_hash, name FROM users WHERE username = ?", (req.username,))
        row = cur.fetchone()
        conn.close()
        if not row:
            raise HTTPException(status_code=401, detail="Invalid credentials")
        user = {"id": row[0], "email": row[1], "username": row[2], "password_hash": row[3], "name": row[4]}
        if user["password_hash"] != hash_password(req.password):
            raise HTTPException(status_code=401, detail="Invalid credentials")
        token = create_token(user["id"], user.get("email"), user.get("username"))
        logger.info(f"[auth] Login success for user id={user['id']} username={user.get('username')}")
        logger.debug(f"[auth] Issued token for user id={user['id']}")
        return {"user": {"id": user["id"], "email": user["email"], "username": user.get("username"), "name": user.get("name")}, "token": token}
    except HTTPException:
        raise
    except Exception as e:
        logger.exception(f"Error in login: {e}")
        raise HTTPException(status_code=500, detail="Internal server error")


# --- Metrics endpoints ---
class SaveMetricsRequest(BaseModel):
    day: str  # YYYY-MM-DD
    nutrition: Dict[str, Any]  # { items: [...], totals: {...} }


def get_user_from_auth_header(auth_header: Optional[str]) -> Optional[Dict[str, Any]]:
    if not auth_header:
        return None
    if not auth_header.lower().startswith("bearer "):
        return None
    token = auth_header.split(" ", 1)[1]
    payload = verify_token(token)
    return payload


@app.post("/metrics/save")
async def save_metrics(req: SaveMetricsRequest, authorization: Optional[str] = Header(None)):
    # Expect Authorization header 'Bearer <token>'
    payload = get_user_from_auth_header(authorization)
    if not payload:
        raise HTTPException(status_code=401, detail="Missing or invalid token")
    user_id = int(payload.get("user_id"))
    # ensure day format
    try:
        datetime.strptime(req.day, "%Y-%m-%d")
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid day format. Use YYYY-MM-DD")

    metric_id = get_or_create_metric_for_day(user_id, req.day)
    # save totals to metrics table
    conn = sqlite3.connect(DB_PATH)
    cur = conn.cursor()
    cur.execute(
        "UPDATE metrics SET calories = ?, protein = ?, carbs = ?, fat = ?, sugar = ?, fiber = ? WHERE id = ?",
        (
            req.nutrition.get("totals", {}).get("calories", 0),
            req.nutrition.get("totals", {}).get("protein", 0),
            req.nutrition.get("totals", {}).get("carbs", 0),
            req.nutrition.get("totals", {}).get("fat", 0),
            req.nutrition.get("totals", {}).get("sugar", 0),
            req.nutrition.get("totals", {}).get("fiber", 0),
            metric_id,
        ),
    )
    conn.commit()
    conn.close()
    # add items as meals
    for item in req.nutrition.get("items", []):
        add_meal_to_metric(metric_id, item)
    return {"status": "ok", "metric_id": metric_id}


@app.get("/metrics/get")
async def get_metrics(day: str, authorization: Optional[str] = Header(None)):
    payload = get_user_from_auth_header(authorization)
    if not payload:
        raise HTTPException(status_code=401, detail="Missing or invalid token")
    user_id = int(payload.get("user_id"))
    conn = sqlite3.connect(DB_PATH)
    cur = conn.cursor()
    cur.execute("SELECT id, calories, protein, carbs, fat, sugar, fiber FROM metrics WHERE user_id = ? AND day = ?", (user_id, day))
    row = cur.fetchone()
    if not row:
        conn.close()
        return {"day": day, "items": [], "totals": {"calories": 0, "protein": 0, "carbs": 0, "fat": 0, "sugar": 0, "fiber": 0}}
    metric_id = row[0]
    totals = {"calories": row[1], "protein": row[2], "carbs": row[3], "fat": row[4], "sugar": row[5], "fiber": row[6]}
    cur.execute("SELECT name, calories, protein, carbs, fat, sugar, fiber, raw_json FROM meals WHERE metric_id = ?", (metric_id,))
    meals = []
    for m in cur.fetchall():
        meals.append({"name": m[0], "calories": m[1], "protein": m[2], "carbs": m[3], "fat": m[4], "sugar": m[5], "fiber": m[6], "raw": m[7]})
    conn.close()
    return {"day": day, "items": meals, "totals": totals}


@app.get("/ping")
async def ping():
    """Health endpoint to verify server is up and returning JSON."""
    return {"ok": True, "time": datetime.utcnow().isoformat()}

@app.post("/upload")
async def upload_image(file: UploadFile = File(...)):
    logger.info("Received upload request")
    try:
        logger.info(f"Upload filename: {file.filename}, content_type: {file.content_type}")
        # Save the file to public directory
        file_path = public_dir / file.filename
        with file_path.open("wb") as buffer:
            shutil.copyfileobj(file.file, buffer)
        logger.info(f"Saved uploaded file to {file_path}, size={file_path.stat().st_size} bytes")
        
        # Return the public URL
        image_url = f"https://nutriguard-n98n.onrender.com/public/{file.filename}"
        logger.info(f"Image saved and URL returned: {image_url}")
        return {"image_url": image_url}
    except Exception as e:
        logger.exception(f"Error uploading image: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/identify-food")
async def identify_food(request: ImageRequest):
    logger.info("Received request to /identify-food with URL: " + request.image_url)
    try:
        logger.info("Preparing image bytes for AI (will send base64 data URI)")

        # Try to load the file from our public directory first (we saved uploads there)
        image_url = request.image_url
        filename = Path(image_url).name
        local_path = public_dir / filename
        image_bytes = None

        if local_path.exists():
            logger.info(f"Found local image at {local_path}, reading bytes")
            image_bytes = local_path.read_bytes()
            logger.info(f"Local image size: {len(image_bytes)} bytes")
        else:
            logger.info(f"Local image not found, attempting HTTP fetch of {image_url}")
            # Try fetching remotely (in case the URL is truly public)
            try:
                async with httpx.AsyncClient(timeout=10.0) as client_http:
                    resp = await client_http.get(image_url)
                    resp.raise_for_status()
                    image_bytes = resp.content
                    logger.info(f"Fetched image via HTTP, size={len(image_bytes)} bytes, content-type={resp.headers.get('content-type')}")
            except Exception as e:
                logger.exception(f"Failed to fetch image from URL: {e}")
                raise HTTPException(status_code=400, detail=f"Could not retrieve image from URL: {e}")

        # Convert to base64 data URI
        b64 = base64.b64encode(image_bytes).decode("utf-8")
        logger.info(f"Base64 length: {len(b64)} chars; preview: {b64[:80]}...")
        data_uri = f"data:image/jpeg;base64,{b64}"

        logger.info("Sending data URI to AI model (base64)")
        logger.info("Starting AI call: model=%s", "meta-llama/llama-4-maverick:free")
        completion = client.chat.completions.create(
            extra_headers={
                "HTTP-Referer": "http://localhost:8081",
                "X-Title": "NutriGuard",
            },
            extra_body={},
            model="meta-llama/llama-4-maverick:free",
            messages=[
                {
                    "role": "user",
                    "content": [
                        {"type": "text", "text": "What Food items are in the image if there is a plate only the items on the plate, give me a list of only names and the serving size in 10-20 words nothing extra. and if there is no food in the image then just repsond wih UnKnown"},
                        {"type": "image_url", "image_url": {"url": data_uri}}
                    ]
                }
            ],
        )
        logger.info(f"AI completion preview: {summarize(completion)}")

        # Check for explicit errors returned by the client
        if getattr(completion, "error", None):
            logger.error(f"AI returned error: {completion.error}")
            logger.exception("AI error details")
            raise HTTPException(status_code=500, detail=f"AI error: {completion.error}")

        if not completion.choices or not completion.choices[0].message:
            logger.error("AI response missing choices/message")
            raise HTTPException(status_code=500, detail="Invalid response from AI model")

        response_text = completion.choices[0].message.content
        if not response_text:
            response_text = "Unable to identify item in the image."

        logger.info(f"Final response text: {summarize(response_text)}")

        # Call CalorieNinjas API for nutrition data
        nutrition_data = None
        if CALORIENINJAS_API_KEY and response_text != "Unable to identify item in the image.":
            try:
                # Sanitize the AI response: remove parenthetical serving info and split into individual items
                logger.info(f"Raw AI identification text: {summarize(response_text, max_words=40)}")
                cleaned = re.sub(r"\(.*?\)", "", response_text)
                raw_items = re.split(r",|\n|\band\b", cleaned)
                # Further clean each item: remove numbering like '1.' or '1) ', and remove trailing '- serving info'
                items_to_query = []
                for s in raw_items:
                    if not s or not s.strip():
                        continue
                    it = s.strip()
                    # remove leading numbering (e.g., '1. ', '2) ')
                    it = re.sub(r"^\s*\d+\s*[\.|\)]\s*", "", it)
                    # remove trailing hyphenated serving descriptions (e.g., ' - 1 Plate')
                    it = re.sub(r"\s*-\s*.*$", "", it)
                    it = it.strip()
                    if it:
                        items_to_query.append(it)
                logger.info(f"Parsed items to query CalorieNinjas: {items_to_query}")

                cn_headers = {"X-Api-Key": CALORIENINJAS_API_KEY}
                all_items = []
                for item in items_to_query:
                    try:
                        logger.info(f"Querying CalorieNinjas for: '{item}'")
                        resp = requests.get("https://api.calorieninjas.com/v1/nutrition", params={"query": item}, headers=cn_headers, timeout=15)
                        logger.info(f"CalorieNinjas status for '{item}': {resp.status_code}")
                        if resp.status_code == 200:
                            cn_json = resp.json()
                            logger.info(f"CalorieNinjas preview for '{item}': {summarize(cn_json, max_words=20)}")
                            found = cn_json.get("items", []) if isinstance(cn_json, dict) else []
                            for f in found:
                                f.setdefault("queried_item", item)
                            all_items.extend(found)
                        else:
                            logger.warning(f"CalorieNinjas non-200 for '{item}': {summarize(resp.text, max_words=20)}")
                    except Exception:
                        logger.exception(f"Error querying CalorieNinjas for '{item}'")

                items = all_items
                # compute totals by summing the returned items
                totals_calc = {"calories": 0.0, "carbs": 0.0, "fat": 0.0, "protein": 0.0, "fiber": 0.0, "sugar": 0.0}
                for it in items:
                    try:
                        totals_calc["calories"] += float(it.get("calories", 0) or 0)
                        totals_calc["carbs"] += float(it.get("carbohydrates_total_g", 0) or 0)
                        totals_calc["fat"] += float(it.get("fat_total_g", 0) or 0)
                        totals_calc["protein"] += float(it.get("protein_g", 0) or 0)
                        totals_calc["fiber"] += float(it.get("fiber_g", 0) or 0)
                        totals_calc["sugar"] += float(it.get("sugar_g", 0) or 0)
                    except Exception:
                        logger.exception("Error summing nutrition item")
                nutrition_data = {"items": items, "totals": {k: round(v, 2) for k, v in totals_calc.items()}}
                logger.info(f"Computed nutrition totals: {summarize(nutrition_data['totals'], max_words=20)}")
            except Exception as e:
                logger.exception(f"Error calling nutrition API: {e}")

        return {"item_name": response_text, "nutrition": nutrition_data}
    except Exception as e:
        logger.exception(f"Error in identify_food: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# New clean upload endpoint: accepts multipart file, saves to public/, returns public URL
@app.post("/upload-image")
async def upload_image_clean(file: UploadFile = File(...)):
    logger.info("[upload-image] Received upload request")
    try:
        logger.info(f"[upload-image] filename={file.filename}, content_type={file.content_type}")
        file_path = public_dir / file.filename
        with file_path.open("wb") as buffer:
            shutil.copyfileobj(file.file, buffer)
        size = file_path.stat().st_size
        logger.info(f"[upload-image] Saved {file_path} ({size} bytes)")
        image_url = f"{PUBLIC_URL.rstrip('/')}/public/{file.filename}"
        logger.info(f"[upload-image] Returning image_url: {image_url}")
        return {"image_url": image_url}
    except Exception as e:
        logger.exception(f"[upload-image] Error saving file: {e}")
        raise HTTPException(status_code=500, detail=str(e))


class ImageURLRequest(BaseModel):
    image_url: str


# New clean identify endpoint: accepts image_url, sends to model, returns raw model JSON
@app.post("/identify-image")
async def identify_image(request: ImageURLRequest):
    logger.info(f"[identify-image] Received request for URL: {request.image_url}")
    try:
        # Try to load bytes from local public folder first
        filename = Path(request.image_url).name
        local_path = public_dir / filename
        image_bytes = None
        if local_path.exists():
            logger.info(f"[identify-image] Found local file {local_path}")
            image_bytes = local_path.read_bytes()
        else:
            logger.info(f"[identify-image] Fetching remote URL: {request.image_url}")
            try:
                async with httpx.AsyncClient(timeout=10.0) as client_http:
                    resp = await client_http.get(request.image_url)
                    resp.raise_for_status()
                    image_bytes = resp.content
                    logger.info(f"[identify-image] Fetched remote image, size={len(image_bytes)}")
            except Exception as e:
                logger.exception(f"[identify-image] Failed to fetch image: {e}")
                raise HTTPException(status_code=400, detail=f"Could not retrieve image: {e}")

        if not image_bytes:
            raise HTTPException(status_code=400, detail="No image bytes available")

        # Convert to base64 data URI
        b64 = base64.b64encode(image_bytes).decode("utf-8")
        data_uri = f"data:image/jpeg;base64,{b64}"

        # Call the model via OpenRouter's OpenAI client
        logger.info(f"[identify-image] Calling model meta-llama/llama-4-maverick:free")
        completion = client.chat.completions.create(
            extra_headers={"HTTP-Referer": "http://localhost:8081", "X-Title": "NutriGuard"},
            extra_body={},
            model="meta-llama/llama-4-maverick:free",
            messages=[
                {
                    "role": "user",
                    "content": [
                        {"type": "text", "text": "Identify the food items on the plate in this image. Ignore background details; list only item names and estimated serving sizes. If no food, reply with 'None'. Provide a concise JSON-compatible list."},
                        {"type": "image_url", "image_url": {"url": data_uri}}
                    ]
                }
            ],
        )

        logger.info(f"[identify-image] Model call complete; preview: {summarize(completion, max_words=20)}")

        # Basic validation of model response
        if getattr(completion, "error", None):
            logger.error(f"[identify-image] Model error: {completion.error}")
            raise HTTPException(status_code=500, detail=f"Model error: {completion.error}")

        return {"model_response": completion}
    except HTTPException:
        raise
    except Exception as e:
        logger.exception(f"[identify-image] Error processing request: {e}")
        raise HTTPException(status_code=500, detail=str(e))
