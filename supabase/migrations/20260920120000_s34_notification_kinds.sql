-- S34a — 알림 채널 분리와 빠진 사건 종류.
--
-- PostgreSQL enum 의 새 값은 값을 사용하는 DDL/DML과 같은 트랜잭션에서 안전하게
-- 쓸 수 없다. 그래서 enum 확장만 한 마이그레이션으로 먼저 커밋하고, 실제 함수와
-- 트리거는 다음 마이그레이션에서 만든다.

alter type notification_kind add value if not exists 'notification_email_verify';
alter type notification_kind add value if not exists 'intro_delivered';
alter type notification_kind add value if not exists 'candidates_refilled';
alter type notification_kind add value if not exists 'no_show_response_required';

