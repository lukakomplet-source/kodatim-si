-- SBN Auto — spremljanja: razširitev shranjenih iskanj na cel uporabniški obrazec.
-- Poženite v Supabase SQL Editorju. Varno je pognati večkrat.
--
-- Zakaj: tabela je nastala z minimalnim naborom pogojev (zgornje meje in
-- najnižja moč). Uporabniški obrazec pa potrebuje oba robova pri vsakem
-- številskem pogoju, gorivo, menjalnik in vrsto prodajalca — brez teh stolpcev
-- bi obrazec obljubljal filtre, ki jih ujemanje ne bi moglo upoštevati.

alter table public.avtonet_iskanja
  add column if not exists km_min integer,
  add column if not exists moc_max integer,
  add column if not exists cena_min numeric(10,2),
  add column if not exists gorivo text,
  add column if not exists menjalnik text,
  /* vsi | dealer | zasebnik — trivrednostno, ker je "samo fizične osebe"
     enakovredna zahteva kot "samo avtohiše", boolean pa je ne zmore izraziti. */
  add column if not exists prodajalec_filter text not null default 'vsi',
  /* Kdaj je uporabnik nazadnje odprl to spremljanje. Iz tega se izračuna
     "3 novi oglasi" — brez tega bi bila značka odvisna od tega, ali je bilo
     obvestilo poslano po e-pošti, kar ni isto kot ali jih je uporabnik videl. */
  add column if not exists zadnji_ogled timestamptz;

-- Ločen stavek, ker `add column if not exists` ob ponovnem zagonu preskoči
-- celotno klavzulo in bi z njo preskočil tudi omejitev.
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'avtonet_iskanja_prodajalec_filter_chk'
  ) then
    alter table public.avtonet_iskanja
      add constraint avtonet_iskanja_prodajalec_filter_chk
      check (prodajalec_filter in ('vsi', 'dealer', 'zasebnik'));
  end if;
end
$$;

-- Stara zastavica se prenese v novo polje, da obstoječa spremljanja ne
-- izgubijo pogoja. Teče samo enkrat: po prenosu vrednost ni več 'vsi'.
update public.avtonet_iskanja
   set prodajalec_filter = 'dealer'
 where samo_dealerji = true
   and prodajalec_filter = 'vsi';

-- Ujemanje bere samo aktivna spremljanja; z rastjo tabele je to najpogostejša
-- poizvedba na tej strani sistema.
create index if not exists avtonet_iskanja_aktivno_idx
  on public.avtonet_iskanja (aktivno, created_at desc);

-- Statistika bere zaključene oglase po modelu in času; brez tega indeksa bi
-- lestvica na strani "Analiza trga" pri stotisočih vrsticah brala celo tabelo.
create index if not exists avtonet_oglasi_analiza_idx
  on public.avtonet_oglasi (status, status_spremenjen)
  where status in ('izginil', 'prodano');
