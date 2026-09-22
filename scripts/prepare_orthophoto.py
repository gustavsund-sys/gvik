#!/usr/bin/env python3
"""Build a Cesium GeographicTilingScheme pyramid from adjacent GeoTIFFs."""

from __future__ import annotations

import argparse
import json
import shutil
import tempfile
from datetime import date
from pathlib import Path

import numpy as np
import rasterio
from PIL import Image
from rasterio.enums import Resampling
from rasterio.merge import merge
from rasterio.transform import from_bounds
from rasterio.warp import reproject, transform_bounds


def arguments() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("inputs", nargs="+", type=Path)
    parser.add_argument("--output", required=True, type=Path)
    parser.add_argument("--maximum-level", type=int, default=5)
    parser.add_argument("--tile-size", type=int, default=512)
    parser.add_argument("--quality", type=int, default=88)
    parser.add_argument("--date", default=str(date.today()))
    return parser.parse_args()


def main() -> None:
    args = arguments()
    for path in args.inputs:
        if not path.is_file():
            raise FileNotFoundError(path)

    sources = [rasterio.open(path) for path in args.inputs]
    try:
        crs = sources[0].crs
        if not crs or any(source.crs != crs for source in sources):
            raise ValueError("All source rasters must use the same CRS")

        bounds = (
            min(source.bounds.left for source in sources),
            min(source.bounds.bottom for source in sources),
            max(source.bounds.right for source in sources),
            max(source.bounds.top for source in sources),
        )
        pixels = args.tile_size * (2**args.maximum_level)
        resolution = max((bounds[2] - bounds[0]) / pixels, (bounds[3] - bounds[1]) / pixels)

        args.output.parent.mkdir(parents=True, exist_ok=True)
        build_dir = Path(tempfile.mkdtemp(prefix=f"{args.output.name}-", dir=args.output.parent))
        mosaic_path = Path(tempfile.gettempdir()) / f"{args.output.name}-mosaic.tif"
        if mosaic_path.exists():
            mosaic_path.unlink()

        merge(
            sources,
            bounds=bounds,
            res=resolution,
            indexes=[1, 2, 3],
            output_count=3,
            resampling=Resampling.bilinear,
            target_aligned_pixels=False,
            mem_limit=256,
            dst_path=mosaic_path,
            dst_kwds={
                "driver": "GTiff",
                "tiled": True,
                "blockxsize": 512,
                "blockysize": 512,
                "compress": "deflate",
                "predictor": 2,
                "BIGTIFF": "YES",
            },
        )

        with rasterio.open(mosaic_path) as mosaic:
            west, south, east, north = transform_bounds(
                mosaic.crs, "EPSG:4326", *mosaic.bounds, densify_pts=41
            )
            for level in range(args.maximum_level + 1):
                side = 2**level
                width = args.tile_size * side
                for y in range(side):
                    row_north = north - (north - south) * y / side
                    row_south = north - (north - south) * (y + 1) / side
                    row = np.zeros((3, args.tile_size, width), dtype=np.uint8)
                    reproject(
                        source=rasterio.band(mosaic, (1, 2, 3)),
                        destination=row,
                        src_transform=mosaic.transform,
                        src_crs=mosaic.crs,
                        dst_transform=from_bounds(
                            west, row_south, east, row_north, width, args.tile_size
                        ),
                        dst_crs="EPSG:4326",
                        resampling=Resampling.bilinear,
                        num_threads=2,
                        warp_mem_limit=256,
                    )
                    for x in range(side):
                        tile = np.moveaxis(
                            row[:, :, x * args.tile_size : (x + 1) * args.tile_size], 0, 2
                        )
                        tile_path = build_dir / str(level) / str(x) / f"{y}.webp"
                        tile_path.parent.mkdir(parents=True, exist_ok=True)
                        Image.fromarray(tile, "RGB").save(
                            tile_path, "WEBP", quality=args.quality, method=4
                        )

        tile_count = sum(4**level for level in range(args.maximum_level + 1))
        metadata = {
            "bounds": [west, south, east, north],
            "tileSize": args.tile_size,
            "maximumLevel": args.maximum_level,
            "levelZeroTilesX": 1,
            "levelZeroTilesY": 1,
            "sources": [path.name for path in args.inputs],
            "sourceResolutionMetres": float(sources[0].res[0]),
            "date": args.date,
            "cacheVersion": f"{args.date.replace('-', '')}-{len(args.inputs)}x-l{args.maximum_level}",
            "sourceCRS": str(crs),
            "tileCRS": "EPSG:4326",
            "rasterSize": [pixels, pixels],
            "tileCount": tile_count,
            "attribution": "© Lantmäteriet, CC BY 4.0",
            "processing": f"RGB GeoTIFF mosaic reprojected to EPSG:4326; WebP quality {args.quality}",
        }
        (build_dir / "metadata.json").write_text(
            json.dumps(metadata, indent=2, ensure_ascii=False) + "\n", encoding="utf-8"
        )

        backup = args.output.with_name(f"{args.output.name}.previous")
        if backup.exists():
            shutil.rmtree(backup)
        if args.output.exists():
            args.output.rename(backup)
        build_dir.rename(args.output)
        shutil.rmtree(backup, ignore_errors=True)
        mosaic_path.unlink(missing_ok=True)
        print(json.dumps(metadata, indent=2, ensure_ascii=False))
    finally:
        for source in sources:
            source.close()


if __name__ == "__main__":
    main()
