from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
from openai import OpenAI
import os

OPENROUTER_API_KEY = os.getenv("OPENROUTER_API_KEY")

client = OpenAI(
    base_url="https://openrouter.ai/api/v1",
    api_key=OPENROUTER_API_KEY,
)

app = FastAPI()

class ImageRequest(BaseModel):
    image_base64: str  # frontend sends base64

@app.post("/identify-food")
async def identify_food(request: ImageRequest):
    try:
        # Send image to Gemini/Google multimodal model
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
                        {"type": "text", "text": "Identify the food in this image and give the exact name"},
                        {"type": "image_url", "image_url": {"url": f"data:image/jpeg;base64,{request.image_base64}"}}
                    ]
                }
            ],
        )

        response_text = completion.choices[0].message.content
        return {"food_name": response_text}

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
