from fastapi import FastAPI, HTTPException, UploadFile, File
from pydantic import BaseModel
from openai import OpenAI
import os
import logging
import shutil
from pathlib import Path

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
        logger.info("Sending image URL to Gemini model")
        # Send image URL to Gemini/Google multimodal model
        completion = client.chat.completions.create(
            extra_headers={
                "HTTP-Referer": "http://localhost:8081",  # optional
                "X-Title": "NutriGuard",
            },
            extra_body={},
            model="google/gemini-2.0-flash-exp:free",
            messages=[
                {
                    "role": "user",
                    "content": [
                        {"type": "text", "text": "What object or item is shown in this image?"},
                        {"type": "image_url", "image_url": {"url": request.image_url}}
                    ]
                }
            ],
        )

        logger.info(f"Gemini response: {completion}")
        if not completion.choices or not completion.choices[0].message:
            raise HTTPException(status_code=500, detail="Invalid response from AI model")
        
        response_text = completion.choices[0].message.content
        if not response_text:
            response_text = "Unable to identify food in the image."
        
        logger.info(f"Final response text: {response_text}")
        return {"item_name": response_text}

    except Exception as e:
        logger.error(f"Error in identify_food: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))
