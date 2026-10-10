import pytest
from routes_fakes import line_of_places, make_candidate

from wayfarer_pipeline.routes import geometry, ordering


def test_leg_is_straight_line_times_the_detour_factor():
    a, b = make_candidate("Q1", 0.0, 0.0), make_candidate("Q2", 0.0, 0.01)
    straight = geometry.haversine_m(a.lat, a.lng, b.lat, b.lng)
    assert straight == pytest.approx(1111.95, abs=1)
    assert geometry.leg_m(a, b) == pytest.approx(straight * 1.3)


def test_path_length_sums_legs_and_is_zero_for_one_place():
    places = line_of_places(3)
    assert geometry.path_m(places[:1]) == 0
    expected = geometry.leg_m(places[0], places[1]) + geometry.leg_m(places[1], places[2])
    assert geometry.path_m(places) == pytest.approx(expected)


def test_walking_seconds_uses_the_app_walking_speed():
    assert geometry.walking_seconds(1250) == 1000  # 1.25 m/s, as packages/shared constants


def test_order_for_shortest_walk_untangles_a_shuffled_line():
    line = line_of_places(6)
    shuffled = [line[i] for i in (3, 0, 5, 1, 4, 2)]
    ordered = ordering.order_for_shortest_walk(shuffled)
    assert [p.qid for p in ordered] in ([p.qid for p in line], [p.qid for p in reversed(line)])


def test_order_is_deterministic_and_keeps_every_place():
    line = line_of_places(5)
    first = ordering.order_for_shortest_walk(line)
    assert first == ordering.order_for_shortest_walk(list(reversed(line)))
    assert sorted(p.qid for p in first) == sorted(p.qid for p in line)


def test_order_refuses_more_places_than_a_route_holds():
    with pytest.raises(ValueError, match="at most 8"):
        ordering.order_for_shortest_walk(line_of_places(9))
