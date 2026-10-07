"""Refresh verified series only from the Macau open-data platform API.

The DSEC timetable is deliberately not a statistics source. A missing API key or
an invalid response never replaces the last published values.
"""

import argparse
import datetime as dt
import json
import math
import os
from pathlib import Path
import time
from urllib.parse import urlparse
from urllib.request import Request, urlopen
from zoneinfo import ZoneInfo


DATA = Path(__file__).resolve().parents[1] / "data"
MACAU = ZoneInfo("Asia/Macau")


def checked_series(old, payload):
    if payload.get("success") is not True or not isinstance(payload.get("value"), dict):
        raise ValueError("API did not return a successful value")
    value = payload["value"]
    if value.get("title") != old.get("title") or value.get("unit") != old.get("unit"):
        raise ValueError("title or unit changed; needs review")
    if value.get("periodType") != old.get("periodType"):
        raise ValueError("period type changed; needs review")
    rows = value.get("values")
    if not isinstance(rows, list):
        raise ValueError("values are missing")
    points = []
    for row in rows:
        if not isinstance(row, dict) or not isinstance(row.get("periodString"), str):
            raise ValueError("period is missing")
        period = row["periodString"].strip()
        try:
            number = float(str(row["value"]).replace(",", ""))
        except (KeyError, TypeError, ValueError):
            raise ValueError("non-numeric value") from None
        if not period or not math.isfinite(number):
            raise ValueError("invalid period or value")
        points.append([period, number])
    if len(points) < 2 or len({p for p, _ in points}) != len(points):
        raise ValueError("too few or repeated periods")
    if not {p for p, _ in old["points"]}.issubset({p for p, _ in points}):
        raise ValueError("previous periods disappeared; needs review")
    return {**old, "minYear": value.get("minYear") or old.get("minYear"),
            "maxYear": value.get("maxYear") or old.get("maxYear"),
            "remarks": value.get("indicatorRemarks"), "points": points}


def fetch_series(url, key):
    parsed = urlparse(url)
    if parsed.scheme != "https" or parsed.hostname != "dsec.apigateway.data.gov.mo":
        raise ValueError("unapproved statistics API host")
    request = Request(url, data=b"{}", method="POST", headers={
        "Content-Type": "application/json", "X-Ca-Key": key,
        "User-Agent": "MacauDataMap/1.0",
    })
    with urlopen(request, timeout=15) as response:
        raw = response.read(2_000_001)
    if len(raw) > 2_000_000:
        raise ValueError("API response too large")
    return json.loads(raw)


def update_preview(dataset_id, payload, checked_at):
    path = DATA / "previews" / f"{dataset_id}.json"
    if not path.exists():
        return
    preview = json.loads(path.read_text(encoding="utf-8"))
    files = preview.get("files") or []
    if len(files) != 1 or files[0].get("columns") != ["value", "periodString", "remarks"]:
        return
    rows = payload["value"]["values"]
    files[0].update({"rows": [[str(r["value"]), r["periodString"], r.get("remarks") or ""]
                             for r in reversed(rows[-28:])],
                     "count": len(rows), "previewOrder": "latest", "snapshotAt": checked_at,
                     "source": "政府數據開放平台 API"})
    path.write_text(json.dumps(preview, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--only", help="Refresh one series for a focused check")
    args = parser.parse_args()
    key = os.environ.get("DATA_GOV_MO_API_KEY", "").strip()
    if not key:
        print("Statistics skipped: DATA_GOV_MO_API_KEY is not configured")
        return
    sources = json.loads((DATA / "series_sources.json").read_text(encoding="utf-8"))
    index_path = DATA / "series_index.json"
    index = json.loads(index_path.read_text(encoding="utf-8"))
    by_id = {item["id"]: item for item in index}
    status_path = DATA / "series_status.json"
    status = json.loads(status_path.read_text(encoding="utf-8")) if status_path.exists() else {}
    checked_at = dt.datetime.now(MACAU).strftime("%Y-%m-%d %H:%M")
    successful = changed = failed = 0
    targets = {args.only: sources[args.only]} if args.only else sources
    for sid, url in targets.items():
        try:
            old_path = DATA / "series" / f"{sid}.json"
            old = json.loads(old_path.read_text(encoding="utf-8"))
            payload = fetch_series(url, key)
            new = checked_series(old, payload)
            is_changed = new != old
            if is_changed:
                old_path.write_text(json.dumps(new, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
                update_preview(old["datasetId"], payload, checked_at)
                meta = by_id[sid]
                meta.update(minYear=new["minYear"], maxYear=new["maxYear"], n=len(new["points"]),
                            first=new["points"][0], last=new["points"][-1])
                changed += 1
            prior = status.get(sid) or {}
            status[sid] = {"checkedAt": checked_at, "latestPeriod": new["points"][-1][0],
                           "lastChangedAt": checked_at if is_changed else prior.get("lastChangedAt")}
            successful += 1
        except Exception as error:
            failed += 1
            print(f"Statistics {sid}: {type(error).__name__}: {error}")
        time.sleep(0.5)
    if not successful:
        raise SystemExit("No statistics source could be verified; previous data retained")
    index_path.write_text(json.dumps(index, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    status_path.write_text(json.dumps(status, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    print(f"Statistics: {successful} checked, {changed} changed, {failed} failed")


if __name__ == "__main__":
    main()
