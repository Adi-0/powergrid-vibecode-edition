"""Build the bundled state outlines from Natural Earth (public domain).

Offline tool. Reads Natural Earth 1:10m admin-1 states/provinces and lakes GeoJSON,
keeps California and its neighbours (Oregon, Nevada, Arizona, Baja California) plus
large Californian lakes, simplifies each ring (Douglas–Peucker, ~1 km), and writes
src/assets/geo/outline.json as rounded lat/lon. The app projects it at runtime
with the same projection as the network (src/model/geo.ts). Nothing is fetched at
runtime.

    python tools/geo/build_outline.py <admin1.geojson> <lakes.geojson>

Source: https://github.com/nvkelso/natural-earth-vector (geojson/)
"""
import json
import math
import os
import sys

from shapely.geometry import shape, mapping, box, Point, MultiPoint
from shapely.ops import unary_union

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.normpath(os.path.join(HERE, "..", "..", "src", "assets", "geo", "outline.json"))

KEEP = {
    ("United States of America", "California"): "CA",
    ("United States of America", "Oregon"): "OR",
    ("United States of America", "Nevada"): "NV",
    ("United States of America", "Arizona"): "AZ",
    ("Mexico", "Baja California"): "BC",
}
# ~1 km in degrees at 37°N
TOL = 0.009
CLIP = box(-126.5, 31.0, -110.5, 43.6)


def rings(geom):
    polys = [geom] if geom.geom_type == "Polygon" else list(geom.geoms)
    out = []
    for p in polys:
        if p.area < 0.002:  # drop tiny islands (< ~20 km²)
            continue
        ext = [[round(x, 4), round(y, 4)] for x, y in p.exterior.coords]
        out.append(ext)
    return out


# Intertie points that must sit on neighbouring ground (lon, lat): Malin, Eldorado, Palo Verde
INTERTIES = [(-121.408, 42.013), (-114.98, 35.795), (-112.86, 33.39)]


def lines_of(geom):
    if geom.is_empty:
        return []
    if geom.geom_type == "LineString":
        return [geom]
    if geom.geom_type in ("MultiLineString", "GeometryCollection"):
        out = []
        for g in geom.geoms:
            out += lines_of(g)
        return out
    return []


def main(admin_path, lakes_path):
    admin = json.load(open(admin_path))
    raw = {}
    for f in admin["features"]:
        pr = f["properties"]
        key = (pr.get("admin"), pr.get("name"))
        if key in KEEP:
            raw[KEEP[key]] = shape(f["geometry"])
    # Neighbours are shown only as context near California: clipped to a band around
    # the state and its intertie points. Where the clip cuts them, the drawing uses a
    # break line (drafting convention for "the drawing stops here").
    ca = raw["CA"]
    band = unary_union([ca.buffer(1.1), MultiPoint(INTERTIES).buffer(0.9)]).simplify(0.05)
    regions = {}
    cuts = []
    for k, g in raw.items():
        if k == "CA":
            regions[k] = rings(g.intersection(CLIP).simplify(TOL, preserve_topology=True))
            continue
        clipped = g.intersection(band).simplify(TOL, preserve_topology=True)
        regions[k] = rings(clipped)
        cut = clipped.boundary.difference(g.boundary.buffer(0.02))
        for ln in lines_of(cut):
            if ln.length > 0.05:
                cuts.append([[round(x, 4), round(y, 4)] for x, y in ln.simplify(TOL).coords])
    lakes = []
    for f in json.load(open(lakes_path))["features"]:
        g = shape(f["geometry"])
        c = g.centroid
        if -124.5 < c.x < -114 and 32.5 < c.y < 42 and g.area > 0.01:
            name = f["properties"].get("name") or ""
            g2 = g.simplify(TOL, preserve_topology=True)
            for r in rings(g2):
                lakes.append({"name": name, "ring": r})
    out = {
        "source": "Natural Earth 1:10m admin-1 states/provinces and lakes (public domain), simplified ~1 km",
        "regions": regions,
        "cuts": cuts,
        "lakes": lakes,
    }
    with open(OUT, "w") as fh:
        json.dump(out, fh, separators=(",", ":"))
    n = sum(len(r) for rs in regions.values() for r in rs)
    print(OUT, os.path.getsize(OUT), "bytes;", {k: sum(len(r) for r in v) for k, v in regions.items()}, "lakes", [l["name"] for l in lakes])


if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2])
