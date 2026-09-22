#!/usr/bin/env python3
"""Build bounded Cesium terrain grids from one or more RH2000 GeoTIFFs."""

from __future__ import annotations

import argparse
import json
from pathlib import Path

import numpy as np
import rasterio
from pyproj import Transformer
from rasterio.windows import Window


def bilinear(values, transform, x, y):
    cols = (x - transform.c) / transform.a - 0.5
    rows = (y - transform.f) / transform.e - 0.5
    c = np.floor(cols).astype(int)
    r = np.floor(rows).astype(int)
    fx, fy = cols - c, rows - r
    return (
        (values[r, c] * (1 - fx) + values[r, c + 1] * fx) * (1 - fy)
        + (values[r + 1, c] * (1 - fx) + values[r + 1, c + 1] * fx) * fy
    )


def sample_height_sources(paths, east, north):
    result = np.full(east.shape, np.nan, dtype=np.float64)
    for path in paths:
        with rasterio.open(path) as src:
            if src.crs.to_epsg() != 5845:
                raise ValueError(f"Expected EPSG:5845: {path}")
            b = src.bounds
            mask = (
                (east >= b.left + 1)
                & (east <= b.right - 1)
                & (north >= b.bottom + 1)
                & (north <= b.top - 1)
            )
            if not mask.any():
                continue
            rr, cc = np.where(mask)
            rows, cols = rasterio.transform.rowcol(src.transform, east[mask], north[mask])
            r0, r1 = max(0, min(rows) - 2), min(src.height, max(rows) + 3)
            c0, c1 = max(0, min(cols) - 2), min(src.width, max(cols) + 3)
            window = Window(c0, r0, c1 - c0, r1 - r0)
            values = src.read(1, window=window)
            if src.nodata is not None and np.any(values == src.nodata):
                raise ValueError(f"Missing height data in {path}")
            result[rr, cc] = bilinear(
                values, src.window_transform(window), east[mask], north[mask]
            )
    missing = ~np.isfinite(result)
    if missing.any():
        # Adjacent one-metre rasters meet between their outer pixel centres.
        # Interpolate the occasional output row that lands exactly on that seam.
        if missing.mean() > 0.002:
            raise ValueError("Requested terrain grid extends outside source coverage")
        row_numbers = np.arange(result.shape[0])
        for column in np.where(missing.any(axis=0))[0]:
            valid = np.isfinite(result[:, column])
            result[~valid, column] = np.interp(
                row_numbers[~valid], row_numbers[valid], result[valid, column]
            )
    return result


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("sources", nargs="+", type=Path)
    parser.add_argument("--geoid", required=True, type=Path)
    parser.add_argument("--output", required=True, type=Path)
    parser.add_argument("--bounds", required=True, nargs=4, type=float, metavar=("W", "S", "E", "N"))
    parser.add_argument("--width", type=int, default=1537)
    parser.add_argument("--height", type=int, default=3073)
    args = parser.parse_args()

    west, south, east_bound, north_bound = args.bounds
    lon, lat = np.meshgrid(
        np.linspace(west, east_bound, args.width),
        np.linspace(north_bound, south, args.height),
    )
    east, north = Transformer.from_crs(4326, 3006, always_xy=True).transform(lon, lat)
    rh = sample_height_sources(args.sources, east, north)
    with rasterio.open(args.geoid) as geoid:
        undulation = bilinear(geoid.read(1), geoid.transform, lon, lat)
    ellipsoid = rh + undulation
    encoded = np.rint(ellipsoid * 100).astype("<u2")
    if ellipsoid.min() < 0 or ellipsoid.max() >= 655.35:
        raise ValueError("Height outside uint16 centimetre encoding")

    args.output.mkdir(parents=True, exist_ok=True)
    encoded.tofile(args.output / "heights.bin")
    samples = []
    for r, c in [(0, 0), (args.height // 2, args.width // 2), (args.height - 1, args.width - 1)]:
        samples.append({
            "row": r, "column": c, "longitude": float(lon[r, c]), "latitude": float(lat[r, c]),
            "rh2000_m": float(rh[r, c]), "geoid_m": float(undulation[r, c]),
            "ellipsoid_m": float(ellipsoid[r, c]), "encoded_m": float(encoded[r, c] / 100),
        })
    metadata = {
        "width": args.width, "height": args.height, "west": west, "south": south,
        "east": east_bound, "north": north_bound, "encoding": "uint16-le-centimetres",
        "heightScale": 0.01, "source": " + ".join(p.name for p in args.sources),
        "sources": [p.name for p in args.sources], "sourceCRS": "EPSG:5845",
        "sourceResolutionMetres": 1, "verticalConversion": "h = H + N; SWEN17_RH2000",
        "geoidSource": "https://cdn.proj.org/se_lantmateriet_SWEN17_RH2000.tif",
        "geoidRangeMetres": [float(undulation.min()), float(undulation.max())],
        "rh2000RangeMetres": [float(rh.min()), float(rh.max())],
        "maxEncodingErrorMetres": float(np.abs(encoded / 100 - ellipsoid).max()), "samples": samples,
    }
    (args.output / "metadata.json").write_text(json.dumps(metadata, indent=2, ensure_ascii=False) + "\n")

    step = 6
    context = encoded[::step, ::step]
    context.tofile(args.output / "context.bin")
    context_meta = {
        "width": int(context.shape[1]), "height": int(context.shape[0]), "west": west, "south": south,
        "east": east_bound, "north": north_bound, "heightScale": 0.01,
        "sources": [p.name for p in args.sources],
        "note": "Coarse context from the same surveys; outside this rectangle the globe is clipped.",
    }
    (args.output / "context.json").write_text(json.dumps(context_meta, ensure_ascii=False) + "\n")
    print(json.dumps({"metadata": metadata, "context": context_meta}, indent=2, ensure_ascii=False))


if __name__ == "__main__":
    main()
