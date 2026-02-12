import requests
import json

# API Endpoint
# The space is at https://huggingface.co/spaces/akshay-sg/SafeScroll
# The direct API URL (usually) implies the username and space name
API_URL = "https://akshay-sg-safescroll.hf.space/classify"

# Test Image URL (a safe image)
# using a standard test image from github
TEST_IMAGE_URL = "https://raw.githubusercontent.com/pytorch/hub/master/images/dog.jpg"

def test_classify():
    print(f"Sending request to {API_URL}...", flush=True)
    
    payload = {
        "url": TEST_IMAGE_URL
    }
    
    try:
        response = requests.post(API_URL, json=payload, timeout=30)
        
        print(f"Status Code: {response.status_code}")
        
        if response.status_code == 200:
            result = response.json()
            print("\nClassification Result:")
            print(json.dumps(result, indent=2))
            
            if result.get("is_nsfw"):
                print("\n⚠️  NSFW Detected!")
            else:
                print("\n✅  Image is Safe.")
                
        else:
            print(f"Error: {response.text}")
            
    except Exception as e:
        print(f"An error occurred: {e}")

if __name__ == "__main__":
    test_classify()
