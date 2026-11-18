# Component grouping and consolidation (GROUP and CONSOLIDATE modes)

A **component** is a leaf namespace, package or directory that contains source files and serves one purpose. A **domain** is a group of components that serves one business capability. Namespaces are how a domain becomes visible in code.

## Part A. Group components into domains (GROUP)

### A1. Inventory

List every component with its path, a one-line responsibility and its incoming and outgoing dependencies. If a MAP report exists, start from its domain list.

### A2. Name the domains

Name domains after business capabilities, using words the business uses. Prefer a few well-formed domains to many thin ones; a domain with one tiny component usually belongs to a neighbor.

### A3. Assign each component

| Component | Current namespace | Domain | Fit | Evidence |
|---|---|---|---|---|
| Billing Payment | `services/billing/payment` | Customer | Good | Uses `Customer`, `Contract`; called only by customer flows |

Fit is Good, Partial or Poor. For Partial or Poor, ask: does the component speak this domain's vocabulary, is it used mainly by this domain, and does it change with it? A component that fits nowhere usually mixes two responsibilities; recommend splitting it before assigning it.

### A4. Plan namespace alignment

Show the target so the domain is visible in the path:

```
Before                         After
services/billing/payment       services/customer/billing/payment
services/billing/history       services/customer/billing/history
services/supportcontract       services/customer/supportcontract
```

Order the plan by priority: components with Poor fit and high incoming dependencies first. For each move list the files affected and the imports that will change. Do not move anything without approval.

### A5. Draw the domain map

List each domain with its components and the dependencies between domains, with direction. Flag every pair of domains that depend on each other in both directions.

## Part B. Find common domain logic (CONSOLIDATE)

### B1. Separate domain from infrastructure

- **Common to some components**: domain functionality (notification, audit, validation, pricing). Candidate for consolidation.
- **Common to all components**: infrastructure (logging, metrics, security). Out of scope here.

### B2. Look for three signals

1. **Namespace pattern**: components that end in the same leaf, such as `*.notification`, `*.audit`, `*.validation`.
2. **Shared class**: one class imported by several components, such as `SMTPConnection` used in five places.
3. **Similar behavior**: different components doing the same business job with small variations.

### B3. Confirm it is the same concept

Before calling something duplicated, check that it means the same thing in each place: same rules, same lifecycle, same reason to change. If the word is shared but the rules differ, the components are in different contexts. Keep them apart and translate at the boundary.

### B4. Measure the coupling impact

Count incoming dependencies (afferent coupling, CA) before and after.

```
Before: CustomerNotification CA=2, TicketNotification CA=2, SurveyNotification CA=1   total 5
After:  Notification CA=5                                                              total 5
Verdict: no increase; safe to consolidate
```

If one consolidated component would receive most of the system's dependencies, say so; it becomes a bottleneck for change and deployment.

### B5. Recommend one approach

| Approach | Choose when |
|---|---|
| Merge components | Same context, closely related, coupling does not rise, same deployment unit is fine |
| Shared library | Logic is stable and simple; a compile-time dependency is acceptable |
| Shared service | Logic changes often, is complex or needs to scale on its own |
| Leave duplicated | Different contexts, or sharing would raise coupling more than it saves |

Default to merging inside one context and to leaving duplicates across contexts. Recommend a shared library across contexts only when the overlap is small and stable and both sides agree to own and test it together.

## Part C. Keep the boundaries with fitness functions

After a grouping is accepted, propose an automated check that fails the build when a boundary is crossed. Use the project's own tooling; these are starting points to adapt, not finished rules.

Java or Kotlin with ArchUnit:

```java
@ArchTest
static final ArchRule domains_do_not_depend_on_each_other =
    slices().matching("com.acme.(*)..").should().notDependOnEachOther();
```

TypeScript or JavaScript with dependency-cruiser:

```js
// .dependency-cruiser.js
forbidden: [{
  name: "no-cross-domain-imports",
  severity: "error",
  from: { path: "^src/([^/]+)/" },
  to:   { path: "^src/([^/]+)/", pathNot: "^src/($1|shared)/" }
}]
```

Tighten the rule to allow only each domain's entry point once gateways exist. Introduce the check in warning mode first if the codebase has many existing violations.

## Before reporting

- Every component is assigned to exactly one domain, with fit and evidence.
- Every consolidation candidate has a same-concept check and a before/after coupling count.
- The plan is ordered by priority and nothing has been moved.
