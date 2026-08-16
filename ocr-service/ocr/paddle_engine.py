# ─────────────────────────────────────────────
# ocr/paddle_engine.py
# wraps PaddleOCR
# supports input types:
#   image path  (.jpg .jpeg .png)
#   pdf path    (.pdf) — converted page by page
#   bytes       (raw image bytes)
#   numpy array
#
# preprocessing per page/image:
#   upscale → denoise → CLAHE → sharpen → RGB
#
# PDF handling:
#   each page → image → OCR
#   all pages merged into single OCRResult
#   page boundaries marked in full_text
# ─────────────────────────────────────────────

import os
os.environ["FLAGS_use_mkldnn"] = "0"

import cv2
import time
import numpy as np
from typing import Union
from paddleocr import PaddleOCR


class PaddleOCREngine:

    def __init__(self):
        self._ocr = PaddleOCR(use_angle_cls=True, lang="en", show_log=False)

    def extract(self, file_input: Union[str, bytes, np.ndarray]) -> "OCRResult":
        """
        accepts image path, pdf path, bytes, or numpy array.
        returns merged OCRResult across all pages.
        """
        start = time.time()

        # PDF path — convert pages to images first
        if isinstance(file_input, str) and file_input.lower().endswith(".pdf"):
            return self._extract_pdf(file_input, start)

        # image path, bytes, or numpy array
        img = self._preprocess(self._load(file_input))
        return self._run_ocr([img], start)

    def _extract_pdf(self, pdf_path: str, start: float) -> "OCRResult":
        try:
            from pdf2image import convert_from_path
        except ImportError:
            raise ImportError(
                "pdf2image is required for PDF support.\n"
                "Install with: pip install pdf2image\n"
                "Also install poppler: sudo pacman -S poppler  (Arch) "
                "or sudo apt install poppler-utils  (Ubuntu)"
            )

        pages = convert_from_path(pdf_path, dpi=300)
        images = []
        for page in pages:
            # PIL Image → numpy BGR
            img = cv2.cvtColor(np.array(page), cv2.COLOR_RGB2BGR)
            images.append(self._preprocess(img))

        return self._run_ocr(images, start, source=pdf_path)

    def _run_ocr(self, images: list, start: float, source: str = "") -> "OCRResult":
        all_lines       = []
        all_confidences = []

        for page_num, img in enumerate(images):
            result = self._ocr.ocr(img)
            if result and result[0]:
                if len(images) > 1:
                    all_lines.append(f"[PAGE {page_num + 1}]")
                for line in result[0]:
                    text, conf = line[1]
                    all_lines.append(text.strip())
                    all_confidences.append(conf)

        return OCRResult(
            full_text       = "\n".join(all_lines),
            lines           = all_lines,
            confidences     = all_confidences,
            avg_confidence  = round(sum(all_confidences) / len(all_confidences) * 100, 1) if all_confidences else 0.0,
            processing_time = round(time.time() - start, 2),
            page_count      = len(images),
        )

    def _load(self, image_input) -> np.ndarray:
        if isinstance(image_input, str):
            img = cv2.imread(image_input)
            if img is None:
                raise FileNotFoundError(f"could not read image: {image_input}")
            return img
        elif isinstance(image_input, bytes):
            return cv2.imdecode(np.frombuffer(image_input, np.uint8), cv2.IMREAD_COLOR)
        elif isinstance(image_input, np.ndarray):
            return image_input
        raise ValueError(f"unsupported input type: {type(image_input)}")

    def _preprocess(self, img: np.ndarray) -> np.ndarray:
        # upscale to minimum 1500px height
        h, w = img.shape[:2]
        if h < 1500:
            scale = 1500 / h
            img   = cv2.resize(img, (int(w * scale), int(h * scale)), interpolation=cv2.INTER_CUBIC)

        # denoise
        img = cv2.fastNlMeansDenoisingColored(img, None, 10, 10, 7, 21)

        # CLAHE on LAB L-channel
        lab     = cv2.cvtColor(img, cv2.COLOR_BGR2LAB)
        l, a, b = cv2.split(lab)
        clahe   = cv2.createCLAHE(clipLimit=2.0, tileGridSize=(8, 8))
        l       = clahe.apply(l)
        lab     = cv2.merge((l, a, b))
        img     = cv2.cvtColor(lab, cv2.COLOR_LAB2BGR)

        # sharpen
        kernel = np.array([[0, -1, 0], [-1, 5, -1], [0, -1, 0]])
        img    = cv2.filter2D(img, -1, kernel)

        return cv2.cvtColor(img, cv2.COLOR_BGR2RGB)


class OCRResult:

    def __init__(self, full_text, lines, confidences, avg_confidence, processing_time, page_count=1):
        self.full_text       = full_text
        self.lines           = lines
        self.confidences     = confidences
        self.avg_confidence  = avg_confidence
        self.processing_time = processing_time
        self.page_count      = page_count

    @property
    def confidence_level(self) -> str:
        if self.avg_confidence >= 85: return "HIGH"
        if self.avg_confidence >= 65: return "MEDIUM"
        return "LOW"

    def to_dict(self) -> dict:
        return {
            "full_text":        self.full_text,
            "lines":            self.lines,
            "avg_confidence":   self.avg_confidence,
            "confidence_level": self.confidence_level,
            "processing_time":  self.processing_time,
            "total_lines":      len(self.lines),
            "page_count":       self.page_count,
        }