"""Read DSEC publication dates, never DSEC statistics values."""

import argparse
import datetime as dt
from html.parser import HTMLParser
import json
from pathlib import Path
import re
from urllib.request import Request, urlopen
from zoneinfo import ZoneInfo


SOURCE = "https://www.dsec.gov.mo/TimeTables.aspx?lang=zh-MO"
DEFAULT_OUTPUT = Path(__file__).resolve().parents[1] / "data/release_schedule.json"
MACAU = ZoneInfo("Asia/Macau")


class Rows(HTMLParser):
    def __init__(self):
        super().__init__()
        self.rows = []
        self.row = None
        self.cell = None

    def handle_starttag(self, tag, attrs):
        if tag == "tr":
            self.row = []
        elif tag == "td" and self.row is not None:
            self.cell = []

    def handle_data(self, data):
        if self.cell is not None:
            self.cell.append(data)

    def handle_endtag(self, tag):
        if tag == "td" and self.cell is not None and self.row is not None:
            self.row.append(re.sub(r"\s+", " ", "".join(self.cell)).strip())
            self.cell = None
        elif tag == "tr" and self.row is not None:
            self.rows.append(self.row)
            self.row = None


def parse_schedule(html, today):
    parser = Rows()
    parser.feed(html)
    events = []
    for row in parser.rows:
        for index, cell in enumerate(row[:-1]):
            if not re.fullmatch(r"\d{4}/\d{2}/\d{2}", cell):
                continue
            try:
                date = dt.date.fromisoformat(cell.replace("/", "-"))
            except ValueError:
                continue
            title = row[index + 1].strip()
            if title and today - dt.timedelta(days=7) <= date <= today + dt.timedelta(days=120):
                events.append({"date": date.isoformat(), "title": title})
            break
    events.sort(key=lambda item: (item["date"], item["title"]))
    if not events:
        raise ValueError("No relevant timetable rows found; previous schedule retained")
    return events


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--input", type=Path, help="Read saved HTML for testing")
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT)
    args = parser.parse_args()
    if args.input:
        html = args.input.read_text(encoding="utf-8")
    else:
        with urlopen(Request(SOURCE, headers={"User-Agent": "MacauDataMap/1.0"}), timeout=20) as response:
            html = response.read(2_000_001).decode("utf-8")
    now = dt.datetime.now(MACAU)
    payload = {"source": SOURCE, "checkedAt": now.strftime("%Y-%m-%d %H:%M"),
               "events": parse_schedule(html, now.date())}
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(payload, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    print(f"DSEC timetable: {len(payload['events'])} entries")


if __name__ == "__main__":
    main()
