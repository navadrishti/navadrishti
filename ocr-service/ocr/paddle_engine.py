import os
os.environ["PADDLE_PDX_DISABLE_MODEL_SOURCE_CHECK"] = "True"

import cv2
import numpy as np
import time
from typing import Union
from paddleocr import PaddleOCR


class PaddleOCREngine:

    def __init__(self):
        self._ocr = PaddleOCR(ocr_version="PP-OCRv4")

    def extract(self, image_input: Union[str, bytes, np.ndarray]) -> "OCRResult":
        start  = time.time()
        img    = self._preprocess(self._load(image_input))
        result = self._ocr.ocr(img)

        lines, confidences = [], []
        if result and result[0]:
            for item in result[0]:
                bbox, (text, conf) = item
                lines.append(text.strip())
                confidences.append(conf)

        return OCRResult(
            full_text       = "\n".join(lines),
            lines           = lines,
            confidences     = confidences,
            avg_confidence  = round(sum(confidences) / len(confidences) * 100, 1) if confidences else 0.0,
            processing_time = round(time.time() - start, 2),
        )

    def _load(self, image_input) -> np.ndarray:
        if isinstance(image_input, str):
            return cv2.imread(image_input)
        elif isinstance(image_input, bytes):
            return cv2.imdecode(np.frombuffer(image_input, np.uint8), cv2.IMREAD_COLOR)
        elif isinstance(image_input, np.ndarray):
            return image_input
        raise ValueError(f"Unsupported type: {type(image_input)}")

    def _preprocess(self, img: np.ndarray) -> np.ndarray:
        # step 1: upscale
        h, w = img.shape[:2]
        if h < 1500:
            scale = 1500 / h
            img = cv2.resize(img, (int(w * scale), int(h * scale)), interpolation=cv2.INTER_CUBIC)

        # step 2: denoise on color image first
        img = cv2.fastNlMeansDenoisingColored(img, None, 10, 10, 7, 21)

        # step 3: increase contrast on color image using CLAHE on L channel
        # convert to LAB — L is brightness, A and B are color
        # we only enhance brightness, not color
        lab   = cv2.cvtColor(img, cv2.COLOR_BGR2LAB)
        l, a, b = cv2.split(lab)
        clahe = cv2.createCLAHE(clipLimit=2.0, tileGridSize=(8, 8))
        l     = clahe.apply(l)
        lab   = cv2.merge((l, a, b))
        img   = cv2.cvtColor(lab, cv2.COLOR_LAB2BGR)

        # step 4: sharpen
        kernel = np.array([[0, -1, 0],
                           [-1, 5, -1],
                           [0, -1, 0]])
        img = cv2.filter2D(img, -1, kernel)

        # step 5: convert to RGB for PaddleOCR
        img = cv2.cvtColor(img, cv2.COLOR_BGR2RGB)

        return img


class OCRResult:

    def __init__(self, full_text, lines, confidences, avg_confidence, processing_time):
        self.full_text       = full_text
        self.lines           = lines
        self.confidences     = confidences
        self.avg_confidence  = avg_confidence
        self.processing_time = processing_time

    @property
    def confidence_level(self):
        if self.avg_confidence >= 85: return "HIGH"
        if self.avg_confidence >= 65: return "MEDIUM"
        return "LOW"

    def to_dict(self):
        return {
            "full_text":        self.full_text,
            "lines":            self.lines,
            "avg_confidence":   self.avg_confidence,
            "confidence_level": self.confidence_level,
            "processing_time":  self.processing_time,
            "total_lines":      len(self.lines),
        }