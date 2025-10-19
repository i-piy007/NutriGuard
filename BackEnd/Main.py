from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
from openai import OpenAI
import os

# Initialize OpenAI client
OPENROUTER_API_KEY = os.getenv("OPENROUTER_API_KEY")

client = OpenAI(
    base_url="https://openrouter.ai/api/v1",
    api_key=OPENROUTER_API_KEY,
)

app = FastAPI()

# Define the request body
class MessageRequest(BaseModel):
    message: str

@app.post("/chat")
async def chat(request: MessageRequest):
    try:
        # Send message to LLM API following OpenRouter docs
        completion = client.chat.completions.create(
            extra_headers={
                "HTTP-Referer": "http://localhost:8081",  # optional
                "X-Title": "NutriGuard",                  # optional
            },
            extra_body={},  # optional
            model="meta-llama/llama-3.3-8b-instruct:free",
            messages=[
                {"role": "user", "content": request.message}
            ],
        )

        response_text = completion.choices[0].message.content
        return {"response": response_text}

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
