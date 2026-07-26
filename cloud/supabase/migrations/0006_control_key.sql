-- Per-run control-key hash (#45): retire the coarse global CONTROL_KEY.
--
-- The guard sends a control key at ingest; `ingest` stores only its SHA-256 hash here. The `control`
-- endpoint then authorizes a non-owner caller (private-run CLI control, no dashboard session) by
-- constant-time-comparing the presented key's hash against this column — so a leaked key can only
-- act on the one run it was minted for, never a global master kill switch.
alter table public.runs add column if not exists control_key_hash text;
