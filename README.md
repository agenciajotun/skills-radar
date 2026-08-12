# Skills Radar

Site estático público para apresentar o LEGION.AI Skills Pack e acompanhar, todos os dias, projetos de IA em destaque. A interface tem duas abas:

- **O Pack:** landing de apresentação e captura de interesse. Não vende o produto neste momento.
- **Skills em Alta:** ranking diário de skills, agentes, plugins, servidores MCP e configurações de IA.

## Checkout

Hoje **não há checkout, preço nem botão de compra**. Quando houver um checkout aprovado, abra `assets/site.js` e preencha a constante `CHECKOUT_URL` com a URL real do provedor. Depois, sirva o site localmente e confirme que o CTA abre o endereço correto. Não publique uma URL provisória.

## Estrutura

- `index.html` — marcação das duas abas e conteúdo estático da página.
- `assets/estilo.css` — identidade visual, layout responsivo e estados de acessibilidade.
- `assets/site.js` — navegação, carregamento do ranking e constante `CHECKOUT_URL`.
- `assets/SpaceGrotesk-Variable.ttf` — fonte Space Grotesk distribuída localmente.
- `assets/OFL.txt` — licença SIL Open Font License 1.1 da Space Grotesk.
- `data/trending.json` — ranking publicado e metadados da coleta mais recente.
- `data/historico.json` — snapshots diários de estrelas usados para calcular o momento.
- `scripts/coletar-trending.mjs` — coleta dados do GitHub e do Hacker News e atualiza os JSONs.
- `scripts/enriquecer-pt.mjs` — enriquecimento local das descrições em português; não roda no Actions.
- `.github/workflows/trending.yml` — rotina diária e acionamento manual da coleta.
- `.gitignore` — arquivos locais e temporários que não entram no repositório.
- `.nojekyll` — instrui o GitHub Pages a servir os arquivos sem processamento do Jekyll.

Os arquivos `data/trending.json` e `data/historico.json` são versionados de propósito. O GitHub Pages publica o ranking a partir deles.

## Rodar a coleta localmente

Pré-requisitos: Node.js 24, GitHub CLI (`gh`) autenticado e acesso à internet.

Na raiz do repositório:

```bash
GH_TOKEN="$(gh auth token)" node scripts/coletar-trending.mjs
```

Uma execução bem-sucedida atualiza `data/trending.json` e `data/historico.json`. Confira o campo `gerado_em` e os itens gravados; se uma fonte falhar, o coletor deve registrar a indisponibilidade em vez de inventar valores.

O enriquecimento em português é uma etapa local separada. Ele depende do CLI `codex` e, por isso, não faz parte do workflow do GitHub Actions.

## Forçar a rotina no GitHub Actions

Pela interface do GitHub:

1. Abra **Actions** no repositório.
2. Selecione **Atualizar ranking diário**.
3. Clique em **Run workflow** e escolha a branch `main`.
4. Aguarde o job **Coletar e publicar dados** terminar.
5. Abra o log e confirme que houve um commit ou a mensagem de que não existiam mudanças reais.

Pela linha de comando:

```bash
gh workflow run trending.yml --ref main
gh run watch
```

A rotina agendada roda diariamente. O cron usa UTC e o GitHub pode atrasar o início, portanto nenhum comportamento depende de um minuto exato. Execuções concorrentes do mesmo ref cancelam a anterior para evitar disputa pelo commit.

## Como o ranking funciona

O ranking tem dois modos, informados no campo `modo_ranking` e mostrados na interface:

- **`estrelas`:** usado na primeira execução, quando existe apenas um snapshot. Ordena pelos totais de estrelas. Nesse momento ainda não existe “em alta”, porque não há histórico para medir crescimento; `ganho_periodo`, `ganho_por_dia` e `novo` podem ser `null`.
- **`momento`:** usado a partir do segundo dia, quando já há pelo menos dois snapshots. Prioriza o ganho de estrelas por dia calculado no período disponível.

`data/historico.json` guarda até 30 dias de totais por repositório. A diferença entre snapshots produz `ganho_periodo`; a divisão pelos dias observados produz `ganho_por_dia`. Um valor `0` é um resultado real. Um valor `null` indica que não havia histórico suficiente ou que a fonte responsável não respondeu, conforme o campo.

### Origem de cada dado

- **GitHub Search API, acessada por `gh api`:** repositório, proprietário, URL, descrição original, total de estrelas, data de atualização, linguagem e tópicos.
- **Histórico local das respostas do GitHub:** ganho no período, ganho por dia, indicação de item novo e mudança do modo `estrelas` para `momento`.
- **Hacker News Algolia API:** quantidade de discussões encontradas no período, gravada em `comentado_em`. `0` significa nenhuma discussão encontrada; `null` significa que a fonte não respondeu.

A X/Twitter API não é usada porque o acesso necessário é pago. A rotina não estima sinal social nem preenche lacunas com números inventados.

## Servir localmente

Na raiz do repositório, inicie um servidor HTTP simples:

```bash
python3 -m http.server 8000
```

Abra `http://localhost:8000`. Para encerrar, pressione `Ctrl+C` no terminal.

Abrir `index.html` diretamente por `file://` exibe o conteúdo estático, mas o navegador normalmente bloqueia o `fetch` de `data/trending.json`; nesse modo, o ranking não carrega. Use o servidor HTTP para testar a aba **Skills em Alta**.

## Isolamento do produto privado

O produto vendido mora em outro repositório, privado. **Não copie para este repositório público nenhum arquivo, documentação, captura de tela, instalador ou conteúdo do produto.** A única exceção autorizada é a fonte Space Grotesk, que deve permanecer acompanhada de `assets/OFL.txt`.

## Fonte e licença

A interface usa **Space Grotesk**, distribuída nos arquivos `assets/SpaceGrotesk-Variable.ttf` e `assets/OFL.txt` sob a **SIL Open Font License 1.1**. Preserve os dois arquivos juntos ao redistribuir a fonte.
