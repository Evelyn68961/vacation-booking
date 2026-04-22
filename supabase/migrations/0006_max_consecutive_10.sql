-- 預假系統 v2 — raise max_consecutive from 7 to 10 days.
-- submit_booking reads this value from public.settings at call time, so no
-- function changes are needed. Client-side fallback (useSettings.js) and the
-- help page text were updated to match.

begin;

update public.settings
   set value = '10'
 where key = 'max_consecutive';

commit;
