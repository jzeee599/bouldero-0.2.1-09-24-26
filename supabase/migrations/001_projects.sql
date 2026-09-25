-- Milestone 1 only. Sessions and attempts are proposed in docs/architecture.md.
create table public.users (
  id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);
create table public.projects (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  name text not null check (length(trim(name)) between 1 and 80),
  grade text check (length(grade) <= 24), gym text check (length(gym) <= 100),
  -- Store the private Storage object path; signed URLs are generated on read.
  photo_url text not null,
  status text not null default 'active' check (status in ('active','sent','archived')),
  created_at timestamptz not null default now(), sent_at timestamptz
);
create table public.holds (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  order_index integer not null check (order_index > 0),
  x double precision not null check (x between 0 and 1),
  y double precision not null check (y between 0 and 1),
  is_top boolean not null default false,
  created_at timestamptz not null default now(),
  unique(project_id, order_index)
);
create unique index one_top_per_project on public.holds(project_id) where is_top;
create index projects_owner on public.projects(user_id);
alter table public.users enable row level security;
alter table public.projects enable row level security;
alter table public.holds enable row level security;
create policy own_user on public.users for all to authenticated using (id = (select auth.uid())) with check (id = (select auth.uid()));
create policy own_projects on public.projects for all to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy own_holds on public.holds for all to authenticated
  using (exists (select 1 from public.projects p where p.id = project_id and p.user_id = (select auth.uid())))
  with check (exists (select 1 from public.projects p where p.id = project_id and p.user_id = (select auth.uid())));
grant select, insert, update, delete on public.users, public.projects, public.holds to authenticated;

-- Invoker rights preserve RLS. Any failure rolls back the project and all holds.
create function public.create_project(p_id uuid, p_name text, p_grade text, p_gym text, p_photo text, p_holds jsonb)
returns uuid language plpgsql security invoker set search_path = public as $$
declare hold_count integer;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if p_photo <> auth.uid()::text || '/' || p_id::text || '.jpg' then raise exception 'Invalid photo path'; end if;
  if jsonb_typeof(p_holds) <> 'array' then raise exception 'Holds must be an array'; end if;
  hold_count := jsonb_array_length(p_holds);
  if hold_count < 1 or hold_count > 200 then raise exception 'Add between 1 and 200 holds'; end if;
  if exists (
    select 1 from jsonb_array_elements(p_holds) with ordinality as h(value, n)
    where (value->>'order_index')::integer is distinct from n::integer
       or ((value->>'is_top')::boolean and n <> hold_count)
  ) then raise exception 'Holds must be consecutive; only the final hold can be TOP'; end if;
  insert into public.users(id) values(auth.uid()) on conflict(id) do nothing;
  insert into public.projects(id,user_id,name,grade,gym,photo_url)
    values(p_id,auth.uid(),trim(p_name),nullif(trim(p_grade),''),nullif(trim(p_gym),''),p_photo);
  insert into public.holds(id,project_id,order_index,x,y,is_top)
    select (h->>'id')::uuid,p_id,(h->>'order_index')::integer,(h->>'x')::double precision,(h->>'y')::double precision,(h->>'is_top')::boolean
    from jsonb_array_elements(p_holds) h;
  return p_id;
end; $$;
revoke all on function public.create_project(uuid,text,text,text,text,jsonb) from public, anon;
grant execute on function public.create_project(uuid,text,text,text,text,jsonb) to authenticated;

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
  values('project-photos','project-photos',false,10485760,array['image/jpeg']);
create policy own_photos_read on storage.objects for select to authenticated
  using(bucket_id = 'project-photos' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy own_photos_insert on storage.objects for insert to authenticated
  with check(bucket_id = 'project-photos' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy own_photos_delete on storage.objects for delete to authenticated
  using(bucket_id = 'project-photos' and (storage.foldername(name))[1] = (select auth.uid())::text);
