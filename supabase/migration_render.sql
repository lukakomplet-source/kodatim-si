-- Vrsta nalog za lokalni render (kodatim.si/render) — LOKALNA baza (avtonet-db).
--
-- Stran naloge samo vpise in prikaze; racuna jih worker-render na tem racunalniku
-- (RTX 3060). Vrsta je v bazi in ne v pomnilniku, ker se delavec vmes ustavi
-- (nadzornik, izpad elektrike) in mora nadaljevati tam, kjer je ostal.
--
-- Kopija te datoteke je v C:\Users\lukak\avtonet-db\initdb\44-render.sql, da jo
-- dobi tudi na novo postavljena baza.

create table if not exists public.render_naloge (
  id          bigserial primary key,
  -- obnova | nekoc_danes | paralaksa (faza 1); nove vrste pridejo z novimi fazami
  vrsta       text not null check (vrsta in ('obnova', 'nekoc_danes', 'paralaksa')),
  -- caka -> tece -> koncano | napaka | preklicano
  -- rabi_tocke: samodejna poravnava stare in nove slike ni uspela; clovek v
  -- adminu oznaci 4 pare tock in naloga gre nazaj v 'caka'.
  status      text not null default 'caka'
              check (status in ('caka', 'tece', 'rabi_tocke', 'koncano', 'napaka', 'preklicano')),
  naziv       text,
  -- [{ "pot": "vhod/<paket>/<ime>", "ime": "...", "vloga": "staro|danes|slika", "velikost": 123 }]
  -- Poti so relativne na D:\kodatim-render. Izvirniki se nikoli ne spreminjajo.
  vhod        jsonb not null default '[]'::jsonb,
  parametri   jsonb not null default '{}'::jsonb,
  napredek    smallint not null default 0 check (napredek between 0 and 100),
  faza        text,
  -- { "datoteke": [{ "pot", "vrsta", "opis", "ai" }], "meritve": { ... } }
  rezultat    jsonb,
  napaka      text,
  poskusi     integer not null default 0,

  -- Izvor in objava. Stare fotografije so last ustanov (knjiznice, muzeji):
  -- javno se sme pokazati samo izdelek z navedenim virom, ustanovo in licenco.
  -- Pravilo je v bazi in ne samo v gumbu, da ga ne obide noben drug klic.
  vir         text,
  vir_url     text,
  ustanova    text,
  licenca     text,
  objavljeno  boolean not null default false,
  constraint render_objava_zahteva_vir check (
    not objavljeno or (
      coalesce(btrim(vir), '') <> '' and
      coalesce(btrim(ustanova), '') <> '' and
      coalesce(btrim(licenca), '') <> ''
    )
  ),

  ustvarjeno  timestamptz not null default now(),
  zacetek     timestamptz,
  konec       timestamptz,
  posodobljeno timestamptz not null default now()
);

create index if not exists render_naloge_status_idx on public.render_naloge (status, id);
create index if not exists render_naloge_objavljeno_idx on public.render_naloge (objavljeno) where objavljeno;

-- Baza je prek tunela dosegljiva z interneta (avtonet-db.kodatim.si), privzete
-- pravice pa dajo vlogi anon VSE na vsaki novi tabeli (00-shim.sql). Brez tega
-- bi lahko kdorkoli brez kljuca bral in brisal naloge. service_role (stran in
-- delavec) ima bypassrls, zato ga RLS brez politik ne ovira.
alter table public.render_naloge enable row level security;
revoke all on public.render_naloge from anon, authenticated;
revoke all on sequence public.render_naloge_id_seq from anon, authenticated;

notify pgrst, 'reload schema';
