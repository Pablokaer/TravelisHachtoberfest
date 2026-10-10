-- Nature category (D-068): beaches, waterfalls, national parks, nature reserves, caves, islands,
-- lakes, mountains… Brazil and Southeast Asia's top sights are mostly natural, and filing them
-- under park (national parks) or nowhere at all (beaches, mountains) hid them.
--
-- Listed right after 'park' so the enum order matches the app's tab order. Nothing else
-- enumerates categories: attractions_in_view takes an array of the enum (null = all) and the
-- views copy the column through. The new value is not used in this migration, as Postgres does
-- not allow using an enum value in the transaction that adds it.
alter type public.attraction_category add value if not exists 'nature' after 'park';
