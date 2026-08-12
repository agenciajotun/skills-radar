"use strict";

// Preencha com a URL HTTPS da Kirvano ou Kiwify quando o checkout existir.
// Enquanto for null, a página mostra somente as opções honestas de aviso e contato.
const CHECKOUT_URL = null;

const ROTAS = new Set(["pack", "alta"]);
const CATEGORIAS = new Set(["skill", "agente", "plugin", "mcp", "config"]);
const NOMES_CATEGORIA = {
  skill: "Skill",
  agente: "Agente",
  plugin: "Plugin",
  mcp: "MCP",
  config: "Config"
};

const estado = {
  dados: null,
  categoria: "todas",
  busca: ""
};

const elementos = {
  abas: Array.from(document.querySelectorAll('[role="tab"]')),
  paineis: Array.from(document.querySelectorAll('[role="tabpanel"]')),
  aviso: document.querySelector("#cta-aviso"),
  compra: document.querySelector("#cta-compra"),
  linkCheckout: document.querySelector("#link-checkout"),
  tituloRanking: document.querySelector("#titulo-ranking"),
  explicacao: document.querySelector("#explicacao-ranking"),
  metadados: document.querySelector("#metadados-ranking"),
  controles: document.querySelector("#controles-ranking"),
  busca: document.querySelector("#busca"),
  filtros: Array.from(document.querySelectorAll(".filtro")),
  ordenacao: document.querySelector("#ordenacao-ranking"),
  estadoRanking: document.querySelector("#estado-ranking"),
  resumo: document.querySelector("#resultado-resumo"),
  lista: document.querySelector("#lista-ranking")
};

function configurarCheckout(url) {
  let checkoutValido = null;

  if (typeof url === "string" && url.trim()) {
    try {
      const destino = new URL(url);
      if (destino.protocol === "https:") checkoutValido = destino.href;
    } catch {
      checkoutValido = null;
    }
  }

  elementos.aviso.hidden = Boolean(checkoutValido);
  elementos.compra.hidden = !checkoutValido;

  if (checkoutValido) {
    elementos.linkCheckout.href = checkoutValido;
  } else {
    elementos.linkCheckout.removeAttribute("href");
  }
}

function rotaDoHash() {
  const rota = window.location.hash.slice(1);
  return ROTAS.has(rota) ? rota : "pack";
}

function ativarRota(rota, moverFoco = false) {
  elementos.abas.forEach((aba) => {
    const selecionada = aba.dataset.rota === rota;
    aba.setAttribute("aria-selected", String(selecionada));
    aba.tabIndex = selecionada ? 0 : -1;
    if (selecionada && moverFoco) aba.focus();
  });

  elementos.paineis.forEach((painel) => {
    painel.hidden = painel.id !== `painel-${rota}`;
  });
}

function navegarPara(rota, moverFoco = false) {
  if (rotaDoHash() === rota && window.location.hash) {
    ativarRota(rota, moverFoco);
    return;
  }
  window.location.hash = rota;
}

function configurarAbas() {
  elementos.abas.forEach((aba, indice) => {
    aba.addEventListener("click", () => navegarPara(aba.dataset.rota));
    aba.addEventListener("keydown", (evento) => {
      const ultima = elementos.abas.length - 1;
      let destino = null;

      if (evento.key === "ArrowRight") destino = indice === ultima ? 0 : indice + 1;
      if (evento.key === "ArrowLeft") destino = indice === 0 ? ultima : indice - 1;
      if (evento.key === "Home") destino = 0;
      if (evento.key === "End") destino = ultima;
      if (destino === null) return;

      evento.preventDefault();
      navegarPara(elementos.abas[destino].dataset.rota, true);
    });
  });

  window.addEventListener("hashchange", () => ativarRota(rotaDoHash()));

  if (!ROTAS.has(window.location.hash.slice(1))) {
    window.history.replaceState(null, "", "#pack");
  }
  ativarRota(rotaDoHash());
}

function texto(valor) {
  return typeof valor === "string" ? valor.trim() : "";
}

function numero(valor) {
  return typeof valor === "number" && Number.isFinite(valor);
}

function validarDados(dados) {
  if (!dados || typeof dados !== "object") return false;
  if (!texto(dados.gerado_em) || Number.isNaN(Date.parse(dados.gerado_em))) return false;
  if (!Number.isInteger(dados.janela_dias) || dados.janela_dias < 1) return false;
  if (!new Set(["estrelas", "momento", "velocidade"]).has(dados.modo_ranking)) return false;
  if (!Array.isArray(dados.fontes) || !dados.fontes.every((fonte) => texto(fonte))) return false;
  if (!Array.isArray(dados.itens)) return false;

  return dados.itens.every((item) => (
    item &&
    typeof item === "object" &&
    texto(item.id) &&
    texto(item.nome) &&
    texto(item.dono) &&
    texto(item.url) &&
    CATEGORIAS.has(item.categoria) &&
    numero(item.estrelas) &&
    (item.comentado_em === null || numero(item.comentado_em)) &&
    (item.descricao_pt === null || typeof item.descricao_pt === "string")
  ));
}

function formatarData(iso) {
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "America/Sao_Paulo"
  }).format(new Date(iso));
}

function formatarNumero(valor, casas = 0) {
  return new Intl.NumberFormat("pt-BR", {
    minimumFractionDigits: casas,
    maximumFractionDigits: casas
  }).format(valor);
}

function plural(valor, singular, pluralNome) {
  return valor === 1 ? singular : pluralNome;
}
function formatarIdadeRepositorio(criadoEm, referenciaIso) {
  const criadoEmMs = Date.parse(criadoEm);
  if (Number.isNaN(criadoEmMs)) return "";

  const referenciaMs = Date.parse(referenciaIso);
  const agoraMs = Number.isNaN(referenciaMs) ? Date.now() : referenciaMs;
  const dias = Math.max(0, Math.floor((agoraMs - criadoEmMs) / 86_400_000));

  if (dias === 0) return "criado hoje";
  if (dias < 30) return `criado há ${dias} ${plural(dias, "dia", "dias")}`;
  if (dias < 365) {
    const meses = Math.floor(dias / 30);
    return `criado há ${meses} ${plural(meses, "mês", "meses")}`;
  }

  const anos = Math.floor(dias / 365);
  return `criado há ${anos} ${plural(anos, "ano", "anos")}`;
}


function definirTextoRanking(dados) {
  elementos.tituloRanking.replaceChildren();
  const destaque = document.createElement("em");

  if (dados.modo_ranking === "momento") {
    elementos.tituloRanking.append("Crescimento em ");
    destaque.textContent = "Alta";
    elementos.explicacao.textContent = `Crescimento observado na janela de ${dados.janela_dias} ${plural(dados.janela_dias, "dia", "dias")}, ordenado pelo ganho médio de estrelas por dia.`;
    elementos.ordenacao.textContent = "Ordenado por crescimento médio de estrelas por dia";
  } else if (dados.modo_ranking === "velocidade") {
    elementos.tituloRanking.append("Mais estrelas por dia ");
    destaque.textContent = "desde a criação";
    elementos.explicacao.textContent = "Sem histórico de dias anteriores, a lista mostra quantas estrelas cada projeto conquistou por dia desde a criação.";
    elementos.ordenacao.textContent = "Ordenado por estrelas por dia desde a criação";
  } else {
    elementos.tituloRanking.append("Mais estreladas ");
    destaque.textContent = "hoje";
    elementos.explicacao.textContent = "O radar ainda não tem histórico suficiente para medir crescimento. Esta primeira leitura está ordenada por estrelas totais.";
    elementos.ordenacao.textContent = "Ordenado por estrelas totais — histórico em formação";
  }

  elementos.tituloRanking.append(destaque);
}

function preencherMetadados(dados) {
  const valores = elementos.metadados.querySelectorAll("strong");
  valores[0].textContent = formatarData(dados.gerado_em);
  valores[1].textContent = `${dados.janela_dias} ${plural(dados.janela_dias, "dia", "dias")}`;
  valores[2].textContent = dados.fontes.join(" + ");
}

function mostrarEstado(titulo, mensagem, erro = false) {
  elementos.estadoRanking.hidden = false;
  elementos.estadoRanking.classList.toggle("erro", erro);
  elementos.estadoRanking.replaceChildren();

  const bloco = document.createElement("div");
  const forte = document.createElement("strong");
  const paragrafo = document.createElement("p");
  forte.textContent = titulo;
  paragrafo.textContent = mensagem;
  bloco.append(forte, paragrafo);
  elementos.estadoRanking.append(bloco);
}

function ocultarEstado() {
  elementos.estadoRanking.hidden = true;
}

function criarSelo(conteudo, classe = "") {
  const selo = document.createElement("span");
  selo.className = `selo ${classe}`.trim();
  selo.textContent = conteudo;
  return selo;
}

function linkGithubValido(url) {
  try {
    const destino = new URL(url);
    return destino.protocol === "https:" && destino.hostname === "github.com" ? destino.href : null;
  } catch {
    return null;
  }
}

function criarItem(item, posicao, modo, geradoEm) {
  const linha = document.createElement("li");
  linha.className = "item-ranking";

  const numeroPosicao = document.createElement("span");
  numeroPosicao.className = "item-posicao";
  numeroPosicao.textContent = String(posicao).padStart(2, "0");
  numeroPosicao.setAttribute("aria-label", `${posicao}ª posição`);

  const conteudo = document.createElement("div");
  const topo = document.createElement("div");
  topo.className = "item-topo";

  const nome = document.createElement("h2");
  nome.className = "item-nome";
  nome.textContent = item.nome;

  const dono = document.createElement("span");
  dono.className = "item-dono";
  dono.textContent = `por ${item.dono}`;

  topo.append(nome, dono, criarSelo(NOMES_CATEGORIA[item.categoria], "selo-categoria"));
  if (item.novo === true) topo.append(criarSelo("Novo", "selo-novo"));

  const descricao = document.createElement("p");
  descricao.className = "item-descricao";
  descricao.textContent = texto(item.descricao_pt) || texto(item.descricao) || "Este repositório não tem descrição.";

  const detalhes = document.createElement("div");
  detalhes.className = "item-detalhes";
  if (texto(item.linguagem)) detalhes.append(criarSelo(item.linguagem));
  // Zero discussão não é informação, é ruído: só mostra o selo quando alguém
  // de fato comentou. Nulo (fonte não respondeu) também some.
  if (numero(item.comentado_em) && item.comentado_em > 0) {
    detalhes.append(criarSelo(`Citado em ${formatarNumero(item.comentado_em)} ${plural(item.comentado_em, "discussão", "discussões")} no Hacker News`));
  }

  conteudo.append(topo, descricao, detalhes);

  const metricas = document.createElement("div");
  metricas.className = "item-metricas";
  const principal = document.createElement("div");
  principal.className = "metrica-principal";
  const valorPrincipal = document.createElement("strong");
  const rotuloPrincipal = document.createElement("span");

  let mostrarPrincipal = true;
  if (modo === "momento") {
    if (numero(item.ganho_por_dia)) {
      const sinal = item.ganho_por_dia > 0 ? "+" : "";
      valorPrincipal.textContent = `${sinal}${formatarNumero(item.ganho_por_dia, 1)}/dia`;
    } else {
      valorPrincipal.textContent = "indisponível";
    }
    rotuloPrincipal.textContent = "ganho médio de estrelas";
  } else if (modo === "velocidade") {
    if (numero(item.estrelas_por_dia_vida)) {
      valorPrincipal.textContent = formatarNumero(item.estrelas_por_dia_vida, 1);
      rotuloPrincipal.textContent = "estrelas/dia desde a criação";
    } else {
      mostrarPrincipal = false;
    }
  } else {
    valorPrincipal.textContent = formatarNumero(item.estrelas);
    rotuloPrincipal.textContent = "estrelas totais";
  }

  if (mostrarPrincipal) principal.append(valorPrincipal, rotuloPrincipal);

  const secundarios = document.createElement("div");
  secundarios.className = "metricas-secundarias";
  if (modo === "momento") {
    secundarios.textContent = `${formatarNumero(item.estrelas)} estrelas totais`;
    if (numero(item.ganho_periodo)) {
      const sinalPeriodo = item.ganho_periodo > 0 ? "+" : "";
      secundarios.append(document.createElement("br"), `${sinalPeriodo}${formatarNumero(item.ganho_periodo)} na janela`);
    }
  } else if (modo === "velocidade") {
    secundarios.textContent = `${formatarNumero(item.estrelas)} estrelas totais`;
    const idade = formatarIdadeRepositorio(item.criado_em, geradoEm);
    if (idade) secundarios.append(document.createElement("br"), idade);
  }

  const destinoGithub = linkGithubValido(item.url);
  const link = document.createElement("a");
  link.className = "link-repositorio";
  link.textContent = "Ver no GitHub ↗";
  link.target = "_blank";
  link.rel = "noopener noreferrer";
  if (destinoGithub) {
    link.href = destinoGithub;
  } else {
    link.removeAttribute("href");
    link.textContent = "Link indisponível";
  }

  if (mostrarPrincipal) metricas.append(principal);
  if (secundarios.textContent) metricas.append(secundarios);
  metricas.append(link);
  linha.append(numeroPosicao, conteudo, metricas);
  return linha;
}

function normalizarBusca(valor) {
  return valor.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("pt-BR");
}

function itensOrdenados(dados) {
  return dados.itens
    .map((item, indice) => ({ item, posicaoOriginal: indice + 1 }))
    .sort((a, b) => {
      if (dados.modo_ranking === "momento") {
        const ganhoA = numero(a.item.ganho_por_dia) ? a.item.ganho_por_dia : Number.NEGATIVE_INFINITY;
        const ganhoB = numero(b.item.ganho_por_dia) ? b.item.ganho_por_dia : Number.NEGATIVE_INFINITY;
        if (ganhoA !== ganhoB) return ganhoB - ganhoA;
      } else if (dados.modo_ranking === "velocidade") {
        const velocidadeA = numero(a.item.estrelas_por_dia_vida) ? a.item.estrelas_por_dia_vida : Number.NEGATIVE_INFINITY;
        const velocidadeB = numero(b.item.estrelas_por_dia_vida) ? b.item.estrelas_por_dia_vida : Number.NEGATIVE_INFINITY;
        if (velocidadeA !== velocidadeB) return velocidadeB - velocidadeA;
      }
      return b.item.estrelas - a.item.estrelas;
    })
    .map(({ item }, indice) => ({ item, posicao: indice + 1 }));
}

function renderizarLista() {
  if (!estado.dados) return;

  const termo = normalizarBusca(estado.busca.trim());
  const ordenados = itensOrdenados(estado.dados);
  const filtrados = ordenados.filter(({ item }) => {
    const categoriaConfere = estado.categoria === "todas" || item.categoria === estado.categoria;
    const campoBusca = normalizarBusca([
      item.nome,
      item.dono,
      item.descricao_pt,
      item.descricao,
      item.linguagem,
      ...(Array.isArray(item.topicos) ? item.topicos : [])
    ].filter(Boolean).join(" "));
    return categoriaConfere && (!termo || campoBusca.includes(termo));
  });

  elementos.lista.replaceChildren();
  elementos.resumo.textContent = `${filtrados.length} ${plural(filtrados.length, "item encontrado", "itens encontrados")}`;

  if (!filtrados.length) {
    const vazio = document.createElement("li");
    vazio.className = "vazio-filtro";
    vazio.textContent = "Nenhum item corresponde à busca e ao filtro selecionados.";
    elementos.lista.append(vazio);
    return;
  }

  const fragmento = document.createDocumentFragment();
  filtrados.forEach(({ item, posicao }) => fragmento.append(criarItem(item, posicao, estado.dados.modo_ranking, estado.dados.gerado_em)));
  elementos.lista.append(fragmento);
}

function configurarFiltros() {
  elementos.busca.addEventListener("input", () => {
    estado.busca = elementos.busca.value;
    renderizarLista();
  });

  elementos.filtros.forEach((filtro) => {
    filtro.addEventListener("click", () => {
      estado.categoria = filtro.dataset.categoria;
      elementos.filtros.forEach((opcao) => {
        const ativa = opcao === filtro;
        opcao.classList.toggle("ativo", ativa);
        opcao.setAttribute("aria-pressed", String(ativa));
      });
      renderizarLista();
    });
  });
}

async function carregarRanking() {
  if (window.location.protocol === "file:") {
    mostrarEstado(
      "O ranking não pode carregar por file://.",
      "Navegadores bloqueiam a leitura do JSON local nesse modo. Abra o site publicado ou sirva esta pasta por HTTP para consultar o ranking.",
      true
    );
    return;
  }

  try {
    const resposta = await fetch("data/trending.json", { cache: "no-store" });
    if (!resposta.ok) throw new Error("arquivo indisponível");
    const dados = await resposta.json();
    if (!validarDados(dados)) throw new Error("arquivo inválido");

    estado.dados = dados;
    definirTextoRanking(dados);
    preencherMetadados(dados);
    elementos.controles.hidden = false;
    ocultarEstado();
    renderizarLista();
  } catch {
    elementos.controles.hidden = true;
    elementos.lista.replaceChildren();
    elementos.resumo.textContent = "";
    mostrarEstado(
      "O ranking ainda não foi gerado.",
      "A rotina diária vai preencher esta área assim que houver uma leitura válida das fontes.",
      true
    );
  }
}

configurarCheckout(CHECKOUT_URL);
configurarAbas();
configurarFiltros();
carregarRanking();
