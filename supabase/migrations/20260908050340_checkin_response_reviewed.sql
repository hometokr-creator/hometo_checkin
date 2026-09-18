-- AD-A: review state only; apply manually after review.
alter table public.checkin_response add column reviewed_at timestamptz;
create index checkin_response_unreviewed on public.checkin_response (submitted_at)
  where reviewed_at is null;

create function public.mark_checkin_response_reviewed(p_response_id uuid, p_reviewed boolean)
returns timestamptz language plpgsql security invoker set search_path = '' as $$
declare result timestamptz;
begin
  if p_response_id is null or p_reviewed is null then
    raise exception 'invalid-answer';
  end if;
  update public.checkin_response
     set reviewed_at = case when p_reviewed then coalesce(reviewed_at, now()) else null end
   where id = p_response_id
   returning reviewed_at into result;
  if not found then raise exception 'invalid'; end if;
  return result;
end;
$$;
revoke all on function public.mark_checkin_response_reviewed(uuid, boolean) from public, anon, authenticated;
grant execute on function public.mark_checkin_response_reviewed(uuid, boolean) to service_role;
