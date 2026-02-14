"""Production image processing pipeline.

Features:
- HEIC/HEIF conversion via pillow-heif
- Auto-orientation from EXIF before stripping
- EXIF metadata extraction (camera, timestamp)
- Perceptual hashing (pHash) for deduplication
- Progressive JPEG output for faster loading
- WebP thumbnail generation (50-70% smaller than JPEG)
- File type validation via magic bytes
- Multi-resolution output (processed + thumbnail)
"""

import io
import logging
from datetime import datetime

import numpy as np
from PIL import Image, ImageOps

logger = logging.getLogger(__name__)

# Register HEIC support
try:
    import pillow_heif
    pillow_heif.register_heif_opener()
except ImportError:
    logger.warning("pillow-heif not available — HEIC uploads will fail")


def validate_image_file(data: bytes) -> str | None:
    """Validate file is actually an image via magic bytes. Returns mime type or None."""
    try:
        import magic
        mime = magic.from_buffer(data[:2048], mime=True)
        if mime in ("image/jpeg", "image/png", "image/webp", "image/heic", "image/heif"):
            return mime
        # pillow_heif files sometimes detected as application/octet-stream
        if mime == "application/octet-stream" and data[:4] in (b'\x00\x00\x00\x1c', b'\x00\x00\x00\x18'):
            return "image/heif"
        return None
    except Exception:
        # If python-magic not available, fall back to PIL check
        try:
            img = Image.open(io.BytesIO(data))
            img.verify()
            return f"image/{img.format.lower()}" if img.format else "image/jpeg"
        except Exception:
            return None


def extract_exif_metadata(data: bytes) -> dict:
    """Extract useful EXIF metadata before stripping. Returns dict with camera info and timestamp."""
    result = {"camera_make": None, "camera_model": None, "taken_at": None, "orientation": None}
    try:
        img = Image.open(io.BytesIO(data))
        exif = img.getexif()
        if not exif:
            return result

        # Tag IDs: 271=Make, 272=Model, 36867=DateTimeOriginal, 274=Orientation
        result["camera_make"] = exif.get(271)
        result["camera_model"] = exif.get(272)
        result["orientation"] = exif.get(274)

        # DateTimeOriginal from EXIF IFD
        ifd = exif.get_ifd(0x8769)  # Exif IFD
        if ifd:
            date_str = ifd.get(36867) or ifd.get(36868)  # DateTimeOriginal or DateTimeDigitized
            if date_str:
                try:
                    result["taken_at"] = datetime.strptime(date_str, "%Y:%m:%d %H:%M:%S")
                except ValueError:
                    pass
    except Exception:
        pass
    return result


def compute_phash(data: bytes, hash_size: int = 8) -> str:
    """Compute perceptual hash for image deduplication.

    Uses DCT-based pHash: resize to 32x32 grayscale, compute DCT,
    take top-left 8x8 block, threshold by median. Returns 16-char hex string.
    """
    try:
        img = Image.open(io.BytesIO(data))
        # Resize to 32x32 and convert to grayscale
        img = img.convert("L").resize((32, 32), Image.LANCZOS)
        pixels = np.array(img, dtype=float)

        # DCT via matrix multiplication (avoid scipy dependency here)
        from scipy.fft import dctn
        dct = dctn(pixels, type=2)

        # Take top-left hash_size x hash_size
        dct_low = dct[:hash_size, :hash_size]
        # Exclude DC component
        dct_low[0, 0] = 0
        median = np.median(dct_low)
        bits = (dct_low > median).flatten()

        # Convert to hex string
        hash_int = 0
        for bit in bits:
            hash_int = (hash_int << 1) | int(bit)
        return format(hash_int, f"0{hash_size * hash_size // 4}x")
    except Exception as e:
        logger.warning(f"pHash computation failed: {e}")
        return ""


def phash_distance(hash1: str, hash2: str) -> int:
    """Hamming distance between two perceptual hashes."""
    if not hash1 or not hash2 or len(hash1) != len(hash2):
        return 999
    try:
        n1 = int(hash1, 16)
        n2 = int(hash2, 16)
        return bin(n1 ^ n2).count("1")
    except ValueError:
        return 999


def process_image(image_data: bytes, config: dict | None = None) -> dict:
    """Full image processing pipeline.

    Args:
        image_data: Raw image bytes
        config: Optional config dict with processing params

    Returns dict with:
        processed: JPEG bytes (resized, EXIF stripped, progressive)
        thumbnail: WebP bytes (or JPEG fallback)
        thumbnail_format: 'webp' or 'jpeg'
        width, height: processed dimensions
        phash: perceptual hash string
        exif: extracted EXIF metadata
    """
    cfg = config or {}
    max_size = cfg.get("processed_max_size", 2048)
    thumb_size = cfg.get("thumbnail_size", 400)
    jpeg_quality = cfg.get("jpeg_quality", 85)
    thumb_quality = cfg.get("thumbnail_quality", 80)
    enable_webp = cfg.get("enable_webp_thumbnails", True)

    img = Image.open(io.BytesIO(image_data))

    # Auto-orient from EXIF before stripping
    img = ImageOps.exif_transpose(img) or img

    # Convert to RGB
    if img.mode not in ("RGB", "RGBA"):
        img = img.convert("RGB")
    elif img.mode == "RGBA":
        # Composite on white background
        bg = Image.new("RGB", img.size, (255, 255, 255))
        bg.paste(img, mask=img.split()[3])
        img = bg

    # Extract EXIF before stripping
    exif_meta = extract_exif_metadata(image_data)

    # Compute pHash before resize
    phash = compute_phash(image_data)

    # Resize (maintain aspect ratio)
    img.thumbnail((max_size, max_size), Image.LANCZOS)
    width, height = img.size

    # Save processed as progressive JPEG (faster perceived loading)
    processed_buf = io.BytesIO()
    img.save(
        processed_buf,
        format="JPEG",
        quality=jpeg_quality,
        optimize=True,
        progressive=True,
        subsampling=0,  # 4:4:4 chroma for better quality
    )
    processed_bytes = processed_buf.getvalue()

    # Generate thumbnail
    thumb_img = img.copy()
    thumb_img.thumbnail((thumb_size, thumb_size), Image.LANCZOS)

    thumb_buf = io.BytesIO()
    if enable_webp:
        thumb_img.save(thumb_buf, format="WEBP", quality=thumb_quality, method=4)
        thumbnail_format = "webp"
    else:
        thumb_img.save(thumb_buf, format="JPEG", quality=thumb_quality, optimize=True)
        thumbnail_format = "jpeg"
    thumbnail_bytes = thumb_buf.getvalue()

    return {
        "processed": processed_bytes,
        "thumbnail": thumbnail_bytes,
        "thumbnail_format": thumbnail_format,
        "width": width,
        "height": height,
        "phash": phash,
        "exif": exif_meta,
    }


def load_image_for_detection(image_path: str) -> np.ndarray:
    """Load image as numpy array (RGB) for InsightFace. Handles orientation."""
    img = Image.open(image_path)
    img = ImageOps.exif_transpose(img) or img
    if img.mode != "RGB":
        img = img.convert("RGB")
    return np.array(img)
