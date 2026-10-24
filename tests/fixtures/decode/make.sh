#!/usr/bin/env bash
# Regenerates the decoding fixtures for tests/audio/decode.spec.ts (spike S2, #43).
# Needs ffmpeg with libmp3lame, libshine, libvorbis and libopus. Run from anywhere:
#   tests/fixtures/decode/make.sh
#
# Every file encodes the same 0.5 s, 44.1 kHz signal: a 0.8 ms Hann pulse at 100 ms
# and 350 ms on both channels, plus a quiet 440 Hz tone on the left and 660 Hz on
# the right (so swapped channels are visible). Opus is always 48 kHz.
set -euo pipefail
cd "$(dirname "$0")"

pulse='if(between(t,0.1,0.1008),0.5*(1-cos(2*PI*(t-0.1)/0.0008)),0)+if(between(t,0.35,0.3508),0.5*(1-cos(2*PI*(t-0.35)/0.0008)),0)'
left="0.8*($pulse)+0.05*sin(2*PI*440*t)"
right="0.8*($pulse)+0.05*sin(2*PI*660*t)"
src=(-f lavfi -i "aevalsrc='$left|$right':s=44100:d=0.5")
ff() { ffmpeg -hide_banner -loglevel error -y "${src[@]}" "$@"; }

ff -c:a pcm_s16le wav_s16.wav
ff -c:a pcm_s24le wav_s24.wav
ff -c:a pcm_f32le wav_f32.wav
ff -c:a pcm_s16be aiff_s16.aiff
ff -c:a pcm_s24be aiff_s24.aiff
ff -c:a pcm_s32be aiff_s32.aiff
ff -ac 1 -c:a pcm_s16be aiff_s16_mono.aiff
ff -c:a pcm_s16le -f aiff aifc_sowt.aifc
ff -c:a pcm_f32be -f aiff aifc_fl32.aifc
ff -c:a pcm_f64be -f aiff aifc_fl64.aifc
ff -c:a flac flac.flac
ff -c:a libmp3lame -b:a 192k mp3_lame.mp3
ff -c:a libmp3lame -b:a 192k -write_xing 0 mp3_lame_noheader.mp3
ff -c:a libshine -b:a 192k mp3_shine.mp3
ff -c:a aac -b:a 192k aac.m4a
ff -c:a alac alac.m4a
ff -c:a libvorbis -q:a 6 vorbis.ogg
ff -c:a libopus -b:a 128k opus.opus
ls -l
