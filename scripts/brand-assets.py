#!/usr/bin/env python3
"""
Genera los recursos gráficos de Baketa a partir de un único diseño propio:
un aro de latón (el plato) con dos baquetas cruzadas.

Todo es original: formas dibujadas por código, sin imágenes de terceros.

Uso:  python3 scripts/brand-assets.py
Requiere: Pillow  (pip install Pillow)

Genera:
  android/app/src/main/res/mipmap-*/ic_launcher.png, ic_launcher_round.png
  android/app/src/main/res/mipmap-*/ic_launcher_foreground.png
  public/icons/*.png            iconos de la app web instalable (PWA)
  play/icon-512.png             icono de la ficha de Google Play
  play/feature-graphic.png      imagen destacada 1024x500
"""
import os

from PIL import Image, ImageDraw, ImageFont

BG = (22, 26, 34)        # --bg
BRASS = (232, 181, 58)   # --brass
STEEL = (207, 216, 230)  # --steel
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
RES = os.path.join(ROOT, 'android/app/src/main/res')
PLAY = os.path.join(ROOT, 'play')

SS = 4  # supermuestreo para bordes suaves


def draw_mark(size, scale=1.0, bg=None, radius_ratio=0.22):
    """Dibuja el logotipo. scale < 1 deja margen (zona segura del icono adaptativo)."""
    s = size * SS
    img = Image.new('RGBA', (s, s), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    if bg:
        r = int(s * radius_ratio)
        d.rounded_rectangle([0, 0, s - 1, s - 1], radius=r, fill=bg)

    c = s / 2
    unit = s * scale / 2
    ring_r = unit * 0.52
    cy = c + unit * 0.16
    width = unit * 0.17
    d.ellipse([c - ring_r, cy - ring_r, c + ring_r, cy + ring_r], outline=BRASS, width=int(width))
    d.ellipse([c - ring_r * 0.34, cy - ring_r * 0.34, c + ring_r * 0.34, cy + ring_r * 0.34], fill=STEEL)
    stick = unit * 0.16
    for dx in (-1, 1):
        x0 = c + dx * unit * 0.66
        y0 = cy - unit * 1.02
        d.line([x0, y0, c, cy], fill=STEEL, width=int(stick))
        d.ellipse([x0 - stick / 2, y0 - stick / 2, x0 + stick / 2, y0 + stick / 2], fill=STEEL)
    return img.resize((size, size), Image.LANCZOS)


def save(img, path):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    img.save(path)
    print('·', os.path.relpath(path, ROOT), f'{img.size[0]}x{img.size[1]}')


def android_icons():
    for folder, size in [('mdpi', 48), ('hdpi', 72), ('xhdpi', 96), ('xxhdpi', 144), ('xxxhdpi', 192)]:
        save(draw_mark(size, scale=0.78, bg=BG), f'{RES}/mipmap-{folder}/ic_launcher.png')
        round_img = Image.new('RGBA', (size, size), (0, 0, 0, 0))
        mark = draw_mark(size, scale=0.74, bg=BG, radius_ratio=0.5)
        mask = Image.new('L', (size * SS, size * SS), 0)
        ImageDraw.Draw(mask).ellipse([0, 0, size * SS - 1, size * SS - 1], fill=255)
        round_img.paste(mark, (0, 0), mask.resize((size, size), Image.LANCZOS))
        save(round_img, f'{RES}/mipmap-{folder}/ic_launcher_round.png')

    # Icono adaptativo: 108dp, contenido dentro del 66 % central (zona segura)
    for folder, size in [('mdpi', 108), ('hdpi', 162), ('xhdpi', 216), ('xxhdpi', 324), ('xxxhdpi', 432)]:
        save(draw_mark(size, scale=0.52), f'{RES}/mipmap-{folder}/ic_launcher_foreground.png')


def web_icons():
    pub = os.path.join(ROOT, 'public/icons')
    save(draw_mark(192, scale=0.78, bg=BG), f'{pub}/icon-192.png')
    save(draw_mark(512, scale=0.78, bg=BG), f'{pub}/icon-512.png')
    # Maskable: el sistema puede recortar los bordes, así que el dibujo va más pequeño
    save(draw_mark(512, scale=0.52, bg=BG, radius_ratio=0.0), f'{pub}/icon-maskable-512.png')


def play_assets():
    # Play exige un cuadrado sin transparencia y aplica él mismo el redondeo
    save(draw_mark(512, scale=0.78, bg=BG, radius_ratio=0.0).convert('RGB'), f'{PLAY}/icon-512.png')

    w, h = 1024, 500
    img = Image.new('RGB', (w, h), BG)
    d = ImageDraw.Draw(img)
    for i in range(1, 8):
        x = w * i / 8
        d.line([x, 0, x, h], fill=(30, 35, 46), width=2)
    mark = draw_mark(300, scale=0.92)
    img.paste(mark, (96, 100), mark)
    font_path = '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf'
    if os.path.exists(font_path):
        title = ImageFont.truetype(font_path, 104)
        sub = ImageFont.truetype(font_path, 34)
    else:
        title = sub = ImageFont.load_default()
    d.text((440, 175), 'Baketa', font=title, fill=(237, 240, 245))
    d.text((446, 305), 'Metrónomo y caja de ritmos', font=sub, fill=BRASS)
    save(img, f'{PLAY}/feature-graphic.png')


if __name__ == '__main__':
    android_icons()
    web_icons()
    play_assets()
    print('Listo.')
