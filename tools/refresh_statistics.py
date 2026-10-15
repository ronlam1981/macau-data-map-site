"""Refresh verified series only from the Macau open-data platform API.

The DSEC timetable is deliberately not a statistics source. A missing API key or
an invalid response never replaces the last published values.
"""

import argparse
import datetime as dt
import io
import json
import math
import os
from pathlib import Path
import re
import time
from urllib.parse import urlparse
from urllib.request import Request, urlopen
from xml.etree import ElementTree as ET
from zipfile import ZipFile, BadZipFile
from zoneinfo import ZoneInfo


DATA = Path(__file__).resolve().parents[1] / "data"
MACAU = ZoneInfo("Asia/Macau")
DGTO_ID = "025edc1e-3836-4984-947b-166376b727ef"
DGTO_DETAIL = f"https://api.data.gov.mo/datadir/detail/{DGTO_ID}"
DGTO_DOWNLOAD = "https://api.data.gov.mo/datadir/downloadSingleFile"
XLSX_NS = "{http://schemas.openxmlformats.org/spreadsheetml/2006/main}"


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


def fetch_public(url, limit):
    parsed = urlparse(url)
    if parsed.scheme != "https" or parsed.hostname != "api.data.gov.mo":
        raise ValueError("unapproved public data host")
    request = Request(url, headers={"User-Agent": "MacauDataMap/1.0"})
    with urlopen(request, timeout=30) as response:
        raw = response.read(limit + 1)
    if len(raw) > limit:
        raise ValueError("public data response too large")
    return raw


def xlsx_rows(raw):
    """Read the single worksheet without adding a third-party CI dependency."""
    try:
        archive = ZipFile(io.BytesIO(raw))
    except BadZipFile as error:
        raise ValueError("official file is not an XLSX archive") from error
    with archive:
        members = {item.filename: item for item in archive.infolist()}
        required = {"xl/workbook.xml", "xl/_rels/workbook.xml.rels", "xl/worksheets/sheet1.xml"}
        if not required.issubset(members) or any(item.file_size > 10_000_000 for item in members.values()):
            raise ValueError("unexpected XLSX structure")
        strings = []
        if "xl/sharedStrings.xml" in members:
            root = ET.fromstring(archive.read("xl/sharedStrings.xml"))
            strings = ["".join(node.text or "" for node in item.iter(XLSX_NS + "t"))
                       for item in root.findall(XLSX_NS + "si")]
        sheet = ET.fromstring(archive.read("xl/worksheets/sheet1.xml"))
        result = []
        for row in sheet.iter(XLSX_NS + "row"):
            values = []
            for cell in row.findall(XLSX_NS + "c"):
                match = re.match(r"([A-Z]+)", cell.attrib.get("r", ""))
                if not match:
                    raise ValueError("cell reference is missing")
                column = 0
                for char in match.group(1):
                    column = column * 26 + ord(char) - 64
                values.extend([""] * max(0, column - 1 - len(values)))
                node = cell.find(XLSX_NS + "v")
                value = "" if node is None else (node.text or "")
                if cell.attrib.get("t") == "s" and value:
                    value = strings[int(value)]
                values.append(value)
            result.append(values)
        return result


def refresh_dgto(checked_at):
    metadata = json.loads(fetch_public(DGTO_DETAIL, 2_000_000))
    if metadata.get("code") != 0 or not isinstance(metadata.get("data"), dict):
        raise ValueError("DGTO metadata response is invalid")
    detail = metadata["data"]
    files = detail.get("file") or []
    if len(files) != 1 or files[0].get("fileName") != "dst_visitor_04_stats.xlsx":
        raise ValueError("DGTO official filename changed; needs review")
    file_id = files[0].get("fileId")
    if not isinstance(file_id, int):
        raise ValueError("DGTO file id is missing")
    url = f"{DGTO_DOWNLOAD}?fileId={file_id}&dataDirId={DGTO_ID}"
    worksheet = xlsx_rows(fetch_public(url, 5_000_000))
    expected = ["YEAR", "MONTH", "ORIGIN_CN", "ORIGIN_PT", "ORIGIN_EN", "DISTRICT_CN",
                "DISTRICT_PT", "DISTRICT_EN", "ADV_TIME", "NOTES"]
    if not worksheet or worksheet[0][:len(expected)] != expected:
        raise ValueError("DGTO worksheet columns changed; needs review")
    records = []
    for values in worksheet[1:]:
        values += [""] * (len(expected) - len(values))
        if not any(str(value).strip() for value in values):
            continue
        row = dict(zip(expected, values))
        try:
            year, month = int(row["YEAR"]), int(row["MONTH"])
            value = float(str(row["ADV_TIME"]).replace(",", ""))
        except (TypeError, ValueError) as error:
            raise ValueError("DGTO row has an invalid period or ADV_TIME") from error
        if not (1 <= month <= 12) or not math.isfinite(value) or not row["ORIGIN_CN"] or not row["DISTRICT_CN"]:
            raise ValueError("DGTO row is incomplete")
        records.append({"period": f"{year}年{month}月", "origin": row["ORIGIN_CN"],
                        "district": row["DISTRICT_CN"], "value": value,
                        "notes": row["NOTES"]})
    keys = {(row["period"], row["origin"], row["district"]) for row in records}
    periods = sorted({row["period"] for row in records}, key=lambda value: tuple(map(int, re.findall(r"\d+", value))))
    if len(records) < 100 or len(keys) != len(records) or not periods:
        raise ValueError("DGTO row count or grouping is invalid")
    update_time = detail.get("info", {}).get("updateTime")
    payload = {"datasetId": DGTO_ID, "source": "澳門政府旅遊局／政府數據開放平台",
               "officialUrl": f"https://data.gov.mo/Detail?id={DGTO_ID}",
               "sourceFile": files[0]["fileName"], "sourceUpdated": update_time,
               "retrievedAt": checked_at, "periodStart": periods[0], "periodEnd": periods[-1],
               "unit": "分鐘", "worksheetRows": len(worksheet), "rows": records}
    output = DATA / "visitor_stay.json"
    old = json.loads(output.read_text(encoding="utf-8")) if output.exists() else None
    changed = old != payload
    if changed:
        output.write_text(json.dumps(payload, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    preview_path = DATA / "previews" / f"{DGTO_ID}.json"
    latest = [row for row in records if row["period"] == periods[-1]][:28]
    preview = {"files": [{"columns": ["YEAR", "MONTH", "ORIGIN_CN", "DISTRICT_CN", "ADV_TIME", "NOTES"],
                           "rows": [[*re.findall(r"\d+", row["period"]), row["origin"], row["district"], row["value"], row["notes"]] for row in latest],
                           "count": len(records), "previewOrder": "latest", "snapshotAt": checked_at,
                           "source": files[0]["fileName"]}]}
    preview_path.write_text(json.dumps(preview, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    catalog_path = DATA / "catalog.json"
    catalog = json.loads(catalog_path.read_text(encoding="utf-8"))
    dataset = next((item for item in catalog["datasets"] if item["id"] == DGTO_ID), None)
    if not dataset:
        raise ValueError("DGTO dataset is missing from catalog")
    dataset["updated"] = update_time
    catalog_path.write_text(json.dumps(catalog, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    return changed, len(records), periods[-1]


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
    checked_at = dt.datetime.now(MACAU).strftime("%Y-%m-%d %H:%M")
    if not args.only:
        dgto_changed, dgto_count, dgto_period = refresh_dgto(checked_at)
        print(f"DGTO visitor stay: {dgto_count} records through {dgto_period}, changed={dgto_changed}")
    key = os.environ.get("DATA_GOV_MO_API_KEY", "").strip()
    if not key:
        print("DSEC statistics skipped: DATA_GOV_MO_API_KEY is not configured")
        return
    sources = json.loads((DATA / "series_sources.json").read_text(encoding="utf-8"))
    index_path = DATA / "series_index.json"
    index = json.loads(index_path.read_text(encoding="utf-8"))
    by_id = {item["id"]: item for item in index}
    status_path = DATA / "series_status.json"
    status = json.loads(status_path.read_text(encoding="utf-8")) if status_path.exists() else {}
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
