"""
DealsDash — National Area Screener: monthly data build
=======================================================
Downloads open government datasets, aggregates them to local-authority level
(whole UK) and postcode-district level (England & Wales only), and writes a
single static JSON file that the Screener tab reads at runtime.

Run monthly (after the UK HPI / PIPR releases, mid-month), then deploy as usual:
    python scripts/build_screener.py --out public/data/screener.json
    .\\update-dealsdash.bat

Sources (all Open Government Licence v3.0):
  - HM Land Registry Price Paid Data (England & Wales, address-level sales)
  - UK House Price Index full file (all UK local authorities, mix-adjusted)
  - ONS Price Index of Private Rents (PIPR) monthly price statistics

Design notes:
  - Scoring is NOT done here. This script only produces raw metrics; the app
    applies user-editable weights and the max-entry-price filter, so changing
    a weight never needs a rebuild.
  - Only public, aggregated statistics are written. No personal data, no
    secrets, no API keys are used or emitted.
"""

import argparse
import json
import re
import sys
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

import duckdb  # fast columnar SQL over multi-GB CSVs without loading into RAM
import pandas as pd

# ---------------------------------------------------------------------------
# Source locations (verified 3 Oct 2026). Price Paid uses the HTTPS host —
# the older S3 "website" URLs are HTTP-only and open to tampering in transit.
# ---------------------------------------------------------------------------
PPD_URL = "https://price-paid-data.publicdata.landregistry.gov.uk/pp-{year}.csv"
HPI_URL = "https://publicdata.landregistry.gov.uk/market-trend-data/house-price-index-data/UK-HPI-full-file-{yyyy_mm}.csv"
PIPR_PAGE = "https://www.ons.gov.uk/economy/inflationandpriceindices/datasets/priceindexofprivaterentsukmonthlypricestatistics"

# ONS rejects requests without a browser-like User-Agent.
UA = {"User-Agent": "Mozilla/5.0 (DealsDash screener build)"}

# Allow-list of hosts this script may download from (defence against a
# tampered page link redirecting the build to an arbitrary host).
# Largest legitimate file is a full year of Price Paid (~170 MB in 2025).
MAX_DOWNLOAD_BYTES = 1_000_000_000

ALLOWED_HOSTS = ("publicdata.landregistry.gov.uk", "price-paid-data.publicdata.landregistry.gov.uk", "www.ons.gov.uk")

# ---------------------------------------------------------------------------
# Scotland: PIPR publishes Scottish rents by Broad Rental Market Area (S33),
# not by council (S12). This maps each HPI council name to its BRMA.
# UNVERIFIED APPROXIMATION — built by name, not from an official lookup.
# BRMA and council boundaries do not align exactly (e.g. Moray). Replace with
# the Scottish Government BRMA–council lookup when sourced.
# ---------------------------------------------------------------------------
SCOT_LA_TO_BRMA = {
    "City of Aberdeen": "Aberdeen and Shire", "Aberdeenshire": "Aberdeen and Shire",
    "Moray": "Aberdeen and Shire",  # least certain mapping — verify
    "Argyll and Bute": "Argyll and Bute",
    "East Ayrshire": "Ayrshires", "North Ayrshire": "Ayrshires", "South Ayrshire": "Ayrshires",
    "Dumfries and Galloway": "Dumfries and Galloway",
    "City of Dundee": "Dundee and Angus", "Angus": "Dundee and Angus",
    "East Dunbartonshire": "East Dunbartonshire",
    "Fife": "Fife",
    "Clackmannanshire": "Forth Valley", "Falkirk": "Forth Valley", "Stirling": "Forth Valley",
    "City of Glasgow": "Greater Glasgow", "East Renfrewshire": "Greater Glasgow",
    "Highland": "Highland and Islands", "Na h-Eileanan Siar": "Highland and Islands",
    "Orkney Islands": "Highland and Islands", "Shetland Islands": "Highland and Islands",
    "City of Edinburgh": "Lothian", "East Lothian": "Lothian", "Midlothian": "Lothian",
    "North Lanarkshire": "North Lanarkshire",
    "Perth and Kinross": "Perth and Kinross",
    "Renfrewshire": "Renfrewshire/Inverclyde", "Inverclyde": "Renfrewshire/Inverclyde",
    "Scottish Borders": "Scottish Borders",
    "South Lanarkshire": "South Lanarkshire",
    "West Dunbartonshire": "West Dunbartonshire",
    "West Lothian": "West Lothian",
}

# Local-authority code prefixes we keep (E=England, W=Wales, S=Scotland, N=NI).
LA_PREFIXES = ("E06", "E07", "E08", "E09", "W06", "S12", "N09")
NATION = {"E": "England", "W": "Wales", "S": "Scotland", "N": "Northern Ireland"}


def fetch(url: str, dest: Path) -> Path:
    """Download url to dest unless already cached. Enforces the host allow-list."""
    host = re.sub(r"^https?://([^/]+)/.*$", r"\1", url)
    if not url.startswith("https://"):
        raise ValueError(f"Refusing non-HTTPS download: {url}")
    if host not in ALLOWED_HOSTS:
        raise ValueError(f"Refusing to download from non-allow-listed host: {host}")
    if dest.exists() and dest.stat().st_size > 0:
        return dest  # cache hit: re-runs within the month don't re-download
    print(f"  downloading {url}")
    req = urllib.request.Request(url, headers=UA)
    tmp = dest.with_suffix(dest.suffix + ".part")  # never leave a half file in the cache
    with urllib.request.urlopen(req, timeout=300) as r:
        # urllib follows redirects silently — re-check the FINAL host too.
        final_host = re.sub(r"^https?://([^/]+)/.*$", r"\1", r.geturl())
        if final_host not in ALLOWED_HOSTS:
            raise ValueError(f"Redirected to non-allow-listed host: {final_host}")
        written = 0
        with open(tmp, "wb") as f:
            while chunk := r.read(1 << 20):  # stream in 1 MB chunks
                written += len(chunk)
                if written > MAX_DOWNLOAD_BYTES:  # guard against runaway/hostile responses
                    raise ValueError(f"Download exceeded {MAX_DOWNLOAD_BYTES} bytes: {url}")
                f.write(chunk)
    tmp.replace(dest)  # atomic move once complete
    return dest


def latest_hpi(cache: Path) -> tuple[Path, str]:
    """UK HPI full files are named by reference month and published ~2 months
    in arrears. Walk back from the current month until one exists."""
    now = datetime.now()
    for back in range(1, 7):
        y, m = now.year, now.month - back
        while m < 1:
            y, m = y - 1, m + 12
        tag = f"{y}-{m:02d}"
        try:
            return fetch(HPI_URL.format(yyyy_mm=tag), cache / f"hpi-{tag}.csv"), tag
        except Exception:
            continue  # not published yet — try the previous month
    raise RuntimeError("No UK HPI full file found in the last 6 months")


def latest_pipr(cache: Path) -> tuple[Path, str]:
    """ONS file names change between releases (e.g. '...statistics13.xlsx'),
    so scrape the dataset page and pick the newest dated link."""
    req = urllib.request.Request(PIPR_PAGE, headers=UA)
    html = urllib.request.urlopen(req, timeout=60).read().decode("utf-8", "ignore")
    links = set(re.findall(r'/file\?uri=(/economy/[^"]+?\.xlsx)', html))

    def release_date(link: str) -> datetime:
        # Folder segment looks like '16september2026'
        seg = re.search(r"/(\d{1,2}[a-z]+\d{4})/", link)
        return datetime.strptime(seg.group(1), "%d%B%Y") if seg else datetime.min

    newest = max(links, key=release_date)
    tag = release_date(newest).strftime("%Y-%m-%d")
    url = "https://www.ons.gov.uk/file?uri=" + newest
    return fetch(url, cache / f"pipr-{tag}.xlsx"), tag


def build_areas(hpi_path: Path, pipr_path: Path) -> list[dict]:
    """Local-authority metrics for the whole UK: prices, growth, liquidity,
    rents and gross yields for terraced and semi-detached stock."""
    hpi = pd.read_csv(hpi_path, low_memory=False)
    hpi["Date"] = pd.to_datetime(hpi["Date"], dayfirst=True)
    hpi = hpi[hpi["AreaCode"].astype(str).str.startswith(LA_PREFIXES)]
    latest = hpi["Date"].max()

    # Rents: PIPR Table 1 (header is on row 3). '[x]' = suppressed value.
    pipr = pd.read_excel(pipr_path, sheet_name="Table 1", header=2)
    pipr = pipr.replace({"[x]": None, "[z]": None})
    pipr_latest = pipr["Time period"].max()
    pl = pipr[pipr["Time period"] == pipr_latest].set_index("Area name")
    pipr_by_code = pipr[pipr["Time period"] == pipr_latest].set_index("Area code")

    out = []
    for code, g in hpi.groupby("AreaCode"):
        g = g.sort_values("Date")
        cur = g.iloc[-1]
        name = cur["RegionName"]

        def back(months: int, col: str):
            """Value of col `months` before the latest observation, if present."""
            row = g[g["Date"] == latest - pd.DateOffset(months=months)]
            return float(row[col].iloc[0]) if len(row) and pd.notna(row[col].iloc[0]) else None

        # Sales volume lags the price series by ~2 months, so sum the latest
        # 12 months that actually have a volume figure.
        vol = g.dropna(subset=["SalesVolume"]).tail(12)

        # Rent lookup: E/W by council code; Scotland via BRMA name; NI unavailable.
        rent_src, rent_row = None, None
        if code.startswith(("E", "W")) and code in pipr_by_code.index:
            rent_row, rent_src = pipr_by_code.loc[code], "LA"
        elif code.startswith("S") and SCOT_LA_TO_BRMA.get(name) in pl.index:
            brma = SCOT_LA_TO_BRMA[name]
            rent_row, rent_src = pl.loc[brma], f"BRMA:{brma}"

        def rent(col):
            v = None if rent_row is None else rent_row.get(col)
            return float(v) if v is not None and pd.notna(v) else None

        def gy(r, p):
            """Gross yield = annual rent / price. None if either is missing."""
            return round(r * 12 / p, 4) if r and p else None

        price_t, price_s = cur.get("TerracedPrice"), cur.get("SemiDetachedPrice")
        rent_t, rent_s = rent("Rental price terraced"), rent("Rental price semidetached")
        out.append({
            "code": code,
            "name": name,
            "nation": NATION[code[0]],
            "priceAll": round(float(cur["AveragePrice"])),  # fallback where type prices are absent (NI)
            "priceT": None if pd.isna(price_t) else round(float(price_t)),
            "priceS": None if pd.isna(price_s) else round(float(price_s)),
            "growth12T": None if pd.isna(cur.get("Terraced12m%Change")) else float(cur["Terraced12m%Change"]),
            "growth12S": None if pd.isna(cur.get("SemiDetached12m%Change")) else float(cur["SemiDetached12m%Change"]),
            # 5-year growth from the index (captures cycle position, not just last year)
            "growth60T": (lambda b: round((cur["TerracedIndex"] / b - 1) * 100, 1) if b else None)(back(60, "TerracedIndex")),
            "sales12m": int(vol["SalesVolume"].sum()) if len(vol) else None,
            "salesThrough": vol["Date"].max().strftime("%Y-%m") if len(vol) else None,
            "rentT": rent_t, "rentS": rent_s,
            "rentGrowth12": rent("Annual change"),
            "rentSource": rent_src,  # None => BRRR score cannot be computed (e.g. NI)
            "yieldT": gy(rent_t, price_t), "yieldS": gy(rent_s, price_s),
        })

    # Integrity checks — fail loudly rather than ship a silently partial file.
    scot = [a for a in out if a["nation"] == "Scotland"]
    unmapped = [a["name"] for a in scot if a["rentSource"] is None]
    if unmapped:
        sys.exit(f"Scottish councils with no BRMA mapping: {unmapped}")
    print(f"  areas: {len(out)} (HPI {latest:%Y-%m}, PIPR {pipr_latest:%Y-%m})")
    return out, latest.strftime("%Y-%m"), pipr_latest.strftime("%Y-%m")


def build_districts(ppd_files: list[Path], areas: list[dict]) -> list[dict]:
    """England & Wales postcode-district drill-down from Price Paid Data:
    median prices, sales counts, and observed flip activity (repeat sales)."""
    files = ", ".join(f"'{p.as_posix()}'" for p in ppd_files)
    con = duckdb.connect()
    # PPD has no header; columns are fixed by Land Registry's published spec.
    con.execute(f"""
        CREATE TABLE ppd AS
        SELECT column01::INTEGER AS price, column02::DATE AS dt, column03 AS postcode,
               column04 AS ptype, column07 AS paon, column08 AS saon, column09 AS street,
               upper(column12) AS la_name, column14 AS cat, column15 AS status
        FROM read_csv([{files}], header=false, all_varchar=true)
    """)
    # Apply Land Registry change records: keep only the latest status per
    # transaction and drop deletions ('D'). Category 'A' = standard market sales
    # (excludes repossessions, buy-to-let portfolio and non-arm's-length sales).
    con.execute("""
        CREATE TABLE sales AS
        SELECT *, split_part(postcode, ' ', 1) AS outcode,
               concat_ws('|', postcode, paon, coalesce(saon,''), coalesce(street,'')) AS addr
        FROM ppd
        WHERE cat IN ('A','B') AND status <> 'D' AND ptype IN ('T','S') AND postcode IS NOT NULL
    """)
    # Category B is kept ONLY for the purchase leg of flip detection: investor
    # buys via companies and repossession purchases are recorded as B. All
    # price/volume statistics below use category A (open-market sales) only.
    max_dt = con.execute("SELECT max(dt) FROM sales").fetchone()[0]

    # Medians and volumes over the trailing 24 months.
    stats = con.execute(f"""
        SELECT outcode, ptype, any_value(la_name) AS la_name,
               median(price)::INTEGER AS median_price, count(*) AS sales
        FROM sales WHERE cat = 'A' AND dt > DATE '{max_dt}' - INTERVAL 24 MONTH
        GROUP BY outcode, ptype
    """).df()

    # Flip evidence: the same address sold twice 3–24 months apart with a
    # gain of 15%+. This is the footprint of a completed buy-refurb-sell.
    flips = con.execute("""
        WITH s AS (
          SELECT addr, outcode, ptype, dt, price, cat,
                 lag(dt) OVER w AS prev_dt, lag(price) OVER w AS prev_price
          FROM sales WINDOW w AS (PARTITION BY addr ORDER BY dt)
        )
        SELECT outcode, ptype, count(*) AS flips,
               round(median(price::DOUBLE / prev_price - 1) * 100, 1) AS flip_uplift_pct,
               median(price - prev_price)::INTEGER AS flip_gain_gbp
        FROM s
        WHERE prev_dt IS NOT NULL
          AND cat = 'A'  -- the resale must be an open-market sale
          AND date_diff('day', prev_dt, dt) BETWEEN 90 AND 730
          AND price >= prev_price * 1.15
        GROUP BY outcode, ptype
    """).df()

    d = stats.merge(flips, on=["outcode", "ptype"], how="left")
    d[["flips"]] = d[["flips"]].fillna(0).astype(int)

    # Link districts to council codes by name (PPD only carries names).
    # Normalise case/punctuation/whitespace (HPI has trailing spaces and
    # commas differ), then patch the known spelling differences.
    def norm(s: str) -> str:
        return re.sub(r"[^A-Z]", "", str(s).upper())
    aliases = {  # PPD spelling -> HPI spelling (normalised); verified Oct 2026
        "RHONDDACYNONTAFF": "RHONDDACYNONTAF",
        "THEVALEOFGLAMORGAN": "VALEOFGLAMORGAN",
        "WREKIN": "TELFORDANDWREKIN",
        "ISLESOFSCILLY": "CORNWALL",  # HPI reports Scilly within Cornwall
    }
    name_to_code = {norm(a["name"]): a["code"] for a in areas}
    d["la_code"] = d["la_name"].map(lambda n: name_to_code.get(aliases.get(norm(n), norm(n))))
    miss = sorted(d.loc[d["la_code"].isna(), "la_name"].dropna().unique())
    if miss:
        print(f"  WARNING: {len(miss)} PPD council names unmatched to HPI: {miss[:10]}")

    print(f"  districts: {len(d)} rows (PPD through {max_dt})")
    d = d.drop(columns=["la_name"]).astype(object).where(pd.notna(d.drop(columns=["la_name"])), None)
    return d.to_dict("records"), str(max_dt)


def main():
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[1])
    ap.add_argument("--out", type=Path, default=Path("public/data/screener.json"))
    ap.add_argument("--cache", type=Path, default=Path(".screener-cache"))  # gitignored
    ap.add_argument("--ppd-years", type=int, default=3, help="years of Price Paid to load")
    args = ap.parse_args()
    args.cache.mkdir(exist_ok=True)

    print("Fetching sources…")
    hpi_path, _ = latest_hpi(args.cache)
    pipr_path, pipr_rel = latest_pipr(args.cache)
    this_year = datetime.now().year
    ppd = [fetch(PPD_URL.format(year=y), args.cache / f"pp-{y}.csv")
           for y in range(this_year - args.ppd_years + 1, this_year + 1)]

    print("Building…")
    areas, hpi_ref, pipr_ref = build_areas(hpi_path, pipr_path)
    districts, ppd_ref = build_districts(ppd, areas)

    payload = {
        "meta": {
            "built": datetime.now(timezone.utc).isoformat(timespec="seconds"),
            "hpiThrough": hpi_ref, "piprThrough": pipr_ref, "piprRelease": pipr_rel,
            "ppdThrough": ppd_ref,
            "notes": [
                "Rents and prices are area averages, not deal-level values — use for screening only.",
                "Scottish rents are Broad Rental Market Area figures mapped to councils by name (unverified).",
                "Northern Ireland rents are suppressed in PIPR; BRRR scores unavailable for NI.",
                "District drill-down and flip evidence cover England & Wales only.",
            ],
            "licence": "Contains HM Land Registry and ONS data © Crown copyright, OGL v3.0",
        },
        "areas": areas,
        "districts": districts,
    }
    args.out.parent.mkdir(parents=True, exist_ok=True)
    args.out.write_text(json.dumps(payload, separators=(",", ":")))
    print(f"Wrote {args.out} ({args.out.stat().st_size/1e6:.1f} MB)")


if __name__ == "__main__":
    main()
