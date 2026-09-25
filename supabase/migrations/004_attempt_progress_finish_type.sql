-- Version 0.2.1: finish type and exact progress for every mapped attempt.
alter table public.projects
  add column finish_type text not null default 'hold'
    check (finish_type in ('hold', 'top_out'));

alter table public.attempts
  add column ended_hold_id uuid references public.holds(id) on delete set null,
  add column topped_out boolean not null default false;

create index attempts_ended_hold on public.attempts(ended_hold_id)
  where ended_hold_id is not null;

create function public.create_project_v3(
  p_id uuid,
  p_name text,
  p_grade text,
  p_gym text,
  p_photo text,
  p_holds jsonb,
  p_route_mode text,
  p_source_project_id uuid,
  p_finish_type text
)
returns uuid language plpgsql security invoker set search_path = public as $$
declare
  hold_count integer;
  final_photo text;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if p_route_mode not in ('mapped', 'count_only') then raise exception 'Invalid tracking mode'; end if;
  if p_finish_type not in ('hold', 'top_out') then raise exception 'Invalid finish type'; end if;
  if jsonb_typeof(p_holds) <> 'array' then raise exception 'Holds must be an array'; end if;
  hold_count := jsonb_array_length(p_holds);

  if p_source_project_id is not null then
    if p_photo is not null then raise exception 'A reused line cannot upload another photo'; end if;
    select photo_url into final_photo from public.projects
      where id = p_source_project_id and user_id = auth.uid();
    if final_photo is null then raise exception 'Photo source not found'; end if;
  else
    if p_photo is null or p_photo <> auth.uid()::text || '/' || p_id::text || '.jpg' then
      raise exception 'Invalid photo path';
    end if;
    final_photo := p_photo;
  end if;

  if p_route_mode = 'mapped' and (hold_count < 1 or hold_count > 200) then
    raise exception 'Add between 1 and 200 holds';
  end if;
  if p_route_mode = 'count_only' and hold_count <> 0 then
    raise exception 'Count-only lines cannot contain mapped holds';
  end if;
  if exists (
    select 1 from jsonb_array_elements(p_holds) with ordinality as h(value, n)
    where (value->>'order_index')::integer is distinct from n::integer
       or ((value->>'is_top')::boolean and n <> hold_count)
  ) then raise exception 'Holds must be consecutive; only the final hold can be TOP'; end if;

  insert into public.users(id) values(auth.uid()) on conflict(id) do nothing;
  insert into public.projects(
    id,user_id,name,grade,gym,photo_url,route_mode,source_project_id,finish_type
  ) values(
    p_id,auth.uid(),trim(p_name),nullif(trim(p_grade),''),nullif(trim(p_gym),''),
    final_photo,p_route_mode,p_source_project_id,p_finish_type
  );
  insert into public.holds(id,project_id,order_index,x,y,is_top)
    select (h->>'id')::uuid,p_id,(h->>'order_index')::integer,
      (h->>'x')::double precision,(h->>'y')::double precision,(h->>'is_top')::boolean
    from jsonb_array_elements(p_holds) h;
  return p_id;
end; $$;

revoke all on function public.create_project_v3(uuid,text,text,text,text,jsonb,text,uuid,text)
  from public, anon;
grant execute on function public.create_project_v3(uuid,text,text,text,text,jsonb,text,uuid,text)
  to authenticated;
