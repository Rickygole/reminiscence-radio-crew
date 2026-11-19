import hashlib
import json
import subprocess
import sys
from pathlib import Path

import soundfile as sf
from kokoro_onnx import Kokoro

VOICE = "af_heart"
TAG = "kokoro-af_heart"
SPEED = 0.88


def name_for(text):
    return "tts-" + hashlib.sha1(f"{TAG}|{text}".encode("utf-8")).hexdigest()[:16] + ".mp3"


def main():
    show, model, voices = sys.argv[1], sys.argv[2], sys.argv[3]
    out = Path(__file__).resolve().parent.parent / "voice"
    out.mkdir(exist_ok=True)
    data = json.loads(Path(show).read_text())
    lines = [s["text"] for s in data["segments"] if s["kind"] in ("host", "story", "reminder")]
    tts = Kokoro(model, voices)
    for text in lines:
        target = out / name_for(text)
        if target.exists():
            continue
        samples, rate = tts.create(text, voice=VOICE, speed=SPEED, lang="en-us")
        wav = target.with_suffix(".wav")
        sf.write(wav, samples, rate)
        subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-i", str(wav), "-af", "loudnorm=I=-20:TP=-3,afade=t=in:d=0.05", "-codec:a", "libmp3lame", "-q:a", "4", str(target)], check=True)
        wav.unlink()
        print(target.name, text)


if __name__ == "__main__":
    main()
