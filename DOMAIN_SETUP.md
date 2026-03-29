## epsu.site setup

### App code
- Public site base: `https://epsu.site`
- Legal docs:
  - `https://epsu.site/terms`
  - `https://epsu.site/guidelines`
  - `https://epsu.site/privacy`
  - `https://epsu.site/whitepaper`
- Owner invite links:
  - `https://epsu.site/join/<epsu-slug>`
  - `https://epsu.site/mod/<epsu-slug>`

### Supabase
Set these in `Authentication -> URL Configuration`:
- `Site URL`: `https://epsu.site`
- add redirect URLs later when web auth / reset-password flows are live

### DNS / hosting
Point `epsu.site` to your web host / landing page provider, then serve the legal pages and invite landing pages from that domain.
