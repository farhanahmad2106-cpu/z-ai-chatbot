import io
import traceback
from PIL import Image, ImageEnhance, ImageFilter, ExifTags

def preprocess_for_ocr(image_bytes: bytes) -> bytes:
    """
    Prepares an image for OCR by decoding, orienting, enhancing contrast,
    and applying mild unsharp masking. Fails safely by returning original bytes.
    """
    try:
        # Load image
        img = Image.open(io.BytesIO(image_bytes))
        
        # 1. Normalize Orientation (EXIF)
        try:
            for orientation in ExifTags.TAGS.keys():
                if ExifTags.TAGS[orientation] == 'Orientation':
                    break
            exif = img._getexif()
            if exif is not None and orientation in exif:
                if exif[orientation] == 3:
                    img = img.rotate(180, expand=True)
                elif exif[orientation] == 6:
                    img = img.rotate(270, expand=True)
                elif exif[orientation] == 8:
                    img = img.rotate(90, expand=True)
        except Exception as e:
            # Safely ignore EXIF errors
            print(f"[ImagePreprocessor] EXIF handling error: {e}")

        # Ensure image is in RGB mode for processing
        if img.mode != 'RGB':
            img = img.convert('RGB')

        # 2. Conservative Contrast Normalization
        # Enhances readability of low-contrast text on reflective packaging
        enhancer = ImageEnhance.Contrast(img)
        img = enhancer.enhance(1.2) # 20% contrast boost

        # 3. Mild Unsharp Masking
        # Sharpens edges without introducing artifacts (Radius=2, Percent=150%, Threshold=3)
        img = img.filter(ImageFilter.UnsharpMask(radius=2, percent=150, threshold=3))
        
        # 4. Re-encode to high quality JPEG
        out_io = io.BytesIO()
        img.save(out_io, format='JPEG', quality=95)
        return out_io.getvalue()
        
    except Exception as e:
        print(f"[ImagePreprocessor] Preprocessing failed: {e}")
        traceback.print_exc()
        # Graceful fallback: return original image bytes
        return image_bytes
