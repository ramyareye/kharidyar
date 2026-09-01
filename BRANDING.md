# Provisional Branding Notes

- Status: Working direction, not a final brand decision
- Checked: 2026-09-01

## Current shortlist

### WantKit — international direction

- Public brand: **WantKit**
- First domain to consider: **wantkit.com**
- Additional domains to consider: **wantkit.app** and **wantkit.io**

Why it works:

- It is short, easy to say, and understandable internationally.
- A themed Collection can naturally be presented as a kit: “New Apartment Kit,” “Running Kit,” or “Summer Wardrobe Kit.”
- It fits shared lists, product research, comparisons, and future AI features without making the product sound like a shop.
- It feels more modern and extensible than BuyBuddy.

The product owner reported all three domains as apparently unregistered on 2026-09-01. This has not been independently confirmed in this document; availability, prior use, and trademark conflicts must be checked again immediately before registration.

### Kiesmaatje — Dutch direction

- Public brand: **Kiesmaatje**
- Preferred domain: **kiesmaatje.nl**
- Suggested tagline: **Samen slimmer kiezen.**

`Kiesmaatje` fits the product better than a literal translation of “BuyBuddy.” The product helps people collect ideas, research options, compare offers, collaborate, and make decisions; it is not itself a shop.

SIDN reported `kiesmaatje.nl` as free when checked on 2026-09-01. Availability can change at any time and must be confirmed immediately before registration.

### Directional choice

- Prefer **WantKit** for an international, English-friendly product with `.com`, `.app`, or `.io` positioning.
- Prefer **Kiesmaatje** for a Netherlands-first identity and a distinctly Dutch public brand.

Neither name is final. Domain registration, prior-use research, and trademark clearance should happen before changing the product name in code.

## Other Dutch alternatives considered

| Name | Domain status on 2026-09-01 | Assessment |
| --- | --- | --- |
| Koopmaatje | `koopmaatje.nl` reported free | The closest Dutch translation of “BuyBuddy,” but the domain previously hosted an indexed affiliate site and may carry old search history. |
| Koopgenoot | `koopgenoot.nl` reported free | Distinct and collaborative, but less natural in everyday Dutch. |
| Wenskompas | `wenskompas.nl` reported free | Warm and suitable for visual concepts and wish planning, but less clearly related to purchasing and already used as the name of an arts project. |
| Koopplanner | `koopplanner.nl` reported free | Accurate but functional rather than memorable or friendly. |

## Names not recommended

- **BuyBody** has an unintended body-purchasing meaning in English.
- **BuyBuddy** is already used by multiple international shopping products. SIDN reported `buybuddy.nl` in quarantine rather than freely available on 2026-09-01.
- `winkelmaatje.nl`, `koopkompas.nl`, `kiesmaat.nl`, `samenkiezen.nl`, `koopplan.nl`, `keuzemaatje.nl`, `winkelkompas.nl`, `kieswijzer.nl`, `goedgekozen.nl`, and `kiesgoed.nl` were already registered when checked.

## Implementation boundary

Register the chosen domain before changing the product name in code. A public brand and custom domain can be introduced while internal package names, database names, and the Cloudflare Worker remain `kharidyar`. Rename those identifiers only after the brand is final and only where the change provides user-facing value.

Before a public launch, perform a formal Benelux trademark and Dutch business-name check. Domain availability alone does not establish trademark clearance.

## Sources

- [SIDN Whois](https://www.sidn.nl/whois)
- [SIDN Whois status and command-line guidance](https://www.sidn.nl/nl-domeinnaam/uitleg-whois)
- [Existing BuyBuddy shopping product](https://buybuddyai.com/)
- [Existing BuyBuddy iOS app](https://apps.apple.com/nl/app/buybuddy/id6463859462)
- [Previously indexed Koopmaatje content](https://www.koopmaatje.nl/l/beste-cadeau-tiener/)
- [Existing Wenskompas arts project](https://www.hotelmariakapel.nl/en/project-2023/7)
