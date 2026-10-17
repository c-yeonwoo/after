-- Enum values must commit before the following migration uses them.
alter type public.notification_kind add value if not exists 'meeting_checkin_reminder';
alter type public.notification_kind add value if not exists 'meeting_checkin_final';
alter type public.notification_kind add value if not exists 'meeting_checkin_cancelled';
alter type public.notification_kind add value if not exists 'feedback_followup';
