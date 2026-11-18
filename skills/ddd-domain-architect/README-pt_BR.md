# ddd-domain-architect

Uma Agent Skill que ajuda um agente de código a analisar, projetar e revisar um domínio de negócio no código com Domain-Driven Design. Ela reúne as partes mais fortes de cinco skills públicas em um único roteador com sete modos e segue a [especificação Agent Skills](https://agentskills.io/specification).

Versão em inglês: [README.md](README.md) e [SKILL.md](SKILL.md).

## O que ela faz

| Modo | Pergunta que responde | Referência carregada |
|---|---|---|
| MAP | Quais domínios existem, qual a importância de cada um, onde ficam as fronteiras de contexto? | `references/strategic-analysis.md` |
| GROUP | Quais componentes existentes pertencem a qual domínio? | `references/component-grouping.md` Parte A |
| CONSOLIDATE | Qual lógica de negócio está duplicada e deve ser unificada? | `references/component-grouping.md` Parte B |
| REVIEW | Este modelo de domínio é anêmico? Qual building block cada classe deveria ser? | `references/tactical-modeling.md` |
| REFACTOR | Levar o comportamento para dentro do modelo, passo a passo | `references/tactical-modeling.md` |
| DESIGN | Como modelar um conceito novo? | `references/tactical-modeling.md` |
| LANGUAGE | O que este termo significa, e esta decisão deve ser registrada? | `references/language-and-decisions.md` |

## Estrutura

```
ddd-domain-architect/
├── SKILL.md                      o que o agente carrega na ativação (94 linhas, cerca de 1.900 tokens)
├── SKILL-pt_BR.md                tradução do SKILL.md para português
├── README.md / README-pt_BR.md   para pessoas; o agente nunca carrega
├── references/
│   ├── strategic-analysis.md     MAP
│   ├── component-grouping.md     GROUP, CONSOLIDATE, fitness functions
│   ├── tactical-modeling.md      REVIEW, REFACTOR, DESIGN
│   └── language-and-decisions.md LANGUAGE: formatos de glossário e ADR
├── assets/
│   └── report-templates.md       modelos completos de saída por modo
└── evals/
    └── trigger-queries.json      18 consultas que devem e não devem ativar
```

## Instalação

Copie a pasta para o diretório de skills do seu cliente e mantenha o nome da pasta, porque a especificação exige que `name` seja igual ao diretório pai.

```bash
# Claude Code, por projeto
cp -r ddd-domain-architect .claude/skills/

# Claude Code, por usuário
cp -r ddd-domain-architect ~/.claude/skills/
```

Outros clientes usam outros diretórios; consulte a documentação do cliente. Valide com `agentskills validate ./ddd-domain-architect` (pacote `skills-ref`).

### Usando a versão em português

Os agentes carregam apenas o arquivo chamado `SKILL.md`. Para rodar em português, substitua-o:

```bash
cd ddd-domain-architect && mv SKILL.md SKILL-en.md && mv SKILL-pt_BR.md SKILL.md
```

Os arquivos de referência ficam em inglês de propósito. Quem os lê é o modelo, não o usuário; os termos canônicos de DDD são em inglês; e manter uma cópia só evita duas versões divergindo. O `SKILL.md` em português instrui o agente a responder em português do Brasil.

## De onde veio cada parte

| Elemento desta skill | Origem | Por que foi mantido |
|---|---|---|
| Tabela de intenção que escolhe as fases e um ponto de parada | `tactical-ddd` | Única fonte que separa "verificar" de "corrigir"; evita refatoração não pedida |
| Referências carregadas sob demanda, com condição declarada | `tactical-ddd`, `domain-modeling` | Progressive disclosure como a especificação descreve |
| Descrição com frases de gatilho e "Do NOT use" | as quatro skills do tech-leads-club | Gatilhos negativos mantêm pedidos vizinhos de fora |
| Árvore de decisão de subdomínio, dimensões de coesão, regras de problema, relacionamentos de contexto | `domain-analysis` | Transforma DDD estratégico em procedimento |
| Tabela de atribuição de componentes, alinhamento de namespaces, mapa de domínios | `domain-identification-grouping` | Torna os domínios visíveis na estrutura do código |
| Teste domínio vs. infraestrutura, três sinais de duplicação, contagem de acoplamento antes e depois | `component-common-domain-detection` | Impede consolidação que só muda o problema de lugar |
| Fitness functions | `domain-identification-grouping`, `component-common-domain-detection` | Fronteira que não é verificada se desgasta |
| Sinais de anemia com peso, tabela de building blocks, movimentos de refatoração em ordem, regras de ouro | `tactical-ddd` | Trabalho frágil recebe uma sequência prescritiva |
| Movimentos de conversa, formato de glossário, ADR de três critérios, criação preguiçosa de arquivos | `domain-modeling` | Mantém linguagem e decisões em dia sem cerimônia |
| Explicar o motivo ao lado da regra | `domain-modeling` | Um agente que conhece o propósito lida com casos que a regra não previu |

## O que foi alterado ou deixado de fora, e por quê

| Decisão | Motivo |
|---|---|
| Sem "How to Use", "Quick Start" ou "When to Use" no corpo | O corpo só carrega depois que a skill foi ativada. Essas seções falam com um leitor humano e pertencem a este README. A informação de gatilho mora em `description`, único texto que o agente vê antes da ativação. |
| Sem duplicação estilo README dentro do `SKILL.md` | Três skills de origem repetem o mesmo conteúdo em `SKILL.md`, `README.md` e `QUICK-REFERENCE.md`. Cada fato tem um único dono (Pragmatic Programmer, DRY). |
| Todo arquivo de apoio é referenciado com condição de carga | Três skills de origem trazem `EXAMPLES.md` ou `QUICK-REFERENCE.md` que o `SKILL.md` nunca menciona, então o agente não tem motivo para abri-los. |
| Pontuação de coesão é uma soma simples, de 0 a 10 | A fórmula de origem divide a soma por 10, o que dá de 0 a 1, e depois lê o resultado numa escala de 8 a 10. |
| Pontuações descritas como heurísticas de ordenação | Os pesos são julgamento dos autores, não medições. A skill diz isso e mostra os sinais. |
| Fitness functions com ArchUnit e dependency-cruiser | As fontes usam pseudocódigo JavaScript com funções auxiliares não definidas. Ferramentas reais entram no CI. |
| Exemplos em Java, notas de detecção para Kotlin e TypeScript | As fontes assumem TypeScript ou Node. O método é neutro quanto à linguagem; as notas cobrem Lombok, records e propriedades mutáveis. |
| Sem marcadores de emoji, sem listas longas de faça/não faça | Repetem o que os passos já dizem e custam contexto a cada execução. |
| Seção de Armadilhas (Gotchas) adicionada | As boas práticas da especificação a tratam como o conteúdo de maior valor. Nenhuma das cinco fontes tem uma. |
| Camadas, gateways e extensões do DOMA adicionados | As skills de origem param em "sugerir integração". O artigo da Uber dá regras para direção de dependência e pontos de entrada. |
| "Não recomende microsserviços por padrão" adicionado | O próprio artigo do DOMA avisa que organizações pequenas podem não compensar o custo operacional. |
| Uma skill em vez de cinco | As quatro skills do tech-leads-club se referenciam e compartilham conceitos; uma ativação com referências sob demanda evita carregar vários corpos sobrepostos. Veja Trade-offs. |

## Como as referências moldaram as regras

| Regra na skill | Fonte |
|---|---|
| Começar por capacidade, subdomínio, contexto e linguagem; padrões táticos por último | Vernon, *Domain-Driven Design Distilled* |
| Uma linguagem por bounded context; refinar a linguagem antes de adicionar comportamento | Evans, *Domain-Driven Design* |
| Agregados pequenos, referência por identidade, um agregado por transação, repositório por raiz | Vernon, *Implementing Domain-Driven Design* |
| Nove relacionamentos de contexto, cada um com um dever; ACL precisa traduzir de verdade; Shared Kernel exige governança | Vernon, *Distilled*; Evans |
| Nada de DDD tático para CRUD ou subdomínios genéricos | Vernon, *Distilled* e *Implementing* |
| Um dono por fato; decisões reversíveis; automatizar verificações; evidência em vez de palpite | Hunt e Thomas, *The Pragmatic Programmer* |
| Camada, wrapper ou serviço precisa esconder mais do que acrescenta; sem fronteiras pass-through | Ousterhout, *A Philosophy of Software Design* |
| Camadas, um gateway por domínio, pontos de extensão, adoção incremental | Uber Engineering, *Introducing Domain-Oriented Microservice Architecture* |
| Domínios de componentes, componentes de domínio comum, fitness functions | Ford, Richards, Sadalage e Dehghani, *Software Architecture: The Hard Parts* (base de duas skills de origem) |

## Conformidade com a especificação

| Requisito | Esta skill |
|---|---|
| `name`: minúsculas, hifens, até 64 caracteres, igual ao diretório | `ddd-domain-architect` |
| `description`: até 1024 caracteres, diz o quê e quando | 794 caracteres (inglês), 869 (português) |
| `SKILL.md` abaixo de 500 linhas e cerca de 5.000 tokens | 94 linhas, cerca de 1.900 tokens |
| Referências a arquivos relativas e a um nível de profundidade | Cinco links, todos diretos a partir do `SKILL.md` |
| Campos opcionais | `license`, `metadata` (somente valores string) |
| `compatibility`, `allowed-tools` | Omitidos; a skill só precisa ler e buscar arquivos |

## Boas práticas aplicadas

- **Descrição imperativa que nomeia a intenção do usuário**, inclusive quando ele nunca diz "DDD".
- **Procedimentos em vez de declarações**: cada modo é uma sequência de passos que funciona em qualquer base de código.
- **Padrões em vez de cardápios**: unificar dentro de um contexto, manter duplicado entre contextos, monólito modular antes de serviços.
- **Especificidade proporcional à fragilidade**: os modos de análise descrevem o que procurar; REFACTOR prescreve uma ordem; tudo que altera arquivos tem ponto de parada.
- **Checklist e laço de validação**: um checklist de progresso e uma checagem final que o agente repete até passar.
- **Modelos de saída**: um esqueleto curto no corpo, modelos completos em `assets/`.
- **Detalhe moderado**: o corpo leva regras e armadilhas; o detalhe espera nas referências.

## Testes

`evals/trigger-queries.json` traz 10 consultas que devem ativar a skill e 8 quase-acertos que não devem, como "domain" de DNS, "components" de UI e mapeamento JPA. Rode cada consulta três vezes no seu cliente e compare a taxa de ativação com o rótulo, como descrito em [Optimizing skill descriptions](https://agentskills.io/skill-creation/optimizing-descriptions). A skill foi conferida quanto a formato e limites; ainda não foi executada contra bases de código reais, então trate a versão 1.0.0 como um primeiro rascunho e acrescente à seção de Armadilhas cada correção que você fizer.

## Trade-offs

- Uma skill ampla é mais difícil de ativar com precisão do que cinco estreitas. A descrição e as consultas de quase-acerto são a mitigação; se o seu catálogo já tiver `coupling-analysis` ou skills parecidas, acrescente-as à frase "NÃO use".
- Os nomes dos arquivos de glossário (`GLOSSARY.md`, `GLOSSARY-MAP.md`) seguem a `domain-modeling`. A skill manda o agente seguir a convenção do projeto se ela for diferente.
- Pontuações e pesos são heurísticas herdadas das fontes. Calibre no seu próprio código.

## Fontes e licença

MIT. Esta skill é uma adaptação; a atribuição e os avisos de licença estão em [NOTICE.md](NOTICE.md). Adaptado de:

- [tech-leads-club/agent-skills](https://github.com/tech-leads-club/agent-skills), de Tech Leads Club, conteúdo das skills sob [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/): `domain-analysis`, `domain-identification-grouping`, `component-common-domain-detection`, `tactical-ddd`
- [mattpocock/skills](https://github.com/mattpocock/skills), MIT: `domain-modeling`
- [ciembor/agent-rules-books](https://github.com/ciembor/agent-rules-books), MIT: resumos de regras dos cinco livros acima
- [Uber Engineering: Introducing Domain-Oriented Microservice Architecture](https://www.uber.com/blog/microservice-architecture/)
- [Especificação e boas práticas de Agent Skills](https://agentskills.io)
