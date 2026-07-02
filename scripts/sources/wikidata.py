"""Wikidata enrichment for company profiles (keyless).

Resolves a QID from the company name (wbsearchentities) unless an explicit qid is given,
then reads a few profile fields from the EntityData JSON. Wikidata data is profile "chrome"
(founding year, employees, website, ISIN, Wikipedia link) — never a screener metric.
A descriptive User-Agent is mandatory or Wikidata blocks the request.
"""
import time

import requests

API = "https://www.wikidata.org/w/api.php"
ENTITY = "https://www.wikidata.org/wiki/Special:EntityData/{qid}.json"
UA = "ep-americas-screener/0.1 (contacto@example.com)"


def _session() -> requests.Session:
    s = requests.Session()
    s.headers.update({"User-Agent": UA, "Accept-Encoding": "gzip, deflate"})
    return s


def _get(session, url, params=None, tries=3):
    for a in range(tries):
        try:
            r = session.get(url, params=params, timeout=30)
            if r.status_code == 200:
                return r.json()
            if r.status_code == 429:
                time.sleep(2 ** a)
                continue
            return None
        except requests.RequestException:
            time.sleep(2 ** a)
    return None


def resolve_qid(session, name):
    d = _get(session, API, params={
        "action": "wbsearchentities", "search": name, "language": "en",
        "type": "item", "limit": 1, "format": "json",
    })
    hits = (d or {}).get("search", [])
    return hits[0]["id"] if hits else None


def _claim(claims, pid):
    arr = claims.get(pid)
    if not arr:
        return None
    try:
        return arr[0]["mainsnak"]["datavalue"]["value"]
    except (KeyError, IndexError, TypeError):
        return None


def fetch_entity(session, qid):
    d = _get(session, ENTITY.format(qid=qid))
    ent = (d or {}).get("entities", {}).get(qid)
    if not ent:
        return None
    claims = ent.get("claims", {})
    out = {"qid": qid}

    t = _claim(claims, "P571")  # inception (time)
    if isinstance(t, dict) and t.get("time"):
        try:
            out["founded"] = int(t["time"][1:5])
        except ValueError:
            pass
    emp = _claim(claims, "P1128")  # employees (quantity)
    if isinstance(emp, dict) and emp.get("amount"):
        try:
            out["employees"] = int(float(emp["amount"]))
        except ValueError:
            pass
    web = _claim(claims, "P856")  # official website
    if isinstance(web, str):
        out["website"] = web
    isin = _claim(claims, "P946")  # ISIN
    if isinstance(isin, str):
        out["isin"] = isin

    lbl = ent.get("labels", {}).get("en", {}).get("value")
    if lbl:
        out["label"] = lbl
    wiki = ent.get("sitelinks", {}).get("enwiki", {}).get("title")
    if wiki:
        out["wikipedia"] = "https://en.wikipedia.org/wiki/" + wiki.replace(" ", "_")
    return out


def fetch_profile(session, name, qid=None):
    """Return a small profile dict for a company, or None."""
    if not qid:
        qid = resolve_qid(session, name)
        if not qid:
            return None
    return fetch_entity(session, qid)


def polite_sleep():
    time.sleep(0.1)
