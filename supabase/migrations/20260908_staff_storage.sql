-- Private staff-photo bucket. Application routes use the service role to upload and issue short-lived signed URLs.
insert into storage.buckets (id, name, public)
values ('bimed-staff-photos', 'bimed-staff-photos', false)
on conflict (id) do update set public = false;
