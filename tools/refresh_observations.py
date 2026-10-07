"""Read two allowlisted public SMG feeds and preserve full, typed observations."""
import argparse
import datetime as dt
import json
from pathlib import Path
import urllib.request
import xml.etree.ElementTree as ET

SOURCES = {
    "air": "https://www.smg.gov.mo/smg/airQuality/latestAirConcentration.json",
    "weather": "https://xml.smg.gov.mo/c_actualweather.xml",
}
AIR_FIELDS = {"pm25": "HE_PM2_5", "pm10": "HE_PM10", "no2": "HE_NO2", "o3": "HE_O3"}
WEATHER_FIELDS = {"temperature": "Temperature/dValue", "humidity": "Humidity/dValue",
                  "wind": "WindSpeed/dValue", "dailyHigh": "Temperature_daily_max/dValue"}


def number(value):
    try:
        result = float(value)
        return result if -float("inf") < result < float("inf") else None
    except (TypeError, ValueError):
        return None


def fetch_source(kind):
    url = SOURCES[kind]
    request = urllib.request.Request(url, headers={"User-Agent": "MacauDataMap/1.0"})
    with urllib.request.urlopen(request, timeout=10) as response:
        raw = response.read(2_000_001)
    if len(raw) > 2_000_000:
        raise ValueError("Source response too large")
    if kind == "air":
        payload = json.loads(raw)
        source_at = payload.get("datetime")
        metrics = {metric: [] for metric in AIR_FIELDS}
        for station in payload.values():
            if not isinstance(station, dict) or not station.get("Chinese"):
                continue
            stamp = str(station.get("DDTT", ""))
            observed_at = (f"{stamp[:4]}-{stamp[4:6]}-{stamp[6:8]} {stamp[8:10]}時"
                           if len(stamp) == 10 and stamp.isdigit() else "來源未標示")
            for metric, field in AIR_FIELDS.items():
                value = number(station.get(field))
                if value is not None and value >= 0:
                    metrics[metric].append({"name": station["Chinese"], "value": value, "time": observed_at})
    else:
        root = ET.fromstring(raw)
        source_at = root.findtext(".//SysPubdate")
        metrics = {metric: [] for metric in WEATHER_FIELDS}
        for station in root.findall(".//station"):
            name = station.findtext("stationname")
            if not name:
                continue
            for metric, field in WEATHER_FIELDS.items():
                value = number(station.findtext(field))
                if value is not None and (metric == "temperature" or value >= 0):
                    metrics[metric].append({"name": name, "value": value,
                                            "time": station.findtext("RecordTime")})
    if not source_at or not any(metrics.values()):
        raise ValueError("Source has no valid observations or publication time")
    primary = "pm25" if kind == "air" else "temperature"
    return {"kind": kind, "sourceUrl": url, "sourceAt": source_at,
            "fetchedAt": dt.datetime.now(dt.timezone.utc).isoformat(),
            "metrics": metrics, "records": metrics[primary]}


def main():
    parser = argparse.ArgumentParser(description="Refresh verified public observations for static fallback")
    parser.add_argument("--source", choices=list(SOURCES))
    args = parser.parse_args()
    output = Path(__file__).resolve().parents[1] / "data/live"
    output.mkdir(parents=True, exist_ok=True)
    failed = False
    for kind in ([args.source] if args.source else SOURCES):
        try:
            payload = fetch_source(kind)
            temporary = output / (kind + ".tmp")
            temporary.write_text(json.dumps(payload, ensure_ascii=False), encoding="utf-8")
            temporary.replace(output / (kind + ".json"))
            print(kind, payload["sourceAt"], len(payload["records"]), "observations")
        except Exception as error:
            failed = True
            print(kind, "refresh failed; previous snapshot retained:", error)
    raise SystemExit(1 if failed else 0)


if __name__ == "__main__":
    main()
