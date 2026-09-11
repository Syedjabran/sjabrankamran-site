#!/usr/bin/env python3
"""Build per-scene base frames (screenshot on dark backdrop) and animated-overlay PNGs
   (lower-third caption + highlight callouts) for the SJAK portal guided tour."""
import json, os, math
from PIL import Image, ImageDraw, ImageFont, ImageFilter

TMP = '/home/admin/.openclaw/workspace/sjabrankamran-site/tmp-tour'
SHOTS = os.path.join(TMP, 'shots')
BASE_DIR = os.path.join(TMP, 'base'); os.makedirs(BASE_DIR, exist_ok=True)
OV_DIR = os.path.join(TMP, 'ov'); os.makedirs(OV_DIR, exist_ok=True)

W, H = 1920, 1080
BG = (11, 15, 20)            # #0B0F14
CYAN = (61, 225, 240)        # #3DE1F0
INK = (233, 242, 245)
SUB = (150, 170, 178)
CARD = (17, 24, 32)

FONT = '/home/admin/.local/share/fonts/jco/Inter.ttf'
def font(sz):
    return ImageFont.truetype(FONT, sz)

script = json.load(open(os.path.join(TMP, 'script.json')))

# --- Screenshot placement geometry on the 1920x1080 canvas ---
# We fit the 2560x1600 (ratio 1.6) shot into a framed area. Keep a top/side margin so
# lower-third + callouts have room. Screenshot ratio 1.6; area chosen to preserve it.
SHOT_W = 1720
SHOT_H = int(SHOT_W / 1.6)          # 1075 -> clamp
if SHOT_H > 940: 
    SHOT_H = 940; SHOT_W = int(SHOT_H * 1.6)  # 1504
SHOT_X = (W - SHOT_W) // 2
SHOT_Y = 40
# rounding for the shot frame
RAD = 18

def rounded_mask(size, radius):
    m = Image.new('L', size, 0)
    d = ImageDraw.Draw(m)
    d.rounded_rectangle([0, 0, size[0]-1, size[1]-1], radius=radius, fill=255)
    return m

def build_base(scene):
    shot = Image.open(os.path.join(SHOTS, scene['id'] + '.png')).convert('RGB')
    shot = shot.resize((SHOT_W, SHOT_H), Image.LANCZOS)
    canvas = Image.new('RGB', (W, H), BG)
    # subtle vignette / gradient backdrop
    grad = Image.new('L', (1, H), 0)
    for y in range(H):
        grad.putpixel((0, y), int(18 * (1 - abs(y - H/2) / (H/2))))
    grad = grad.resize((W, H))
    tint = Image.new('RGB', (W, H), (18, 26, 34))
    canvas = Image.composite(tint, canvas, grad)
    # drop shadow for the shot
    shadow = Image.new('RGBA', (W, H), (0, 0, 0, 0))
    sd = ImageDraw.Draw(shadow)
    sd.rounded_rectangle([SHOT_X-6, SHOT_Y-2, SHOT_X+SHOT_W+6, SHOT_Y+SHOT_H+14],
                         radius=RAD+6, fill=(0, 0, 0, 150))
    shadow = shadow.filter(ImageFilter.GaussianBlur(18))
    canvas = Image.alpha_composite(canvas.convert('RGBA'), shadow).convert('RGB')
    # place rounded shot with a thin cyan border
    mask = rounded_mask((SHOT_W, SHOT_H), RAD)
    canvas.paste(shot, (SHOT_X, SHOT_Y), mask)
    bd = ImageDraw.Draw(canvas)
    bd.rounded_rectangle([SHOT_X, SHOT_Y, SHOT_X+SHOT_W-1, SHOT_Y+SHOT_H-1],
                         radius=RAD, outline=(40, 60, 70), width=2)
    canvas.save(os.path.join(BASE_DIR, scene['id'] + '.png'))
    return (SHOT_X, SHOT_Y, SHOT_W, SHOT_H)

# Map a region given in SOURCE screenshot pixels (2560x1600) to canvas coords.
def src_to_canvas(box, geom):
    sx, sy, sw, sh = geom
    x0, y0, x1, y1 = box
    fx = sw / 2560.0; fy = sh / 1600.0
    return [sx + x0*fx, sy + y0*fy, sx + x1*fx, sy + y1*fy]

# --- Per-scene callouts. boxes in SOURCE (2560x1600) coords. ---
# label optional; 'arrow' direction from label anchor -> box.
def SC(box, label=None, side='below'):
    return {'box': box, 'label': label, 'side': side}

# sidebar nav item y positions (source px): items start ~y396, each ~ +86
def navbox(i):
    top = 396 + i*86
    return [110, top-30, 540, top+30]
# nav order: 0 Dashboard,1 PhysicsResources,2 ResourceLibrary,3 Timetable,4 StudyPlan,
# 5 ExamLab,6 AnswerScripts,7 MyLearning,8 MyProgress,9 MyRanking,10 Leaderboard,11 Notifications
# (there is a gap after ResourceLibrary; approximate)

CALLOUTS = {
 '01_welcome': [ SC([100,300,1250,900], 'Your Physics learning ecosystem', 'right') ],
 '02_install': [ SC([905,555,1620,870], 'Sign in with your email', 'left'),
                 SC([905,880,1610,940], 'Remember me on this device', 'left') ],
 '03_dashboard': [ SC([560,660,2420,1180], 'Everything that needs you today', 'below'),
                   SC([1950,190,2340,260], 'Alerts', 'below') ],
 '04_timetable': [ SC([120,690,1090,780], 'Physics timetable', 'right'),
                   SC([560,540,2420,1120], 'Classes in Pakistan time \u00b7 sync to Google Calendar', 'below') ],
 '05_examlab': [ SC([560,820,2420,1560], 'Drills, past papers & proctored tests', 'below') ],
 '06_review': [ SC([120,930,1090,1020], 'My answer scripts', 'right'),
                SC([560,520,2420,1300], 'Your answers, the correct answers & feedback', 'below') ],
 '07_studyplan': [ SC([600,560,2420,780], 'Level, priority topics & mandatory work', 'below'),
                   SC([600,850,2420,1120], 'Reading \u2192 video \u2192 simulation \u2192 test', 'below') ],
 '08_notifications': [ SC([560,760,2420,1120], 'Real-time alerts, even when closed', 'below'),
                       SC([600,690,2130,760], 'Filter by type', 'below') ],
 '09_library': [ SC([560,520,2420,1200], 'Download & react \u2014 learn as a community', 'below') ],
 '10_leaderboard': [ SC([560,520,2420,1200], 'Ranked privately under a call-sign', 'below') ],
 '11_close': [ SC([560,360,1560,520], "Install it, turn on alerts \u2014 let's begin", 'below') ],
}

def rr(draw, box, radius, outline, width, fill=None):
    draw.rounded_rectangle(box, radius=radius, outline=outline, width=width, fill=fill)

def draw_arrow(draw, x0, y0, x1, y1, color, width=5):
    draw.line([x0, y0, x1, y1], fill=color, width=width)
    ang = math.atan2(y1-y0, x1-x0)
    L = 22
    for da in (math.radians(155), math.radians(-155)):
        draw.line([x1, y1, x1+L*math.cos(ang+da), y1+L*math.sin(ang+da)], fill=color, width=width)

def wrap(draw, text, fnt, maxw):
    words = text.split(); lines=[]; cur=''
    for w in words:
        t = (cur+' '+w).strip()
        if draw.textlength(t, font=fnt) <= maxw: cur=t
        else:
            if cur: lines.append(cur)
            cur=w
    if cur: lines.append(cur)
    return lines

def build_overlay(scene, geom):
    ov = Image.new('RGBA', (W, H), (0,0,0,0))
    d = ImageDraw.Draw(ov)
    # ---- highlight callouts ----
    for c in CALLOUTS.get(scene['id'], []):
        bx = src_to_canvas(c['box'], geom)
        # clamp inside shot area
        sx, sy, sw, sh = geom
        bx[0]=max(sx+4,bx[0]); bx[1]=max(sy+4,bx[1]); bx[2]=min(sx+sw-4,bx[2]); bx[3]=min(sy+sh-4,bx[3])
        # glowing rounded highlight
        glow = Image.new('RGBA',(W,H),(0,0,0,0)); gd=ImageDraw.Draw(glow)
        rr(gd, bx, 16, (CYAN[0],CYAN[1],CYAN[2],230), 5)
        glow = glow.filter(ImageFilter.GaussianBlur(6))
        ov.alpha_composite(glow)
        rr(d, bx, 16, (CYAN[0],CYAN[1],CYAN[2],255), 3)
        # faint cyan fill wash
        wash = Image.new('RGBA',(W,H),(0,0,0,0)); wd=ImageDraw.Draw(wash)
        rr(wd, bx, 16, None, 0, fill=(CYAN[0],CYAN[1],CYAN[2],26))
        ov.alpha_composite(wash)
        # label chip
        if c['label']:
            fnt = font(30)
            tw = d.textlength(c['label'], font=fnt); pad=18
            chip_w = tw + pad*2; chip_h = 52
            side = c['side']
            cx = (bx[0]+bx[2])/2
            if side=='below':
                ly = bx[3] + 22; lx = min(max(cx - chip_w/2, sx), sx+sw-chip_w)
                ax0, ay0 = cx, bx[3]; ax1, ay1 = cx, ly
            elif side=='right':
                lx = min(bx[2] + 26, W-chip_w-10); ly = bx[1]
                ax0, ay0 = bx[2], (bx[1]+bx[3])/2; ax1, ay1 = lx, ly+chip_h/2
            else: # left
                lx = max(bx[0] - chip_w - 26, 10); ly = bx[1]
                ax0, ay0 = bx[0], (bx[1]+bx[3])/2; ax1, ay1 = lx+chip_w, ly+chip_h/2
            ly = min(max(ly, 6), H-chip_h-6)
            draw_arrow(d, ax0, ay0, ax1, ay1, (CYAN[0],CYAN[1],CYAN[2],255), 5)
            rr(d, [lx,ly,lx+chip_w,ly+chip_h], 12, (CYAN[0],CYAN[1],CYAN[2],255), 2,
               fill=(11,18,24,235))
            d.text((lx+pad, ly+chip_h/2), c['label'], font=fnt, fill=INK, anchor='lm')

    # ---- lower-third caption ----
    cap = scene['caption']
    num = scene['id'].split('_')[0]
    fnt_cap = font(58); fnt_kick = font(26); fnt_num = font(24)
    bar_y = H - 150
    # gradient scrim at bottom
    scrim = Image.new('RGBA',(W,H),(0,0,0,0)); scd=ImageDraw.Draw(scrim)
    for i in range(220):
        a = int(200 * (i/220))
        scd.line([(0,H-220+i),(W,H-220+i)], fill=(7,10,14,a))
    ov.alpha_composite(scrim)
    # accent bar
    d.rectangle([120, bar_y, 132, bar_y+96], fill=(CYAN[0],CYAN[1],CYAN[2],255))
    d.text((156, bar_y-4), 'SJAK EDUCATION PORTAL', font=fnt_kick, fill=(CYAN[0],CYAN[1],CYAN[2],255))
    d.text((156, bar_y+30), cap, font=fnt_cap, fill=INK)
    # scene counter (right)
    counter = f'{int(num):02d} / 11'
    d.text((W-120, bar_y+6), counter, font=fnt_num, fill=SUB, anchor='rt')
    ov.save(os.path.join(OV_DIR, scene['id'] + '.png'))

geoms = {}
for sc in script['scenes']:
    g = build_base(sc)
    geoms[sc['id']] = g
    build_overlay(sc, g)
    print('built', sc['id'])
json.dump(geoms, open(os.path.join(TMP,'geoms.json'),'w'))
print('ASSETS DONE')
