-- orders and the original total
CREATE TABLE orders (id int primary key, status text not null);

CREATE OR REPLACE FUNCTION order_total(p_id int) RETURNS int AS $$
  SELECT count(*) FROM orders WHERE id = p_id AND status <> 'void';
$$ LANGUAGE sql;

CREATE FUNCTION old_fn() RETURNS int AS $$ SELECT 1 FROM orders $$ LANGUAGE sql;
