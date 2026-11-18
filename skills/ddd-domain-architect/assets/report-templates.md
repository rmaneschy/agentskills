# Report templates

Use the block for the current mode. Drop sections that have no content.

## MAP

```markdown
## Domain: {Name}

**Type**: Core | Supporting | Generic. Reason: {why}
**Business capability**: {what business problem it solves}
**Ubiquitous Language**: {key terms}
**Key concepts**:
- {Concept} ({Entity|Service|UseCase|Event}) at {path}
**Cohesion**: {n}/10 (linguistic {0-3}, usage {0-3}, data {0-2}, change {0-2})
**Suggested bounded context**: {Name}
- Linguistic boundary: {where the terms change meaning}
- Entry point: {gateway or module API}
**Dependencies**:
- -> {Other} via {relationship}, {sync|async}
```

```markdown
## Context map

| From | To | Relationship | Style | Translation owner | Issue |
|------|----|--------------|-------|-------------------|-------|
```

## GROUP

```markdown
## Component assignment

| Component | Current namespace | Domain | Fit | Evidence |
|-----------|-------------------|--------|-----|----------|

## Namespace alignment plan

| Priority | Component | From | To | Files | Imports to update |
|----------|-----------|------|----|-------|-------------------|

## Domain dependencies

| Domain | Depends on | Direction ok? | Note |
|--------|-----------|---------------|------|
```

## CONSOLIDATE

```markdown
## Consolidation opportunities

| Concept | Found in | Same concept? | CA before | CA after | Recommendation |
|---------|----------|---------------|-----------|----------|----------------|

### {Concept}: {Merge | Shared library | Shared service | Leave duplicated}
- Why: {reason}
- Steps: {ordered moves}
- Risk: {coupling, deployment, ownership}
```

## REVIEW and REFACTOR

```markdown
## Diagnosis: {ClassName} ({bounded context})

Severity: {None|Mild|Moderate|Severe} (score {n}: {signals})
Building block today: {x} -> should be: {y}

Issues:
- {problem} ({path:line})

Recommended moves:
- {move}
```

## Any mode

```markdown
## Issues

### Priority: High
**{Issue}**
- Where: {path}
- Problem: {what is wrong}
- Evidence: {what was observed}
- Recommendation: {fix}

## Open questions for the domain expert
- {question the code cannot answer}
```
