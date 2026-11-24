#!/usr/bin/env python3
"""
CompanyGen STT (Speech-to-Text) — Transcrição de áudios do WhatsApp em Português
Usa faster-whisper (int8 em CPU) com VAD para resposta rápida e custo ridículo.

Uso CLI:
  python scripts/transcribe_audio.py caminho/audio.ogg
  python scripts/transcribe_audio.py caminho/audio.ogg --json --model small

Uso Servidor HTTP (compatível com WHISPER_ENDPOINT_URL):
  STT_TOKEN=seu_segredo python scripts/transcribe_audio.py --serve --port 8765
  POST /v1/audio/transcriptions  (multipart form-data: file, language=pt)
  GET  /health
"""

import argparse
import json
import os
import sys
import tempfile
from pathlib import Path
from typing import Optional

MAX_AUDIO_BYTES = 4 * 1024 * 1024  # 4 MB
MAX_IMAGE_BYTES = 6 * 1024 * 1024  # 6 MB
DEFAULT_MODEL = os.environ.get("STT_MODEL", "base")
DEFAULT_COMPUTE = os.environ.get("STT_COMPUTE_TYPE", "int8")
DEFAULT_DEVICE = os.environ.get("STT_DEVICE", "cpu")
DEFAULT_VISION_MODEL = os.environ.get("LOCAL_VISION_MODEL", "Salesforce/blip-image-captioning-base")

_MODEL_CACHE = None
_VISION_CACHE = None


def detect_magic_ext(data: bytes) -> Optional[str]:
    if len(data) < 12:
        return None
    if data[:4] == b"OggS":
        return ".ogg"
    if data[:4] == b"RIFF" and data[8:12] == b"WAVE":
        return ".wav"
    if data[:3] == b"ID3" or (data[0] == 0xFF and (data[1] & 0xE0) == 0xE0):
        return ".mp3"
    if data[:4] == b"\x1a\x45\xdf\xa3":
        return ".webm"
    if data[4:8] == b"ftyp":
        return ".m4a"
    return None


def get_model(model_name: str = DEFAULT_MODEL):
    global _MODEL_CACHE
    if _MODEL_CACHE is None:
        from faster_whisper import WhisperModel  # type: ignore

        _MODEL_CACHE = WhisperModel(
            model_name,
            device=DEFAULT_DEVICE,
            compute_type=DEFAULT_COMPUTE,
        )
    return _MODEL_CACHE


def transcribe_file(file_path: str, model_name: str = DEFAULT_MODEL, language: str = "pt") -> dict:
    model = get_model(model_name)
    segments, info = model.transcribe(
        file_path,
        language=language or "pt",
        vad_filter=True,
        beam_size=1,
    )
    parts = [seg.text.strip() for seg in segments if seg.text and seg.text.strip()]
    text = " ".join(parts).strip()
    return {
        "text": text,
        "language": getattr(info, "language", language or "pt"),
        "duration": round(float(getattr(info, "duration", 0.0) or 0.0), 2),
    }


def get_vision_model(vision_name: str = DEFAULT_VISION_MODEL):
    global _VISION_CACHE
    if _VISION_CACHE is None:
        from transformers import BlipForConditionalGeneration, BlipProcessor  # type: ignore

        try:
            processor = BlipProcessor.from_pretrained(vision_name, local_files_only=True)
            model = BlipForConditionalGeneration.from_pretrained(vision_name, local_files_only=True)
        except Exception:
            processor = BlipProcessor.from_pretrained(vision_name)
            model = BlipForConditionalGeneration.from_pretrained(vision_name)
        model.eval()
        _VISION_CACHE = (processor, model)
    return _VISION_CACHE


def describe_image_bytes(raw_bytes: bytes, question: str = "") -> dict:
    import io
    import torch  # type: ignore
    from PIL import Image  # type: ignore

    img = Image.open(io.BytesIO(raw_bytes)).convert("RGB")
    processor, model = get_vision_model()
    inputs = processor(img, return_tensors="pt")
    with torch.no_grad():
        out = model.generate(**inputs, max_new_tokens=55, repetition_penalty=1.35)
    caption = processor.decode(out[0], skip_special_tokens=True).strip()
    return {"description": caption, "model": DEFAULT_VISION_MODEL}


def run_server(host: str, port: int, model_name: str):
    from fastapi import FastAPI, File, Form, Header, HTTPException, UploadFile  # type: ignore
    import uvicorn  # type: ignore

    app = FastAPI(title="CompanyGen Whisper STT & Local Vision", version="1.1.0")
    expected_token = os.environ.get("STT_TOKEN", "").strip()

    # Pré-carrega o modelo STT no startup para eliminar cold start por requisição
    get_model(model_name)

    @app.get("/health")
    def health():
        return {"ok": True, "service": "companygen_stt", "vision": True, "model": model_name, "device": DEFAULT_DEVICE, "compute_type": DEFAULT_COMPUTE}

    @app.post("/v1/vision/describe")
    async def vision_describe(
        file: UploadFile = File(...),
        question: Optional[str] = Form(default=""),
        authorization: Optional[str] = Header(default=None),
    ):
        if expected_token:
            supplied = (authorization or "").replace("Bearer ", "").strip()
            if supplied != expected_token:
                raise HTTPException(status_code=401, detail="Unauthorized")
        raw = await file.read(MAX_IMAGE_BYTES + 1)
        if not raw:
            raise HTTPException(status_code=400, detail="Empty image file")
        if len(raw) > MAX_IMAGE_BYTES:
            raise HTTPException(status_code=413, detail="Image exceeds 6MB limit")
        return describe_image_bytes(raw, question=question or "")

    @app.post("/v1/audio/transcriptions")
    async def transcriptions(
        file: UploadFile = File(...),
        model: Optional[str] = Form(default="whisper-1"),
        language: Optional[str] = Form(default="pt"),
        authorization: Optional[str] = Header(default=None),
    ):
        if expected_token:
            supplied = (authorization or "").replace("Bearer ", "").strip()
            if supplied != expected_token:
                raise HTTPException(status_code=401, detail="Unauthorized")

        raw = await file.read(MAX_AUDIO_BYTES + 1)
        if not raw:
            raise HTTPException(status_code=400, detail="Empty audio file")
        if len(raw) > MAX_AUDIO_BYTES:
            raise HTTPException(status_code=413, detail="Audio exceeds 4MB limit")

        ext = detect_magic_ext(raw)
        if not ext:
            raise HTTPException(status_code=415, detail="Unsupported audio magic bytes")

        tmp_path = None
        try:
            with tempfile.NamedTemporaryFile(delete=False, suffix=ext) as tmp:
                tmp.write(raw)
                tmp_path = tmp.name
            result = transcribe_file(tmp_path, model_name=model_name, language=language or "pt")
            return result
        finally:
            if tmp_path and os.path.exists(tmp_path):
                try:
                    os.remove(tmp_path)
                except OSError:
                    pass

    uvicorn.run(app, host=host, port=port)


def main():
    parser = argparse.ArgumentParser(description="CompanyGen Faster-Whisper STT")
    parser.add_argument("audio", nargs="?", help="Caminho para arquivo de áudio (.ogg, .mp3, .wav, .m4a)")
    parser.add_argument("--json", action="store_true", help="Retorna saída JSON")
    parser.add_argument("--model", default=DEFAULT_MODEL, help="Modelo faster-whisper (tiny, base, small, medium)")
    parser.add_argument("--language", default="pt", help="Idioma (padrão: pt)")
    parser.add_argument("--serve", action="store_true", help="Inicia servidor HTTP FastAPI")
    parser.add_argument("--host", default="0.0.0.0", help="Host do servidor HTTP")
    parser.add_argument("--port", type=int, default=int(os.environ.get("PORT", "8765")), help="Porta HTTP")
    args = parser.parse_args()

    if args.serve:
        run_server(args.host, args.port, args.model)
        return

    if not args.audio:
        parser.print_help()
        sys.exit(1)

    target = Path(args.audio)
    if not target.is_file():
        print(f"Arquivo não encontrado: {target}", file=sys.stderr)
        sys.exit(2)

    data = target.read_bytes()
    if len(data) > MAX_AUDIO_BYTES:
        print("Áudio excede o limite máximo de 4 MB.", file=sys.stderr)
        sys.exit(3)
    if not detect_magic_ext(data):
        print("Formato de áudio inválido (magic bytes não reconhecidos).", file=sys.stderr)
        sys.exit(4)

    result = transcribe_file(str(target), model_name=args.model, language=args.language)
    if args.json:
        print(json.dumps(result, ensure_ascii=False))
    else:
        print(result["text"])


if __name__ == "__main__":
    main()
