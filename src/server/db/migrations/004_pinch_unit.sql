-- Adds the unit "pinch" (a new, separate unit family). SQLite cannot change a CHECK constraint in place, so the two
-- tables that list the units are rebuilt; all rows are copied unchanged.

CREATE TABLE ingredients_new (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  meal_id INTEGER NOT NULL REFERENCES meals(id) ON DELETE CASCADE,
  position INTEGER NOT NULL,
  name TEXT NOT NULL,
  name_key TEXT NOT NULL,
  quantity REAL NOT NULL CHECK (quantity > 0),
  unit TEXT NOT NULL CHECK (unit IN ('g', 'kg', 'ml', 'l', 'tsp', 'tbsp', 'piece', 'pinch'))
);

INSERT INTO ingredients_new (id, meal_id, position, name, name_key, quantity, unit)
  SELECT id, meal_id, position, name, name_key, quantity, unit FROM ingredients;

DROP TABLE ingredients;
ALTER TABLE ingredients_new RENAME TO ingredients;
CREATE INDEX idx_ingredients_meal_id ON ingredients(meal_id);
CREATE INDEX idx_ingredients_name_key ON ingredients(name_key);

CREATE TABLE shopping_tick_new (
  week_start TEXT NOT NULL,
  ingredient_key TEXT NOT NULL,
  unit_family TEXT NOT NULL CHECK (unit_family IN ('mass', 'volume', 'spoon', 'piece', 'pinch')),
  ticked_qty REAL NOT NULL,
  PRIMARY KEY (week_start, ingredient_key, unit_family)
);

INSERT INTO shopping_tick_new (week_start, ingredient_key, unit_family, ticked_qty)
  SELECT week_start, ingredient_key, unit_family, ticked_qty FROM shopping_tick;

DROP TABLE shopping_tick;
ALTER TABLE shopping_tick_new RENAME TO shopping_tick;
