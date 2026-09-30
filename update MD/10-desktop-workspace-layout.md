# 10 — Desktop Workspace: Filter Rail + Map + Ranked List

## Goal
Add a three-pane desktop workspace for leads and deals, modelled on Estately's map screen: **filters on the left, map in the centre, ranked list on the right**, with a top navigation bar. On mobile it collapses to list-first with a map toggle and filters in a bottom sheet.

DealsDash differences:
- It shows the owner's own leads and deals (tens to low hundreds), not thousands of national lots, so filtering is done client-side and clustering is only switched on at volume.
- Filters only appear for data DealsDash actually holds. No empty filter groups.

## Before you start
- List the fields available on lead/deal summary documents (after prompt 01) and propose which filters each supports. Report any filter below that has no data source yet; leave it out rather than faking it.
- Check whether leads/deals store latitude/longitude. If not, geocode from postcode with postcodes.io (already used in prompt 06) and store on the document.
- Use established libraries: `react-leaflet` with OpenStreetMap tiles (include the required "© OpenStreetMap contributors" attribution and follow the OSM tile usage policy), and `react-leaflet-cluster` only when more than an editable threshold of markers (seed 100) are in view.

## Layout
**Top bar:** DealsDash wordmark · Home · Workspace (map) · Buy boxes · Pipeline · Portfolio (post-purchase deals) · search (address, postcode, deal ID) · notification bell (prompt 09) · theme toggle · map/satellite toggle.

**Left filter rail** (collapsible groups, each option shows a live count, "Clear" per group and "Clear all"):
- *Filter by buy box* (top, like Estately's "Filter by Playbook"): applies a saved buy box's filters in one click.
- *Timing & money:* pipeline stage (prompt 04 stages, with counts); auction window — Today / ≤ N days / > N days / Awaiting outcome; date added; price range.
- *Quality gates:* recommendation BUY / WATCH / PASS / Unscored (prompt 05); fits buy box; min profit on cost; min gross yield; max money left in (prompt 03).
- *Property shape:* property type; bedrooms; tenure; lease years; EPC band; renovation level (from Refurb Survey, if attached).
- *Location & risk:* postcode district; flood zone; IMD decile (prompt 06); crime level; Article 4 area.
- *Legal:* legal pack reviewed yes/no; red flags count; tenancy status.
Filter state is kept in the URL query string so a filtered view can be bookmarked and linked from notification emails.

**Centre map:** markers coloured by recommendation (tokens), stage shown in the popup. Popup: address, stage, max bid, badges, "Open". Selecting a list card highlights and pans to its marker; hovering a marker highlights the card. Optional overlays (toggle): flood zone boundary from Environment Agency, if the existing flood integration provides geometry — otherwise leave out.

**Right list:** header "Deals (N)" and Sort: Best deal (recommendation, then profit on cost), Auction soonest, Newest, Price low–high, Days in stage. Card layout: status dot + stage, recommendation badge, title (e.g. "3-bed terraced house, OL11"), up to 4 badges (prompt 07), address, price or guide, max bid, profit or money left in, auction countdown ("Auction in 6 days"), warning icon when red flags or gates are incomplete.

**Mobile (< 1024 px):** list first; floating "Map" toggle; filters open in a bottom sheet with an "Apply (N results)" button.

## Design
VIXIV tokens only; dark and light themes; badges from prompt 07; keyboard accessible (filter rail and list reachable by Tab, visible focus states).

## Verification
- Test with the real lead/deal set in the emulator; confirm filter counts match a manual count for 3 filters.
- Test at 1920, 1366, 1024 and 390 px widths.

## Acceptance criteria
- Filters, map and list stay in sync; counts update live.
- Only filters with real data are shown.
- Filter state survives refresh and works as a shareable URL.
- Map attribution displayed; no API keys in the client.
