-- SBN Auto — poveži posnetke z raziskavo, ki jih je zajela.
-- Poženite v Supabase SQL Editorju. Varno je pognati večkrat.
--
-- Zakaj: doslej se ni dalo odgovoriti na vprašanje "kaj je TA pregled dejansko
-- videl". Posnetek je vedel, kdaj je nastal, ne pa v katerem pregledu — in ob
-- odprtju raziskave bi bilo treba ugibati po časovnem oknu.

alter table public.avtonet_posnetki
  /* on delete set null in NE cascade: brisanje raziskave je pospravljanje
     dnevnika, ne brisanje zbranih podatkov. Zgodovina cen in časa na oglasniku
     je najdragocenejše, kar ta sistem ima, in je ne sme odnesti klik na
     "izbriši raziskavo". */
  add column if not exists raziskava_id uuid
    references public.avtonet_raziskave(id) on delete set null;

create index if not exists avtonet_posnetki_raziskava_idx
  on public.avtonet_posnetki (raziskava_id, zajeto desc);
