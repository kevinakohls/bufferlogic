LiquidPlanner Classic two-house comparison import

Source: BufferLogic current two-house example, 36 tasks per house.
Effort: Low and High values multiplied by 8 and explicitly labeled hours.
Resource roles and estimates match the source; hierarchy follows House One then House Two.
Current BufferLogic interprets these Low/High values as P10/P90; LP interpretation is unverified.

Column mapping:
Name -> Name (required)
Order -> Order (hierarchical 1, 1/1, 1/2 ... 2, 2/1 ...)
Item Type -> Item Type (Project and Task; confirm preview accepts these)
Low Estimate -> Low Estimate
High Estimate -> High Estimate
Reference Field -> Reference Field
Description -> Description
Owner -> Owner ONLY if LP has matching member names for the resource roles.
Otherwise leave Owner unmapped and assign resources explicitly after import.
Leave Expected Work, Duration, Percent Complete and other mappings unset.

The supplied mapping screen has NO dependency column. Dependencies are included
in Description for reference, plus a separate checklist CSV. Those descriptions
DO NOT create scheduling dependencies. Restore these links through LP before
comparing forecasts. Import row order expresses priority, not dependencies.

Confirm preview has TWO projects and 72 tasks before completing the import.
If Item Type or hierarchy is not accepted, stop and inspect the preview rather
than importing all rows as unrelated tasks. No exact LP import schema was available
beyond the user-provided column mapping screenshot; this file has not been tested
inside LiquidPlanner.

Match both tools' start date, daily/weekly calendars and exceptions, owner capacity,
project priority, and competing work. Use the same LP owner for a shared role in
both houses, and distinct owners/capacity for unrelated roles. Do not assign all
roles to one person: that introduces resource contention absent from the source.
Do not add supporting equipment from housing-template.csv; this uses the in-app
two-house example, which has 21 primary resource roles and no supporting equipment.
