-- S11 — 프로필 사진을 Storage 로
--
-- 진단(UX-3): FileReader.readAsDataURL 결과가 그대로 profiles.photo_url(text)에
-- 들어갔다. 4MB 사진 한 장이 5.4MB 문자열이 되어 **모든 select 에 딸려 나온다.**
-- S8 에서 1MB CHECK 로 상한만 걸어 뒀는데, 그건 출혈을 막은 것이고 원인은 그대로였다.
--
-- 버킷은 공개로 두지 않는다. 사진은 소개가 열린 상대에게만 보여야 하고,
-- 공개 버킷이면 URL 을 아는 누구나 영구히 볼 수 있다 — 소개를 넘긴 뒤에도.
-- 대신 클라이언트가 필요할 때 서명 URL 을 받아 간다(짧은 만료).

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('profile-photos', 'profile-photos', false, 2 * 1024 * 1024,
        array['image/jpeg','image/png','image/webp'])
on conflict (id) do update
  set public             = false,
      file_size_limit    = 2 * 1024 * 1024,
      allowed_mime_types = array['image/jpeg','image/png','image/webp'];

/*
  경로 규약: {user_id}/{임의이름}.{ext}
  첫 번째 폴더가 소유자여야 한다 — 그래야 남의 폴더에 쓰지 못한다.
*/

create policy photos_insert_own on storage.objects
  for insert to authenticated with check (
    bucket_id = 'profile-photos'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy photos_update_own on storage.objects
  for update to authenticated using (
    bucket_id = 'profile-photos'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy photos_delete_own on storage.objects
  for delete to authenticated using (
    bucket_id = 'profile-photos'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- 읽기: 본인 + public_profiles 로 볼 수 있는 사람.
-- public_profiles 가 이미 "누가 누구를 볼 수 있는가"를 단독으로 판정하므로
-- 그 판단을 여기서 다시 쓰기만 한다 — 규칙을 두 곳에 복제하지 않는다.
create policy photos_select_visible on storage.objects
  for select to authenticated using (
    bucket_id = 'profile-photos'
    and (storage.foldername(name))[1] in (
      select pp.id::text from public_profiles pp
    )
  );

-- photo_url 에는 이제 Storage 오브젝트 경로만 들어온다.
-- data URL(base64) 을 다시 넣지 못하게 형식을 좁힌다. S8 의 1MB 상한을 대체한다.
alter table profiles drop constraint if exists profiles_photo_len;
alter table profiles add constraint profiles_photo_path check (
  photo_url is null
  or (photo_url !~ '^data:' and char_length(photo_url) <= 400)
);

comment on column profiles.photo_url is
  'profile-photos 버킷의 오브젝트 경로({user_id}/…). data URL 금지 — 행에 담기면 모든 select 에 딸려 나온다.';
