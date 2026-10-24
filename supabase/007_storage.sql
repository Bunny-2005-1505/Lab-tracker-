-- Step 7 of 7: storage buckets. Avatars are public; staff ID photos are private.

insert into storage.buckets (id, name, public) values ('avatars', 'avatars', true)
  on conflict (id) do nothing;
insert into storage.buckets (id, name, public) values ('id-proofs', 'id-proofs', false)
  on conflict (id) do nothing;

create policy "Avatars are public to view" on storage.objects for select
  using (bucket_id = 'avatars');
create policy "Users upload own avatar" on storage.objects for insert
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "Users update own avatar" on storage.objects for update
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text)
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "Users delete own avatar" on storage.objects for delete
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "Upload own id proof" on storage.objects for insert
  with check (bucket_id = 'id-proofs' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "Read own or admin id proof" on storage.objects for select
  using (bucket_id = 'id-proofs' and ((storage.foldername(name))[1] = auth.uid()::text or public.is_platform_admin()));
create policy "Admin delete id proof" on storage.objects for delete
  using (bucket_id = 'id-proofs' and public.is_platform_admin());
