from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
from openai import OpenAI

# Initialize OpenAI client
client = OpenAI(
    base_url="https://openrouter.ai/api/v1",
    api_key="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",  # replace with your key
)

app = FastAPI()

# Define the request body
class MessageRequest(BaseModel):
    message: str

@app.post("/chat")
async def chat(request: MessageRequest):
    try:
        # Send message to LLM API
        completion = client.chat.completions.create(
            extra_headers={
                "HTTP-Referer": "<YOUR_SITE_URL>",  # optional
                "X-Title": "<YOUR_SITE_NAME>",      # optional
            },
            model="meta-llama/llama-3.3-8b-instruct:free",
            messages=[
                {"role": "user", "content": request.message}
            ]
        )
        # Extract the assistant's response
        response_text = completion.choices[0].message.content
        return {"response": response_text}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
