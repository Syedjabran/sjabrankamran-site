#!/usr/bin/env bash
set -euo pipefail
cd /home/admin/.openclaw/workspace/sjabrankamran-site/tmp-tour
FF=/usr/bin/ffmpeg
FPS=30
XF=0.4                      # crossfade duration
CLIPS=clips
mkdir -p "$CLIPS"

# Read scenes + durations from script.json via python -> shell array
mapfile -t LINES < <(python3 -c "
import json
d=json.load(open('script.json'))
for s in d['scenes']:
    print(s['id'], s['vo_seconds'])
")

IDS=(); DURS=()
for l in "${LINES[@]}"; do
  IDS+=("$(echo "$l" | awk '{print $1}')")
  DURS+=("$(echo "$l" | awk '{print $2}')")
done
N=${#IDS[@]}
echo "Scenes: $N"

# ---- Per-scene clip: zoompan Ken-Burns on base + overlay fade-in ----
# clip length = vo_seconds + XF  (extra XF consumed by crossfade overlap)
for i in "${!IDS[@]}"; do
  id="${IDS[$i]}"; dur="${DURS[$i]}"
  clen=$(python3 -c "print(round($dur + $XF, 3))")
  frames=$(python3 -c "print(int(round(($clen)*$FPS)))")
  out="$CLIPS/$id.mp4"
  # Alternate zoom direction / pan for variety based on index parity
  if (( i % 2 == 0 )); then
    zexpr="zoom+0.00035"; xexpr="iw/2-(iw/zoom/2)"; yexpr="ih/2-(ih/zoom/2)"
  else
    # start slightly zoomed, ease out (pan toward top)
    zexpr="if(eq(on,0),1.10,zoom-0.00030)"; xexpr="iw/2-(iw/zoom/2)"; yexpr="0"
  fi
  # overlay fade-in over 0.55s
  $FF -y -loglevel error -threads 2 \
    -loop 1 -t "$clen" -i "base/$id.png" \
    -loop 1 -t "$clen" -i "ov/$id.png" \
    -filter_complex "\
      [0:v]scale=2496:1404,zoompan=z='$zexpr':x='$xexpr':y='$yexpr':d=$frames:s=1920x1080:fps=$FPS,setsar=1[bg]; \
      [1:v]format=rgba,fade=t=in:st=0.15:d=0.55:alpha=1,setsar=1[ov]; \
      [bg][ov]overlay=0:0:format=auto,format=yuv420p[v]" \
    -map "[v]" -r $FPS -t "$clen" -c:v libx264 -preset veryfast -crf 20 -pix_fmt yuv420p "$out"
  echo "clip $id  dur=$clen frames=$frames"
done

# ---- Chain crossfades ----
# Build filter graph: xfade successive clips with offset = cumulative(vo) so far.
INPUTS=()
for id in "${IDS[@]}"; do INPUTS+=(-i "$CLIPS/$id.mp4"); done

# compute xfade filtergraph + offsets in python
FILTER=$(python3 -c "
import json
d=json.load(open('script.json'))
durs=[s['vo_seconds'] for s in d['scenes']]
xf=$XF
n=len(durs)
parts=[]
prev='[0:v]'
offset=0.0
# each clip length = dur+xf ; xfade offset = start_of_transition = cumulative content length so far
cum=0.0
label_in=prev
for i in range(1,n):
    cum += durs[i-1]            # transition starts after previous scene's content
    off=round(cum,3)
    out='[vx%d]'%i if i<n-1 else '[vout]'
    parts.append('%s[%d:v]xfade=transition=fade:duration=%s:offset=%s%s' % (label_in,i,xf,off,out))
    label_in=out.replace('[','[').replace(']',']') if False else out
    label_in=out
print(';'.join(parts))
")
echo "XFADE FILTER: $FILTER"

$FF -y -loglevel error -threads 2 "${INPUTS[@]}" \
  -filter_complex "$FILTER" -map "[vout]" \
  -r $FPS -c:v libx264 -preset veryfast -crf 20 -pix_fmt yuv420p -movflags +faststart \
  video-noaudio.mp4
echo "video-noaudio built"
ffprobe -v error -show_entries format=duration -of csv=p=0 video-noaudio.mp4
