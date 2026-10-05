from app.orders import open_count


def summary():
    return {"open": open_count()}
