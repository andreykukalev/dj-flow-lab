#!/usr/bin/env bash
# Generates a 10 s stereo 44.1 kHz click track (120 BPM, first click at 0.5 s)
# in several formats. Requires python3 with numpy, and ffmpeg.
set -euo pipefail
out="${1:-fixtures}"
mkdir -p "$out"
python3 - "$out/ref.wav" <<'PY'
import sys, wave, numpy as np
sr, dur, bpm, first = 44100, 10.0, 120, 0.5
n = int(sr * dur); x = np.zeros((n, 2), dtype=np.float32)
t = first
while t < dur - 0.1:
    i = int(round(t * sr)); L = 200
    x[i:i + L, :] += (0.8 * np.sin(2 * np.pi * 1000 * np.arange(L) / sr) * np.exp(-np.arange(L) / 40.0))[:, None]
    t += 60 / bpm
w = wave.open(sys.argv[1], 'wb'); w.setnchannels(2); w.setsampwidth(2); w.setframerate(sr)
w.writeframes((x * 32767).astype('<i2').tobytes()); w.close()
PY
cd "$out"
cp ref.wav out_s16.wav
ffmpeg -loglevel error -y -i ref.wav -c:a pcm_s24le out_s24.wav
ffmpeg -loglevel error -y -i ref.wav -c:a pcm_f32le out_f32.wav
ffmpeg -loglevel error -y -i ref.wav -c:a pcm_s16be out_s16.aiff
ffmpeg -loglevel error -y -i ref.wav -c:a pcm_s24be out_s24.aiff
ffmpeg -loglevel error -y -i ref.wav -c:a flac out.flac
ffmpeg -loglevel error -y -i ref.wav -c:a libmp3lame -b:a 320k out.mp3
ffmpeg -loglevel error -y -i ref.wav -c:a aac -b:a 256k out.m4a
ffmpeg -loglevel error -y -i ref.wav -c:a libvorbis out.ogg
ffmpeg -loglevel error -y -i ref.wav -c:a libopus out.opus
ffmpeg -loglevel error -y -i ref.wav -c:a alac out_alac.m4a
