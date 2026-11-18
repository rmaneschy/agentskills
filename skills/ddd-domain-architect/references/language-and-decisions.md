# Language and decisions (LANGUAGE mode, and a duty in every mode)

This is the active discipline of changing the model: challenging terms, testing them against scenarios and code, and writing the result down when it settles. Reading the glossary for vocabulary is just a habit; this file is for when the model is changing.

## 1. Where the files live

```
Single context (most repos)        Multiple contexts
/GLOSSARY.md                       /GLOSSARY-MAP.md
/docs/adr/0001-<slug>.md           /docs/adr/                 system-wide decisions
                                   /src/ordering/GLOSSARY.md
                                   /src/ordering/docs/adr/    context decisions
```

- If `GLOSSARY-MAP.md` exists, read it to find the contexts. If only `GLOSSARY.md` exists, there is one context.
- Create files lazily: the glossary when the first term is resolved, `docs/adr/` when the first ADR is needed.
- With several contexts, infer which one the topic belongs to; ask if it is unclear.
- If the project already uses another name or location for these files, follow the project.

## 2. Moves during the conversation

- **Challenge against the glossary.** "The glossary defines 'cancellation' as X, but you seem to mean Y. Which is it?"
- **Sharpen fuzzy terms.** "You say 'account'. Do you mean the Customer or the User?" Propose one canonical term.
- **Test with scenarios.** Invent a concrete edge case that forces a decision about where one concept ends and the next begins.
- **Check against code.** "The code cancels whole Orders, but you said partial cancellation exists. Which is right?"
- **Write it down at once.** Update the glossary when a term is resolved. Do not batch.

## 3. Glossary format

```md
# {Context name}

{One or two sentences: what this context is and why it exists.}

## Language

**Order**:
A customer's request to buy one or more items.
_Avoid_: Purchase, transaction
```

Rules:

- Be opinionated: pick one word and list the others under `_Avoid_`.
- One or two sentences. Define what the thing IS, not what it does.
- Only terms specific to this context. No general programming concepts.
- No implementation details. The glossary is not a spec, a scratch pad or a decision log.
- Group under subheadings when natural clusters appear.

Glossary map for several contexts:

```md
# Glossary Map

## Contexts
- [Ordering](./src/ordering/GLOSSARY.md): receives and tracks customer orders
- [Billing](./src/billing/GLOSSARY.md): generates invoices and processes payments

## Relationships
- **Ordering -> Billing**: Customer/Supplier; Ordering emits `OrderPlaced`, Billing consumes it
```

## 4. ADRs, sparingly

Offer an ADR only when all three are true:

1. **Hard to reverse**: changing your mind later has a real cost.
2. **Surprising without context**: a future reader will ask why it was done this way.
3. **A real trade-off**: there were alternatives and one was chosen for specific reasons.

Typical cases: integration pattern between contexts, ownership of data, a technology with lock-in, a deliberate deviation from the obvious path, a constraint invisible in the code, a rejected alternative that someone will suggest again.

Format: `docs/adr/NNNN-slug.md`, numbered from the highest existing number.

```md
# {Short title of the decision}

{1-3 sentences: the context, what was decided, and why.}
```

Add `Status`, `Considered Options` or `Consequences` only when they carry information.
