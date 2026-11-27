-- Профиль сотрудника: дата рождения, отдел, должность, о себе
-- ФИО хранится в уже существующем поле name
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS birth_date DATE,
  ADD COLUMN IF NOT EXISTS department VARCHAR(50),
  ADD COLUMN IF NOT EXISTS position VARCHAR(100),
  ADD COLUMN IF NOT EXISTS about TEXT;