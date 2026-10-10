-- Amsterdam demo community (LOCAL ONLY; needs accounts.sql first). Six friends review the city
-- and 10 places in English, Spanish and French (4–5 stars), each publishes walk lists, and they
-- rate and save each other's lists; the Wayfarer Team publishes official lists the friends rate.
-- Idempotent: first removes the demo accounts' Amsterdam content, then re-creates it. Places are
-- found by Wikidata id (attraction uuids change on every re-ingest); list ids are derived from
-- the list key, so share links survive re-runs.
begin;

-- The official-list guard (D-035) trusts auth.uid(): act as the moderator for this transaction.
do $$ begin
  perform set_config('request.jwt.claims',
    '{"sub":"d0000000-0000-4000-8000-000000000099","role":"authenticated"}', true);
end $$;

create function pg_temp.demo_user(p_handle text) returns uuid language plpgsql as $$
declare
  found_id uuid;
begin
  select u.id into found_id from auth.users u where u.email = p_handle || '@demo-wayfarer.example.com';
  if found_id is null then
    raise exception 'demo account "%" not found: run supabase/demo/accounts.sql first', p_handle;
  end if;
  return found_id;
end;
$$;

create function pg_temp.amsterdam_place(p_wikidata_id text) returns uuid language plpgsql as $$
declare
  found_id uuid;
begin
  select a.id into found_id from public.attractions a
   where a.wikidata_id = p_wikidata_id and a.city_slug = 'amsterdam';
  if found_id is null then
    raise exception 'Amsterdam attraction with Wikidata id % not found (re-ingested?)', p_wikidata_id;
  end if;
  return found_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- Reset this city's demo content (lists cascade to their stops, reviews and saves)
-- ---------------------------------------------------------------------------
delete from public.trips t
 using auth.users u
 where u.id = t.user_id and u.email like '%@demo-wayfarer.example.com' and t.city_slug = 'amsterdam';
delete from public.reviews r
 using auth.users u
 where u.id = r.user_id and u.email like '%@demo-wayfarer.example.com'
   and (r.city_slug = 'amsterdam'
        or r.attraction_id in (select a.id from public.attractions a where a.city_slug = 'amsterdam'));

-- ---------------------------------------------------------------------------
-- City reviews
-- ---------------------------------------------------------------------------
insert into public.reviews (city_slug, user_id, rating, comment, created_at, updated_at)
select 'amsterdam', pg_temp.demo_user(v.handle), v.rating, v.comment, v.at::timestamptz, v.at::timestamptz
  from (values
    ('emma', 5, 'Four days of canals, bikes and bitterballen and I''d go back tomorrow. Walk everywhere — the centre is compact and every street looks like a postcard.', '2026-07-08 19:20+00'),
    ('oliver', 4, 'Gorgeous and very walkable, but book the big museums weeks ahead and watch out for bikes: they have right of way and they know it.', '2026-07-15 21:05+00'),
    ('lucia', 5, 'Ámsterdam me enamoró: canales, casas torcidas y un ambiente relajadísimo. Recorrerla a pie es la mejor forma de descubrir rincones escondidos.', '2026-07-22 10:41+00'),
    ('mateo', 4, 'Ciudad preciosa y muy segura para caminar. Llovió dos días, así que lleva impermeable, pero los museos lo compensan todo.', '2026-08-03 17:12+00'),
    ('camille', 5, 'Une ville à taille humaine, parfaite à pied. Les canaux au coucher du soleil, c''est magique. Je recommande le Jordaan le dimanche matin.', '2026-08-11 08:30+00'),
    ('julien', 4, 'Très belle ville, animée et accueillante. Un peu chère et bondée en été, mais les balades le long des canaux valent le détour.', '2026-08-19 22:48+00')
  ) as v(handle, rating, comment, at);

-- ---------------------------------------------------------------------------
-- Place reviews: 10 places, 3–5 reviews each
-- ---------------------------------------------------------------------------
insert into public.reviews (attraction_id, user_id, rating, comment, created_at, updated_at)
select pg_temp.amsterdam_place(v.wikidata_id), pg_temp.demo_user(v.handle), v.rating, v.comment,
       v.at::timestamptz, v.at::timestamptz
  from (values
    -- Anne Frank House
    ('Q165366', 'emma', 5, 'Deeply moving. Book tickets the moment they are released — it sells out. The audio guide is excellent and the secret annex stays with you.', '2026-07-06 16:02+00'),
    ('Q165366', 'lucia', 5, 'Una visita imprescindible y muy emotiva. Reserva con antelación: las entradas se agotan en minutos.', '2026-07-20 12:15+00'),
    ('Q165366', 'camille', 5, 'Bouleversant. On en ressort en silence. Réservez en ligne, il n''y a pas de guichet sur place.', '2026-08-09 15:40+00'),
    ('Q165366', 'mateo', 4, 'Muy impactante. Algo estrecho y con mucha gente, pero vale totalmente la pena.', '2026-08-02 11:05+00'),
    -- Rijksmuseum
    ('Q190804', 'oliver', 5, 'The Night Watch alone is worth the trip. Go at opening time and head straight to the Gallery of Honour before the crowds.', '2026-07-13 18:30+00'),
    ('Q190804', 'julien', 5, 'Magnifique ! La Ronde de nuit, les Vermeer… prévoyez au moins trois heures. Le jardin est gratuit et très agréable.', '2026-08-17 14:22+00'),
    ('Q190804', 'lucia', 4, 'Enorme y precioso. Imposible verlo todo en un día; céntrate en la Galería de Honor.', '2026-07-21 19:47+00'),
    ('Q190804', 'emma', 5, 'The library room is stunning. Don''t skip the Golden Age dollhouses on the ground floor.', '2026-07-07 17:55+00'),
    ('Q190804', 'camille', 4, 'Superbe collection, mais très fréquenté l''après-midi. Venez tôt.', '2026-08-10 13:10+00'),
    -- Van Gogh Museum
    ('Q224124', 'camille', 5, 'Voir Les Tournesols en vrai, quel frisson. Le parcours chronologique aide à comprendre sa vie. Créneau horaire obligatoire.', '2026-08-10 18:02+00'),
    ('Q224124', 'mateo', 5, 'Mi museo favorito del viaje. Ver la evolución de Van Gogh sala por sala es increíble.', '2026-08-03 12:30+00'),
    ('Q224124', 'oliver', 4, 'Beautifully curated. Timed tickets keep it manageable, though the top floor still gets busy.', '2026-07-14 16:45+00'),
    ('Q224124', 'emma', 4, 'Lovely — but give yourself time in the gift shop, it is dangerous for the wallet.', '2026-07-07 20:12+00'),
    -- Royal Palace of Amsterdam
    ('Q1056152', 'julien', 5, 'La salle des Citoyens est à couper le souffle. L''audioguide inclus est très complet.', '2026-08-18 11:20+00'),
    ('Q1056152', 'emma', 4, 'Surprisingly grand inside. Check it is open before you go: it closes for royal events.', '2026-07-06 12:40+00'),
    ('Q1056152', 'lucia', 4, 'El Salón de los Ciudadanos es espectacular, con el mapa del mundo en el suelo.', '2026-07-20 16:58+00'),
    -- Dam Square
    ('Q839050', 'mateo', 4, 'El corazón de la ciudad. Mucho turista, pero buen punto de partida para cualquier ruta.', '2026-08-01 10:15+00'),
    ('Q839050', 'oliver', 4, 'Busy and a bit chaotic, but you''ll pass through it anyway. The palace and the Nieuwe Kerk frame it nicely.', '2026-07-12 15:33+00'),
    ('Q839050', 'camille', 4, 'Place animée, idéale pour commencer une balade. Attention aux pickpockets.', '2026-08-08 09:50+00'),
    -- Vondelpark
    ('Q1419691', 'lucia', 5, 'Perfecto para descansar entre museos. Alquilamos bicis e hicimos un picnic junto al estanque.', '2026-07-21 20:30+00'),
    ('Q1419691', 'emma', 5, 'A Sunday morning run here was a highlight of the trip. Grab a coffee at the Blue Tea House.', '2026-07-08 09:10+00'),
    ('Q1419691', 'julien', 4, 'Grand parc très vivant. Les concerts gratuits du théâtre en plein air, l''été, sont top.', '2026-08-17 19:05+00'),
    ('Q1419691', 'oliver', 5, 'Great place to people-watch, and right next to Museumplein — an easy break after the Rijks.', '2026-07-13 21:15+00'),
    -- Westerkerk
    ('Q1130722', 'camille', 5, 'Montez dans la tour : la vue sur le Jordaan et les canaux est splendide. Visite guidée en petits groupes.', '2026-08-09 17:25+00'),
    ('Q1130722', 'mateo', 4, 'La torre ofrece una de las mejores vistas de Ámsterdam. Ojo, las escaleras son estrechas.', '2026-08-02 15:40+00'),
    ('Q1130722', 'emma', 4, 'Beautiful church, and the carillon every quarter hour is lovely. Rembrandt is buried here.', '2026-07-06 14:05+00'),
    -- Oude Kerk
    ('Q623558', 'oliver', 5, 'Amsterdam''s oldest building, with contemporary art inside. A strange and wonderful contrast with the Red Light District around it.', '2026-07-12 19:00+00'),
    ('Q623558', 'julien', 4, 'Église magnifique, charpente en bois impressionnante. Les expositions d''art contemporain surprennent.', '2026-08-18 16:35+00'),
    ('Q623558', 'lucia', 4, 'Muy bonita por dentro, con el suelo lleno de lápidas. Curioso contraste con el barrio.', '2026-07-22 13:20+00'),
    -- NEMO Science Museum
    ('Q1422000', 'mateo', 5, 'Fuimos con mis sobrinos y no querían irse. La terraza de la azotea tiene vistas geniales y es gratis.', '2026-08-04 17:50+00'),
    ('Q1422000', 'emma', 4, 'Hands-on science heaven for kids and adults. The rooftop terrace is free and worth the climb.', '2026-07-07 13:30+00'),
    ('Q1422000', 'julien', 5, 'Parfait avec des enfants. Le toit-terrasse offre une belle vue sur le port.', '2026-08-19 12:10+00'),
    -- Rembrandt House Museum
    ('Q277316', 'camille', 4, 'On entre dans l''atelier du maître. Les démonstrations de gravure sont passionnantes.', '2026-08-11 14:45+00'),
    ('Q277316', 'oliver', 5, 'Walking through Rembrandt''s actual studio is surreal. Catch the etching demonstration.', '2026-07-14 11:20+00'),
    ('Q277316', 'lucia', 5, 'Una casa preciosa y muy bien conservada. La demostración de pigmentos fue lo mejor.', '2026-07-22 17:05+00')
  ) as v(wikidata_id, handle, rating, comment, at);

-- ---------------------------------------------------------------------------
-- Walk lists: community (friends) and official (Wayfarer Team)
-- ---------------------------------------------------------------------------
create temporary table demo_list (
  key text primary key,
  id uuid not null,
  handle text not null,
  name text not null,
  is_official boolean not null,
  created_at timestamptz not null,
  stops text[] not null
) on commit drop;

insert into demo_list (key, id, handle, name, is_official, created_at, stops)
select v.key, md5('demo/amsterdam/' || v.key)::uuid, v.handle, v.name, v.official, v.at::timestamptz, v.stops
  from (values
    ('emma-canal-ring', 'emma', 'Golden Age Canal Ring', false, '2026-07-09 10:00+00',
     array['Q839050', 'Q1056152', 'Q1419675', 'Q1130722', 'Q165366', 'Q51411']),
    ('emma-jordaan', 'emma', 'Sunday in the Jordaan', false, '2026-07-10 09:30+00',
     array['Q165366', 'Q1130722', 'Q1854398', 'Q2740663', 'Q643079']),
    ('oliver-museums', 'oliver', 'Museum Quarter Marathon', false, '2026-07-16 08:45+00',
     array['Q639321', 'Q190804', 'Q26832671', 'Q224124', 'Q924335', 'Q849957', 'Q1419691']),
    ('lucia-un-dia', 'lucia', 'Ámsterdam imprescindible en un día', false, '2026-07-23 09:15+00',
     array['Q839050', 'Q1056152', 'Q165366', 'Q643079', 'Q190804', 'Q1419691']),
    ('lucia-mercados', 'lucia', 'Mercados, canales y cerveza', false, '2026-07-24 18:00+00',
     array['Q2342892', 'Q2087161', 'Q1344400', 'Q1579642', 'Q1429748', 'Q643079']),
    ('mateo-torres', 'mateo', 'Ruta de torres y miradores', false, '2026-08-05 10:20+00',
     array['Q1130722', 'Q1429748', 'Q1946061', 'Q610402', 'Q1422000']),
    ('camille-peintres', 'camille', 'L''Amsterdam des peintres', false, '2026-08-12 09:00+00',
     array['Q2466999', 'Q277316', 'Q190804', 'Q224124']),
    ('camille-vert', 'camille', 'Balade verte à l''est', false, '2026-08-13 15:30+00',
     array['Q1576733', 'Q713124', 'Q1616123', 'Q1422000']),
    ('julien-vieux-centre', 'julien', 'Vieux centre et quartier juif', false, '2026-08-20 10:40+00',
     array['Q1350750', 'Q610402', 'Q493160', 'Q623558', 'Q2466999', 'Q1853707', 'Q1576733', 'Q713124']),
    ('team-highlights', 'team', 'Amsterdam Highlights in a Day', true, '2026-06-20 08:00+00',
     array['Q839050', 'Q1056152', 'Q165366', 'Q1130722', 'Q643079', 'Q190804', 'Q1419691']),
    ('team-canals', 'team', 'Canals & Hidden Courtyards', true, '2026-06-22 08:00+00',
     array['Q1130722', 'Q2740663', 'Q643079', 'Q1429748', 'Q1579642', 'Q1344400']),
    ('team-medieval', 'team', 'Medieval Amsterdam & the Harbour', true, '2026-06-24 08:00+00',
     array['Q1419675', 'Q851200', 'Q623558', 'Q493160', 'Q610402', 'Q1946061', 'Q1616123', 'Q1422000']),
    ('team-museumplein', 'team', 'Museumplein Classics', true, '2026-06-26 08:00+00',
     array['Q639321', 'Q190804', 'Q224124', 'Q924335', 'Q849957'])
  ) as v(key, handle, name, official, at, stops);

insert into public.trips (id, user_id, city_slug, name, visibility, is_official, is_fallback, provider,
                          created_at, updated_at)
select l.id, pg_temp.demo_user(l.handle), 'amsterdam', l.name, 'public', l.is_official, true,
       'fallback', l.created_at, l.created_at
  from demo_list l;

insert into public.trip_stops (trip_id, position, attraction_id)
select l.id, (s.ord - 1)::smallint, pg_temp.amsterdam_place(s.wikidata_id)
  from demo_list l, unnest(l.stops) with ordinality as s(wikidata_id, ord);

-- Same numbers the app stores when routing is offline (route-optimize fallback): straight legs,
-- ×1.3 street detour (WALKING_DETOUR_FACTOR), 1.25 m/s (WALKING_SPEED_M_PER_S).
with legs as (
  select s.trip_id, a.location, a.avg_visit_minutes,
         extensions.st_distance(a.location, lag(a.location) over w) as straight_m
    from public.trip_stops s join public.attractions a on a.id = s.attraction_id
   where s.trip_id in (select id from demo_list)
  window w as (partition by s.trip_id order by s.position)
), totals as (
  select trip_id, round(coalesce(sum(straight_m), 0) * 1.3)::integer as distance_m,
         sum(avg_visit_minutes)::integer as visit_minutes
    from legs group by trip_id
)
update public.trips t
   set distance_m = totals.distance_m,
       walking_seconds = round(totals.distance_m / 1.25)::integer,
       visit_minutes = totals.visit_minutes,
       route_geometry = (
         select extensions.st_asgeojson(extensions.st_makeline(a.location::extensions.geometry order by s.position))::jsonb
           from public.trip_stops s join public.attractions a on a.id = s.attraction_id
          where s.trip_id = t.id)
  from totals
 where totals.trip_id = t.id;

-- ---------------------------------------------------------------------------
-- Walk list reviews: friends rating each other's lists and the official ones
-- ---------------------------------------------------------------------------
insert into public.reviews (trip_id, user_id, rating, comment, created_at, updated_at)
select l.id, pg_temp.demo_user(v.handle), v.rating, v.comment, v.at::timestamptz, v.at::timestamptz
  from (values
    ('emma-canal-ring', 'oliver', 5, 'Did this on day one — perfect intro to the city. The Homomonument at the end was a lovely surprise.', '2026-07-12 20:10+00'),
    ('emma-canal-ring', 'lucia', 5, 'La hicimos con calma en una mañana. Muy bien pensada, todo a un paso.', '2026-07-19 18:40+00'),
    ('emma-canal-ring', 'camille', 4, 'Très jolie boucle. Réservez Anne Frank avant, sinon on ne fait que passer devant !', '2026-08-08 21:00+00'),
    ('emma-canal-ring', 'julien', 5, null, '2026-08-17 22:15+00'),
    ('emma-jordaan', 'camille', 5, 'Exactement mon Jordaan du dimanche. Le Begijnhof est un havre de paix.', '2026-08-09 20:30+00'),
    ('emma-jordaan', 'mateo', 4, 'Muy agradable para pasear sin prisa. Añadiría una parada para tomar café.', '2026-08-02 19:25+00'),
    ('emma-jordaan', 'oliver', 5, 'Emma knows her canals. Short, sweet and very photogenic.', '2026-07-14 22:05+00'),
    ('oliver-museums', 'emma', 4, 'Ambitious! We split it over two days and it worked much better.', '2026-07-18 19:30+00'),
    ('oliver-museums', 'julien', 5, 'Parfait pour les fans de musées. Le Moco est une belle découverte.', '2026-08-18 20:45+00'),
    ('oliver-museums', 'mateo', 5, 'Todos los museos en una sola ruta. Terminar en el Vondelpark fue el mejor cierre.', '2026-08-04 21:10+00'),
    ('oliver-museums', 'lucia', 4, null, '2026-07-25 11:00+00'),
    ('lucia-un-dia', 'mateo', 5, '¡Gracias, Lucía! La seguimos al pie de la letra y vimos lo esencial en un día.', '2026-08-01 21:30+00'),
    ('lucia-un-dia', 'emma', 5, 'Exactly what a first-timer needs. Great balance between sights and breaks.', '2026-07-26 18:15+00'),
    ('lucia-un-dia', 'camille', 4, 'Très efficace pour une première visite. Journée bien remplie mais faisable.', '2026-08-11 22:00+00'),
    ('lucia-mercados', 'oliver', 5, 'Albert Cuyp for stroopwafels, Heineken for a cold one — my kind of walk.', '2026-07-27 20:40+00'),
    ('lucia-mercados', 'julien', 4, 'Sympa et gourmand. Le Magere Brug de nuit est superbe.', '2026-08-19 21:20+00'),
    ('lucia-mercados', 'mateo', 5, 'Mercado, cerveza y canales: ruta perfecta para una tarde.', '2026-08-03 20:05+00'),
    ('mateo-torres', 'lucia', 5, 'Qué buena idea una ruta de torres. Las vistas desde NEMO al final, geniales.', '2026-08-06 19:50+00'),
    ('mateo-torres', 'julien', 4, 'Original ! Le Schreierstoren a une histoire touchante.', '2026-08-20 18:30+00'),
    ('mateo-torres', 'emma', 4, 'Fun theme and a nice way to see the old harbour.', '2026-08-07 17:45+00'),
    ('camille-peintres', 'julien', 5, 'Magnifique parcours, on suit Rembrandt puis Van Gogh. Merci Camille !', '2026-08-18 19:10+00'),
    ('camille-peintres', 'oliver', 5, 'Art lovers, this is the one. Rembrandt House first is a great call.', '2026-08-14 20:25+00'),
    ('camille-peintres', 'lucia', 4, 'Preciosa ruta para amantes del arte. Reservad las entradas con tiempo.', '2026-08-15 12:40+00'),
    ('camille-vert', 'mateo', 5, 'Ideal para ir con niños: Artis, el museo marítimo y NEMO. Un día redondo.', '2026-08-16 18:20+00'),
    ('camille-vert', 'emma', 4, 'A calm side of Amsterdam I hadn''t seen. The Hortus greenhouses are beautiful.', '2026-08-15 16:10+00'),
    ('camille-vert', 'oliver', 4, null, '2026-08-17 09:30+00'),
    ('julien-vieux-centre', 'camille', 5, 'Passionnant, riche en histoire. La synagogue portugaise est impressionnante.', '2026-08-21 20:00+00'),
    ('julien-vieux-centre', 'lucia', 5, 'Una ruta llena de historia. Nuestro Señor en el Ático nos dejó sin palabras.', '2026-08-22 18:35+00'),
    ('julien-vieux-centre', 'oliver', 4, 'Long but rewarding. Save the Hortus and Artis for the afternoon.', '2026-08-23 21:45+00'),
    ('team-highlights', 'emma', 5, 'The classic route, well paced. Good pick for a first day.', '2026-07-06 21:30+00'),
    ('team-highlights', 'mateo', 5, 'Ruta oficial muy completa. Perfecta para una primera vez.', '2026-08-01 22:00+00'),
    ('team-highlights', 'camille', 4, 'Bon itinéraire, mais prévoyez les billets des musées à l''avance.', '2026-08-08 22:30+00'),
    ('team-highlights', 'julien', 5, null, '2026-08-17 23:00+00'),
    ('team-canals', 'lucia', 5, 'Los patios escondidos son una joya. Muy tranquila y bonita.', '2026-07-20 21:10+00'),
    ('team-canals', 'oliver', 4, 'Pretty and relaxed. Best in the late afternoon light.', '2026-07-13 19:40+00'),
    ('team-canals', 'camille', 5, 'Charmant. Le Magere Brug pour finir, parfait.', '2026-08-10 21:15+00'),
    ('team-medieval', 'julien', 5, 'Superbe, on voit l''Amsterdam d''avant les canaux. Très instructif.', '2026-08-19 20:40+00'),
    ('team-medieval', 'emma', 4, 'Great history walk. The maritime museum is a must.', '2026-07-08 21:50+00'),
    ('team-medieval', 'mateo', 4, 'Muy interesante, aunque larga. Mejor empezar temprano.', '2026-08-04 22:20+00'),
    ('team-museumplein', 'lucia', 5, 'Todo lo esencial de los museos, sin perder tiempo.', '2026-07-21 22:10+00'),
    ('team-museumplein', 'oliver', 5, 'Tight and efficient. The Concertgebouw lunchtime concert (Wednesdays) is a bonus.', '2026-07-15 18:55+00'),
    ('team-museumplein', 'camille', 4, 'Pratique pour regrouper les musées. Un peu dense pour une seule journée.', '2026-08-10 19:30+00')
  ) as v(key, handle, rating, comment, at)
  join demo_list l on l.key = v.key;

-- ---------------------------------------------------------------------------
-- Saved lists (My Trips → Saved): friends keeping each other's lists
-- ---------------------------------------------------------------------------
insert into public.saved_trips (user_id, trip_id, created_at)
select pg_temp.demo_user(v.handle), l.id, v.at::timestamptz
  from (values
    ('emma', 'lucia-un-dia', '2026-07-26 18:16+00'),
    ('emma', 'team-medieval', '2026-07-05 10:00+00'),
    ('oliver', 'emma-canal-ring', '2026-07-11 22:00+00'),
    ('oliver', 'camille-peintres', '2026-08-14 20:26+00'),
    ('lucia', 'emma-canal-ring', '2026-07-19 18:41+00'),
    ('lucia', 'team-canals', '2026-07-19 09:00+00'),
    ('mateo', 'lucia-un-dia', '2026-07-30 21:00+00'),
    ('mateo', 'oliver-museums', '2026-08-01 08:00+00'),
    ('camille', 'emma-jordaan', '2026-08-07 19:00+00'),
    ('camille', 'julien-vieux-centre', '2026-08-21 20:01+00'),
    ('julien', 'camille-peintres', '2026-08-15 10:00+00'),
    ('julien', 'team-highlights', '2026-08-16 09:00+00')
  ) as v(handle, key, at)
  join demo_list l on l.key = v.key;

commit;
