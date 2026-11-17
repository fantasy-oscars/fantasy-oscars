# Architecture Decision Records (ADRs)

ADRs capture decisions that could be questioned later. They keep the project intentional and explain “why” beyond code and tests.

## When to write an ADR

- Choosing a framework/library when alternatives exist (and it’s not the obvious default).
- Any deviation from conventional practice.
- Cross-cutting concerns (auth strategy, data model shifts, infra approach).

## Format

- Short and readable; see the template.
- Include context, decision, alternatives, consequences, and follow-ups.

## How to add

1. Copy `template.md` to `docs/adr/NNNN-title.md` (increment NNNN).
2. Fill it in.
3. Link from this README if useful.

## Links

- Template: [template.md](template.md)
- 0001 – Canonical Domain Model (Fantasy Oscars): [0001-domain-model.md](0001-domain-model.md)
- 0002 – Public seasons as auto-managed league containers: [0002-public-seasons.md](0002-public-seasons.md)
- 0003 – Layered visual testing: [0003-layered-visual-testing.md](0003-layered-visual-testing.md)
- 0004 – Measured component tolerances: [0004-measured-component-tolerances.md](0004-measured-component-tolerances.md) (supersedes the screenshot tiers of 0003)
- 0005 – Series competition domain model: [0005-series-domain-model.md](0005-series-domain-model.md) (sections 1, 2 and 4 partly superseded by 0006)
- 0006 – Circuit, with an admin-defined structure: [0006-circuit-admin-defined-structure.md](0006-circuit-admin-defined-structure.md) (section 3 amended by 0007)
- 0007 – Circuit groups, a derived results date and shared waiver windows: [0007-circuit-groups-and-derived-dates.md](0007-circuit-groups-and-derived-dates.md)
