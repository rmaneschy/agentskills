# Strategic analysis (MAP mode)

Goal: say which domains exist, how much each one matters, where the language changes, and how the contexts should relate. This is about WHAT exists, not HOW to implement it.

## Step 1. Extract business concepts

Scan for business concepts and ignore technical plumbing.

| Look for | Typical patterns | Keep only |
|---|---|---|
| Domain models | `@Entity`, `@Document`, `class`, `record`, `interface`, schema files | Business nouns |
| Operations | `*Service`, `*Manager`, `*Handler`, `*Policy` | Business rules, not utilities |
| Workflows | `*UseCase`, `*Command`, `*Interactor`, saga or process classes | Business processes, not CRUD |
| Entry points | `*Controller`, `*Resolver`, routes, message listeners | The capability exposed |
| Facts | `*Event`, topics, queue names | Past-tense business facts |

Record each concept with its path. A concept without a path is `inferred`.

## Step 2. Group by Ubiquitous Language

For each concept ask: which business vocabulary does it speak? `Subscription`, `Invoice`, `Payment` speak billing. `Shipment`, `Carrier`, `Route` speak fulfillment.

Then look for linguistic boundaries:

- The same term with different attributes, rules or lifecycle in two places.
- A term that needs a qualifier to be understood ("billing customer", "support customer").
- Mapping or conversion code between two shapes of the same word.

Each boundary found is a candidate bounded context edge. Record the term, both meanings and both paths.

## Step 3. Identify and classify subdomains

A subdomain has a distinct business capability, its own vocabulary, several concepts that work together and a cohesive set of operations.

```
Does it give the business a competitive advantage?
  yes -> Core Domain
  no  -> Does it need knowledge specific to this business?
           yes -> Supporting Subdomain
           no  -> Generic Subdomain
```

| Type | Signals in code | What to recommend |
|---|---|---|
| Core | Complex rules, frequent change, domain experts needed | Richest model, best people, protect from generic mechanisms |
| Supporting | Business-specific, moderate rules | Keep simple; model only where invariants exist |
| Generic | Solved problem, low differentiation | Buy, reuse or keep minimal; no tactical ceremony |

State the reason for each classification. If you cannot tell whether something differentiates the business, put it under "Open questions for the domain expert" instead of guessing.

## Step 4. Score cohesion

Score each candidate subdomain from 0 to 10. The score is a ranking heuristic.

| Dimension | Points | Question |
|---|---|---|
| Linguistic | 0-3 | Do the concepts share one vocabulary? |
| Usage | 0-3 | Are they used together in the same use cases? |
| Data | 0-2 | Do the entities reference each other directly? |
| Change | 0-2 | Do they change together (check commit history when available)? |

Total = sum of the four. 8-10 high, 5-7 medium, 0-4 low. Always list the signals next to the number.

## Step 5. Detect boundary problems

| Problem | Signal | Recommendation |
|---|---|---|
| Linguistic mismatch | Two vocabularies in one module (`User` + `Subscription`) | Separate into two contexts |
| Cross-domain coupling | Module A instantiates or imports B's domain classes, enums or tables | Integrate through an interface, event or translation layer |
| Mixed responsibility | One class serves two business concerns | Split by subdomain |
| Generic inside Core | Email, PDF or file handling inside core business logic | Extract to a Generic subdomain behind an interface |
| Unclear owner | A concept related to several domains | Clarify the owner; often the concept is really two concepts |
| Model shaped from outside | Database, API payload, UI or vendor types define domain classes | Restore translation at the boundary |

## Step 6. Map the contexts

Aim for one subdomain per bounded context. For each pair that interacts, choose a relationship deliberately; each implies a duty.

| Relationship | Use when | Duty |
|---|---|---|
| Partnership | Two teams succeed or fail together | Coordinated planning |
| Shared Kernel | Small, stable overlap | Joint ownership and shared tests |
| Customer/Supplier | Downstream needs influence upstream | Upstream plans for downstream |
| Conformist | Upstream will not adapt | Downstream adopts upstream model |
| Anti-corruption Layer | Upstream model would pollute yours | Real translation, tested |
| Open Host Service | Many consumers | Stable published interface |
| Published Language | Integration needs a shared, documented format | Version it |
| Separate Ways | Integration costs more than it returns | Duplicate deliberately |
| Big Ball of Mud | Legacy with no boundaries | Contain it behind a boundary; do not extend it |

Choose the integration style from business coupling and failure semantics: synchronous calls need acceptable request/response coupling; messaging must tolerate lag, duplicates and ordering limits; exposed resources must not leak aggregate internals.

## Step 7. Check dependency direction and entry points

Apply these when the system has more than a handful of domains or services. They come from Uber's Domain-Oriented Microservice Architecture and work just as well for modules in a monolith.

- **Layers.** Assign each domain a layer and allow dependencies only downward: Edge, Presentation, Product, Business, Infrastructure. Lower layers are more general and have a larger blast radius when they fail.
- **Gateway.** Give each domain one entry point. Callers use the gateway, never the internals, so the internals can be rewritten without migrating callers.
- **Extensions.** When another team needs behavior or data inside a domain, offer an extension point (a provider interface, or attached data) instead of letting them edit the core.
- **Scale.** Small teams rarely need separate services; recommend modules with enforced boundaries. Mid-size systems gain from layers and gateways. Large systems gain the most from all four.

## Before reporting

- Every domain: name from the business language, type with reason, capability, key concepts with paths, cohesion with signals.
- Every dependency: direction, relationship, integration style.
- Issues ordered by priority, each with location and recommendation.
- Unanswered business questions listed for the domain expert.
