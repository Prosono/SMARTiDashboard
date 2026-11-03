"""Derive a combined personal canvas without changing either legacy layout."""

from copy import deepcopy


def combined_layout(overview, history):
    layouts = [value for value in (overview, history) if value and value.get("items") is not None]
    if not layouts:
        return {"revision": 0, "items": None}
    items, seen = [], set()
    for layout in layouts:
        offset = max((item["y"] + item["h"] for item in items), default=0)
        for original in layout["items"]:
            item = deepcopy(original)
            if item["id"] in seen:
                if not item["id"].startswith("custom:"):
                    continue
                item["id"] = item["id"][:240] + ":history"
            item["y"] += offset
            items.append(item)
            seen.add(item["id"])
    if items:
        end = max(item["y"] + item["h"] for item in items)
        for x, name in enumerate(("capacity", "tariff", "price-hours")):
            items.append(
                {"id": f"energy:{name}", "x": x, "y": end, "w": 1, "h": 3 if name == "price-hours" else 2}
            )
    if len(items) > 300 or any(item["y"] + item["h"] > 2000 for item in items):
        return {
            "revision": 0,
            "items": None,
            "notice": "De tidligere oppsettene er beholdt. Et nytt energioppsett vises fordi de samlet overskrider størrelsesgrensen.",
        }
    return {"revision": 0, "items": items}
