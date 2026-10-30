"""Rasterize PocketBench's geometric vector mark; Python standard library only."""
from pathlib import Path
import math
import struct
import zlib

ROOT = Path(__file__).resolve().parent.parent
BACKGROUND = (17, 20, 24, 255)
ACCENT = (122, 165, 221, 255)
SUCCESS = (115, 186, 145, 255)


def segment_distance(x, y, x1, y1, x2, y2):
    t = max(0, min(1, ((x-x1)*(x2-x1)+(y-y1)*(y2-y1))/((x2-x1)**2+(y2-y1)**2)))
    return math.hypot(x-(x1+t*(x2-x1)), y-(y1+t*(y2-y1)))


def pixel(x, y):
    if not (4 <= x <= 252 and 4 <= y <= 252):
        return (0, 0, 0, 0)
    cx, cy = min(204, max(52, x)), min(204, max(52, y))
    if math.hypot(x-cx, y-cy) > 48:
        return (0, 0, 0, 0)
    p = 76 <= x <= 109 and 62 <= y <= 194
    bowl = (109 <= x <= 134 and 62 <= y <= 160) or (x >= 134 and math.hypot(x-134, y-111) <= 49)
    hole = (109 <= x <= 132 and 92 <= y <= 130) or (x >= 132 and math.hypot(x-132, y-111) <= 19)
    color = ACCENT if p or (bowl and not hole) else BACKGROUND
    if min(segment_distance(x,y,165,184,177,196), segment_distance(x,y,177,196,202,167)) <= 5:
        color = SUCCESS
    return color


def png(size):
    raw = bytearray()
    for y in range(size):
        raw.append(0)
        for x in range(size):
            samples = [pixel((x+(sx+.5)/4)*256/size, (y+(sy+.5)/4)*256/size) for sy in range(4) for sx in range(4)]
            raw.extend(round(sum(s[c] for s in samples)/16) for c in range(4))
    def chunk(kind, data):
        return struct.pack('>I',len(data))+kind+data+struct.pack('>I',zlib.crc32(kind+data)&0xffffffff)
    return b'\x89PNG\r\n\x1a\n'+chunk(b'IHDR',struct.pack('>IIBBBBB',size,size,8,6,0,0,0))+chunk(b'IDAT',zlib.compress(raw,9))+chunk(b'IEND',b'')


images = [(size, png(size)) for size in (16, 32, 48, 64, 128, 256)]
offset = 6+16*len(images)
entries = bytearray()
for size, data in images:
    entries.extend(struct.pack('<BBBBHHII',size%256,size%256,0,0,1,32,len(data),offset))
    offset += len(data)
(ROOT/'resources/icon.ico').write_bytes(struct.pack('<HHH',0,1,len(images))+entries+b''.join(data for _,data in images))
(ROOT/'resources/icon.png').write_bytes(images[-1][1])
print('Generated Windows icon from the original PocketBench geometric mark.')
