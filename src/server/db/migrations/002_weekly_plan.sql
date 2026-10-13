CREATE TABLE planned_meal (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  week_start TEXT NOT NULL,
  day_of_week INTEGER NOT NULL CHECK (day_of_week BETWEEN 1 AND 7),
  meal_id INTEGER NOT NULL REFERENCES meals(id) ON DELETE CASCADE,
  servings INTEGER NOT NULL CHECK (servings BETWEEN 1 AND 20),
  UNIQUE (week_start, day_of_week),
  UNIQUE (week_start, meal_id)
);

CREATE TABLE shopping_tick (
  week_start TEXT NOT NULL,
  ingredient_key TEXT NOT NULL,
  unit_family TEXT NOT NULL CHECK (unit_family IN ('mass', 'volume', 'spoon', 'piece')),
  ticked_qty REAL NOT NULL,
  PRIMARY KEY (week_start, ingredient_key, unit_family)
);

CREATE TABLE app_setting (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
