from fastapi import FastAPI, HTTPException, UploadFile, File
from pydantic import BaseModel
from openai import OpenAI
import os
import logging
import shutil
from pathlib import Path
import base64
import httpx

# Set up logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

OPENROUTER_API_KEY = os.getenv("OPENROUTER_API_KEY")
logger.info(f"OPENROUTER_API_KEY set: {bool(OPENROUTER_API_KEY)}")

client = OpenAI(
    base_url="https://openrouter.ai/api/v1",
    api_key=OPENROUTER_API_KEY,
)

app = FastAPI()


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

@app.post("/upload")
async def upload_image(file: UploadFile = File(...)):
    logger.info("Received upload request")
    try:
        # Save the file to public directory
        file_path = public_dir / file.filename
        with file_path.open("wb") as buffer:
            shutil.copyfileobj(file.file, buffer)
        
        # Return the public URL
        image_url = f"https://nutriguard-n98n.onrender.com/public/{file.filename}"
        logger.info(f"Image saved and URL returned: {image_url}")
        return {"image_url": image_url}
    except Exception as e:
        logger.error(f"Error uploading image: {str(e)}")
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
        else:
            logger.info(f"Local image not found, attempting HTTP fetch of {image_url}")
            # Try fetching remotely (in case the URL is truly public)
            try:
                async with httpx.AsyncClient(timeout=10.0) as client_http:
                    resp = await client_http.get(image_url)
                    resp.raise_for_status()
                    image_bytes = resp.content
            except Exception as e:
                logger.error(f"Failed to fetch image from URL: {e}")
                raise HTTPException(status_code=400, detail=f"Could not retrieve image from URL: {e}")

        # Convert to base64 data URI
        b64 = base64.b64encode(image_bytes).decode("utf-8")
        data_uri = f"data:image/jpeg;base64,{b64}"

        logger.info("Sending data URI to AI model (base64)")
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
                        {"type": "text", "text": "What Food items are in the image, give me a list of only names and the serving size. and if there is no food in the image then just repsond wih None"},
                        {"type": "image_url", "image_url": {"url": data_uri}}
                    ]
                }
            ],
        )
        logger.info(f"Gemini response: {summarize(completion)}")

        # Check for explicit errors returned by the client
        if getattr(completion, "error", None):
            logger.error(f"AI returned error: {completion.error}")
            raise HTTPException(status_code=500, detail=f"AI error: {completion.error}")

        if not completion.choices or not completion.choices[0].message:
            logger.error("AI response missing choices/message")
            raise HTTPException(status_code=500, detail="Invalid response from AI model")

        response_text = completion.choices[0].message.content
        if not response_text:
            response_text = "Unable to identify item in the image."

        logger.info(f"Final response text: {summarize(response_text)}")
        return {"item_name": response_text}

    except Exception as e:
        logger.error(f"Error in identify_food: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))
