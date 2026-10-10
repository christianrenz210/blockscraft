-- BlocksCraft game: admin login + announcements broadcast to players.
-- Run this once in the Supabase SQL Editor of the project the game uses.
-- Everything is prefixed so it stays separate from the rest of the project.

create schema if not exists blockscraft_private;
revoke all on schema blockscraft_private from public, anon, authenticated;

create table blockscraft_private.admins (
  username text primary key,
  password_hash text not null,
  updated_at timestamptz not null default now()
);

create table blockscraft_private.login_attempts (
  id bigint generated always as identity primary key,
  at timestamptz not null default now(),
  ok boolean not null
);
create index login_attempts_at_idx on blockscraft_private.login_attempts (at);

create table public.blockscraft_announcements (
  id bigint generated always as identity primary key,
  message text not null check (char_length(message) between 1 and 300),
  created_at timestamptz not null default now()
);
alter table public.blockscraft_announcements enable row level security;
create policy "Announcements are public"
  on public.blockscraft_announcements for select
  to anon, authenticated
  using (true);
revoke insert, update, delete, truncate on public.blockscraft_announcements from anon, authenticated;

-- Returns 'ok' | 'invalid_login' | 'too_many_attempts'. Never raises, so every
-- attempt is recorded (a raised error would roll the record back).
create or replace function blockscraft_private.check_admin(p_username text, p_password text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_ok boolean;
begin
  if (select count(*) from blockscraft_private.login_attempts
      where not ok and at > now() - interval '10 minutes') >= 20 then
    return 'too_many_attempts';
  end if;
  select exists (
    select 1 from blockscraft_private.admins a
    where a.username = lower(trim(coalesce(p_username, '')))
      and a.password_hash = extensions.crypt(coalesce(p_password, ''), a.password_hash)
  ) into v_ok;
  insert into blockscraft_private.login_attempts (ok) values (v_ok);
  delete from blockscraft_private.login_attempts where at < now() - interval '1 day';
  return case when v_ok then 'ok' else 'invalid_login' end;
end;
$$;
revoke execute on function blockscraft_private.check_admin(text, text) from public, anon, authenticated;

create or replace function public.blockscraft_admin_login(p_username text, p_password text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
begin
  return blockscraft_private.check_admin(p_username, p_password);
end;
$$;

create or replace function public.blockscraft_post_announcement(p_username text, p_password text, p_message text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_status text;
  v_message text := trim(coalesce(p_message, ''));
begin
  v_status := blockscraft_private.check_admin(p_username, p_password);
  if v_status <> 'ok' then return v_status; end if;
  if char_length(v_message) < 1 or char_length(v_message) > 300 then return 'bad_message'; end if;
  insert into public.blockscraft_announcements (message) values (v_message);
  return 'ok';
end;
$$;

create or replace function public.blockscraft_change_password(p_username text, p_password text, p_new_password text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_status text;
begin
  v_status := blockscraft_private.check_admin(p_username, p_password);
  if v_status <> 'ok' then return v_status; end if;
  if char_length(coalesce(p_new_password, '')) < 8 then return 'weak_password'; end if;
  update blockscraft_private.admins
     set password_hash = extensions.crypt(p_new_password, extensions.gen_salt('bf', 10)),
         updated_at = now()
   where username = lower(trim(p_username));
  return 'ok';
end;
$$;

revoke execute on function public.blockscraft_admin_login(text, text) from public;
revoke execute on function public.blockscraft_post_announcement(text, text, text) from public;
revoke execute on function public.blockscraft_change_password(text, text, text) from public;
grant execute on function public.blockscraft_admin_login(text, text) to anon, authenticated;
grant execute on function public.blockscraft_post_announcement(text, text, text) to anon, authenticated;
grant execute on function public.blockscraft_change_password(text, text, text) to anon, authenticated;

-- Create the admin account. Replace YOUR-PASSWORD (at least 8 characters)
-- before running; you can change it later from the game's Admin panel.
insert into blockscraft_private.admins (username, password_hash)
values ('admin', extensions.crypt('YOUR-PASSWORD', extensions.gen_salt('bf', 10)));
