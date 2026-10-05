-- order_total no longer reads status
CREATE OR REPLACE FUNCTION order_total(p_id int) RETURNS int AS $$
  SELECT count(*) FROM orders WHERE id = p_id;
$$ LANGUAGE sql;

CREATE VIEW open_orders AS SELECT * FROM orders WHERE status = 'open';

CREATE POLICY orders_owner ON orders USING (true);

DROP FUNCTION old_fn;
