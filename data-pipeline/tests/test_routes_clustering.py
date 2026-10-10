from routes_fakes import line_of_places, make_candidate

from wayfarer_pipeline.routes import clustering, geometry
from wayfarer_pipeline.routes.constants import (
    MAX_ROUTES_PER_CITY,
    ROUTE_MAX_STOPS,
    ROUTE_MAX_WALK_M,
    ROUTE_MIN_STOPS,
)


def test_a_compact_area_becomes_one_group_of_at_most_eight():
    groups = clustering.cluster(line_of_places(12))
    assert len(groups[0]) == ROUTE_MAX_STOPS
    assert all(ROUTE_MIN_STOPS <= len(g) <= ROUTE_MAX_STOPS for g in groups)


def test_groups_are_disjoint_and_walkable():
    far = [make_candidate(f"Q{100 + i}", 41.15 + i * 0.002, -8.61) for i in range(5)]
    groups = clustering.cluster([*line_of_places(6), *far])
    qids = [c.qid for g in groups for c in g]
    assert len(qids) == len(set(qids))
    assert len(groups) == 2
    for group in groups:
        assert geometry.path_m(group) <= ROUTE_MAX_WALK_M


def test_places_too_far_apart_never_share_a_group():
    scattered = [make_candidate(f"Q{i}", 38.0 + i * 0.5, -9.0) for i in range(6)]
    assert clustering.cluster(scattered) == []


def test_best_group_comes_first_and_the_count_is_capped():
    quiet = [make_candidate(f"Q{50 + i}", 41.15 + i * 0.002, -8.61, popularity=5) for i in range(4)]
    groups = clustering.cluster([*quiet, *line_of_places(4)])
    assert groups[0][0].popularity > 50
    many = [
        make_candidate(f"Q{k}0{i}", 10.0 + k, 20.0 + i * 0.002)
        for k in range(MAX_ROUTES_PER_CITY + 4)
        for i in range(4)
    ]
    assert len(clustering.cluster(many)) == MAX_ROUTES_PER_CITY


def test_clustering_is_deterministic():
    pool = line_of_places(10)
    assert clustering.cluster(pool) == clustering.cluster(list(reversed(pool)))
