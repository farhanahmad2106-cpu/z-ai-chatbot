import cv2
import numpy as np
import pytesseract
import os
from PIL import Image
import io

# If on Windows, configure the Tesseract path
if os.name == 'nt':
    # Default installation path on Windows. User should update if installed elsewhere.
    pytesseract.pytesseract.tesseract_cmd = r'C:\Program Files\Tesseract-OCR\tesseract.exe'

def extract_text_from_image(image_bytes: bytes) -> str:
    """
    Preprocesses the image using OpenCV and extracts text using Tesseract.
    """
    # 1. Convert bytes to numpy array then to OpenCV image
    nparr = np.frombuffer(image_bytes, np.uint8)
    img = cv2.imdecode(nparr, cv2.IMREAD_COLOR)

    if img is None:
        raise ValueError("Could not decode image bytes into an OpenCV image.")

    # 2. Preprocessing for better OCR accuracy
    # Convert to grayscale
    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
    
    # Apply Gaussian blur to remove noise
    blur = cv2.GaussianBlur(gray, (5, 5), 0)
    
    # Apply adaptive thresholding to handle uneven lighting and glossy reflections
    thresh = cv2.adaptiveThreshold(
        blur, 255, cv2.ADAPTIVE_THRESH_GAUSSIAN_C, cv2.THRESH_BINARY, 11, 2
    )

    # 3. Extract text using Tesseract
    # We pass the thresholded image (as a PIL Image) to pytesseract
    extracted_text = pytesseract.image_to_string(Image.fromarray(thresh))
    
    # Clean up excess whitespace
    clean_text = " ".join(extracted_text.split())
    
    return clean_text
