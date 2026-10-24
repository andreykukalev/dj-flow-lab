# Chromium probe (2026-10-24)

Throwaway evidence for [TECHNICAL_AUDIT_v0.2.md](../../docs/TECHNICAL_AUDIT_v0.2.md). Not product code.

```sh
./make-fixtures.sh /tmp/fixtures            # needs python3 + numpy + ffmpeg
node decode-and-sync.cjs /tmp/fixtures      # decode matrix, MP3 offset, inter-deck alignment
node seek-restoration.cjs                   # seek restoration with and without a gain ramp
```

Both scripts use the `playwright` package and its Chromium build. Results from headless Chromium 153 on Linux:

```
out.flac         ok, 441000 frames, first onset 500.02 ms
out.m4a (AAC)    ok, 441000 frames, first onset 500.02 ms
out.mp3          ok, 441000 frames, first onset 500.02 ms
out.ogg          ok, 441000 frames, first onset 500.05 ms
out.opus         ok, 440999 frames, first onset 500.02 ms
out_alac.m4a     EncodingError: Unable to decode audio data
out_f32.wav      ok, 441000 frames, first onset 500.02 ms
out_s16.aiff     EncodingError: Unable to decode audio data
out_s16.wav      ok, 441000 frames, first onset 500.02 ms
out_s24.aiff     EncodingError: Unable to decode audio data
out_s24.wav      ok, 441000 frames, first onset 500.02 ms
SYNC  max inter-deck onset offset over 256 beats (124 vs 120 BPM, rate 1.0333): 1 sample (0.023 ms)
SEEK  residual −31.5 dB with and without a gain ramp; fractional sample offset −0.484 (timing error < 11 µs)
```

To be repeated on Firefox and WebKit in spike S2.
