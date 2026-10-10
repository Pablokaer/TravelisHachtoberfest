"""Wikipedia Pageviews REST API: 12 complete months of views per article (en + pt)."""

from __future__ import annotations

import datetime as dt
import json
from concurrent.futures import ThreadPoolExecutor
from urllib.parse import quote

from ..http import HttpClient

BASE = "https://wikimedia.org/api/rest_v1/metrics/pageviews/per-article"


def month_range(today: dt.date, months: int = 12) -> tuple[str, str]:
    """Last ``months`` complete months before ``today`` as API timestamps (YYYYMMDD00)."""
    first_this_month = today.replace(day=1)
    end = first_this_month - dt.timedelta(days=1)  # last day of previous month
    year, month = end.year, end.month - (months - 1)
    while month <= 0:
        month += 12
        year -= 1
    start = dt.date(year, month, 1)
    return start.strftime("%Y%m%d00"), end.strftime("%Y%m%d00")


def article_url(project: str, title: str, start: str, end: str) -> str:
    encoded = quote(title.replace(" ", "_"), safe="")
    return f"{BASE}/{project}/all-access/user/{encoded}/monthly/{start}/{end}"


def views(client: HttpClient, project: str, title: str, start: str, end: str) -> int:
    status, text = client.request(
        "GET",
        article_url(project, title, start, end),
        namespace="pageviews",
        cache_statuses=(200, 404),
    )
    if status != 200:
        return 0
    return sum(int(i.get("views", 0)) for i in json.loads(text).get("items", []))


def total_views(
    client: HttpClient,
    articles: dict[str, tuple[str | None, str | None]],
    start: str,
    end: str,
    workers: int = 4,
) -> dict[str, int]:
    """``{qid: (enwiki title, ptwiki title)}`` → ``{qid: en views + pt views}``."""
    jobs = []
    for qid, (en, pt) in sorted(articles.items()):
        if en:
            jobs.append((qid, "en.wikipedia", en))
        if pt:
            jobs.append((qid, "pt.wikipedia", pt))
    totals = {qid: 0 for qid in articles}
    with ThreadPoolExecutor(max_workers=workers) as pool:
        results = pool.map(lambda j: (j[0], views(client, j[1], j[2], start, end)), jobs)
        for qid, n in results:
            totals[qid] += n
    return totals
