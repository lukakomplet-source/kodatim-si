-- Stran Uporabniki bere profiles.full_name (ime ob e-naslovu); lokalna baza
-- je imela samo id/role/email, zato je stran padla s
-- "column profiles_1.full_name does not exist".
alter table profiles add column if not exists full_name text;
notify pgrst, 'reload schema';
