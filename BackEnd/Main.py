from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
from openai import OpenAI
import os
import logging

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

class ImageRequest(BaseModel):
    image_base64: str  # Expects base64 encoded image

@app.post("/identify-food")
async def identify_food(request: ImageRequest):
    logger.info("Received request to /identify-food with base64 image")
    try:
        logger.info("Sending base64 image to Gemini model")
        # Send base64 image to Gemini/Google multimodal model
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
                        {"type": "image_url", "image_url": {"url": f"data:image/jpeg;base64,{request.image_base64}"}}
                    ]
                }
            ],
        )

        logger.info(f"Gemini response: {completion}")
        if not completion.choices or not completion.choices[0].message:
            raise HTTPException(status_code=500, detail="Invalid response from AI model")
        
        response_text = completion.choices[0].message.content
        if not response_text:
            response_text = "Unable to identify item in the image."
        
        logger.info(f"Final response text: {response_text}")
        return {"item_name": response_text}

    except Exception as e:
        logger.error(f"Error in identify_food: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))
