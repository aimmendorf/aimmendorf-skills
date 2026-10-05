from app.orders import open_count


def test_open_count():
    assert open_count() >= 0
