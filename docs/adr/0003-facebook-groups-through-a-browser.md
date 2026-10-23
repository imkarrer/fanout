# 0003: Facebook groups through a browser, assisted by default

Meta removed the Groups API in April 2024; no API posts to a group. The
`facebook-group` target drives a real browser (Playwright) with a persistent,
signed-in profile of a group member. Automated access is against Meta's
terms and automated posting can trip spam checks or checkpoint the account,
so the default mode is `assist`: open the group, fill in the post, wait for a
person to click Post, then record it. `auto` clicks Post itself, for those who
accept the risk. It cannot run in CI (it needs that signed-in profile), so a
project runs it where the profile lives: `fanout run --live` there, with the
other targets disabled or already delivered.
