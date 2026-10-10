"""Data gates (D-042): compare freshly fetched snapshots with the committed ones before they ship.

- **Guards** restore a value that got worse (a text that became empty, markup, a disambiguation
  page, a raw Wikidata id or a fraction of what it was; a photo or country fact that vanished)
  from the committed baseline, and report it.
- **Blocks** refuse a refresh that lost too much (places per city, visa rules, countries) or needed
  too many restores (the source probably broke); a human looks at it first.

``python -m wayfarer_pipeline gate --base origin/main [--fix]`` — see ``run.run_gates``.
"""
