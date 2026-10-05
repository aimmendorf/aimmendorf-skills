from app.db import query


def open_count():
    return query("select count(*) from orders where status = 'open'")
