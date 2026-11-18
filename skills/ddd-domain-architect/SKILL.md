---
name: ddd-domain-architect
description: Use this skill to analyze, design, or review a business domain in code with Domain-Driven Design - map subdomains and bounded contexts, decide which components belong to which domain, find business logic duplicated across components, review or refactor anemic entities, aggregates and value objects, and keep the project glossary and ADRs sharp. Use it when the user asks where to draw service or module boundaries, which components belong together, what can be consolidated, whether code "is good DDD", or when domain terms in the conversation are vague or contradict the code, even if they never say "DDD". Do NOT use for line-level copy-paste detection (use a linter), dependency or coupling metrics with no domain question, UI or infrastructure design, or plain CRUD with no business rules.
license: MIT. Adapts material licensed under CC-BY-4.0 and MIT; attribution in NOTICE.md
metadata:
  version: "1.0.0"
  language: en
  translations: SKILL-pt_BR.md
---

# DDD Domain Architect

Work from the business outward: capability, subdomain, bounded context and local language come first; tactical patterns, frameworks and persistence come last and only where they earn their cost. Every finding must point at evidence in the code or at something the user said.

## 1. Pick the mode before doing anything

| The user wants to... | Mode | Load | Stop gate |
|---|---|---|---|
| know what domains exist, classify subdomains, find bounded contexts, place service boundaries | **MAP** | [references/strategic-analysis.md](references/strategic-analysis.md) | Report only |
| decide which existing components belong together, organize code by domain | **GROUP** | [references/component-grouping.md](references/component-grouping.md) Part A | Present the move plan; ask before moving files |
| find business logic duplicated across components, decide what to consolidate | **CONSOLIDATE** | [references/component-grouping.md](references/component-grouping.md) Part B | Recommend; ask before merging |
| validate, review or check a domain model ("is this good DDD?") | **REVIEW** | [references/tactical-modeling.md](references/tactical-modeling.md) sections 1-2 | Report, then ask "Apply these fixes?" |
| fix, refactor or enrich a domain model | **REFACTOR** | [references/tactical-modeling.md](references/tactical-modeling.md) all sections | Before/after diff per class |
| design a new model ("how should I model X?") | **DESIGN** | [references/tactical-modeling.md](references/tactical-modeling.md) section 2, plus strategic-analysis.md if the context is unknown | Proposal; no code until agreed |
| settle a term, write the glossary, record a decision | **LANGUAGE** | [references/language-and-decisions.md](references/language-and-decisions.md) | Write inline, as it happens |

- A request that spans modes runs in this order: MAP, GROUP, CONSOLIDATE, REVIEW. Finish and report one before starting the next.
- If the mode is unclear, ask one question: "Do you want a map of the domains, a regrouping of components, or a review of the model code?"
- LANGUAGE is also a background duty in every other mode (rule 7).

## 2. Rules that hold in every mode

1. **Language before structure.** Group by the vocabulary the business uses, never by technical layer. The same word with two meanings marks a context boundary.
2. **Evidence or label it.** Cite a path (`src/billing/Invoice.java:42`) for each claim. Mark anything you could not verify as `inferred`.
3. **Invest in proportion.** Rich modeling goes to the Core Domain. Supporting and Generic subdomains stay simple. Never push tactical patterns onto CRUD.
4. **Read-only by default.** Analysis modes change nothing. Changes need the user's explicit yes, because a boundary move is expensive to undo.
5. **Scores rank, they do not measure.** Cohesion and anemia scores exist to order the findings. Say so, and show the signals behind each score.
6. **Make boundaries explicit.** Every cross-context dependency gets a named relationship, a direction and a translation owner. Prefer one entry point per domain.
7. **Capture as you go.** When a term is resolved, update the glossary right then. Offer an ADR only when the decision is hard to reverse, surprising without context, and the result of a real trade-off.

## 3. Workflow

Progress:
- [ ] 1. Scope: confirm the target path and what the user will do with the result.
- [ ] 2. Read existing domain knowledge: `GLOSSARY.md`, `GLOSSARY-MAP.md`, `docs/adr/`. What is written there outranks what you infer from code.
- [ ] 3. Load the reference for the mode and follow its steps.
- [ ] 4. Write the output with the template in section 5.
- [ ] 5. Run the final check in section 6. Fix what fails, then check again.
- [ ] 6. Deliver, and name the single most useful next mode.

## 4. Gotchas

- A framework annotation is not a building block. JPA `@Entity`, a Mongoose schema or a Prisma model is a persistence mapping; decide Entity vs Value Object from identity and lifecycle, not from the annotation.
- A folder is not a domain. `services/`, `controllers/`, `utils/` are layers. When the codebase is organized by layer, build the component inventory from business nouns in class and route names instead.
- Same name does not mean same concept. `Customer` in Sales and `Customer` in Support are two models. Do not report them as duplication and do not merge them; translate at the boundary.
- Common to all components means infrastructure (logging, auth, metrics). Common to some means domain (notification, audit, pricing). Only the second kind is a consolidation candidate.
- Consolidating can raise coupling. Compare incoming dependencies before and after; some duplication is cheaper than a shared bottleneck.
- Generic subdomains score low on cohesion by nature. Low cohesion means "look here", not "broken".
- A Shared Kernel without joint ownership and tests is a hidden dependency. Recommend another relationship.
- An Anti-corruption Layer that only forwards calls is a pass-through. Check that it translates.
- Many Domain Services, or one event per field change, are signs of an anemic model, not of a rich one.
- Do not recommend microservices by default. A modular monolith with enforced boundaries is the right answer for most small and mid-size codebases.
- In REVIEW mode, never edit. Users who ask "is this correct?" have not asked for a refactor.

## 5. Output

Use this skeleton; adapt sections to the mode. Full per-mode templates are in [assets/report-templates.md](assets/report-templates.md); load it when the report has more than one domain or more than five findings.

```markdown
# <Mode>: <target>

## Summary
<3 lines: what was analyzed, the main finding, the recommended next step>

## Findings
| # | Priority | Where | Finding | Evidence | Recommendation |
|---|----------|-------|---------|----------|----------------|

## Domain picture
<domain list, context map or class diagnosis, depending on the mode>

## Open questions for the domain expert
- <what the code cannot answer>
```

## 6. Final check

- [ ] Every finding has evidence or is labeled `inferred`.
- [ ] Every subdomain is classified Core, Supporting or Generic, with the reason.
- [ ] Every cross-context dependency has a relationship name and a direction.
- [ ] No tactical pattern is recommended for code without invariants or lifecycle.
- [ ] Scores show their signals and are described as heuristics.
- [ ] Terms resolved in the session are in the glossary; any ADR offered meets all three criteria.
- [ ] Nothing was changed without the user's yes.
