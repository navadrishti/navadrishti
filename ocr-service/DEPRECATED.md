# Deprecated — not part of the Navadrishti product path

This directory contains a standalone **PaddleOCR** prototype (Python) used for
early document OCR experiments.

## Status

- **Not wired** to the Next.js platform APIs or GRAM PWA.
- Production KYC OCR uses **Gemini** (`lib/gemini-vision.ts` via CA review).
- ESLint ignores this tree (`eslint.config.mjs`).

## Do not use for

- Customer-facing verification
- Payment integrations (this is unrelated to Paddle Payments)
- New feature work

## Removal
- Do not delete it, it will be used once the production scales up to full time after the pilot.
