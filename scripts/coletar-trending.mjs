#!/usr/bin/env node

import { execFile } from "node:child_process";
import { readFile, rename, unlink, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { promisify } from "node:util";

const executarArquivo = promisify(execFile);
const RAIZ = resolve(import.meta.dirname, "..");
const CAMINHO_TRENDING = resolve(RAIZ, "data/trending.json");
const CAMINHO_HISTORICO = resolve(RAIZ, "data/historico.json");
const DIA_MS = 86_400_000;
const MAXIMO_HISTORICO_DIAS = 30;
const DESCRICAO_INICIO_CARACTERES = 160;
const IDADE_MINIMA_RANKING_DIAS = 7;

function lerOpcoes(argumentos) {
  const opcoes = { dias: 7, limite: 40, semHn: false };

  for (let indice = 0; indice < argumentos.length; indice += 1) {
    const argumento = argumentos[indice];
    if (argumento === "--sem-hn") {
      opcoes.semHn = true;
      continue;
    }
    if (argumento === "--dias" || argumento === "--limite") {
      const valor = Number.parseInt(argumentos[indice + 1], 10);
      if (!Number.isInteger(valor) || valor < 1) {
        throw new Error(`O valor de ${argumento} deve ser um número inteiro maior que zero.`);
      }
      if (argumento === "--dias") opcoes.dias = valor;
      if (argumento === "--limite") opcoes.limite = Math.min(valor, 40);
      indice += 1;
      continue;
    }
    throw new Error(`Opção desconhecida: ${argumento}`);
  }

  return opcoes;
}

const FORMATADOR_DATA = new Intl.DateTimeFormat("en-CA", {
  timeZone: "America/Sao_Paulo",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

function dataLocal(data = new Date()) {
  return FORMATADOR_DATA.format(data);
}

function dataDiasAtras(dias, data = new Date()) {
  return dataLocal(new Date(data.getTime() - dias * DIA_MS));
}

function esperar(milissegundos) {
  return new Promise((resolver) => setTimeout(resolver, milissegundos));
}

async function escreverJsonAtomico(caminho, valor) {
  const temporario = resolve(
    dirname(caminho),
    `.${caminho.split("/").at(-1)}.${process.pid}.${Date.now()}.tmp`,
  );
  try {
    await writeFile(temporario, `${JSON.stringify(valor, null, 2)}\n`, "utf8");
    await rename(temporario, caminho);
  } catch (erro) {
    await unlink(temporario).catch(() => {});
    throw erro;
  }
}

async function lerHistorico() {
  try {
    const conteudo = JSON.parse(await readFile(CAMINHO_HISTORICO, "utf8"));
    if (!conteudo || typeof conteudo !== "object" || typeof conteudo.por_dia !== "object") {
      throw new Error("estrutura inválida");
    }
    return conteudo;
  } catch (erro) {
    if (erro.code === "ENOENT") return { por_dia: {} };
    console.warn(`Aviso: o histórico existente não pôde ser lido (${erro.message}); um novo será criado.`);
    return { por_dia: {} };
  }
}

function consultasGitHub(dataCorte) {
  const atividade = `pushed:>=${dataCorte} stars:>=5`;
  return [
    `claude skill in:name,description ${atividade}`,
    `agent skill in:name,description ${atividade}`,
    `agent skills in:name,description ${atividade}`,
    `skills claude code in:name,description ${atividade}`,
    `mcp server in:name,description ${atividade}`,
    `model context protocol in:name,description ${atividade}`,
    `claude plugin in:name,description ${atividade}`,
    `claude code plugin in:name,description ${atividade}`,
    `subagent in:name,description ${atividade}`,
    `AGENTS.md in:name,description ${atividade}`,
    `cursor rules in:name,description ${atividade}`,
    `claude code hooks in:name,description ${atividade}`,
    `topic:claude-code ${atividade}`,
    `topic:mcp ${atividade}`,
    `topic:model-context-protocol ${atividade}`,
    `topic:ai-agents ${atividade}`,
    `topic:agent-skills ${atividade}`,
    `topic:claude ${atividade}`,
    `topic:coding-agents ${atividade}`,
    `topic:llm-agents ${atividade}`,
  ];
}

async function consultarGitHub(consulta) {
  const { stdout } = await executarArquivo(
    "gh",
    [
      "api",
      "-X",
      "GET",
      "search/repositories",
      "-f",
      `q=${consulta}`,
      "-f",
      "sort=stars",
      "-f",
      "order=desc",
      "-F",
      "per_page=100",
    ],
    { encoding: "utf8", maxBuffer: 24 * 1024 * 1024, timeout: 30_000 },
  );
  const resposta = JSON.parse(stdout);
  if (!Array.isArray(resposta.items)) throw new Error("resposta sem a lista de repositórios");
  return resposta.items;
}

const TOPICOS_DOMINIO_ESPECIFICOS = new Set([
  "agent-skills",
  "ai-agent",
  "ai-agents",
  "ai-skills",
  "autonomous-agents",
  "claude-code",
  "claude-code-plugin",
  "claude-plugin",
  "claude-skills",
  "coding-agent",
  "coding-agents",
  "llm-agents",
  "mcp-client",
  "mcp-server",
  "model-context-protocol",
  "multi-agent-systems",
]);

function sinaisDoRepositorio(repositorio) {
  const identificador = [repositorio.owner?.login, repositorio.name]
    .filter(Boolean)
    .join("/")
    .toLocaleLowerCase("en-US");
  const topicos = (repositorio.topics ?? []).map((topico) => topico.toLocaleLowerCase("en-US"));
  const descricaoInicio = (repositorio.description ?? "")
    .trim()
    .slice(0, DESCRICAO_INICIO_CARACTERES)
    .toLocaleLowerCase("en-US");
  return { identificador, topicos, descricaoInicio };
}

/*
 * Portão de relevância:
 * - nome/dono são sinais fortes quando contêm um termo explícito do domínio;
 * - tópicos só contam sozinhos quando são específicos. Tags genéricas como "ai",
 *   "agent", "skills" e "mcp" são fáceis de adicionar por associação distante;
 * - na descrição, apenas os 160 primeiros caracteres contam. Assim, uma menção
 *   incidental escondida no restante do texto não promove um repositório.
 * As três regras ficam separadas para que o filtro seja auditável, não uma
 * pontuação opaca.
 */
function temSinalForte(repositorio) {
  const { identificador, topicos, descricaoInicio } = sinaisDoRepositorio(repositorio);
  const termoNoIdentificador =
    /\b(agents?|agentic|claude|codex|mcp|model context protocol|skills?|subagents?)\b/.test(
      identificador,
    );
  const topicoEspecifico = topicos.some((topico) => TOPICOS_DOMINIO_ESPECIFICOS.has(topico));
  const termoNoInicioDaDescricao =
    /\bmodel context protocol\b|\bmcp[- ]?(server|client|tool)s?\b|\b(claude|claude code|ai|agent)[ -]?(plugin|extension|marketplace)s?\b|\b(agent|agentic|ai|claude|claude code|codex)[ -]?skills?\b|\bskills? for (agents?|claude|claude code|codex)\b|\b(ai|llm|coding|autonomous|software|claude code)[ -]?agents?\b|\b(agentic|multi-agent|subagent|agent framework|claude code)\b/.test(
      descricaoInicio,
    );
  return termoNoIdentificador || topicoEspecifico || termoNoInicioDaDescricao;
}

/*
 * Classificação objetiva, em ordem da categoria mais específica para a mais ampla:
 * 1. mcp: tópico ou sinal de peso identifica MCP/Model Context Protocol;
 * 2. plugin: sinal de peso identifica plugin, extensão ou marketplace do Claude;
 * 3. skill: sinal de peso identifica skill reutilizável de agente/Claude;
 * 4. config: regras, hooks, comandos ou arquivos AGENTS.md/CLAUDE.md;
 * 5. agente: sinal de peso identifica agentes de IA, código ou sistemas multiagente.
 * A classificação só acontece depois do portão de relevância acima.
 */
function classificar(repositorio) {
  if (!temSinalForte(repositorio)) return null;

  const { identificador, topicos, descricaoInicio } = sinaisDoRepositorio(repositorio);
  const conjuntoTopicos = new Set(topicos);
  const texto = `${identificador} ${topicos.join(" ")} ${descricaoInicio}`;

  if (
    conjuntoTopicos.has("mcp") ||
    conjuntoTopicos.has("mcp-server") ||
    conjuntoTopicos.has("model-context-protocol") ||
    /\bmodel context protocol\b|\bmcp[- ]?(server|servers|client|clients|tool|tools)?\b/.test(texto)
  ) {
    return "mcp";
  }
  if (
    conjuntoTopicos.has("claude-plugin") ||
    conjuntoTopicos.has("claude-code-plugin") ||
    /\b(claude|claude code|ai|agent)[ -]?(plugin|plugins|extension|extensions|marketplace)\b|\bplugin for (claude|claude code)\b/.test(
      texto,
    )
  ) {
    return "plugin";
  }
  if (
    ["agent-skills", "claude-skills", "ai-skills", "skill", "skills"].some((topico) =>
      conjuntoTopicos.has(topico),
    ) ||
    /\b(agent|agents|agentic|ai|claude|claude code|codex)[ -]?(skill|skills)\b|\bskills? for (agents?|claude|claude code|codex)\b|\bskills?\b/.test(
      texto,
    )
  ) {
    return "skill";
  }
  if (
    conjuntoTopicos.has("cursor-rules") ||
    /\b(agents\.md|claude\.md|cursor rules?|claude(?: code)?[ -]?(configuration|configs?|hooks?|slash commands?))\b/.test(
      texto,
    )
  ) {
    return "config";
  }
  if (
    [
      "ai-agent",
      "ai-agents",
      "llm-agents",
      "autonomous-agents",
      "multi-agent-systems",
      "coding-agent",
      "coding-agents",
      "claude-code",
    ].some((topico) => conjuntoTopicos.has(topico)) ||
    /\b(ai|llm|coding|autonomous|software|claude code)[ -]?(agent|agents)\b|\b(agentic|multi-agent|subagent|agent framework)\b/.test(
      texto,
    )
  ) {
    return "agente";
  }
  return null;
}

function candidatoValido(repositorio) {
  return (
    repositorio &&
    typeof repositorio.full_name === "string" &&
    typeof repositorio.html_url === "string" &&
    Number.isFinite(repositorio.stargazers_count) &&
    !repositorio.archived &&
    !repositorio.disabled &&
    !repositorio.fork &&
    classificar(repositorio) !== null
  );
}

function idadeEmDias(criadoEm, agora = Date.now()) {
  const criadoEmMs = Date.parse(criadoEm);
  if (!Number.isFinite(criadoEmMs)) return null;
  return Math.max(1, (agora - criadoEmMs) / DIA_MS);
}

function transformarRepositorio(repositorio) {
  const criadoEm =
    typeof repositorio.created_at === "string" && Number.isFinite(Date.parse(repositorio.created_at))
      ? repositorio.created_at
      : null;
  const idadeDias = idadeEmDias(criadoEm);
  const estrelasPorDiaVida =
    idadeDias === null ? null : Number((repositorio.stargazers_count / idadeDias).toFixed(1));

  return {
    id: repositorio.full_name,
    nome: repositorio.name,
    dono: repositorio.owner.login,
    url: repositorio.html_url,
    categoria: classificar(repositorio),
    descricao: repositorio.description ?? "",
    descricao_pt: null,
    estrelas: repositorio.stargazers_count,
    ganho_periodo: null,
    ganho_por_dia: null,
    comentado_em: null,
    atualizado_em: repositorio.pushed_at ?? repositorio.updated_at,
    criado_em: criadoEm,
    estrelas_por_dia_vida: estrelasPorDiaVida,
    linguagem: repositorio.language ?? null,
    topicos: Array.isArray(repositorio.topics) ? repositorio.topics : [],
    novo: null,
  };
}

async function coletarCandidatos() {
  const consultas = consultasGitHub(dataDiasAtras(90));
  const unicos = new Map();
  let falhas = 0;

  for (const [indice, consulta] of consultas.entries()) {
    try {
      const repositorios = await consultarGitHub(consulta);
      for (const repositorio of repositorios) {
        if (candidatoValido(repositorio)) unicos.set(repositorio.full_name, repositorio);
      }
    } catch (erro) {
      falhas += 1;
      console.warn(`Aviso: consulta GitHub ${indice + 1}/${consultas.length} falhou: ${erro.message}`);
    }
    if (indice < consultas.length - 1) await esperar(250);
  }

  return { consultas: consultas.length, falhas, repositorios: [...unicos.values()] };
}

const TERMOS_HN = [
  "github.com",
  "claude code",
  "claude skills",
  "agent skills",
  "mcp",
  "model context protocol",
  "subagent",
];

async function consultarHn(termo, epochInicial) {
  const url = new URL("https://hn.algolia.com/api/v1/search");
  url.searchParams.set("query", termo);
  url.searchParams.set("tags", "story");
  url.searchParams.set("numericFilters", `created_at_i>=${epochInicial}`);
  url.searchParams.set("hitsPerPage", "1000");

  let ultimoErro;
  for (let tentativa = 1; tentativa <= 2; tentativa += 1) {
    try {
      const resposta = await fetch(url, {
        headers: { "User-Agent": "skills-radar/1.0 (coleta pública de tendências)" },
        signal: AbortSignal.timeout(15_000),
      });
      if (!resposta.ok) throw new Error(`HTTP ${resposta.status}`);
      const dados = await resposta.json();
      if (!Array.isArray(dados.hits)) throw new Error("resposta sem histórias");
      return dados.hits;
    } catch (erro) {
      ultimoErro = erro;
      if (tentativa === 1) await esperar(800);
    }
  }
  throw ultimoErro;
}

function textoHistoria(historia) {
  return [historia.url, historia.title, historia.story_text]
    .filter(Boolean)
    .join(" ")
    .toLocaleLowerCase("en-US");
}

async function contarMencoesHn(itens, dias) {
  const epochInicial = Math.floor((Date.now() - dias * DIA_MS) / 1000);
  const historias = new Map();
  let falhas = 0;

  for (const [indice, termo] of TERMOS_HN.entries()) {
    try {
      const resultados = await consultarHn(termo, epochInicial);
      for (const historia of resultados) {
        const id = String(historia.objectID ?? `${historia.created_at_i}:${historia.title}`);
        historias.set(id, historia);
      }
    } catch (erro) {
      falhas += 1;
      console.warn(`Aviso: consulta Hacker News ${indice + 1}/${TERMOS_HN.length} falhou: ${erro.message}`);
    }
    if (indice < TERMOS_HN.length - 1) await esperar(350);
  }

  if (falhas > 0) {
    return { consultas: TERMOS_HN.length, falhas, completo: false };
  }

  const historiasComTexto = [...historias.values()].map((historia) => ({
    id: String(historia.objectID),
    texto: textoHistoria(historia),
  }));
  for (const item of itens) {
    const identificador = item.id.toLocaleLowerCase("en-US");
    const urlGitHub = `github.com/${identificador}`;
    const ids = new Set();
    for (const historia of historiasComTexto) {
      if (historia.texto.includes(urlGitHub) || historia.texto.includes(identificador)) {
        ids.add(historia.id);
      }
    }
    item.comentado_em = ids.size;
  }

  return { consultas: TERMOS_HN.length, falhas: 0, completo: true };
}

function pontuacaoEstrelas(item) {
  const idadeDias = Math.max(0, (Date.now() - Date.parse(item.atualizado_em)) / DIA_MS);
  const frescor = Math.max(0, 1 - idadeDias / 90);
  return item.estrelas * (1 + 0.03 * frescor);
}

function compararEstrelas(a, b) {
  return pontuacaoEstrelas(b) - pontuacaoEstrelas(a) || b.estrelas - a.estrelas || a.id.localeCompare(b.id);
}

/*
 * O campo publicado mostra a velocidade observada desde a criação. Para ordenar,
 * porém, repositórios com menos de sete dias usam uma janela conservadora de sete
 * dias. Isso evita extrapolar 200 estrelas de ontem como 200/dia sem esconder o
 * número real no JSON; depois da primeira semana, pontuação e campo são idênticos.
 */
function pontuacaoVelocidade(item) {
  const idadeDias = idadeEmDias(item.criado_em);
  if (idadeDias === null) return Number.NEGATIVE_INFINITY;
  return item.estrelas / Math.max(idadeDias, IDADE_MINIMA_RANKING_DIAS);
}

function compararVelocidade(a, b) {
  const velocidadeA = pontuacaoVelocidade(a);
  const velocidadeB = pontuacaoVelocidade(b);
  if (velocidadeA !== velocidadeB) return velocidadeB - velocidadeA;
  return b.estrelas - a.estrelas || a.id.localeCompare(b.id);
}

function compararMomento(a, b) {
  const ganhoA = a.ganho_por_dia ?? Number.NEGATIVE_INFINITY;
  const ganhoB = b.ganho_por_dia ?? Number.NEGATIVE_INFINITY;
  return ganhoB - ganhoA || b.estrelas - a.estrelas || a.id.localeCompare(b.id);
}

function limitarHistorico(porDia, hoje) {
  const menorData = dataDiasAtras(MAXIMO_HISTORICO_DIAS - 1, new Date(`${hoje}T12:00:00Z`));
  return Object.fromEntries(
    Object.entries(porDia)
      .filter(([data]) => /^\d{4}-\d{2}-\d{2}$/.test(data) && data >= menorData && data <= hoje)
      .sort(([a], [b]) => a.localeCompare(b)),
  );
}

function aplicarRanking(itens, historico, dias, hoje) {
  const instantaneoAtual = Object.fromEntries(itens.map((item) => [item.id, item.estrelas]));
  const porDia = limitarHistorico({ ...historico.por_dia, [hoje]: instantaneoAtual }, hoje);
  const inicioJanela = dataDiasAtras(dias - 1, new Date(`${hoje}T12:00:00Z`));
  const datasNaJanela = Object.keys(porDia).filter((data) => data >= inicioJanela && data <= hoje).sort();

  if (datasNaJanela.length < 2) {
    const comDataDeCriacao = itens.filter((item) => item.estrelas_por_dia_vida !== null).length;
    const maioriaSemData = itens.length - comDataDeCriacao > itens.length / 2;
    itens.sort(maioriaSemData ? compararEstrelas : compararVelocidade);
    return { modo: maioriaSemData ? "estrelas" : "velocidade", porDia };
  }

  const dataBase = datasNaJanela[0];
  const estrelasBase = porDia[dataBase];
  const diasDecorridos = Math.max(1, Math.round((Date.parse(`${hoje}T00:00:00Z`) - Date.parse(`${dataBase}T00:00:00Z`)) / DIA_MS));
  const ontem = dataDiasAtras(1, new Date(`${hoje}T12:00:00Z`));
  const estrelasOntem = porDia[ontem] ?? {};

  for (const item of itens) {
    const base = estrelasBase[item.id];
    item.novo = !Object.hasOwn(estrelasOntem, item.id);
    if (Number.isFinite(base)) {
      item.ganho_periodo = item.estrelas - base;
      item.ganho_por_dia = Number((item.ganho_periodo / diasDecorridos).toFixed(2));
    }
  }
  itens.sort(compararMomento);
  return { modo: "momento", porDia };
}

function distribuicaoCategorias(itens) {
  return itens.reduce((contagem, item) => {
    contagem[item.categoria] = (contagem[item.categoria] ?? 0) + 1;
    return contagem;
  }, {});
}

async function principal() {
  const opcoes = lerOpcoes(process.argv.slice(2));
  const coletaGitHub = await coletarCandidatos();
  if (coletaGitHub.falhas === coletaGitHub.consultas) {
    console.error("Erro: todas as consultas ao GitHub falharam. Os arquivos existentes foram preservados.");
    process.exitCode = 1;
    return;
  }

  const itens = coletaGitHub.repositorios.map(transformarRepositorio);
  const historico = await lerHistorico();
  const hoje = dataLocal();
  const ranking = aplicarRanking(itens, historico, opcoes.dias, hoje);
  const selecionados = itens.slice(0, opcoes.limite);

  let coletaHn = { consultas: 0, falhas: 0, completo: false };
  if (!opcoes.semHn) coletaHn = await contarMencoesHn(selecionados, opcoes.dias);

  const fontes = ["GitHub Search API"];
  if (coletaHn.completo) fontes.push("Hacker News Algolia API");
  const saida = {
    gerado_em: new Date().toISOString(),
    janela_dias: opcoes.dias,
    modo_ranking: ranking.modo,
    fontes,
    itens: selecionados,
  };

  await escreverJsonAtomico(CAMINHO_HISTORICO, { por_dia: ranking.porDia });
  await escreverJsonAtomico(CAMINHO_TRENDING, saida);

  const categorias = distribuicaoCategorias(selecionados);
  const hnPreenchidos = selecionados.filter((item) => item.comentado_em !== null).length;
  console.log(`Consultas: GitHub ${coletaGitHub.consultas} (${coletaGitHub.falhas} falhas); Hacker News ${coletaHn.consultas} (${coletaHn.falhas} falhas).`);
  console.log(`Repositórios únicos: ${coletaGitHub.repositorios.length}. Itens publicados: ${selecionados.length}.`);
  console.log(`Categorias: ${Object.entries(categorias).map(([categoria, total]) => `${categoria}=${total}`).join(", ")}.`);
  console.log(`Modo de ranking: ${ranking.modo}. Hacker News preenchido: ${hnPreenchidos}/${selecionados.length}.`);
}

principal().catch((erro) => {
  console.error(`Erro inesperado na coleta: ${erro.message}`);
  process.exitCode = 1;
});
