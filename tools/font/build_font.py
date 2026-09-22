"""Build "Atlas Sans": a subset of IBM Plex Sans with the few math glyphs Plex lacks.

Why: the brief asks for one typeface in an engineering register with tabular
numerals. IBM Plex Sans has default tabular digits and Greek, but no ANGLE (U+2220),
which the field's phasor notation (V∠θ) needs everywhere. Instead of letting the
browser fall back to a second typeface for one glyph, we draw it here, matched to
Plex's stroke weight.

OFL 1.1: IBM Plex carries the Reserved Font Name "Plex", so the modified font is
renamed. The licence travels with the output.

Usage (offline, one-time; outputs are committed):
    python tools/font/build_font.py <path-to-extracted-ibm-plex-sans-release>
The release zip is https://github.com/IBM/plex/releases (ibm-plex-sans.zip).
"""
import os
import shutil
import sys

from fontTools.pens.ttGlyphPen import TTGlyphPen
from fontTools.subset import Options, Subsetter
from fontTools.ttLib import TTFont

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.normpath(os.path.join(HERE, "..", "..", "src", "assets", "fonts"))

STYLES = {
    "Regular": "IBMPlexSans-Regular.ttf",
    "Italic": "IBMPlexSans-Italic.ttf",
    "SemiBold": "IBMPlexSans-SemiBold.ttf",
}

# Latin (incl. accented place names), Greek, punctuation, super/subscripts,
# letterlike, arrows, math operators, geometric shapes.
UNICODES = (
    list(range(0x20, 0x7F))
    + list(range(0xA0, 0x180))
    + list(range(0x370, 0x400))
    + list(range(0x2000, 0x2070))
    + list(range(0x2070, 0x20A0))
    + list(range(0x2100, 0x2150))
    + list(range(0x2190, 0x2200))
    + list(range(0x2200, 0x2300))
    + list(range(0x25A0, 0x2600))
)


def stroke_thickness(font):
    """Thickness of the minus sign: the operator stroke weight of this style."""
    glyf = font["glyf"]
    g = glyf[font.getBestCmap()[ord("−")]]
    return g.yMax - g.yMin


def draw_angle(font, t):
    """U+2220 ANGLE: a baseline bar and a rising stroke meeting at the left."""
    pen = TTGlyphPen(font.getGlyphSet())
    x0, x1, y0 = 70, 540, 0
    # baseline bar
    pen.moveTo((x0, y0))
    pen.lineTo((x1, y0))
    pen.lineTo((x1, y0 + t))
    pen.lineTo((x0, y0 + t))
    pen.closePath()
    # rising stroke from the vertex to (x2, y2): a parallelogram whose horizontal
    # width w gives a perpendicular thickness of t.
    import math

    x2, y2 = 470, 600
    theta = math.atan2(y2 - y0, x2 - x0)
    w = t / math.sin(theta)
    pen.moveTo((x0, y0))
    pen.lineTo((x0 + w, y0))
    pen.lineTo((x2 + w, y2))
    pen.lineTo((x2, y2))
    pen.closePath()
    return pen.glyph()


def draw_parallel(font, t):
    """U+2225 PARALLEL TO: two verticals (used for impedances in parallel)."""
    pen = TTGlyphPen(font.getGlyphSet())
    for x in (210, 390):
        pen.moveTo((x - t / 2, -120))
        pen.lineTo((x + t / 2, -120))
        pen.lineTo((x + t / 2, 740))
        pen.lineTo((x - t / 2, 740))
        pen.closePath()
    return pen.glyph()


def add_glyph(font, name, codepoint, glyph, advance):
    font["glyf"][name] = glyph
    font["hmtx"][name] = (advance, glyph.xMin if hasattr(glyph, "xMin") else 0)
    order = font.getGlyphOrder()
    if name not in order:
        order.append(name)
        font.setGlyphOrder(order)
    for table in font["cmap"].tables:
        if table.isUnicode():
            table.cmap[codepoint] = name
    font["maxp"].numGlyphs = len(font.getGlyphOrder())


def alias(font, codepoint, existing_char):
    name = font.getBestCmap()[ord(existing_char)]
    for table in font["cmap"].tables:
        if table.isUnicode():
            table.cmap[codepoint] = name


def rename(font, style):
    family = "Atlas Sans"
    full = f"{family} {style}"
    ps = f"AtlasSans-{style}"
    name = font["name"]
    for rec in list(name.names):
        if rec.nameID in (1, 16):
            rec.string = family
        elif rec.nameID == 4:
            rec.string = full
        elif rec.nameID == 6:
            rec.string = ps
        elif rec.nameID == 3:
            rec.string = f"{ps};grid-atlas"
        elif rec.nameID == 5:
            rec.string = str(rec.toUnicode()) + "; subset + ANGLE/PARALLEL added for Grid Atlas"


def build(src_dir):
    os.makedirs(OUT, exist_ok=True)
    ttf_dir = os.path.join(src_dir, "ibm-plex-sans", "fonts", "complete", "ttf")
    for style, fname in STYLES.items():
        font = TTFont(os.path.join(ttf_dir, fname))
        t = stroke_thickness(font)
        angle = draw_angle(font, t)
        angle.recalcBounds(font["glyf"])
        add_glyph(font, "uni2220", 0x2220, angle, 600)
        par = draw_parallel(font, t)
        par.recalcBounds(font["glyf"])
        add_glyph(font, "uni2225", 0x2225, par, 600)
        alias(font, 0x22C5, "·")  # DOT OPERATOR -> middle dot
        alias(font, 0x2217, "*")  # ASTERISK OPERATOR -> asterisk (conjugate)

        opts = Options()
        opts.flavor = "woff2"
        opts.layout_features = ["*"]
        opts.name_IDs = ["*"]
        opts.name_languages = ["*"]
        opts.notdef_outline = True
        opts.glyph_names = False
        sub = Subsetter(opts)
        sub.populate(unicodes=UNICODES)
        sub.subset(font)
        rename(font, style)
        font.flavor = "woff2"
        out = os.path.join(OUT, f"AtlasSans-{style}.woff2")
        font.save(out)
        print(f"{out}  ({os.path.getsize(out)} bytes, stroke {t})")
    shutil.copy(os.path.join(ttf_dir, "license.txt"), os.path.join(OUT, "OFL.txt"))


if __name__ == "__main__":
    build(sys.argv[1])
