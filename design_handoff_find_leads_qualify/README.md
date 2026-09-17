# Handoff: Find Leads Qualify — Dashboard (Visão geral dos leads)

## Overview
Tela principal de um SaaS de prospecção e qualificação de leads com IA. Reúne KPIs do mês,
tabela de leads ordenada por score preditivo, estado do motor de qualificação, funil de
pipeline, ações rápidas, gráfico de descoberta vs. qualificação, histórico de interações e
um painel lateral (drawer) com o detalhe do lead selecionado.

Idioma da interface: **português do Brasil**.

## About the Design Files
Os arquivos deste pacote são **referências de design feitas em HTML** — protótipos que mostram
aparência e comportamento pretendidos, **não código de produção para copiar**.

A tarefa é **recriar esses designs dentro do app já existente**, usando o framework,
a biblioteca de componentes, o sistema de tokens e os padrões já estabelecidos no codebase
(React/Vue/Next/Tailwind/etc.). Estrutura, cores, tipografia e medidas abaixo são a
especificação; a implementação deve seguir as convenções do projeto.

Observação técnica: o protótipo usa um runtime próprio de componentes (`support.js`,
tags `sc-for` / `sc-if` e `{{ holes }}`). Isso é **andaime do protótipo** — ignore.
Traduza `sc-for` para `.map()`, `sc-if` para renderização condicional, e os valores
calculados (`renderVals`) para props/estado do seu framework.

## Fidelity
**High-fidelity (hifi).** Cores, tipografia, espaçamentos, raios, sombras, estados de hover e
microinterações são finais. Recriar com fidelidade visual alta, mas substituindo primitivas
por componentes equivalentes do codebase (botão, badge, card, tabela, drawer, progress).

---

## Layout global

- Grid raiz: `250px | 1fr` (sidebar fixa + main). Altura mínima `100vh`.
- Fundo: três radial-gradients sobrepostos a um linear-gradient vertical (ver Design Tokens →
  Background). Sobre ele, uma malha de grid decorativa:
  `linear-gradient(rgba(120,160,255,0.055) 1px, transparent 1px)` +
  variante 90°, `background-size: 64px 64px`, com
  `mask-image: radial-gradient(1200px 800px at 40% 0%, #000 20%, transparent 78%)`,
  `pointer-events: none`, `opacity: .5`.
- Conteúdo do main: `padding: 24px 28px 40px`, seções em coluna com `gap: 20px`.
- **Responsivo**: as duas seções de conteúdo usam
  `grid-template-columns: repeat(auto-fit, minmax(340px, 1fr))` — abaixo de ~700px de largura
  útil elas empilham. KPIs: `repeat(auto-fit, minmax(210px, 1fr))`.

---

## Screens / Views

### 1. Sidebar (fixa, 250px)
**Purpose**: navegação principal + status de créditos de IA + identidade do usuário.

- Container: `padding: 26px 18px 22px`, `border-right: 1px solid rgba(120,160,255,0.12)`,
  `background: linear-gradient(180deg, rgba(10,16,34,0.72), rgba(6,9,20,0.4))`,
  `backdrop-filter: blur(18px)`, coluna com `gap: 26px`.
- **Logo**: quadrado 40×40, `border-radius: 13px`,
  `background: linear-gradient(145deg, #1E3A8A, #6D28D9 55%, #0E7490)`,
  `box-shadow: inset 0 0 0 1px rgba(160,200,255,0.28), 0 8px 26px rgba(99,102,241,0.55)`.
  Ícone: lupa com “check” interno, stroke `#DFF6FF`, 1.9px.
  Wordmark: “Find Leads” em `#E8EEFF` + “ Qualify” em `#67E8F9`, Sora 700, 14.5px,
  `letter-spacing: -0.2px`. Subtítulo: “AI PROSPECTING”, 10.5px, `#7C8AB4`,
  `letter-spacing: 1.6px`, uppercase.
- **Label de grupo**: “OPERAÇÃO”, 10px, `#5C6A94`, `letter-spacing: 1.8px`, uppercase,
  `padding: 0 10px 8px`.
- **Itens de navegação** (7): `Visão geral` · `Descobrir leads` (badge 24) ·
  `Qualificação IA` (badge 3) · `Pipeline` · `Empresas` · `Métricas` · `Configurações`.
  - Botão: `display:flex`, `gap: 11px`, `padding: 10px 12px`, `border-radius: 11px`,
    `border: 1px solid transparent`, Manrope 600 13.5px, cursor pointer,
    `transition: all .18s ease`.
  - Inativo: texto `#93A0C4`, fundo transparente.
  - Hover: `background: rgba(120,160,255,0.09)`, texto `#E8EEFF`.
  - **Ativo**: `background: linear-gradient(100deg, rgba(37,99,235,0.28), rgba(124,58,237,0.22) 60%, rgba(6,182,212,0.16))`,
    texto `#F2F7FF`, `border-color: rgba(103,232,249,0.34)`,
    `box-shadow: 0 6px 22px rgba(56,89,214,0.32), inset 0 0 22px rgba(34,211,238,0.14)`,
    e uma barra luminosa à esquerda (`position:absolute; left:-18px; top:9px; bottom:9px; width:3px; border-radius:99px`)
    com `background: linear-gradient(180deg, #67E8F9, #A855F7)` e
    `box-shadow: 0 0 10px rgba(103,232,249,0.9)`.
  - Ícone: 17×17, stroke `currentColor` 1.9px (line icons). Badge de contagem: JetBrains Mono
    10.5px, `padding: 2px 7px`, `border-radius: 99px`, `background: rgba(34,211,238,0.12)`,
    `border: 1px solid rgba(34,211,238,0.28)`, cor `#67E8F9`.
- **Card “Créditos de IA”** (rodapé): `padding: 16px`, `border-radius: 16px`,
  `border: 1px solid rgba(168,85,247,0.3)`,
  `background: linear-gradient(160deg, rgba(88,28,135,0.4), rgba(12,18,38,0.6))`,
  `box-shadow: inset 0 0 34px rgba(168,85,247,0.16)`; blob decorativo 90×90 no canto
  superior direito (`radial-gradient(circle, rgba(232,121,249,0.35), transparent 70%)`).
  Valor “7.420” JetBrains Mono 22px `#F5D0FE` + “/ 10.000” 11px `#A78BC9`.
  Barra: trilho 6px `rgba(255,255,255,0.08)`, preenchimento **74%**
  `linear-gradient(90deg, #22D3EE, #A855F7 70%, #E879F9)` com
  `box-shadow: 0 0 14px rgba(168,85,247,0.8)`.
  Botão “Aumentar plano”: largura total, `padding: 9px`, `border-radius: 10px`,
  `border: 1px solid rgba(232,121,249,0.4)`, `background: rgba(232,121,249,0.12)`,
  texto `#FBE8FF` 12px 700; hover `background: rgba(232,121,249,0.22)` +
  `box-shadow: 0 0 18px rgba(232,121,249,0.35)`.
- **Usuário**: avatar 32×32 `border-radius: 10px`,
  `background: linear-gradient(145deg, #67E8F9, #818CF8)`, iniciais “DM” Sora 700 12px `#061021`.
  Nome “Daniel Moreira” 12.5px 700; cargo “Head de Vendas” 10.5px `#7C8AB4`.
  Container: `padding: 10px`, `border-radius: 13px`, `border: 1px solid rgba(120,160,255,0.12)`,
  `background: rgba(255,255,255,0.03)`.

### 2. Header (sticky)
**Purpose**: contexto da tela, busca global, filtros e ação primária.

- `position: sticky; top: 0`, `padding: 18px 28px`,
  `border-bottom: 1px solid rgba(120,160,255,0.12)`,
  `background: rgba(6,10,22,0.72)`, `backdrop-filter: blur(22px)`, `display:flex`,
  `gap: 18px`, `flex-wrap: wrap`.
- **Título**: Sora 700 20px, `letter-spacing: -0.4px` — muda com o item de nav ativo.
  Subtítulo 12px `#7C8AB4`. Mapa título/subtítulo por rota:
  - `Visão geral` → “Visão geral dos leads” / “Painel de prospecção · 16 set 2026, 09:42”
  - `Descobrir leads` → “Descoberta de leads” / “Buscas ativas e novas fontes de dados”
  - `Qualificação IA` → “Qualificação por IA” / “Modelos de scoring e regras de ICP”
  - `Pipeline` → “Pipeline de vendas” / “Status e progressão dos leads”
  - `Empresas` → “Base de empresas” / “Dados enriquecidos e contatos”
  - `Métricas` → “Métricas e resultados” / “Performance de prospecção”
  - `Configurações` → “Configurações” / “Equipe, integrações e créditos”
- **Busca**: `flex: 1`, `min-width: 200px`, `max-width: 420px`, `padding: 10px 14px`,
  `border-radius: 12px`, `border: 1px solid rgba(120,160,255,0.16)`,
  `background: rgba(255,255,255,0.035)`; hover
  `border-color: rgba(34,211,238,0.45)` + `box-shadow: 0 0 22px rgba(34,211,238,0.12)`.
  Placeholder: “Buscar empresa, setor ou contato…”. Atalho “⌘K” em JetBrains Mono 10px
  `#5C6A94` dentro de chip com borda `rgba(120,160,255,0.2)`, `border-radius: 6px`.
  Filtra a tabela por empresa + contato + meta (case-insensitive, `includes`).
- **Botão “Filtros”** (secundário): `padding: 10px 14px`, `border-radius: 12px`,
  `border: 1px solid rgba(120,160,255,0.18)`, `background: rgba(255,255,255,0.04)`,
  texto `#C6D2F0` 12.5px 600; hover `border-color: rgba(120,160,255,0.4)`, texto `#fff`.
- **Botão “Qualificar com IA”** (primário): `padding: 11px 18px`, `border-radius: 12px`,
  `border: 1px solid rgba(160,200,255,0.3)`,
  `background: linear-gradient(120deg, #2563EB, #7C3AED 55%, #06B6D4)`, texto `#F4F9FF` 12.5px 700,
  `white-space: nowrap`, `box-shadow: 0 10px 30px rgba(79,70,229,0.45)`;
  hover `transform: translateY(-1px)` + `box-shadow: 0 14px 38px rgba(79,70,229,0.6)`.
  Ação no protótipo: ativa a aba “Score 80+” e abre o drawer do lead `Nexora Health`.

### 3. KPI cards (4)
`repeat(auto-fit, minmax(210px, 1fr))`, `gap: 16px`.

- Card: `padding: 18px`, `border-radius: 18px`, `border: 1px solid rgba(120,160,255,0.14)`,
  `background: linear-gradient(155deg, rgba(18,26,50,0.85), rgba(8,12,26,0.6))`,
  `box-shadow: 0 18px 40px rgba(2,6,20,0.55)`, `overflow: hidden`;
  hover `transform: translateY(-3px)` + `border-color: rgba(34,211,238,0.34)`.
- Blob de glow: 120×120, `top:-34px; right:-34px`, `border-radius: 50%`, `opacity:.55`,
  cor por card (abaixo).
- Label: 11px uppercase `letter-spacing: 1.2px` `#8A98C0`.
- Valor: Sora 700 30px `letter-spacing: -1px`, `white-space: nowrap`; unidade 11.5px `#7C8AB4`.
- Badge de delta: JetBrains Mono 10.5px 700, `padding: 3px 8px`, `border-radius: 99px`,
  `border: 1px solid`, `white-space: nowrap`.
- Sparkline: SVG 160×34 `preserveAspectRatio="none"`, área com gradiente vertical do
  próprio tom (0.38 → 0), linha 1.8px `stroke-linecap: round` com
  `filter: drop-shadow(0 0 6px <cor>)`, e ponto final `r=2.6` branco com glow.

| Card | Valor | Unidade | Delta | Cor / glow | Série (sparkline) |
|---|---|---|---|---|---|
| Leads descobertos | 1.284 | este mês | +18,4% | `#67E8F9` texto, borda `rgba(34,211,238,0.3)`, fundo `rgba(34,211,238,0.1)`, glow `rgba(34,211,238,0.3)`, linha `#22D3EE` | 180, 240, 210, 300, 275, 360, 420, 470, 560 |
| Qualificados IA | 642 | 50% do total | +9,1% | `#C4B5FD` / `rgba(168,85,247,0.3)` / `rgba(168,85,247,0.1)`, linha `#A855F7` | 70, 105, 95, 150, 190, 230, 270, 300, 342 |
| Taxa de conversão | 12,7 | % reunião | +2,3 p.p. | `#93C5FD` / `rgba(59,130,246,0.32)` / `rgba(59,130,246,0.1)`, linha `#3B82F6` | 8, 9.2, 8.6, 10.1, 10.8, 11.2, 12.0, 12.4, 12.7 |
| Receita em pipeline | R$ 4,8M | ponderada | +24,6% | `#F5D0FE` / `rgba(232,121,249,0.32)` / `rgba(232,121,249,0.1)`, linha `#E879F9` | 1.9, 2.2, 2.1, 2.8, 3.1, 3.6, 4.0, 4.4, 4.8 |

### 4. Tabela “Leads qualificados pela IA”
**Purpose**: priorizar quem contatar; clicar numa linha abre o drawer de detalhe.

- Card: `border-radius: 20px`, `border: 1px solid rgba(120,160,255,0.14)`,
  `background: linear-gradient(160deg, rgba(16,23,45,0.9), rgba(7,11,24,0.7))`,
  `box-shadow: 0 22px 50px rgba(2,6,20,0.5)`.
- Cabeçalho do card: `padding: 18px 20px 14px`,
  `border-bottom: 1px solid rgba(120,160,255,0.1)`.
  Título Sora 700 15px; subtítulo “Ordenado por score preditivo · atualizado há 4 min”
  11.5px `#7C8AB4`.
- **Abas de filtro**: `Todos` · `Quentes` · `Novos` · `Score 80+`.
  Pill `padding: 7px 13px`, `border-radius: 99px`, 11.5px 700.
  Inativa: texto `#9FB4E0`, `border: 1px solid rgba(120,160,255,0.18)`,
  `background: rgba(255,255,255,0.035)`.
  Ativa: texto `#061021`, borda transparente,
  `background: linear-gradient(120deg, #67E8F9, #A78BFA)`.
  Regras: `Quentes` → `status === "Quente"`; `Novos` → `isNew`; `Score 80+` → `score >= 80`.
- **Grid de colunas (idêntico no header e nas linhas)**:
  `32px minmax(90px, 1fr) 66px 78px`, `gap: 12px`, `padding` horizontal `20px`.
  ⚠️ header e linhas **devem** compartilhar as mesmas trilhas fixas — trilhas `auto`
  desalinham os rótulos.
- Header de colunas: 10px uppercase `letter-spacing: 1.4px` `#5C6A94`,
  `padding: 11px 20px`, `border-bottom: 1px solid rgba(120,160,255,0.08)`.
  Rótulos: (vazio) · “Empresa & contato” · “Score” · “Status”.
- **Linha**: `padding: 14px 20px` (modo compacto `9px 20px`),
  `border-bottom: 1px solid rgba(120,160,255,0.07)`, cursor pointer,
  hover `background: rgba(120,160,255,0.07)`,
  selecionada `background: rgba(103,232,249,0.07)`.
  - Avatar da empresa: 32×32, `border-radius: 9px`, iniciais Sora 700 11px `#DDEBFF`,
    `border: 1px solid rgba(160,200,255,0.2)`, fundo em rotação de 4 gradientes
    (ver Design Tokens → Logo gradients).
  - Nome: 13.5px 700, truncado com ellipsis. Badge “NOVO”: JetBrains Mono 9px,
    `padding: 2px 6px`, `border-radius: 5px`, `#67E8F9` sobre `rgba(34,211,238,0.12)`,
    `border: 1px solid rgba(34,211,238,0.3)`.
  - Linha secundária: `{contato} · {cargo} · {meta}` 11.5px `#8A98C0`, truncada.
  - **Score ring**: SVG 38×38, círculo `r=15`, trilho `rgba(255,255,255,0.09)` 3.2px,
    arco `stroke-width: 3.2`, `stroke-linecap: round`,
    `stroke-dasharray = 2πr`, `stroke-dashoffset = 2πr · (1 − score/100)`,
    `transform: rotate(-90 19 19)`, `filter: drop-shadow(0 0 5px <cor>)`,
    `transition: stroke-dashoffset .6s ease`. Número ao lado: JetBrains Mono 13px 600.
    Cor por faixa: `≥85 #67E8F9` · `≥75 #818CF8` · `≥60 #C084FC` · `<60 #7E8BB0`.
  - **Badge de status** (`inline-flex`, `gap: 6px`, `padding: 5px 10px`,
    `border-radius: 99px`, 11px 700, `white-space: nowrap`, ponto 5×5 `currentColor`):
    - Quente — `#FDA4AF` / borda `rgba(244,114,182,0.34)` / fundo `rgba(244,114,182,0.1)`
    - Morno — `#FCD34D` / `rgba(250,204,21,0.3)` / `rgba(250,204,21,0.09)`
    - Nutrir — `#A5B4FC` / `rgba(129,140,248,0.32)` / `rgba(129,140,248,0.1)`
    - Frio — `#94A3B8` / `rgba(148,163,184,0.28)` / `rgba(148,163,184,0.08)`
- Rodapé: “Mostrando {n} de 1.284 leads no segmento ativo” 11.5px `#7C8AB4` +
  link “Abrir lista completa →” 12px 700 (`a` = `#67E8F9`, hover `#A855F7`).

### 5. Card “Motor de qualificação ativo”
- `padding: 18px`, `border-radius: 20px`, `border: 1px solid rgba(34,211,238,0.24)`,
  `background: linear-gradient(160deg, rgba(8,47,73,0.7), rgba(9,14,30,0.75))`,
  `box-shadow: inset 0 0 40px rgba(34,211,238,0.12)`, `overflow: hidden`.
- **Scanline**: faixa de 30% de largura
  `linear-gradient(90deg, transparent, rgba(103,232,249,0.14), transparent)`,
  `animation: fl-scan 3.4s linear infinite` (`translateX(-100%) → translateX(320%)`),
  `pointer-events: none`.
- Indicador: ponto 9px `#22D3EE` com `box-shadow: 0 0 12px #22D3EE` e anel pulsante
  (`inset: -4px`, borda `rgba(34,211,238,0.6)`, `animation: fl-ring 1.8s ease-out infinite`
  → `scale(.85) opacity .55` para `scale(1.5) opacity 0`).
- Título Sora 700 13.5px. Corpo 11.5px `#9FD9E8`, `line-height: 1.55`:
  “Analisando 412 empresas do setor de logística contra o seu ICP e sinais de intenção de compra.”
- Meta: “lote 3 de 5” / “68%” JetBrains Mono 10.5px `#67E8F9`.
  Barra 5px, preenchimento 68% `linear-gradient(90deg, #06B6D4, #67E8F9)` +
  `box-shadow: 0 0 14px rgba(34,211,238,0.8)`.

### 6. Card “Pipeline”
Título Sora 700 14px + total “R$ 4,8M” JetBrains Mono 11px `#8A98C0`.
Cinco estágios em coluna (`gap: 13px`); cada um com rótulo 11.5px 600 `#C6D2F0`,
contagem JetBrains Mono `#8A98C0`, e barra de 8px (`border-radius: 99px`,
trilho `rgba(255,255,255,0.06)`):

| Estágio | Contagem | Largura | Preenchimento |
|---|---|---|---|
| Descobertos | 1.284 | 100% | `linear-gradient(90deg, rgba(59,130,246,0.55), #3B82F6)` |
| Qualificados IA | 642 | 78% | `rgba(99,102,241,0.6) → #818CF8`, glow `rgba(129,140,248,0.5)` |
| Em contato | 318 | 54% | `rgba(168,85,247,0.6) → #A855F7`, glow `rgba(168,85,247,0.5)` |
| Reunião marcada | 97 | 32% | `rgba(232,121,249,0.6) → #E879F9`, glow `rgba(232,121,249,0.5)` |
| Fechado | 41 | 16% | `rgba(103,232,249,0.7) → #67E8F9`, glow `rgba(103,232,249,0.6)` |

Glow = `box-shadow: 0 0 12px <cor>`.

### 7. Card “Ações rápidas”
Grid 2×2, `gap: 10px`. Botão: coluna, `gap: 9px`, `padding: 13px`,
`border-radius: 14px`, `border: 1px solid rgba(120,160,255,0.16)`,
`background: rgba(255,255,255,0.035)`, texto `#D6E1FB` 12px 700, alinhado à esquerda;
hover `transform: translateY(-2px)` + borda/fundo na cor do próprio ícone.

| Ação | Ícone (17px) | Cor do ícone | Hover borda / fundo |
|---|---|---|---|
| Sequência de e-mail | envelope | `#67E8F9` | `rgba(34,211,238,0.45)` / `rgba(34,211,238,0.08)` |
| Nova busca de ICP | “+” | `#C084FC` | `rgba(168,85,247,0.45)` / `rgba(168,85,247,0.08)` |
| Relatório semanal | gráfico de linha | `#93C5FD` | `rgba(59,130,246,0.45)` / `rgba(59,130,246,0.08)` |
| Enriquecer contatos | balão de fala | `#F0ABFC` | `rgba(232,121,249,0.45)` / `rgba(232,121,249,0.08)` |

### 8. Gráfico “Descoberta vs. qualificação”
- Card: mesmo estilo do card de tabela, `padding: 18px 20px 12px`.
  Subtítulo “Últimas 12 semanas”. Legenda: traço 18×3 `border-radius: 99px` com glow
  (`#22D3EE` “Descobertos”, `#A855F7` “Qualificados”), rótulos 11.5px `#9FB4E0`.
- SVG `viewBox="0 0 720 220"`, largura 100%, `padding` interno 28px.
  Escala Y de 0 a 620; gridlines em 0/155/310/465/620 —
  `stroke: rgba(120,160,255,0.1)`, rótulo JetBrains Mono 9px `#5C6A94` à esquerda.
  Eixo X: `S1…S12`, JetBrains Mono 9px, centralizado.
- Séries (12 pontos, semanais):
  - Descobertos: `180, 240, 210, 300, 275, 360, 420, 390, 470, 510, 480, 560` —
    linha `#22D3EE` 2.2px, `drop-shadow(0 0 7px rgba(34,211,238,0.75))`,
    área `#22D3EE` 0.34 → 0.
  - Qualificados: `70, 105, 95, 150, 140, 190, 230, 215, 270, 300, 285, 342` —
    linha `#A855F7` 2.2px, `drop-shadow(0 0 7px rgba(168,85,247,0.7))`,
    área `#A855F7` 0.3 → 0.
  - Pontos: `r=2.4`, `fill #061021`, stroke 1.4px (`#67E8F9` / `#C084FC`).

### 9. Card “Histórico de interações”
Título Sora 700 14px + nome do lead selecionado à direita (11px `#7C8AB4`;
padrão “Nexora Health”). Timeline em grid `26px 1fr`, `gap: 12px`:
ponto 9px com `box-shadow: 0 0 10px <cor>` e linha vertical de 1px
`linear-gradient(180deg, rgba(120,160,255,0.28), transparent)`.
Título do evento 12.5px 700, horário JetBrains Mono 10px `#5C6A94`,
corpo 11.5px `#8A98C0` `line-height: 1.55`, `padding-bottom: 18px`.

| Ponto | Evento | Quando | Corpo |
|---|---|---|---|
| `#67E8F9` | E-mail aberto 3× | hoje, 08:12 | Sequência "Eficiência clínica" — clique no estudo de caso Hospital Aurora. |
| `#A855F7` | Score recalculado 87 → 94 | ontem | Novo sinal: 12 vagas de engenharia publicadas e aumento de tráfego orgânico. |
| `#3B82F6` | Ligação atendida · 6 min | 12 set | Marina confirmou avaliação de fornecedores no Q4 e pediu proposta técnica. |
| `#E879F9` | Lead enriquecido | 09 set | Organograma, stack e faturamento estimado adicionados pela IA. |
| `#475A86` | Lead descoberto | 04 set | Origem: busca de ICP "Saúde digital · Série B · Brasil". |

### 10. Drawer de detalhe do lead
Abre ao clicar numa linha da tabela.

- Overlay: `position: fixed; inset: 0`, `background: rgba(3,6,16,0.66)`,
  `backdrop-filter: blur(4px)`; clique fecha.
- Painel: fixo à direita, `width: min(420px, 92vw)`, altura total, `overflow-y: auto`,
  `padding: 24px`, `border-left: 1px solid rgba(120,160,255,0.2)`,
  `background: linear-gradient(190deg, rgba(14,21,44,0.98), rgba(5,8,18,0.98))`,
  `box-shadow: -30px 0 80px rgba(2,5,16,0.7)`.
- Cabeçalho: avatar 46×46 `border-radius: 13px` (mesmo gradiente da linha),
  nome Sora 700 17px `letter-spacing: -0.3px`, meta 11.5px `#8A98C0`.
  Botão fechar 32×32 `border-radius: 10px`, `border: 1px solid rgba(120,160,255,0.2)`,
  `background: rgba(255,255,255,0.04)`, “×” `#9FB4E0`;
  hover `#fff` + `border-color: rgba(232,121,249,0.5)`.
- Dois stat cards (grid 1fr 1fr): “SCORE IA” (cor por faixa: `≥85 #67E8F9`,
  `≥75 #A5B4FC`, senão `#C084FC`) e “FIT COM ICP” (`#67E8F9`).
  Card: `padding: 14px`, `border-radius: 14px`, `border: 1px solid rgba(120,160,255,0.14)`,
  `background: rgba(255,255,255,0.035)`; label 10px uppercase `letter-spacing: 1.3px`
  `#7C8AB4`; valor Sora 700 26px.
- **Resumo da IA**: `padding: 16px`, `border-radius: 16px`,
  `border: 1px solid rgba(168,85,247,0.28)`,
  `background: linear-gradient(155deg, rgba(76,29,149,0.35), rgba(10,15,32,0.6))`;
  título com ícone “sparkle” `#E879F9`, texto `#E9D5FF` Sora 700 12.5px;
  corpo 12px `#CBB8E8` `line-height: 1.65`.
- **Sinais detectados**: chips `padding: 6px 11px`, `border-radius: 99px`, 11.5px 600,
  `#BFE9F5`, `border: 1px solid rgba(34,211,238,0.26)`, `background: rgba(34,211,238,0.08)`.
- **Contato principal**: card com 4 linhas rótulo/valor (Nome, Cargo, E-mail, Telefone);
  rótulo `#7C8AB4` 12.5px, valor 700; e-mail/telefone em JetBrains Mono 11.5px
  (`#67E8F9` / `#C6D2F0`).
- Ações: “Iniciar contato” (primário, mesmo gradiente do botão de header,
  `box-shadow: 0 10px 28px rgba(79,70,229,0.4)`) e “Mover no pipeline” (secundário).

---

## Interactions & Behavior
- **Navegação**: clicar num item da sidebar troca o item ativo e o título/subtítulo do header.
  No protótipo só a Visão geral tem conteúdo; as demais rotas devem ser implementadas
  reutilizando estes mesmos componentes.
- **Abas da tabela**: filtram a lista (regras na seção 4). Estado local.
- **Busca**: filtra por `empresa + contato + meta`, case-insensitive, sem debounce no
  protótipo — use debounce de ~200ms se a fonte for remota.
- **Clique na linha**: seleciona o lead (fundo `rgba(103,232,249,0.07)`) e abre o drawer.
  Fecha por overlay ou botão “×”. `Esc` deve fechar na implementação real.
- **“Qualificar com IA”**: no protótipo aplica a aba “Score 80+” e abre o lead de maior score.
  Na implementação, disparar o job de qualificação e mostrar progresso no card do motor.
- **Transições**: `all .18s ease` em botões/nav/chips; `transform .2s ease` nos KPI cards;
  `stroke-dashoffset .6s ease` nos score rings.
- **Animações contínuas**: `fl-scan` (3.4s linear infinite), `fl-ring` (1.8s ease-out infinite),
  `fl-pulse` e `fl-float` disponíveis. Respeitar `prefers-reduced-motion` na implementação.
- **Hover**: elevação (`translateY(-1px)` a `-3px`), realce de borda na cor do acento e
  glow. Sem hover em touch — garantir estados `:focus-visible` equivalentes
  (o protótipo não os define; adicione anel de foco `#67E8F9`).
- **Responsivo**: seções principais empilham abaixo de ~700px de largura útil;
  header envolve (`flex-wrap`); nomes e contatos truncam com ellipsis.
  Não há layout mobile definido — se precisar, peça.

## State Management
Estado local do protótipo (converter para store/URL conforme o codebase):

```
navId:    'overview' | 'discover' | 'qualify' | 'pipeline' | 'companies' | 'metrics' | 'settings'
tab:      'Todos' | 'Quentes' | 'Novos' | 'Score 80+'
query:    string
selected: leadId | null        // controla o drawer
```

Props expostas como tweaks: `density` (`"Padrão" | "Compacto"` → padding das linhas
14px/9px) e `leadCount` (3–6 → limite da lista).

Modelo de dados por lead:

```
id, company, initials, contact, role, meta,
score (0–100), status ('Quente'|'Morno'|'Nutrir'|'Frio'),
isNew (bool), fit ('96%'), signals (string[]), summary (string),
email, phone
```

Requisitos de dados: lista de leads paginada e ordenada por score; agregados de KPI
(mês atual + série de 9 pontos); série semanal de 12 pontos para descoberta/qualificação;
contagens por estágio de pipeline; timeline de eventos por lead; saldo de créditos de IA;
status do job de qualificação (lote atual, total, % concluído).

Dados de exemplo (6 leads) em `Find Leads Qualify.dc.html` → constante `LEADS`;
timeline em `TIMELINE`. Todos fictícios — substituir pela API real.

## Design Tokens

**Background**
```
radial-gradient(1100px 700px at 12% -10%, rgba(59,130,246,0.22), transparent 60%),
radial-gradient(900px 600px at 88% 0%, rgba(168,85,247,0.18), transparent 62%),
radial-gradient(800px 700px at 60% 110%, rgba(34,211,238,0.12), transparent 60%),
linear-gradient(180deg, #060A16 0%, #04060E 55%, #05070F 100%)
```

**Cores**
| Papel | Valor |
|---|---|
| Base / body | `#04060E`, `#05070F`, `#060A16` |
| Superfície de card | `linear-gradient(160deg, rgba(16,23,45,0.9), rgba(7,11,24,0.7))` |
| Superfície elevada (KPI) | `linear-gradient(155deg, rgba(18,26,50,0.85), rgba(8,12,26,0.6))` |
| Superfície translúcida | `rgba(255,255,255,0.03)` – `rgba(255,255,255,0.04)` |
| Borda padrão | `rgba(120,160,255,0.12)` – `rgba(120,160,255,0.18)` |
| Borda de acento | `rgba(34,211,238,0.24)` – `rgba(103,232,249,0.34)` |
| Texto primário | `#E8EEFF` / `#F2F7FF` |
| Texto secundário | `#C6D2F0` / `#9FB4E0` |
| Texto terciário | `#8A98C0` |
| Texto sutil | `#7C8AB4` / `#5C6A94` |
| Ciano | `#22D3EE`, `#67E8F9`, `#06B6D4` |
| Azul | `#2563EB`, `#3B82F6`, `#93C5FD`, `#1E3A8A` |
| Indigo | `#818CF8`, `#A5B4FC`, `#4F46E5` |
| Violeta | `#7C3AED`, `#A855F7`, `#C084FC`, `#6D28D9` |
| Magenta | `#E879F9`, `#F0ABFC`, `#F5D0FE` |
| Quente (status) | `#FDA4AF` |
| Morno (status) | `#FCD34D` |
| Frio (status) | `#94A3B8` |

**Gradiente primário (CTA)**: `linear-gradient(120deg, #2563EB, #7C3AED 55%, #06B6D4)`
**Gradiente de pill ativa**: `linear-gradient(120deg, #67E8F9, #A78BFA)`
**Logo gradients (rotação nos avatares)**
```
linear-gradient(145deg, rgba(37,99,235,0.55), rgba(14,116,144,0.55))
linear-gradient(145deg, rgba(109,40,217,0.55), rgba(37,99,235,0.5))
linear-gradient(145deg, rgba(6,182,212,0.45), rgba(79,70,229,0.5))
linear-gradient(145deg, rgba(232,121,249,0.4), rgba(109,40,217,0.5))
```

**Tipografia** (Google Fonts)
- **Sora** 400/500/600/700/800 — títulos, números grandes, wordmark.
  Usos: 30px/700 (KPI), 20px/700 (header), 17px/700 (drawer), 15px/700 e 14px/700
  (títulos de card), 13.5px/700 (subtítulo), `letter-spacing` −1px a −0.2px.
- **Manrope** 400/500/600/700 — UI e corpo. 13.5px/600 (nav), 13.5px/700 (nome de lead),
  12.5px/700 (botões), 12px, 11.5px, 11px, 10px (labels uppercase).
- **JetBrains Mono** 400/500/600 — números, badges de delta, timestamps, e-mail/telefone.

**Espaçamento**: 4 · 6 · 8 · 10 · 12 · 14 · 16 · 18 · 20 · 24 · 26 · 28 px
(gaps de seção 16–20px; padding de card 18px; padding de main 24/28px).

**Raios**: 5 · 6 · 9 · 10 · 11 · 12 · 13 · 14 · 16 · 18 · 20 · 99px (pill) · 50% (ponto).

**Sombras**
```
card:       0 18px 40px rgba(2,6,20,0.55)
card alto:  0 22px 50px rgba(2,6,20,0.5)
drawer:     -30px 0 80px rgba(2,5,16,0.7)
CTA:        0 10px 30px rgba(79,70,229,0.45)  (hover 0 14px 38px rgba(79,70,229,0.6))
nav ativo:  0 6px 22px rgba(56,89,214,0.32), inset 0 0 22px rgba(34,211,238,0.14)
glow logo:  inset 0 0 0 1px rgba(160,200,255,0.28), 0 8px 26px rgba(99,102,241,0.55)
```

**Blur**: sidebar `blur(18px)`, header `blur(22px)`, overlay do drawer `blur(4px)`.

**Keyframes**
```css
@keyframes fl-scan  { 0% { transform: translateX(-100%); } 100% { transform: translateX(320%); } }
@keyframes fl-ring  { 0% { transform: scale(.85); opacity: .55; } 100% { transform: scale(1.5); opacity: 0; } }
@keyframes fl-pulse { 0%,100% { opacity: .35; } 50% { opacity: 1; } }
@keyframes fl-float { 0%,100% { transform: translateY(0); } 50% { transform: translateY(-6px); } }
```

**Scrollbar**: 8px, thumb `rgba(120,160,255,0.22)` `border-radius: 99px`, trilho transparente.

**Links**: `a` → `#67E8F9`; `a:hover` → `#A855F7`; sem sublinhado.

## Assets
- Nenhuma imagem ou arquivo binário. Todos os ícones são **SVG inline de traço**
  (stroke `currentColor` ou cor de acento, `stroke-width: 1.9–2`, `stroke-linecap: round`) —
  equivalentes ao conjunto Lucide/Feather; substitua pela biblioteca de ícones do codebase.
- Fontes via Google Fonts: Sora, Manrope, JetBrains Mono.
- Sem marca ou logotipo de terceiros. O símbolo do app é o quadrado com lupa+check descrito
  na seção 1 — substituir pelo logo real quando existir.

## Files
- `Find Leads Qualify.dc.html` — o design completo (template + lógica + dados de exemplo).
  Contém as constantes `NAV`, `LEADS`, `TIMELINE`, `STATUS`, `LOGO_BG` e as funções de
  gráfico `spark()`, `ring()`, `areaChart()` — úteis como referência de matemática do SVG.
- `support.js` — runtime do protótipo. **Não portar.**

## Ainda não desenhado
As telas `Descobrir leads`, `Qualificação IA`, `Pipeline`, `Empresas`, `Métricas` e
`Configurações` existem apenas como rotas na navegação. Implementar depois, reutilizando
os tokens e componentes acima.
