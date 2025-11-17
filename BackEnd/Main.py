from fastapi import FastAPI, HTTPException, UploadFile, File, Header, Request
from fastapi.middleware.cors import CORSMiddleware
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
import json
import uuid
import asyncio
from datetime import timedelta
import json

# Set up logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

OPENROUTER_API_KEY = os.getenv("OPENROUTER_API_KEY")
CALORIENINJAS_API_KEY = os.getenv("CALORIENINJAS_API_KEY")
SPOONACULAR_API_KEY = os.getenv("SPOONACULAR_API_KEY")  # temporary fallback per user instruction
logger.info(f"OPENROUTER_API_KEY set: {bool(OPENROUTER_API_KEY)}")
logger.info(f"CALORIENINJAS_API_KEY set: {bool(CALORIENINJAS_API_KEY)}")
logger.info(f"SPOONACULAR_API_KEY set: {bool(SPOONACULAR_API_KEY)}")
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

# Add CORS middleware to allow frontend to fetch images and API endpoints
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Allow all origins for development; restrict in production
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Health check endpoint for Render
@app.get("/")
def read_root():
    return {"message": "NutriGuard backend is live!", "status": "healthy"}


# --- Simple SQLite user + metrics storage ---
DB_PATH = Path("data.db")

def create_db():
    conn = sqlite3.connect(DB_PATH)
    cur = conn.cursor()
    # users: id, email(unique), username(unique), password_hash, name, height, weight, gender, age, is_diabetic
    # All user profile data is persisted in SQLite and survives server restarts
    cur.execute("""
    CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        email TEXT UNIQUE NOT NULL,
        username TEXT UNIQUE,
        password_hash TEXT NOT NULL,
        name TEXT
    )
    """)
    # metrics: id, user_id, day (YYYY-MM-DD), calories, protein, carbs, fat, sugar, fiber, goal_achieved
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
        goal_achieved INTEGER DEFAULT 0,
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
    # history: id, user_id, timestamp, image_url, scan_type (food|raw_ingredients), result_json
    cur.execute("""
    CREATE TABLE IF NOT EXISTS history (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        timestamp TEXT NOT NULL,
        image_url TEXT,
        scan_type TEXT NOT NULL,
        result_json TEXT,
        FOREIGN KEY(user_id) REFERENCES users(id)
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

        # Ensure user profile columns exist (height, weight, gender, age, is_diabetic)
        cur.execute("PRAGMA table_info(users)")
        cols_now = [r[1] for r in cur.fetchall()]
        profile_cols = {
            'height': 'REAL',
            'weight': 'REAL',
            'gender': 'TEXT',
            'age': 'INTEGER',
            'is_diabetic': 'INTEGER'  # 0 or 1 (boolean)
        }
        for col, coltype in profile_cols.items():
            if col not in cols_now:
                try:
                    cur.execute(f"ALTER TABLE users ADD COLUMN {col} {coltype}")
                except Exception:
                    logger.exception(f"Failed to add column {col}")
        conn.commit()

        # Ensure goal_achieved column exists in metrics table
        cur.execute("PRAGMA table_info(metrics)")
        metrics_cols = [r[1] for r in cur.fetchall()]
        if 'goal_achieved' not in metrics_cols:
            try:
                cur.execute("ALTER TABLE metrics ADD COLUMN goal_achieved INTEGER DEFAULT 0")
                conn.commit()
                logger.info("Added goal_achieved column to metrics table")
            except Exception:
                logger.exception("Failed to add goal_achieved column to metrics")
        conn.commit()
    except Exception:
        logger.exception('Error migrating/ensuring username column')
    finally:
        conn.close()


create_db()

# Dev-only admin bypass: only enable if DEV_ADMIN_BYPASS env var is set to '1'
DEV_ADMIN_BYPASS = os.getenv('DEV_ADMIN_BYPASS', '0') == '1'


@app.post('/admin/bypass')
async def admin_bypass():
    if not DEV_ADMIN_BYPASS:
        raise HTTPException(status_code=403, detail='Admin bypass not enabled')
    # create admin user if missing and return token
    conn = sqlite3.connect(DB_PATH)
    cur = conn.cursor()
    cur.execute("SELECT id, username, email FROM users WHERE username = 'admin'")
    row = cur.fetchone()
    if row:
        user_id = row[0]
        email = row[2]
    else:
        # create admin with default password 'admin' (dev only)
        admin = create_user('admin@local', 'admin', name='Administrator', username='admin')
        user_id = admin['id']
        email = admin['email']
    conn.close()
    token = create_token(user_id, email, 'admin')
    return {'token': token, 'user': {'id': user_id, 'username': 'admin', 'email': email}}


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


def _build_public_image_url(filename: str, request: Request) -> str:
    """Build a public URL for a file in /public that is reachable by the client.
    Prefer configured PUBLIC_URL when it does not point to localhost; otherwise fallback to request.base_url.
    """
    try:
        base = (PUBLIC_URL or "").rstrip("/")
        if base and not ("localhost" in base or "127.0.0.1" in base):
            url = f"{base}/public/{filename}"
            logger.info(f"[_build_public_image_url] Using PUBLIC_URL base: {url}")
            return url
    except Exception:
        logger.exception("[_build_public_image_url] Error evaluating PUBLIC_URL, falling back to request.base_url")
    # Fallback to request base URL
    base_req = str(request.base_url).rstrip("/")
    url = f"{base_req}/public/{filename}"
    logger.info(f"[_build_public_image_url] Using request.base_url: {url}")
    return url


# --- Filter defaults and prompt helpers ---
def _age_bucket(age: Optional[int]) -> Optional[str]:
    try:
        if age is None:
            return None
        a = int(age)
        if a < 13:
            return 'child'
        if a >= 60:
            return 'old'
        return 'adult'
    except Exception:
        return None


def _get_user_profile_row(user_id: int) -> Optional[Dict[str, Any]]:
    try:
        conn = sqlite3.connect(DB_PATH)
        cur = conn.cursor()
        cur.execute(
            'SELECT id, email, username, name, height, weight, gender, age, is_diabetic FROM users WHERE id = ?',
            (user_id,),
        )
        row = cur.fetchone()
        conn.close()
        if not row:
            return None
        return {
            'id': row[0],
            'email': row[1],
            'username': row[2],
            'name': row[3],
            'height': row[4],
            'weight': row[5],
            'gender': row[6],
            'age': row[7],
            'is_diabetic': None if row[8] is None else bool(row[8]),
        }
    except Exception:
        logger.exception('Failed to fetch user profile for defaults')
        return None


def _default_filters_for_user(payload: Optional[Dict[str, Any]]) -> Dict[str, Any]:
    defaults = {
        'times': ['breakfast', 'lunch', 'snacks', 'dinner'],
        'age': 'adult',
        'diabetic': False,
    }
    try:
        if not payload:
            return defaults
        user_id = int(payload.get('user_id'))
        profile = _get_user_profile_row(user_id)
        if not profile:
            return defaults
        age_b = _age_bucket(profile.get('age')) or defaults['age']
        diabetic = defaults['diabetic'] if profile.get('is_diabetic') is None else bool(profile.get('is_diabetic'))
        return {
            'times': defaults['times'],
            'age': age_b,
            'diabetic': diabetic,
        }
    except Exception:
        logger.exception('Failed to derive default filters; using base defaults')
        return defaults


def _merge_filters(base: Dict[str, Any], override: Optional[Dict[str, Any]]) -> Dict[str, Any]:
    if not override:
        return base
    out = dict(base)
    for k in ('times', 'age', 'diabetic'):
        if k in override and override[k] not in (None, [], ''):
            out[k] = override[k]
    # sanitize times
    if out.get('times'):
        allowed = {'breakfast', 'lunch', 'snacks', 'dinner'}
        out['times'] = [t for t in out['times'] if t in allowed]
        if not out['times']:
            out['times'] = base['times']
    return out


def _build_recipe_prompt(ingredients: List[str], filters: Dict[str, Any]) -> str:
    times = ", ".join(filters.get('times', [])) or 'any mealtime'
    age = filters.get('age') or 'adult'
    diabetic = bool(filters.get('diabetic'))
    dietary_line = 'Prioritize low glycemic, diabetic-friendly choices.' if diabetic else 'Avoid excessive sugar and saturated fats.'
    return (
        "You are a culinary assistant focused on Indian cuisine. Based on these raw ingredients: "
        f"{', '.join(ingredients)}. "
        "Suggest 5 Indian dishes (traditional or popular regional) that can realistically be made with them. Prefer Indian preparations and naming; adapt non-Indian ideas into Indian-style where needed. "
        f"Target mealtimes: {times}. Target age group: {age}. {dietary_line} "
        "For each dish provide: name, a concise description, and a short justification referencing the ingredients and filters. "
        "Return JSON with shape {\"dishes\": [{\"name\": str, \"description\": str, \"justification\": str}]}. No prose, JSON only."
    )


def _llm_json(prompt: str) -> Optional[Dict[str, Any]]:
    try:
        resp = client.chat.completions.create(
            model=os.getenv('OPENROUTER_MODEL', 'tngtech/deepseek-r1t2-chimera:free'),
            messages=[
                {"role": "system", "content": "You return only valid minified JSON."},
                {"role": "user", "content": prompt},
            ],
            temperature=0.5,
        )
        content = resp.choices[0].message.content if resp and resp.choices else None
        if not content:
            return None
        c = content.strip()
        if c.startswith('```'):
            c = c.strip('`')
            c = re.sub(r'^json\n', '', c, flags=re.I)
        return json.loads(c)
    except Exception:
        logger.exception('LLM JSON generation failed')
        return None


# --- Parsing helpers for robust outputs ---
# Matches lines like "1. Pasta: tomato-based sauce" or "Pasta - with tomato"
DISH_LINE_RE = re.compile(r'^\s*(?:\d+[.)]\s*)?(?P<name>[^:•\-]+?)(?:\s*[:\-]\s*(?P<desc>.+))?\s*$')

def _normalize_dishes(dishes_raw: Any) -> List[Dict[str, Any]]:
    """Normalize various dish formats (list of dicts/strings or a single string) into a list of dicts.
    Each dict contains at least { name, description?, image_url? }.
    """
    out: List[Dict[str, Any]] = []
    try:
        if isinstance(dishes_raw, list):
            for it in dishes_raw:
                if isinstance(it, dict):
                    out.append({
                        "name": str(it.get("name", "")).strip(),
                        "description": str(it.get("description", "")).strip() if it.get("description") is not None else None,
                        "image_url": it.get("image_url"),
                    })
                elif isinstance(it, str):
                    m = DISH_LINE_RE.match(it)
                    if m:
                        out.append({
                            "name": (m.group("name") or "").strip(),
                            "description": (m.group("desc") or "").strip() or None,
                            "image_url": None,
                        })
        elif isinstance(dishes_raw, str):
            for line in dishes_raw.splitlines():
                line = line.strip()
                if not line:
                    continue
                # skip obvious section headers
                if line.lower().startswith(("ingredients", "suggested dishes")):
                    continue
                m = DISH_LINE_RE.match(line)
                if m and m.group("name"):
                    out.append({
                        "name": (m.group("name") or "").strip(),
                        "description": (m.group("desc") or "").strip() or None,
                        "image_url": None,
                    })
    except Exception:
        logger.exception("Failed to normalize dishes")
    # filter empties
    return [d for d in out if d.get("name")]


# --- Spoonacular helpers ---
def spoonacular_search_recipe(dish_name: str, include_ingredients: Optional[List[str]] = None) -> Optional[Dict[str, Any]]:
    """Search Spoonacular for a dish by name. Returns top result dict or None."""
    try:
        params = {
            "query": dish_name,
            "number": 1,
            "apiKey": SPOONACULAR_API_KEY,
        }
        # Optionally bias by available ingredients
        if include_ingredients:
            try:
                params["includeIngredients"] = ",".join(include_ingredients[:5])  # limit to first 5
            except Exception:
                pass
        url = "https://api.spoonacular.com/recipes/complexSearch"
        resp = requests.get(url, params=params, timeout=10)
        resp.raise_for_status()
        data = resp.json() or {}
        results = data.get("results") or []
        if results:
            return results[0]
    except Exception:
        logger.exception(f"[spoonacular] search failed for '{dish_name}'")
    return None


def spoonacular_get_recipe_info(recipe_id: int) -> Optional[Dict[str, Any]]:
    """Get detailed recipe info including image and instructions."""
    try:
        params = {"includeNutrition": "false", "apiKey": SPOONACULAR_API_KEY}
        url = f"https://api.spoonacular.com/recipes/{recipe_id}/information"
        resp = requests.get(url, params=params, timeout=10)
        resp.raise_for_status()
        return resp.json()
    except Exception:
        logger.exception(f"[spoonacular] information failed for id={recipe_id}")
        return None


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


def create_user(email: str, password: str, name: Optional[str] = None, username: Optional[str] = None, height: Optional[float] = None, weight: Optional[float] = None, gender: Optional[str] = None, age: Optional[int] = None, is_diabetic: Optional[bool] = None) -> Dict[str, Any]:
    conn = sqlite3.connect(DB_PATH)
    cur = conn.cursor()
    pwd = hash_password(password)
    # Derive a username from email if not explicitly provided in the caller
    if not username:
        try:
            username = email.split('@')[0] if email and '@' in email else email
        except Exception:
            username = email
    # Convert is_diabetic boolean to integer (0 or 1) for SQLite
    diabetic_val = None if is_diabetic is None else (1 if is_diabetic else 0)
    cur.execute("INSERT INTO users (email, username, password_hash, name, height, weight, gender, age, is_diabetic) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)", (email, username, pwd, name, height, weight, gender, age, diabetic_val))
    conn.commit()
    user_id = cur.lastrowid
    conn.close()
    return {"id": user_id, "email": email, "username": username, "name": name, "height": height, "weight": weight, "gender": gender, "age": age, "is_diabetic": is_diabetic}


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
    age: Optional[int] = None
    height: Optional[float] = None
    weight: Optional[float] = None
    gender: Optional[str] = None
    is_diabetic: Optional[bool] = None


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

        # create a synthetic email to preserve existing schema, store provided profile fields
        synthetic_email = f"{req.username}@local"
        user = create_user(synthetic_email, req.password, req.name, username=req.username, height=req.height, weight=req.weight, gender=req.gender, age=req.age, is_diabetic=req.is_diabetic)
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
    
    # Calculate goal achievement (simple: calorie goal of 2500, can be customized)
    calories = req.nutrition.get("totals", {}).get("calories", 0)
    calorie_goal = 2500  # Default goal, could be user-specific in future
    goal_achieved = 1 if calories >= calorie_goal * 0.8 and calories <= calorie_goal * 1.2 else 0
    
    # save totals to metrics table
    conn = sqlite3.connect(DB_PATH)
    cur = conn.cursor()
    cur.execute(
        "UPDATE metrics SET calories = ?, protein = ?, carbs = ?, fat = ?, sugar = ?, fiber = ?, goal_achieved = ? WHERE id = ?",
        (
            calories,
            req.nutrition.get("totals", {}).get("protein", 0),
            req.nutrition.get("totals", {}).get("carbs", 0),
            req.nutrition.get("totals", {}).get("fat", 0),
            req.nutrition.get("totals", {}).get("sugar", 0),
            req.nutrition.get("totals", {}).get("fiber", 0),
            goal_achieved,
            metric_id,
        ),
    )
    conn.commit()
    conn.close()
    # add items as meals
    for item in req.nutrition.get("items", []):
        add_meal_to_metric(metric_id, item)
    return {"status": "ok", "metric_id": metric_id, "goal_achieved": bool(goal_achieved)}


class UserProfileRequest(BaseModel):
    name: Optional[str] = None
    height: Optional[float] = None
    weight: Optional[float] = None
    gender: Optional[str] = None
    age: Optional[int] = None
    is_diabetic: Optional[bool] = None


@app.get('/user/profile')
async def get_user_profile(authorization: Optional[str] = Header(None)):
    payload = get_user_from_auth_header(authorization)
    if not payload:
        raise HTTPException(status_code=401, detail='Missing or invalid token')
    user_id = int(payload.get('user_id'))
    conn = sqlite3.connect(DB_PATH)
    cur = conn.cursor()
    cur.execute('SELECT id, email, username, name, height, weight, gender, age, is_diabetic FROM users WHERE id = ?', (user_id,))
    row = cur.fetchone()
    conn.close()
    # If no DB row exists for this user id, return a default/empty profile
    # so the client can show editable fields (None -> empty) and allow the user to save.
    if not row:
        logger.warning(f"User id={user_id} not found in DB; returning empty profile based on token payload")
        return {
            'id': user_id,
            'email': payload.get('email'),
            'username': payload.get('username'),
            'name': payload.get('name') or None,
            'height': None,
            'weight': None,
            'gender': None,
            'age': None,
            'is_diabetic': None,
        }
    return {
        'id': row[0],
        'email': row[1],
        'username': row[2],
        'name': row[3],
        'height': row[4],
        'weight': row[5],
        'gender': row[6],
        'age': row[7],
        'is_diabetic': bool(row[8]) if row[8] is not None else None
    }


@app.post('/user/profile')
async def update_user_profile(req: UserProfileRequest, authorization: Optional[str] = Header(None)):
    payload = get_user_from_auth_header(authorization)
    if not payload:
        raise HTTPException(status_code=401, detail='Missing or invalid token')
    user_id = int(payload.get('user_id'))
    # Validate fields minimally
    conn = sqlite3.connect(DB_PATH)
    cur = conn.cursor()
    try:
        # Build update dynamically
        updates = []
        params = []
        if req.name is not None:
            updates.append('name = ?')
            params.append(req.name)
        if req.height is not None:
            updates.append('height = ?')
            params.append(req.height)
        if req.weight is not None:
            updates.append('weight = ?')
            params.append(req.weight)
        if req.gender is not None:
            updates.append('gender = ?')
            params.append(req.gender)
        if req.age is not None:
            updates.append('age = ?')
            params.append(req.age)
        if req.is_diabetic is not None:
            updates.append('is_diabetic = ?')
            params.append(1 if req.is_diabetic else 0)
        target_id = user_id
        # If the user row for this id does not exist, try to find by username or email from token
        cur.execute('SELECT id FROM users WHERE id = ?', (user_id,))
        if not cur.fetchone():
            uname = payload.get('username')
            email = payload.get('email')
            found_id = None
            if uname:
                cur.execute('SELECT id FROM users WHERE username = ?', (uname,))
                r = cur.fetchone()
                if r:
                    found_id = r[0]
            if not found_id and email:
                cur.execute('SELECT id FROM users WHERE email = ?', (email,))
                r = cur.fetchone()
                if r:
                    found_id = r[0]
            if found_id:
                target_id = found_id
            else:
                # Insert a new placeholder user row so we can save profile data.
                # password_hash is NOT NULL in schema, so use an empty-hash placeholder.
                placeholder_email = email or (f"{uname}@local" if uname else f"user{user_id}@local")
                placeholder_username = uname or f"user{user_id}"
                try:
                    cur.execute('INSERT INTO users (id, email, username, password_hash, name) VALUES (?, ?, ?, ?, ?)',
                                (user_id, placeholder_email, placeholder_username, hash_password(''), req.name))
                    conn.commit()
                    target_id = user_id
                except Exception:
                    # As a fallback, insert without specifying id (let sqlite choose) and use that id
                    cur.execute('INSERT INTO users (email, username, password_hash, name) VALUES (?, ?, ?, ?)',
                                (placeholder_email, placeholder_username, hash_password(''), req.name))
                    conn.commit()
                    target_id = cur.lastrowid

        if updates:
            params.append(target_id)
            sql = 'UPDATE users SET ' + ', '.join(updates) + ' WHERE id = ?'
            cur.execute(sql, params)
            conn.commit()
        # Return the upserted profile
        cur.execute('SELECT id, email, username, name, height, weight, gender, age, is_diabetic FROM users WHERE id = ?', (target_id,))
        row = cur.fetchone()
        profile = None
        if row:
            profile = {'id': row[0], 'email': row[1], 'username': row[2], 'name': row[3], 'height': row[4], 'weight': row[5], 'gender': row[6], 'age': row[7], 'is_diabetic': bool(row[8]) if row[8] is not None else None}
        else:
            profile = {'id': target_id, 'email': payload.get('email'), 'username': payload.get('username'), 'name': req.name or None, 'height': None, 'weight': None, 'gender': None, 'age': None, 'is_diabetic': None}
    except Exception:
        logger.exception('Error updating profile')
        raise HTTPException(status_code=500, detail='Failed to update profile')
    finally:
        conn.close()
    return {'status': 'ok', 'profile': profile}


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


@app.get("/metrics/weekly-status")
async def get_weekly_status(authorization: Optional[str] = Header(None)):
    """Get goal achievement status for the current week (Mon-Sun)"""
    payload = get_user_from_auth_header(authorization)
    if not payload:
        raise HTTPException(status_code=401, detail="Missing or invalid token")
    user_id = int(payload.get("user_id"))
    
    # Get current week's Monday
    today = date.today()
    days_since_monday = today.weekday()  # 0=Monday, 6=Sunday
    monday = today - timedelta(days=days_since_monday)
    
    # Generate all 7 days of the week
    week_days = [(monday + timedelta(days=i)).strftime("%Y-%m-%d") for i in range(7)]
    
    conn = sqlite3.connect(DB_PATH)
    cur = conn.cursor()
    
    weekly_status = []
    for day_str in week_days:
        cur.execute("SELECT goal_achieved FROM metrics WHERE user_id = ? AND day = ?", (user_id, day_str))
        row = cur.fetchone()
        
        if row is None:
            status = "no_data"  # Grey dot
        elif row[0] == 1:
            status = "achieved"  # Green dot
        else:
            status = "not_achieved"  # Red dot
        
        # Get day name (Mon, Tue, etc.)
        day_obj = datetime.strptime(day_str, "%Y-%m-%d")
        day_name = day_obj.strftime("%a")  # Mon, Tue, Wed, etc.
        
        weekly_status.append({
            "day": day_str,
            "day_name": day_name,
            "status": status
        })
    
    conn.close()
    return {"weekly_status": weekly_status}


@app.get("/ping")
async def ping():
    """Health endpoint to verify server is up and returning JSON."""
    return {"ok": True, "time": datetime.utcnow().isoformat()}

@app.post("/upload")
async def upload_image(request: Request, file: UploadFile = File(...)):
    logger.info("Received upload request")
    try:
        logger.info(f"Upload filename: {file.filename}, content_type: {file.content_type}")
        # Generate unique filename to avoid collisions
        original_name = file.filename or "upload.bin"
        ext = ''.join(Path(original_name).suffixes) or ''
        unique_name = f"{uuid.uuid4().hex}{ext}"
        file_path = public_dir / unique_name
        with file_path.open("wb") as buffer:
            shutil.copyfileobj(file.file, buffer)
        logger.info(f"Saved uploaded file to {file_path}, size={file_path.stat().st_size} bytes")
        
        # Return a public URL reachable by the client (avoid localhost when on device)
        image_url = _build_public_image_url(unique_name, request)
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
        logger.info("Starting AI call: model=%s", "google/gemma-3-4b-it:free")
        completion = client.chat.completions.create(
            extra_headers={
                "HTTP-Referer": "http://localhost:8081",
                "X-Title": "NutriGuard",
            },
            extra_body={},
            model="google/gemma-3-4b-it:free",
            messages=[
                {
                    "role": "user",
                    "content": [
                        {"type": "text", "text": "don't respond with anything else other than What Food items are in the image if there is a plate only the items on the plate, give me a list of only names and the serving size in 10-20 words nothing extra. DO not mention stuff like condiments and leaves and stuff like that. If there is no food in the image then just respond with Unknown"},
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
async def upload_image_clean(request: Request, file: UploadFile = File(...)):
    logger.info("[upload-image] Received upload request")
    try:
        logger.info(f"[upload-image] filename={file.filename}, content_type={file.content_type}")
        # Generate unique filename
        original_name = file.filename or "upload.bin"
        ext = ''.join(Path(original_name).suffixes) or ''
        unique_name = f"{uuid.uuid4().hex}{ext}"
        file_path = public_dir / unique_name
        with file_path.open("wb") as buffer:
            shutil.copyfileobj(file.file, buffer)
        size = file_path.stat().st_size
        logger.info(f"[upload-image] Saved {file_path} ({size} bytes)")
        image_url = _build_public_image_url(unique_name, request)
        logger.info(f"[upload-image] Returning image_url: {image_url}")
        return {"image_url": image_url}
    except Exception as e:
        logger.exception(f"[upload-image] Error saving file: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# --- Public directory retention cleanup ---
RETENTION_DAYS = 7


async def _cleanup_public_dir_periodically():
    """Delete files in public/ older than RETENTION_DAYS. Runs daily."""
    while True:
        try:
            cutoff = datetime.utcnow() - timedelta(days=RETENTION_DAYS)
            removed = 0
            for p in public_dir.iterdir():
                try:
                    if not p.is_file():
                        continue
                    mtime = datetime.utcfromtimestamp(p.stat().st_mtime)
                    if mtime < cutoff:
                        p.unlink(missing_ok=True)
                        removed += 1
                except Exception:
                    logger.exception(f"Failed evaluating/removing {p}")
            if removed:
                logger.info(f"[cleanup] Removed {removed} expired public files (>{RETENTION_DAYS} days)")
        except Exception:
            logger.exception("[cleanup] Error during public dir cleanup")
        # Sleep roughly 24 hours
        await asyncio.sleep(60 * 60 * 24)


@app.on_event("startup")
async def _startup_cleanup_task():
    try:
        asyncio.create_task(_cleanup_public_dir_periodically())
        logger.info(f"Scheduled public dir cleanup task (retention={RETENTION_DAYS} days)")
    except Exception:
        logger.exception("Failed to schedule cleanup task")


class ImageURLRequest(BaseModel):
    image_url: str


@app.post("/identify-raw-ingredients")
async def identify_raw_ingredients(request: ImageRequest, authorization: Optional[str] = Header(None)):
    """Endpoint for analyzing raw ingredients and suggesting dishes that can be made."""
    logger.info(f"[identify-raw-ingredients] Received request for URL: {request.image_url}")
    
    # Fetch user profile for personalized recommendations
    user_profile = None
    payload = get_user_from_auth_header(authorization)
    if payload:
        user_id = int(payload.get("user_id"))
        try:
            conn = sqlite3.connect(DB_PATH)
            cur = conn.cursor()
            cur.execute('SELECT age, gender, is_diabetic FROM users WHERE id = ?', (user_id,))
            row = cur.fetchone()
            conn.close()
            if row:
                user_profile = {
                    'age': row[0],
                    'gender': row[1],
                    'is_diabetic': bool(row[2]) if row[2] is not None else False
                }
                logger.info(f"[identify-raw-ingredients] User profile: {user_profile}")
        except Exception as e:
            logger.exception(f"[identify-raw-ingredients] Failed to fetch user profile: {e}")
    
    try:
        # Load image bytes (same logic as identify-food)
        image_url = request.image_url
        filename = Path(image_url).name
        local_path = public_dir / filename
        image_bytes = None

        if local_path.exists():
            logger.info(f"[identify-raw-ingredients] Found local image at {local_path}")
            image_bytes = local_path.read_bytes()
        else:
            logger.info(f"[identify-raw-ingredients] Fetching remote URL: {image_url}")
            try:
                async with httpx.AsyncClient(timeout=10.0) as client_http:
                    resp = await client_http.get(image_url)
                    resp.raise_for_status()
                    image_bytes = resp.content
                    logger.info(f"[identify-raw-ingredients] Fetched remote image, size={len(image_bytes)}")
            except Exception as e:
                logger.exception(f"[identify-raw-ingredients] Failed to fetch image: {e}")
                raise HTTPException(status_code=400, detail=f"Could not retrieve image: {e}")

        if not image_bytes:
            raise HTTPException(status_code=400, detail="No image bytes available")

        # Convert to base64 data URI
        b64 = base64.b64encode(image_bytes).decode("utf-8")
        data_uri = f"data:image/jpeg;base64,{b64}"

        # Build personalized context for AI
        from datetime import datetime
        current_time = datetime.utcnow()
        time_of_day = "breakfast" if current_time.hour < 11 else "lunch" if current_time.hour < 15 else "dinner"
        
        context_parts = [f"Current time context: {time_of_day}"]
        if user_profile:
            if user_profile.get('age'):
                context_parts.append(f"User age: {user_profile['age']}")
            if user_profile.get('gender'):
                context_parts.append(f"User gender: {user_profile['gender']}")
            if user_profile.get('is_diabetic'):
                context_parts.append("User is diabetic (prioritize low-sugar, low-carb recipes)")
        
        context_str = ". ".join(context_parts) + "."
        
        # Call AI with specialized prompt including default filters - requesting JSON with ranking and justification
        logger.info("[identify-raw-ingredients] Calling AI model with personalized raw ingredients prompt")
        # Compute defaults for filters (times, age bucket, diabetic)
        defaults = _default_filters_for_user(payload)
        filters_line = f"Default filters to respect: times={defaults['times']}, age={defaults['age']}, diabetic={defaults['diabetic']}."
        ai_prompt = f"{context_str}\n{filters_line}\n\nAnalyze this image and identify all raw ingredients visible. Then suggest 3-5 delicious INDIAN dishes that can be made using these ingredients, prioritizing traditional and popular Indian cuisine recipes that match the filters. Order them by relevance to the user's needs (considering time of day and health requirements). For EACH dish, explain WHY it's a good choice for this user and why it's ranked in this position. Respond ONLY with valid JSON in this exact format:\n{{\n  \"ingredients\": [\"ingredient1\", \"ingredient2\", ...],\n  \"dishes\": [\n    {{\"name\": \"Dish Name\", \"description\": \"Brief description of the dish\", \"justification\": \"Explain why this dish is ranked here for this user - consider their health needs (diabetic status), time of day appropriateness, and nutritional benefits over other options\"}},\n    ...\n  ]\n}}\n\nIf no ingredients are visible, return: {{\"ingredients\": [], \"dishes\": []}}"
        
        completion = client.chat.completions.create(
            extra_headers={
                "HTTP-Referer": "http://localhost:8081",
                "X-Title": "NutriGuard",
            },
            extra_body={},
            model="google/gemma-3-4b-it:free",
            messages=[
                {
                    "role": "user",
                    "content": [
                        {
                            "type": "text", 
                            "text": ai_prompt
                        },
                        {"type": "image_url", "image_url": {"url": data_uri}}
                    ]
                }
            ],
        )

        logger.info(f"[identify-raw-ingredients] AI completion preview: {summarize(completion)}")

        if getattr(completion, "error", None):
            logger.error(f"[identify-raw-ingredients] AI error: {completion.error}")
            raise HTTPException(status_code=500, detail=f"AI error: {completion.error}")

        if not completion.choices or not completion.choices[0].message:
            logger.error("[identify-raw-ingredients] AI response missing choices/message")
            raise HTTPException(status_code=500, detail="Invalid response from AI model")

        response_text = completion.choices[0].message.content
        if not response_text:
            response_text = '{"ingredients": [], "dishes": []}'

        logger.info(f"[identify-raw-ingredients] Raw response: {summarize(response_text, max_words=50)}")

        # Parse JSON response
        import json
        try:
            # Try to extract JSON if wrapped in markdown code blocks
            raw_text = response_text
            if "```json" in raw_text:
                raw_text = raw_text.split("```json")[1].split("```")[0].strip()
            elif "```" in raw_text:
                raw_text = raw_text.split("```")[1].split("```")[0].strip()

            parsed_data = json.loads(raw_text)
            ingredients = parsed_data.get("ingredients", []) or []
            dishes = _normalize_dishes(parsed_data.get("dishes"))
        except Exception as e:
            logger.exception(f"[identify-raw-ingredients] Failed to parse JSON: {e}")
            # Fallback: try to extract info from the free-form text
            ingredients = []
            dishes = _normalize_dishes(response_text)
            for line in response_text.split('\n'):
                s = line.strip()
                if s.startswith(('-','•')):
                    ingredients.append(s[1:].strip())
        
        # Enrich each dish with Spoonacular information (image + steps). Fall back to Google image if needed.
        google_api_key = os.getenv("GOOGLE_API_KEY")
        google_cx = os.getenv("GOOGLE_CX")

        for dish in dishes:
            dish_name = dish.get("name", "").strip()
            dish.setdefault("image_url", None)
            dish_steps: List[str] = []

            # Try Spoonacular first
            if dish_name and SPOONACULAR_API_KEY:
                result = spoonacular_search_recipe(dish_name, include_ingredients=ingredients if isinstance(ingredients, list) else None)
                if result and result.get("id"):
                    info = spoonacular_get_recipe_info(int(result["id"]))
                    if info:
                        # Prefer Spoonacular image
                        dish["image_url"] = info.get("image") or dish.get("image_url")
                        # Extract steps from analyzedInstructions
                        instr_blocks = info.get("analyzedInstructions") or []
                        if instr_blocks and isinstance(instr_blocks, list):
                            steps_block = instr_blocks[0] or {}
                            for st in steps_block.get("steps", []) or []:
                                txt = st.get("step")
                                if txt:
                                    dish_steps.append(str(txt))
                        if dish_steps:
                            dish["steps"] = dish_steps
                        # Extract simple nutrition (if present) and extended ingredients
                        try:
                            # Nutrition may be included only if API returns it; we asked includeNutrition=false so usually absent.
                            # If later toggled, handle summary extraction.
                            nutrition_obj = info.get("nutrition") or {}
                            if nutrition_obj.get("nutrients"):
                                macros = {}
                                for n in nutrition_obj.get("nutrients", []):
                                    name = n.get("name")
                                    if name in {"Calories", "Protein", "Fat", "Carbohydrates", "Sugar", "Fiber"}:
                                        macros[name.lower()] = n.get("amount")
                                if macros:
                                    dish["nutrition"] = macros
                            ext_ing = []
                            for ing in info.get("extendedIngredients", []) or []:
                                orig = ing.get("original") or ing.get("name")
                                if orig:
                                    ext_ing.append(str(orig))
                            if ext_ing:
                                dish["ingredients"] = ext_ing
                        except Exception:
                            logger.exception(f"[spoonacular] failed extracting nutrition/ingredients for dish '{dish_name}'")

            # Fallback to Google image search if still no image
            if not dish.get("image_url") and google_api_key and google_cx and dish_name:
                try:
                    search_url = "https://www.googleapis.com/customsearch/v1"
                    params = {
                        "key": google_api_key,
                        "cx": google_cx,
                        "q": f"{dish_name} food dish",
                        "searchType": "image",
                        "num": 1,
                        "imgSize": "medium"
                    }
                    resp = requests.get(search_url, params=params, timeout=5)
                    if resp.status_code == 200:
                        data = resp.json()
                        if data.get("items"):
                            dish["image_url"] = data["items"][0].get("link")
                            logger.info(f"[identify-raw-ingredients] Found image for {dish_name} via Google")
                except Exception as e:
                    logger.warning(f"[identify-raw-ingredients] Google image lookup failed for {dish_name}: {e}")

        # Log image status for debugging
        dishes_with_images = sum(1 for d in dishes if d.get('image_url'))
        logger.info(f"[identify-raw-ingredients] Returning {len(ingredients)} ingredients and {len(dishes)} dishes ({dishes_with_images} with images)")

        return {
            "ingredients": ingredients,
            "dishes": dishes,
            "raw_response": response_text,
            "filters_applied": defaults
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.exception(f"[identify-raw-ingredients] Error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


class SuggestDishesWithFiltersRequest(BaseModel):
    ingredients: List[str]
    times: Optional[List[str]] = None
    age: Optional[str] = None  # child | adult | old
    diabetic: Optional[bool] = None


@app.post('/suggest-dishes-with-filters')
async def suggest_dishes_with_filters(req: SuggestDishesWithFiltersRequest, authorization: Optional[str] = Header(None)):
    """Re-generate dish suggestions for provided ingredients with explicit filters.
    Merges provided filters over defaults derived from the authenticated profile when available.
    """
    try:
        payload = get_user_from_auth_header(authorization)
        defaults = _default_filters_for_user(payload)
        merged = _merge_filters(defaults, {
            'times': req.times,
            'age': req.age,
            'diabetic': req.diabetic,
        })

        ingredients = [s for s in (req.ingredients or []) if isinstance(s, str) and s.strip()]
        if not ingredients:
            raise HTTPException(status_code=400, detail='ingredients must be a non-empty list of strings')

        prompt = _build_recipe_prompt(ingredients, merged)
        data = _llm_json(prompt) or {}
        dishes = data.get('dishes') or []

        # Enrich with images via Spoonacular and Google fallback
        google_api_key = os.getenv("GOOGLE_API_KEY")
        google_cx = os.getenv("GOOGLE_CX")
        
        enriched = []
        for d in dishes[:5]:
            name = (d.get('name') or '').strip()
            if not name:
                continue
            image_url = None
            
            # Try Spoonacular first
            try:
                if SPOONACULAR_API_KEY:
                    info = spoonacular_search_recipe(name, include_ingredients=ingredients)
                    if info and info.get('image'):
                        image_url = info['image']
            except Exception:
                logger.debug(f"Spoonacular lookup failed for '{name}'")
            
            # Fallback to Google image search if no image yet
            if not image_url and google_api_key and google_cx:
                try:
                    search_url = "https://www.googleapis.com/customsearch/v1"
                    params = {
                        "key": google_api_key,
                        "cx": google_cx,
                        "q": f"{name} indian food dish",
                        "searchType": "image",
                        "num": 1,
                        "imgSize": "medium"
                    }
                    resp = requests.get(search_url, params=params, timeout=5)
                    if resp.status_code == 200:
                        data_json = resp.json()
                        if data_json.get("items"):
                            image_url = data_json["items"][0].get("link")
                            logger.info(f"[filters] Found image for {name} via Google")
                except Exception as e:
                    logger.debug(f"Google image lookup failed for '{name}': {e}")
            
            d['image_url'] = image_url
            enriched.append(d)

        return {"dishes": enriched or dishes, "filters_applied": merged}
    except HTTPException:
        raise
    except Exception:
        logger.exception('/suggest-dishes-with-filters failed')
        raise HTTPException(status_code=500, detail='Failed to suggest dishes with filters')


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
        logger.info(f"[identify-image] Calling model google/gemma-3-4b-it:free")
        completion = client.chat.completions.create(
            extra_headers={"HTTP-Referer": "http://localhost:8081", "X-Title": "NutriGuard"},
            extra_body={},
            model="google/gemma-3-4b-it:free",
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


# --- History endpoints ---
class SaveHistoryRequest(BaseModel):
    image_url: Optional[str] = None
    scan_type: str  # "food" or "raw_ingredients"
    result_json: str  # JSON string of the scan result


@app.post("/history/save")
async def save_history(req: SaveHistoryRequest, authorization: Optional[str] = Header(None)):
    """Save a scan session to history for the authenticated user."""
    payload = get_user_from_auth_header(authorization)
    if not payload:
        raise HTTPException(status_code=401, detail="Missing or invalid token")
    user_id = int(payload.get("user_id"))
    timestamp = datetime.utcnow().isoformat()
    conn = sqlite3.connect(DB_PATH)
    cur = conn.cursor()
    try:
        cur.execute(
            "INSERT INTO history (user_id, timestamp, image_url, scan_type, result_json) VALUES (?, ?, ?, ?, ?)",
            (user_id, timestamp, req.image_url, req.scan_type, req.result_json)
        )
        conn.commit()
        history_id = cur.lastrowid
        logger.info(f"[history] Saved scan for user {user_id}, id={history_id}, type={req.scan_type}")
        return {"status": "ok", "history_id": history_id}
    except Exception as e:
        logger.exception(f"[history] Failed to save: {e}")
        raise HTTPException(status_code=500, detail="Failed to save history")
    finally:
        conn.close()


@app.get("/history")
async def get_history(authorization: Optional[str] = Header(None)):
    """Fetch all scan history for the authenticated user, newest first."""
    payload = get_user_from_auth_header(authorization)
    if not payload:
        raise HTTPException(status_code=401, detail="Missing or invalid token")
    user_id = int(payload.get("user_id"))
    conn = sqlite3.connect(DB_PATH)
    cur = conn.cursor()
    try:
        cur.execute(
            "SELECT id, timestamp, image_url, scan_type, result_json FROM history WHERE user_id = ? ORDER BY timestamp DESC",
            (user_id,)
        )
        rows = cur.fetchall()
        history_items = []
        for row in rows:
            history_items.append({
                "id": row[0],
                "timestamp": row[1],
                "image_url": row[2],
                "scan_type": row[3],
                "result_json": row[4]
            })
        logger.info(f"[history] Fetched {len(history_items)} items for user {user_id}")
        return {"history": history_items}
    except Exception as e:
        logger.exception(f"[history] Failed to fetch: {e}")
        raise HTTPException(status_code=500, detail="Failed to fetch history")
    finally:
        conn.close()
