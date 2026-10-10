from routes_fakes import attraction_json

from wayfarer_pipeline.routes import candidates


def test_keeps_historic_categories_ranked_by_popularity():
    doc = {
        "attractions": [
            attraction_json("Q1", 1, 1, category="church", popularity=40),
            attraction_json("Q2", 1, 1, category="castle", popularity=90),
            attraction_json("Q3", 1, 1, category="park", popularity=99),
            attraction_json("Q4", 1, 1, category="other", popularity=80),
            attraction_json("Q5", 1, 1, category="viewpoint", popularity=40),
        ]
    }
    picked = candidates.select_candidates(doc)
    assert [c.qid for c in picked] == ["Q2", "Q1", "Q5"]  # ties broken by wikidata id


def test_unesco_sites_stay_whatever_their_category():
    doc = {"attractions": [attraction_json("Q9", 1, 1, category="nature", is_unesco=True)]}
    assert [c.qid for c in candidates.select_candidates(doc)] == ["Q9"]


def test_caps_the_pool_at_the_most_popular_places():
    items = [attraction_json(f"Q{i}", 1, 1, popularity=i % 100) for i in range(1, 200)]
    picked = candidates.select_candidates({"attractions": items})
    assert len(picked) == candidates.MAX_CANDIDATES
    assert picked[0].popularity >= picked[-1].popularity


def test_keeps_name_and_visit_time():
    doc = {"attractions": [attraction_json("Q1", 1.5, 2.5, name_pt="Sé", avg_visit_minutes=45)]}
    only = candidates.select_candidates(doc)[0]
    assert (only.name_pt, only.avg_visit_minutes, only.lat, only.lng) == ("Sé", 45, 1.5, 2.5)
