from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from transformers import pipeline
from PIL import Image
import requests
from io import BytesIO

app = FastAPI()

# Enable CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Allow all origins for extension development
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Load model
# Using the same model as in app.py
classifier = pipeline("image-classification", model="Falconsai/nsfw_image_detection")

class ImageRequest(BaseModel):
    url: str

@app.post("/classify")
def classify_image(request: ImageRequest):
    try:
        # Fetch image
        response = requests.get(request.url, timeout=10)
        response.raise_for_status()
        
        image = Image.open(BytesIO(response.content))
        
        # Classify
        predictions = classifier(image)
        
        # Logic from app.py
        top_prediction = max(predictions, key=lambda x: x['score'])
        label = top_prediction['label']
        score = top_prediction['score']
        is_nsfw = label.lower() == 'nsfw'
        
        return {
            "is_nsfw": is_nsfw,
            "score": score,
            "label": label,
            "predictions": predictions
        }

    except Exception as e:
        # In a real app, logging would be better
        print(f"Error processing image: {e}")
        # Return safe default or error
        raise HTTPException(status_code=500, detail=str(e))

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
