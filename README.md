# Skills Radar

Este repositório público existe apenas como rotina de coleta e feed de dados do ranking diário de skills, agentes, plugins, servidores MCP e configurações de IA. Ele não é o site do produto.

A experiência do produto está no arquivo `INSTALADORKITSKILLS.html`, mantido no repositório privado do produto. A aba **Skills em Alta** desse arquivo consome o JSON publicado aqui.

## Feed consumido pelo produto

URL crua:

```text
https://raw.githubusercontent.com/agenciajotun/skills-radar/main/data/trending.json
```

O arquivo `data/trending.json` contém o ranking publicado e os metadados da coleta mais recente. `data/historico.json` mantém os snapshots diários necessários para medir crescimento. Os dois arquivos são versionados de propósito e atualizados pela rotina automática.

## Estrutura

- `index.html` — página mínima que identifica este repositório como feed de dados.
- `data/trending.json` — feed publicado e consumido pelo produto.
- `data/historico.json` — até 30 dias de totais de estrelas por repositório.
- `scripts/coletar-trending.mjs` — coleta dados, calcula o ranking e atualiza os dois JSONs.
- `scripts/enriquecer-pt.mjs` — enriquecimento local opcional das descrições em português; não roda no Actions.
- `.github/workflows/trending.yml` — execução diária e acionamento manual da coleta.
- `.gitignore` — arquivos locais e temporários ignorados pelo Git.

## Rodar a coleta manualmente

Pré-requisitos: Node.js 24, GitHub CLI (`gh`) autenticado e acesso à internet.

Na raiz do repositório:

```bash
GH_TOKEN="$(gh auth token)" node scripts/coletar-trending.mjs
```

Por padrão, a rotina publica até 40 itens em uma janela de sete dias. Também aceita `--dias N`, `--limite N` (limitado a 40) e `--sem-hn`. Uma execução bem-sucedida atualiza `data/trending.json` e `data/historico.json`.

O enriquecimento em português é uma etapa local separada. Ele depende do CLI `codex` e, por isso, não faz parte do workflow do GitHub Actions.

## Forçar o workflow

Pela interface do GitHub:

1. Abra **Actions** no repositório.
2. Selecione **Atualizar ranking diário**.
3. Clique em **Run workflow** e escolha a branch `main`.
4. Aguarde o job **Coletar e publicar dados** terminar.
5. Confira o log e o campo `gerado_em` em `data/trending.json`.

Pela linha de comando:

```bash
gh workflow run trending.yml --ref main
gh run watch
```

O agendamento roda todos os dias às 04:17 UTC. O GitHub pode atrasar o início, portanto a rotina não depende de pontualidade no minuto. Execuções concorrentes do mesmo ref cancelam a anterior para evitar disputa pelo commit.

## Como o ranking funciona

O campo `modo_ranking` informa qual das três estratégias ordenou a lista:

- **`velocidade`:** modo normal do primeiro dia, quando ainda há apenas um snapshot. Ordena pela média de estrelas por dia desde a criação do repositório. Para não superestimar projetos com menos de sete dias, a pontuação de ordenação usa no mínimo sete dias de idade; o campo publicado `estrelas_por_dia_vida` continua mostrando estrelas divididas pela idade real.
- **`momento`:** usado quando há pelo menos dois snapshots na janela. Ordena por `ganho_por_dia`, calculado a partir da diferença de estrelas entre o primeiro snapshot disponível na janela e o atual.
- **`estrelas`:** último recurso no primeiro dia, quando a maioria dos itens não tem uma data de criação válida e, portanto, não é possível calcular velocidade. Ordena pelo total de estrelas com um pequeno fator de frescor da última atualização; empates usam estrelas e identificador.

No primeiro dia ainda não existe “em alta” no sentido estrito: sem dois pontos no tempo, não há crescimento observado. `velocidade` é uma aproximação histórica desde a criação, não ganho diário medido pelo feed. O crescimento real aparece no modo `momento` a partir do segundo snapshot disponível.

`data/historico.json` guarda no máximo 30 dias. Dentro da janela configurada, `ganho_periodo` é o total atual menos o total do primeiro snapshot disponível; `ganho_por_dia` divide essa diferença pelos dias decorridos. `novo` indica que o item não existia no snapshot do dia anterior. Um valor `0` é uma medição real; `null` indica falta de histórico aplicável ou indisponibilidade da fonte responsável.

## Origem de cada número

- **GitHub Search API, acessada por `gh api`:** identificador, nome, proprietário, URL, descrição original, total de estrelas, datas de criação e atualização, linguagem e tópicos. A categoria também é classificada a partir dos metadados e do texto retornados pelo GitHub.
- **Cálculo local sobre os dados do GitHub:** `estrelas_por_dia_vida`, `ganho_periodo`, `ganho_por_dia`, `novo` e a ordenação indicada por `modo_ranking`.
- **Histórico local:** snapshots em `data/historico.json`, usados como pontos de comparação do modo `momento`.
- **Hacker News Algolia API:** número de histórias encontradas na janela que mencionam o repositório, gravado em `comentado_em`. `0` significa nenhuma história encontrada; `null` significa que a fonte não respondeu de forma completa.

O array `fontes` em `data/trending.json` registra apenas as fontes que responderam de forma suficiente naquela execução. A rotina não inventa valores para preencher falhas.

## Por que X/Twitter não entra

A X/Twitter API ficou de fora porque o acesso necessário para uma coleta automatizada confiável é pago. O feed não estima sinal social, não extrai dados por meios não oficiais e não preenche a ausência com números inventados. Se essa fonte vier a ser incluída, precisará ter acesso oficial e metodologia verificável.

## Página pública mínima

`index.html` apenas explica o papel deste repositório e aponta para o arquivo de dados. Não há interface de ranking aqui: a apresentação e o uso do ranking pertencem ao produto privado.
