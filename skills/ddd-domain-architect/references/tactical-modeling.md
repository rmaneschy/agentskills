# Tactical modeling (REVIEW, REFACTOR and DESIGN modes)

Scope: the domain layer only. DTOs, controllers and infrastructure adapters are out of scope. Before anything else, name the bounded context the code belongs to; terms only have meaning inside one.

## 1. Detect anemia

Scan each domain class and add the weights of the signals found.

| Signal | What it looks like | Weight |
|---|---|---|
| Only accessors | Every method matches `get*`, `set*`, `is*`, `has*` | +4 |
| Setter chain in a caller | `order.setA(); order.setB();` for one business operation | +3 |
| Service mutates the entity | `entity.setX(computed)` inside a service method | +3 |
| Public setter on a business field | `public void setStatus(...)` | +2 |
| Coordinator service | `repo.find()` followed by several setters and `save()` | +2 |
| Primitive obsession | `String customerId`, `BigDecimal amount` + `String currency` | +1 |
| Missing guards | State-changing methods with no precondition | +1 |

| Score | Severity | Meaning |
|---|---|---|
| 0 | None | Well modeled |
| 1-3 | Mild | Minor; fix when touching the class |
| 4-6 | Moderate | Business logic is leaking out; refactor |
| 7+ | Severe | The class is a data bag; redesign |

Language notes: Lombok `@Data` or `@Setter` on a domain class counts as public setters. Kotlin `var` and TypeScript public mutable properties count the same way. A Java `record` used as a Value Object is fine.

Skip the score for classes with no invariants or lifecycle. Simple CRUD stays simple; report it as "no tactical modeling needed".

## 2. Choose the building block

| Question | Answer | Building block |
|---|---|---|
| Does identity matter over time? | Yes | **Entity** |
| Is it defined only by its values? | Yes | **Value Object** (immutable, validated at construction, equal by value) |
| Do several objects share an invariant that must hold in one transaction? | Yes | **Aggregate** with one root |
| Does the operation involve several aggregates and belong to none? | Yes | **Domain Service** |
| Did something happen that the business cares about? | Yes | **Domain Event**, named in the past tense |
| Is it loading, calling, saving and publishing? | Yes | **Application Service** (coordinates; owns no business decision) |

Prefer Value Objects to Entities and small Aggregates to large ones.

### Aggregate rules

1. Modify only through the root; hide mutable internals.
2. Reference other aggregates by identity, never by object reference.
3. Change one aggregate per transaction. When a rule spans aggregates, list the invariant that needs immediate consistency; if there is none, use an event and eventual consistency.
4. Start with root plus Value Objects. Add child entities only for a real shared invariant.

### Other building blocks

- **Repository**: one per aggregate root, with an interface phrased in domain terms. It returns domain objects, holds no business rules and is not a table-shaped DAO.
- **Domain Event**: a completed business fact with a payload in the local language. Not a command, not one per field change, no framework or persistence types.
- **Domain Service**: use sparingly. Many of them means behavior has left the entities.
- **Factory**: use when creation is complex enough that a half-built object could escape.

## 3. Refactor (REFACTOR mode only)

Apply in this order and show a before/after diff for each class touched. Run the tests after each move.

1. Replace a setter chain with one method named in the domain language.
2. Move the logic from the service into the aggregate that owns the data.
3. Add guards at the top of each state-changing method.
4. Publish a Domain Event after each successful state change that the business cares about.
5. Replace primitives with Value Objects.
6. Reduce the service to coordination: load, call, save, publish.

```java
// Before: the service decides, the entity is a bag
order.setStatus(OrderStatus.CONFIRMED);
order.setConfirmedAt(Instant.now());
orderRepository.save(order);

// After: intent, guards, state and event live in the aggregate
order.confirm(clock);
orderRepository.save(order);

public void confirm(Clock clock) {
    if (status != OrderStatus.PLACED) throw new OrderNotConfirmable(id, status);
    if (lines.isEmpty()) throw new EmptyOrder(id);
    this.status = OrderStatus.CONFIRMED;
    this.confirmedAt = clock.instant();
    registerEvent(new OrderConfirmed(id, confirmedAt));
}
```

Name methods from the domain, not from CRUD: `confirm`, `commitTo`, `reschedule`, not `setStatus` or `update`.

## 4. Test the model

Write tests in the domain language: aggregate invariants, allowed and forbidden transitions, Value Object validation, and events as outcomes. When a refactor changes behavior, add the test for the invalid state first.

## 5. Report format

```markdown
## Diagnosis: <ClassName> (<bounded context>)

Severity: None | Mild | Moderate | Severe (score <n>: <signals found>)
Building block today: <what it is>  ->  should be: <what it should be>

Issues:
- <problem> (<path:line>)

Recommended moves:
- <move number and description>
```

In REVIEW mode stop after the report and ask "Apply these fixes?".
