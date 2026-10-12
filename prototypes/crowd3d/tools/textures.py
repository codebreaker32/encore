"""Texture step of the people pipeline (run with python3 -P; needs Pillow).

  textures.py person <Textures dir> <out dir>
      *_body_color / *_head_color  -> <kind>_color.jpg  1024², JPEG q86
      *_opacity_color (RGBA)       -> opacity_color.png 1024², RGBA, 256-colour palette
      *_body_normal / *_head_normal-> <kind>_normal.png 512², RGB
      TV preset: head_color_tv.jpg 512², body_color_tv.jpg 384², opacity_tv.png 384² (RGBA, colour dilated, coverage kept)
  textures.py atlas <out dir> <Textures dir>...
      lod_atlas.jpg 2048² (4x4 tiles of 512², one per avatar; quadrants body | head / opacity | -)
      lod_alpha.png 1024² greyscale alpha (the opacity quadrant's alpha, opaque elsewhere)
      lod_atlas_1k.jpg / lod_alpha_512.png: the same at half size (TV preset)
      lod_alpha_512.r8: that alpha as raw 8-bit rows, top first (the TV preset uploads it as a one-channel texture:
      0.35 MB on the GPU instead of 1.4 MB as RGBA)
  textures.py r8 <alpha png> <out .r8>
      just that conversion

Images are processed one at a time to keep memory low.
"""
import glob
import os
import sys

from PIL import Image

TILE = 512
QUAD = TILE // 2
PAD = 2  # pixels of edge padding inside each quadrant (the UVs are inset to match)


def find(tex_dir, suffix):
    hits = sorted(glob.glob(os.path.join(tex_dir, f"*_{suffix}.tga")))
    return hits[0] if hits else None


def dilate(rgba, cut=8):
    """Fill the colour of (nearly) transparent texels from their neighbours, from a premultiplied pyramid, so filtering
    and mips at a hair card's edge blend towards the hair's own colour instead of the black or white the texture kept
    there (the TV's dark nets and white streaks on hair)."""
    levels = [rgba]
    while min(levels[-1].size) > 1:
        lw, lh = max(1, levels[-1].width // 2), max(1, levels[-1].height // 2)
        levels.append(levels[-1].convert("RGBa").resize((lw, lh), Image.BOX).convert("RGBA"))
    filled = levels[-1].convert("RGB")
    for lv in reversed(levels[:-1]):
        up = filled.resize(lv.size, Image.BILINEAR)
        filled = Image.composite(lv.convert("RGB"), up, lv.getchannel("A").point(lambda a: 255 if a > cut else 0))
    out = filled.convert("RGBA")
    out.putalpha(rgba.getchannel("A"))
    return out


def coverage(a, cut=128):
    h = a.histogram()
    return sum(h[cut:]) / max(1, sum(h))


def keep_coverage(small_a, ref, cut=128):
    """Scale a downsized alpha so the share of texels that pass the alpha test matches the full-size one (thin strands
    otherwise fall under the cut and the hair breaks into holes)."""
    lo, hi = 1.0, 4.0
    for _ in range(14):
        m = (lo + hi) / 2
        if coverage(small_a.point(lambda v: min(255, int(v * m + 0.5))), cut) < ref:
            lo = m
        else:
            hi = m
    return small_a.point(lambda v: min(255, int(v * hi + 0.5)))


def opacity_tv(rgba, size=384):  # (384²: the TV's 30 MB texture cap, build k)
    """The TV's hair texture: colour dilated, resized premultiplied, alpha coverage kept at the 0.5 cut, full RGBA."""
    full = dilate(rgba)
    small = full.convert("RGBa").resize((size, size), Image.LANCZOS).convert("RGBA")
    small = dilate(small)
    small.putalpha(keep_coverage(small.getchannel("A"), coverage(rgba.getchannel("A"))))
    return small


def person(tex_dir, out_dir):
    os.makedirs(out_dir, exist_ok=True)
    for kind in ("body", "head"):
        src = find(tex_dir, f"{kind}_color")
        with Image.open(src) as im:
            rgb = im.convert("RGB")
            rgb.resize((1024, 1024), Image.LANCZOS).save(os.path.join(out_dir, f"{kind}_color.jpg"), quality=86, optimize=True)
            tv = 512 if kind == "head" else 384  # TV preset: faces at 512, clothes at 384
            rgb.resize((tv, tv), Image.LANCZOS).save(os.path.join(out_dir, f"{kind}_color_tv.jpg"), quality=88, optimize=True)
        src = find(tex_dir, f"{kind}_normal")
        with Image.open(src) as im:
            im.convert("RGB").resize((512, 512), Image.LANCZOS).save(
                os.path.join(out_dir, f"{kind}_normal.png"), optimize=True
            )
    src = find(tex_dir, "opacity_color")
    if src:
        with Image.open(src) as im:
            rgba = im.convert("RGBA").resize((1024, 1024), Image.LANCZOS)
            rgba.quantize(colors=256, method=Image.Quantize.FASTOCTREE).save(
                os.path.join(out_dir, "opacity_color.png"), optimize=True
            )
            rgba.resize((256, 256), Image.LANCZOS).quantize(colors=256, method=Image.Quantize.FASTOCTREE).save(
                os.path.join(out_dir, "opacity_256.png"), optimize=True
            )
            with Image.open(src) as full:
                opacity_tv(full.convert("RGBA")).save(os.path.join(out_dir, "opacity_tv.png"), optimize=True)
    print("textures", out_dir)


def quad(img, size):
    """Resize into a size² cell whose outer PAD pixels repeat the edge (so mip levels bleed less)."""
    cell = img.resize((size, size), Image.LANCZOS)
    inner = img.resize((size - 2 * PAD, size - 2 * PAD), Image.LANCZOS)
    cell.paste(inner, (PAD, PAD))
    return cell


def atlas(out_dir, tex_dirs):
    os.makedirs(out_dir, exist_ok=True)
    colour = Image.new("RGB", (TILE * 4, TILE * 4), (40, 32, 30))
    alpha = Image.new("L", (TILE * 4, TILE * 4), 255)
    for i, tex_dir in enumerate(tex_dirs):
        tx, ty = (i % 4) * TILE, (i // 4) * TILE
        for kind, (qx, qy) in (("body_color", (0, 0)), ("head_color", (QUAD, 0)), ("opacity_color", (0, QUAD))):
            src = find(tex_dir, kind)
            if not src:
                continue
            with Image.open(src) as im:
                rgba = im.convert("RGBA")
            if kind == "opacity_color":
                rgba = dilate(rgba)  # (the cards' edges filter towards the hair colour, not black or white)
            colour.paste(quad(rgba.convert("RGB"), QUAD), (tx + qx, ty + qy))
            if kind == "opacity_color":
                alpha.paste(quad(rgba.getchannel("A"), QUAD), (tx + qx, ty + qy))
            del rgba
    colour.save(os.path.join(out_dir, "lod_atlas.jpg"), quality=84, optimize=True)
    colour.resize((TILE * 2, TILE * 2), Image.LANCZOS).save(os.path.join(out_dir, "lod_atlas_1k.jpg"), quality=86, optimize=True)
    ref = coverage(alpha)
    keep_coverage(alpha.resize((TILE * 2, TILE * 2), Image.LANCZOS), ref).save(os.path.join(out_dir, "lod_alpha.png"), optimize=True)
    small = keep_coverage(alpha.resize((TILE, TILE), Image.LANCZOS), ref)
    small.save(os.path.join(out_dir, "lod_alpha_512.png"), optimize=True)
    r8(small, os.path.join(out_dir, "lod_alpha_512.r8"))
    print("atlas", out_dir)


def r8(img, out):
    """One channel of raw bytes, rows top first, for a THREE.DataTexture in RedFormat."""
    with open(out, "wb") as f:
        f.write(img.convert("L").tobytes())


if __name__ == "__main__":
    if sys.argv[1] == "person":
        person(sys.argv[2], sys.argv[3])
    elif sys.argv[1] == "atlas":
        atlas(sys.argv[2], sys.argv[3:])
    elif sys.argv[1] == "r8":
        r8(Image.open(sys.argv[2]), sys.argv[3])
    else:
        sys.exit(__doc__)
