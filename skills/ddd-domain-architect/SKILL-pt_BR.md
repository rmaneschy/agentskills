---
name: ddd-domain-architect
description: Use esta skill para analisar, projetar ou revisar um domínio de negócio no código com Domain-Driven Design - mapear subdomínios e bounded contexts, decidir quais componentes pertencem a qual domínio, encontrar lógica de negócio duplicada entre componentes, revisar ou refatorar entidades, agregados e value objects anêmicos, e manter o glossário e os ADRs do projeto afiados. Use quando o usuário perguntar onde traçar fronteiras de serviços ou módulos, quais componentes ficam juntos, o que pode ser consolidado, se o código "é um bom DDD", ou quando os termos de domínio da conversa estiverem vagos ou contradisserem o código, mesmo que ele nunca diga "DDD". NÃO use para detecção de copia-e-cola em nível de linha (use um linter), métricas de dependência ou acoplamento sem pergunta de domínio, design de UI ou infraestrutura, nem CRUD simples sem regras de negócio.
license: MIT. Adapts material licensed under CC-BY-4.0 and MIT; attribution in NOTICE.md
metadata:
  version: "1.0.0"
  language: pt-BR
  translation-of: SKILL.md
---

# DDD Domain Architect

Responda ao usuário em português do Brasil. Mantenha em inglês os termos canônicos de DDD (Bounded Context, Aggregate, Value Object, Domain Event) e os nomes dos modos.

Trabalhe do negócio para fora: capacidade, subdomínio, bounded context e linguagem local vêm primeiro; padrões táticos, frameworks e persistência vêm por último e só onde pagam o próprio custo. Todo achado precisa apontar para uma evidência no código ou para algo que o usuário disse.

## 1. Escolha o modo antes de qualquer coisa

| O usuário quer... | Modo | Carregar | Ponto de parada |
|---|---|---|---|
| saber quais domínios existem, classificar subdomínios, achar bounded contexts, posicionar fronteiras de serviço | **MAP** | [references/strategic-analysis.md](references/strategic-analysis.md) | Só relatório |
| decidir quais componentes existentes ficam juntos, organizar o código por domínio | **GROUP** | [references/component-grouping.md](references/component-grouping.md) Parte A | Apresente o plano; pergunte antes de mover arquivos |
| achar lógica de negócio duplicada entre componentes, decidir o que consolidar | **CONSOLIDATE** | [references/component-grouping.md](references/component-grouping.md) Parte B | Recomende; pergunte antes de unificar |
| validar, revisar ou checar um modelo de domínio ("isso é um bom DDD?") | **REVIEW** | [references/tactical-modeling.md](references/tactical-modeling.md) seções 1-2 | Relate e pergunte "Aplico essas correções?" |
| corrigir, refatorar ou enriquecer um modelo de domínio | **REFACTOR** | [references/tactical-modeling.md](references/tactical-modeling.md) todas as seções | Diff antes/depois por classe |
| projetar um modelo novo ("como modelo X?") | **DESIGN** | [references/tactical-modeling.md](references/tactical-modeling.md) seção 2, mais strategic-analysis.md se o contexto for desconhecido | Proposta; sem código até haver acordo |
| fechar um termo, escrever o glossário, registrar uma decisão | **LANGUAGE** | [references/language-and-decisions.md](references/language-and-decisions.md) | Escreva na hora, conforme acontece |

- Pedido que cruza modos roda nesta ordem: MAP, GROUP, CONSOLIDATE, REVIEW. Termine e relate um antes de começar o próximo.
- Se o modo não estiver claro, faça uma pergunta: "Você quer um mapa dos domínios, um reagrupamento dos componentes ou uma revisão do código do modelo?"
- LANGUAGE também é um dever de fundo em todos os outros modos (regra 7).

## 2. Regras que valem em todos os modos

1. **Linguagem antes de estrutura.** Agrupe pelo vocabulário que o negócio usa, nunca por camada técnica. A mesma palavra com dois significados marca uma fronteira de contexto.
2. **Evidência ou rótulo.** Cite um caminho (`src/billing/Invoice.java:42`) para cada afirmação. Marque como `inferido` o que não pôde verificar.
3. **Invista na proporção certa.** Modelagem rica vai para o Core Domain. Subdomínios Supporting e Generic ficam simples. Nunca empurre padrões táticos para CRUD.
4. **Somente leitura por padrão.** Modos de análise não alteram nada. Mudanças exigem o sim explícito do usuário, porque mover uma fronteira é caro de desfazer.
5. **Pontuação ordena, não mede.** As pontuações de coesão e anemia servem para ordenar os achados. Diga isso e mostre os sinais por trás de cada nota.
6. **Fronteiras explícitas.** Toda dependência entre contextos recebe um relacionamento nomeado, uma direção e um dono da tradução. Prefira um ponto de entrada por domínio.
7. **Registre enquanto acontece.** Quando um termo for resolvido, atualize o glossário na hora. Ofereça um ADR só quando a decisão for difícil de reverter, surpreendente sem contexto e fruto de um trade-off real.

## 3. Fluxo de trabalho

Progresso:
- [ ] 1. Escopo: confirme o caminho alvo e o que o usuário fará com o resultado.
- [ ] 2. Leia o conhecimento de domínio existente: `GLOSSARY.md`, `GLOSSARY-MAP.md`, `docs/adr/`. O que está escrito ali vale mais do que o que você infere do código.
- [ ] 3. Carregue a referência do modo e siga os passos dela.
- [ ] 4. Escreva a saída com o modelo da seção 5.
- [ ] 5. Rode a checagem final da seção 6. Corrija o que falhar e cheque de novo.
- [ ] 6. Entregue e indique o próximo modo mais útil.

## 4. Armadilhas

- Anotação de framework não é building block. `@Entity` do JPA, schema do Mongoose ou model do Prisma é mapeamento de persistência; decida entre Entity e Value Object pela identidade e pelo ciclo de vida, não pela anotação.
- Pasta não é domínio. `services/`, `controllers/`, `utils/` são camadas. Quando o código estiver organizado por camada, monte o inventário de componentes a partir dos substantivos de negócio nos nomes de classes e rotas.
- Mesmo nome não significa mesmo conceito. `Customer` em Vendas e `Customer` em Suporte são dois modelos. Não relate como duplicação e não unifique; traduza na fronteira.
- Comum a todos os componentes é infraestrutura (log, autenticação, métricas). Comum a alguns é domínio (notificação, auditoria, precificação). Só o segundo tipo é candidato a consolidação.
- Consolidar pode aumentar o acoplamento. Compare as dependências de entrada antes e depois; alguma duplicação custa menos do que um gargalo compartilhado.
- Subdomínios Generic pontuam baixo em coesão por natureza. Coesão baixa significa "olhe aqui", não "está quebrado".
- Shared Kernel sem dono conjunto e sem testes é uma dependência escondida. Recomende outro relacionamento.
- Anti-corruption Layer que só repassa chamadas é um pass-through. Verifique se ela traduz.
- Muitos Domain Services, ou um evento por alteração de campo, são sinais de modelo anêmico, não de modelo rico.
- Não recomende microsserviços por padrão. Um monólito modular com fronteiras verificadas é a resposta certa para a maioria das bases pequenas e médias.
- No modo REVIEW, nunca edite. Quem pergunta "isso está correto?" não pediu uma refatoração.

## 5. Saída

Use este esqueleto e adapte as seções ao modo. Os modelos completos por modo estão em [assets/report-templates.md](assets/report-templates.md); carregue-o quando o relatório tiver mais de um domínio ou mais de cinco achados.

```markdown
# <Modo>: <alvo>

## Resumo
<3 linhas: o que foi analisado, o principal achado, o próximo passo recomendado>

## Achados
| # | Prioridade | Onde | Achado | Evidência | Recomendação |
|---|------------|------|--------|-----------|--------------|

## Retrato do domínio
<lista de domínios, context map ou diagnóstico de classes, conforme o modo>

## Perguntas em aberto para o especialista de domínio
- <o que o código não consegue responder>
```

## 6. Checagem final

- [ ] Todo achado tem evidência ou está marcado como `inferido`.
- [ ] Todo subdomínio está classificado como Core, Supporting ou Generic, com o motivo.
- [ ] Toda dependência entre contextos tem nome de relacionamento e direção.
- [ ] Nenhum padrão tático foi recomendado para código sem invariantes ou ciclo de vida.
- [ ] As pontuações mostram seus sinais e são descritas como heurísticas.
- [ ] Os termos resolvidos na sessão estão no glossário; todo ADR oferecido atende aos três critérios.
- [ ] Nada foi alterado sem o sim do usuário.
