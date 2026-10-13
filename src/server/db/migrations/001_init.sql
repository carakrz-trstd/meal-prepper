CREATE TABLE meals (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL CHECK (length(trim(name)) > 0),
  base_servings INTEGER NOT NULL CHECK (base_servings >= 1),
  calories_per_serving REAL NULL CHECK (calories_per_serving IS NULL OR calories_per_serving >= 0),
  calories_estimated INTEGER NOT NULL DEFAULT 0 CHECK (calories_estimated IN (0, 1)),
  total_cost_eur REAL NULL CHECK (total_cost_eur IS NULL OR total_cost_eur >= 0),
  cost_estimated INTEGER NOT NULL DEFAULT 0 CHECK (cost_estimated IN (0, 1)),
  prep_minutes INTEGER NOT NULL DEFAULT 0 CHECK (prep_minutes >= 0),
  cook_minutes INTEGER NOT NULL CHECK (cook_minutes >= 1),
  is_favourite INTEGER NOT NULL DEFAULT 0 CHECK (is_favourite IN (0, 1)),
  source_url TEXT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE ingredients (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  meal_id INTEGER NOT NULL REFERENCES meals(id) ON DELETE CASCADE,
  position INTEGER NOT NULL,
  name TEXT NOT NULL,
  name_key TEXT NOT NULL,
  quantity REAL NOT NULL CHECK (quantity > 0),
  unit TEXT NOT NULL CHECK (unit IN ('g', 'kg', 'ml', 'l', 'tsp', 'tbsp', 'piece'))
);

CREATE INDEX idx_ingredients_meal_id ON ingredients(meal_id);
CREATE INDEX idx_ingredients_name_key ON ingredients(name_key);
CREATE INDEX idx_meals_lower_name ON meals(lower(name));
