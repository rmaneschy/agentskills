# ddd-domain-architect

An Agent Skill that helps a coding agent analyze, design and review a business domain in code with Domain-Driven Design. It merges the strongest parts of five public skills into one router with seven modes, and it follows the [Agent Skills specification](https://agentskills.io/specification).

Portuguese version: [README-pt_BR.md](README-pt_BR.md) and [SKILL-pt_BR.md](SKILL-pt_BR.md).

## What it does

| Mode | Question it answers | Reference loaded |
|---|---|---|
| MAP | What domains exist, how important is each, where are the context boundaries? | `references/strategic-analysis.md` |
| GROUP | Which existing components belong to which domain? | `references/component-grouping.md` Part A |
| CONSOLIDATE | Which business logic is duplicated and should it be merged? | `references/component-grouping.md` Part B |
| REVIEW | Is this domain model anemic? Which building block should each class be? | `references/tactical-modeling.md` |
| REFACTOR | Move behavior into the model, step by step | `references/tactical-modeling.md` |
| DESIGN | How should a new concept be modeled? | `references/tactical-modeling.md` |
| LANGUAGE | What does this term mean, and should this decision be recorded? | `references/language-and-decisions.md` |

## Layout

```
ddd-domain-architect/
├── SKILL.md                      what agents load on activation (94 lines, about 1,900 tokens)
├── SKILL-pt_BR.md                Portuguese translation of SKILL.md
├── README.md / README-pt_BR.md   for humans; never loaded by the agent
├── references/
│   ├── strategic-analysis.md     MAP
│   ├── component-grouping.md     GROUP, CONSOLIDATE, fitness functions
│   ├── tactical-modeling.md      REVIEW, REFACTOR, DESIGN
│   └── language-and-decisions.md LANGUAGE: glossary and ADR formats
├── assets/
│   └── report-templates.md       full output templates per mode
└── evals/
    └── trigger-queries.json      18 should / should-not trigger queries
```

## Install

Copy the folder into your client's skills directory and keep the folder name, because the specification requires `name` to match the parent directory.

```bash
# Claude Code, per project
cp -r ddd-domain-architect .claude/skills/

# Claude Code, per user
cp -r ddd-domain-architect ~/.claude/skills/
```

Other clients use other directories; check the client's documentation. Validate with `agentskills validate ./ddd-domain-architect` (package `skills-ref`).

### Using the Portuguese version

Agents load only the file named `SKILL.md`. To run in Portuguese, replace it:

```bash
cd ddd-domain-architect && mv SKILL.md SKILL-en.md && mv SKILL-pt_BR.md SKILL.md
```

The reference files stay in English on purpose. They are read by the model, not by the user, DDD's canonical terms are English, and keeping one copy avoids two versions drifting apart. The Portuguese `SKILL.md` tells the agent to answer in Brazilian Portuguese.

## Where each part came from

| Element in this skill | Taken from | Why it was kept |
|---|---|---|
| Intent table that selects phases and a stop gate | `tactical-ddd` | The only source that separated "check" from "fix"; it prevents unrequested refactors |
| Load-on-demand references with a stated condition | `tactical-ddd`, `domain-modeling` | Progressive disclosure as the specification describes it |
| Description with trigger phrases and "Do NOT use" | all four tech-leads-club skills | Negative triggers keep neighboring requests out |
| Subdomain decision tree, cohesion dimensions, issue rules, context relationships | `domain-analysis` | Turns strategic DDD into a procedure |
| Component assignment table, namespace alignment, domain map | `domain-identification-grouping` | Makes domains visible in code structure |
| Domain vs infrastructure test, three duplication signals, coupling count before and after | `component-common-domain-detection` | Stops consolidation that only moves the problem |
| Fitness functions | `domain-identification-grouping`, `component-common-domain-detection` | A boundary that is not checked will erode |
| Weighted anemia signals, building-block table, ordered refactoring moves, golden rules | `tactical-ddd` | Fragile work gets a prescriptive sequence |
| Conversational moves, glossary format, three-criteria ADR, lazy file creation | `domain-modeling` | Keeps language and decisions current without ceremony |
| Explaining the reason next to the rule | `domain-modeling` | An agent that knows the purpose handles cases the rule did not foresee |

## What was changed or left out, and why

| Decision | Reason |
|---|---|
| No "How to Use", "Quick Start" or "When to Use" in the body | The body loads only after the skill has triggered. Those sections address a human reader and belong in this README. Trigger information lives in `description`, the only text the agent sees before activation. |
| No README-style duplication inside `SKILL.md` | Three source skills repeat the same content across `SKILL.md`, `README.md` and `QUICK-REFERENCE.md`. One fact gets one owner (Pragmatic Programmer, DRY). |
| Every supporting file is linked with a load condition | Three source skills ship `EXAMPLES.md` or `QUICK-REFERENCE.md` that `SKILL.md` never mentions, so an agent has no reason to open them. |
| Cohesion score is a plain sum, 0 to 10 | The source formula divides the sum by 10, which yields 0 to 1, and then reads it on an 8 to 10 scale. |
| Scores are described as ranking heuristics | The weights are the authors' judgment, not measurements. The skill says so and shows the signals. |
| Fitness functions use ArchUnit and dependency-cruiser | The sources use JavaScript pseudo-code with undefined helpers. Real tools can go into CI. |
| Examples in Java, detection notes for Kotlin and TypeScript | The sources assume TypeScript or Node. The method is language-neutral; the notes cover Lombok, records and mutable properties. |
| No emoji markers, no long do/don't lists | They restate what the steps already say and cost context on every run. |
| Added a Gotchas section | The specification's best practices call it the highest-value content. None of the five sources has one. |
| Added DOMA layers, gateways and extensions | The source skills stop at "suggest integration". Uber's article gives rules for dependency direction and entry points. |
| Added "do not recommend microservices by default" | The DOMA article itself warns that small organizations may not benefit from the operational cost. |
| One skill instead of five | The four tech-leads-club skills cross-reference each other and share concepts; one activation with on-demand references avoids loading several overlapping bodies. See Trade-offs. |

## How the references shaped the rules

| Rule in the skill | Source |
|---|---|
| Start from capability, subdomain, context and language; tactical patterns last | Vernon, *Domain-Driven Design Distilled* |
| One language per bounded context; refine language before adding behavior | Evans, *Domain-Driven Design* |
| Small aggregates, reference by identity, one aggregate per transaction, repositories per root | Vernon, *Implementing Domain-Driven Design* |
| Nine context relationships, each with a duty; an ACL must really translate; Shared Kernel needs governance | Vernon, *Distilled*; Evans |
| No tactical DDD for CRUD or generic subdomains | Vernon, *Distilled* and *Implementing* |
| One owner per fact; reversible decisions; automate checks; evidence over guesses | Hunt and Thomas, *The Pragmatic Programmer* |
| A layer, wrapper or service must hide more than it adds; no pass-through boundaries | Ousterhout, *A Philosophy of Software Design* |
| Layers, one gateway per domain, extension points, incremental adoption | Uber Engineering, *Introducing Domain-Oriented Microservice Architecture* |
| Component domains, common domain components, fitness functions | Ford, Richards, Sadalage and Dehghani, *Software Architecture: The Hard Parts* (basis of two source skills) |

## Specification compliance

| Requirement | This skill |
|---|---|
| `name`: lowercase, hyphens, at most 64 characters, matches directory | `ddd-domain-architect` |
| `description`: at most 1024 characters, says what and when | 794 characters (English), 869 (Portuguese) |
| `SKILL.md` under 500 lines and about 5,000 tokens | 94 lines, about 1,900 tokens |
| File references relative and one level deep | Five links, all direct from `SKILL.md` |
| Optional fields | `license`, `metadata` (string values only) |
| `compatibility`, `allowed-tools` | Omitted; the skill needs only file reading and search |

## Best practices applied

- **Imperative description that names user intent**, including cases where the user never says "DDD".
- **Procedures over declarations**: each mode is a sequence of steps that works on any codebase.
- **Defaults, not menus**: merge inside a context, leave duplicates across contexts, modular monolith before services.
- **Specificity matched to fragility**: analysis modes describe what to look for; REFACTOR prescribes an order; anything that changes files has a stop gate.
- **Checklist and validation loop**: a progress checklist and a final check that the agent repeats until it passes.
- **Output templates**: a short skeleton inline, full templates in `assets/`.
- **Moderate detail**: the body carries rules and gotchas; detail waits in references.

## Testing

`evals/trigger-queries.json` holds 10 queries that should trigger the skill and 8 near-misses that should not, such as DNS "domain", UI "components" and JPA mapping. Run each query three times in your client and compare the trigger rate with the label, as described in [Optimizing skill descriptions](https://agentskills.io/skill-creation/optimizing-descriptions). The skill has been checked for format and limits; it has not yet been run against real codebases, so treat version 1.0.0 as a first draft and add every correction you make to the Gotchas section.

## Trade-offs

- A broad skill is harder to trigger precisely than five narrow ones. The description and the near-miss queries are the mitigation; if your catalog already has `coupling-analysis` or similar skills, add them to the "Do NOT use" sentence.
- The glossary file names (`GLOSSARY.md`, `GLOSSARY-MAP.md`) follow `domain-modeling`. The skill tells the agent to follow the project's convention if it differs.
- Scores and weights are heuristics inherited from the sources. Calibrate them on your own code.

## Sources and license

MIT. This skill is an adaptation; the attribution and license notices are in [NOTICE.md](NOTICE.md). Adapted from:

- [tech-leads-club/agent-skills](https://github.com/tech-leads-club/agent-skills), by Tech Leads Club, skill content under [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/): `domain-analysis`, `domain-identification-grouping`, `component-common-domain-detection`, `tactical-ddd`
- [mattpocock/skills](https://github.com/mattpocock/skills), MIT: `domain-modeling`
- [ciembor/agent-rules-books](https://github.com/ciembor/agent-rules-books), MIT: rule digests of the five books above
- [Uber Engineering: Introducing Domain-Oriented Microservice Architecture](https://www.uber.com/blog/microservice-architecture/)
- [Agent Skills specification and best practices](https://agentskills.io)
