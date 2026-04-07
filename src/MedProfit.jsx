import { useState, useEffect, useRef, useCallback, useMemo } from "react";

// ─── UTILS ───
const fmt = (n) => "R$ " + Math.round(n).toLocaleString("pt-BR");
const fmtK = (n) => n >= 1000 ? "R$ " + (n / 1000).toFixed(1).replace(".0", "") + "k" : fmt(n);
const pct = (n) => n.toFixed(0) + "%";
const RAMP = [0.4, 0.7, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1];
const SCENARIOS = { conservador: 0.6, realista: 1, otimista: 1.4 };

// ─── MAIN APP ───
export default function MedProfit() {
  const [tab, setTab] = useState("calc"); // calc | planos | reversa | historico
  const [presenting, setPresenting] = useState(false);

  // Clinic data
  const [nome, setNome] = useState("");
  const [servicos, setServicos] = useState([
    { nome: "Consulta", ticket: 250, peso: 40 },
    { nome: "Laser CO2", ticket: 800, peso: 25 },
    { nome: "Alexandrite", ticket: 600, peso: 20 },
    { nome: "Procedimento Estético", ticket: 450, peso: 15 },
  ]);
  const [capacidade, setCapacidade] = useState(40);
  const [retorno, setRetorno] = useState(3);
  const [atuais, setAtuais] = useState(15);

  // Investment
  const [setupVal, setSetupVal] = useState(15300);
  const [mensalVal, setMensalVal] = useState(6700);
  const [midia, setMidia] = useState(2500);
  const [extras, setExtras] = useState(4500);
  const [conv, setConv] = useState(8);
  const [cpl, setCpl] = useState(25);
  const [parcelas, setParcelas] = useState(1);
  const [scenario, setScenario] = useState("realista");

  // Plans
  const plans = useMemo(() => [
    { id: "essencial", nome: "Essencial", setup: 9900, mensal: 2800, cor: "#66FF66" },
    { id: "profissional", nome: "Profissional", setup: 15300, mensal: 6700, cor: "#6699FF" },
    { id: "completo", nome: "Completo", setup: 19050, mensal: 7740, cor: "#CC66FF" },
  ], []);

  // Reverse calc
  const [targetPac, setTargetPac] = useState(20);

  // History
  const [history, setHistory] = useState(() => {
    try { return JSON.parse(localStorage.getItem("medprofit_history") || "[]"); } catch { return []; }
  });

  // Save history
  const saveToHistory = useCallback(() => {
    const entry = {
      id: Date.now(),
      nome: nome || "Sem nome",
      date: new Date().toLocaleDateString("pt-BR"),
      ticket: ticketMedio,
      capacidade, retorno, atuais, setup: setupVal, mensal: mensalVal, midia, conv, cpl,
      scenario,
    };
    const updated = [entry, ...history].slice(0, 20);
    setHistory(updated);
    localStorage.setItem("medprofit_history", JSON.stringify(updated));
  }, [nome, capacidade, retorno, atuais, setupVal, mensalVal, midia, conv, cpl, scenario, history]);

  // Calc ticket medio ponderado
  const ticketMedio = useMemo(() => {
    const totalPeso = servicos.reduce((a, s) => a + s.peso, 0);
    if (totalPeso === 0) return 0;
    return servicos.reduce((a, s) => a + (s.ticket * s.peso / totalPeso), 0);
  }, [servicos]);

  // Core calc
  const calcResults = useCallback((setup, mensal, scenarioKey = "realista") => {
    const sf = SCENARIOS[scenarioKey] || 1;
    const vagasDisp = Math.max(capacidade - atuais, 0);
    const leads = midia > 0 ? Math.floor(midia / cpl) : 0;
    const pacConv = Math.floor(leads * (conv / 100) * sf);
    const pacDig = Math.min(pacConv, vagasDisp);
    const recMensal = pacDig * ticketMedio;
    const investTotal = setup + extras + (mensal * 12) + (midia * 12);

    let acumRec = 0, acumCusto = setup + extras, pb = null;
    const meses = [];
    for (let m = 1; m <= 12; m++) {
      const pacMes = Math.floor(pacDig * RAMP[m - 1]);
      const ltvF = Math.min(retorno, 1 + (m - 1) * (retorno - 1) / 11);
      const rec = pacMes * ticketMedio * ltvF;
      const cst = mensal + midia;
      acumRec += rec;
      acumCusto += cst;
      const saldo = acumRec - acumCusto;
      if (pb === null && saldo >= 0) pb = m;
      meses.push({ m, pacMes, rec, cst, acumRec, acumCusto, saldo });
    }

    const roi = investTotal > 0 ? ((acumRec - investTotal) / investTotal * 100) : 0;
    const mult = investTotal > 0 ? (acumRec / investTotal) : 0;

    return { leads, pacDig, recMensal, investTotal, acumRec, roi, mult, pb, meses, vagasDisp };
  }, [capacidade, atuais, midia, cpl, conv, ticketMedio, retorno, extras]);

  const results = useMemo(() => calcResults(setupVal, mensalVal, scenario), [calcResults, setupVal, mensalVal, scenario]);
  const scenarioResults = useMemo(() => ({
    conservador: calcResults(setupVal, mensalVal, "conservador"),
    realista: calcResults(setupVal, mensalVal, "realista"),
    otimista: calcResults(setupVal, mensalVal, "otimista"),
  }), [calcResults, setupVal, mensalVal]);

  // Reverse calc
  const reverseMidia = useMemo(() => {
    const needed = targetPac;
    const convRate = conv / 100;
    if (convRate === 0) return 0;
    const leadsNeeded = Math.ceil(needed / convRate);
    return leadsNeeded * cpl;
  }, [targetPac, conv, cpl]);

  // Parcelamento
  const parcelamentoFlow = useMemo(() => {
    const parcelaVal = setupVal / parcelas;
    const flow = [];
    for (let m = 1; m <= 12; m++) {
      const setupCost = m <= parcelas ? parcelaVal : 0;
      const totalCost = setupCost + mensalVal + midia + (m === 1 ? extras : 0);
      const rec = results.meses[m - 1]?.rec || 0;
      flow.push({ m, setupCost, totalCost, rec, saldo: rec - totalCost });
    }
    return flow;
  }, [setupVal, parcelas, mensalVal, midia, extras, results.meses]);

  // Plan comparison
  const planResults = useMemo(() =>
    plans.map(p => ({ ...p, results: calcResults(p.setup, p.mensal, scenario) })),
    [plans, calcResults, scenario]
  );

  // Export PDF
  const exportPDF = useCallback(() => {
    const r = results;
    const nomeC = nome || "Clínica";
    const perdaAnual = r.vagasDisp * ticketMedio * retorno * 12;
    const text = `
MEDPROFIT — RESUMO EXECUTIVO
${nomeC.toUpperCase()}
${"═".repeat(50)}

SITUAÇÃO ATUAL
• Pacientes novos/mês (indicação): ${atuais}
• Capacidade total: ${capacidade}
• Vagas ociosas: ${r.vagasDisp}
• Receita não capturada/ano: ${fmt(perdaAnual)}

PROJEÇÃO COM DIGITAL (cenário ${scenario})
• Leads estimados/mês: ${r.leads}
• Novos pacientes/mês: ${r.pacDig}
• Receita mensal adicional: ${fmt(r.recMensal)}

NÚMEROS DE 12 MESES
• Receita projetada: ${fmt(r.acumRec)}
• Investimento total: ${fmt(r.investTotal)}
• ROI: ${pct(r.roi)}
• Multiplicador: ${r.mult.toFixed(1)}x
• Payback: ${r.pb ? "Mês " + r.pb : "> 12 meses"}

SERVIÇOS MAPEADOS
${servicos.map(s => `• ${s.nome}: ${fmt(s.ticket)} (${s.peso}% do mix)`).join("\n")}

Ticket médio ponderado: ${fmt(ticketMedio)}

${"─".repeat(50)}
VPEX Solutions | MedProfit v2.0
Estimativas baseadas em benchmarks de tráfego pago saúde/estética Brasil.
    `.trim();

    const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `MedProfit_${nomeC.replace(/\s+/g, "_")}_${new Date().toISOString().slice(0, 10)}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  }, [results, nome, atuais, capacidade, scenario, servicos, ticketMedio, retorno]);

  // Copy resumo
  const [copied, setCopied] = useState(false);
  const copyResumo = useCallback(() => {
    const r = results;
    const nomeC = nome || "a clínica";
    const perdaAnual = r.vagasDisp * ticketMedio * retorno * 12;
    const txt = `RESUMO — ${nomeC.toUpperCase()}\n\nHoje: ${atuais} pac/mês por indicação, agenda para ${capacidade}. ${r.vagasDisp} vagas ociosas = ${fmt(r.vagasDisp * ticketMedio)}/mês perdido (${fmt(perdaAnual)}/ano com retornos).\n\nProjeção: ${r.leads} leads/mês → ${r.pacDig} novos pac/mês → ${fmt(r.recMensal)} receita mensal.\n\n• Receita 12m: ${fmt(r.acumRec)}\n• Investimento 12m: ${fmt(r.investTotal)}\n• ROI: ${pct(r.roi)} | Multiplicador: ${r.mult.toFixed(1)}x\n• Payback: ${r.pb ? "Mês " + r.pb : "> 12m"}\n\nCada R$ 1 investido → R$ ${r.mult.toFixed(1)}\n\n— VPEX Solutions | MedProfit`;
    navigator.clipboard.writeText(txt);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  }, [results, nome, atuais, capacidade, ticketMedio, retorno]);

  // ─── STYLES ───
  const S = {
    app: { fontFamily: "'Space Grotesk', sans-serif", background: "#070707", color: "#E0E0E0", minHeight: "100vh", position: "relative" },
    container: { maxWidth: 960, margin: "0 auto", padding: presenting ? "20px 24px" : "32px 24px" },
    neon: "#CCFF00",
    card: { background: "rgba(255,255,255,0.025)", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 14, padding: "24px 22px", marginBottom: 16 },
    label: { display: "flex", justifyContent: "space-between", alignItems: "baseline", fontSize: 13, color: "#fff", marginBottom: 6, fontWeight: 500 },
    hint: { fontSize: 11, color: "#777", fontFamily: "'JetBrains Mono', monospace", fontWeight: 400 },
    input: { width: "100%", background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 8, padding: "10px 14px", color: "#fff", fontFamily: "'JetBrains Mono', monospace", fontSize: 15, fontWeight: 600, outline: "none" },
    inputNeon: { width: "100%", background: "rgba(204,255,0,0.04)", border: "1px solid rgba(204,255,0,0.15)", borderRadius: 10, padding: "12px 14px", color: "#CCFF00", fontFamily: "'Space Grotesk', sans-serif", fontSize: 17, fontWeight: 600, outline: "none" },
    grid2: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 },
    grid3: { display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12 },
    metric: { background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 10, padding: "16px 12px", textAlign: "center" },
    metricLabel: { fontSize: 9, textTransform: "uppercase", letterSpacing: 1.5, color: "#777", fontFamily: "'JetBrains Mono', monospace", marginBottom: 6 },
    metricVal: { fontFamily: "'JetBrains Mono', monospace", fontSize: 20, fontWeight: 700, color: "#CCFF00" },
    dot: { width: 6, height: 6, background: "#CCFF00", borderRadius: "50%", boxShadow: "0 0 8px rgba(204,255,0,0.4)", flexShrink: 0 },
    sectionTitle: { display: "flex", alignItems: "center", gap: 8, fontSize: 15, fontWeight: 600, color: "#fff", marginBottom: 4 },
    sub: { fontSize: 11, color: "#777", fontFamily: "'JetBrains Mono', monospace", marginBottom: 18, paddingLeft: 14 },
    tab: (active) => ({ padding: "8px 16px", borderRadius: 8, border: "1px solid " + (active ? "rgba(204,255,0,0.3)" : "rgba(255,255,255,0.06)"), background: active ? "rgba(204,255,0,0.1)" : "transparent", color: active ? "#CCFF00" : "#888", fontFamily: "'JetBrains Mono', monospace", fontSize: 11, fontWeight: 600, cursor: "pointer", letterSpacing: 0.5, transition: "all 0.2s" }),
    btnNeon: { display: "inline-flex", alignItems: "center", gap: 6, background: "rgba(204,255,0,0.1)", border: "1px solid rgba(204,255,0,0.2)", color: "#CCFF00", fontFamily: "'JetBrains Mono', monospace", fontSize: 11, fontWeight: 600, padding: "8px 14px", borderRadius: 8, cursor: "pointer", transition: "all 0.2s" },
    scenarioBtn: (active, color) => ({ padding: "6px 14px", borderRadius: 6, border: `1px solid ${active ? color : "rgba(255,255,255,0.06)"}`, background: active ? color + "18" : "transparent", color: active ? color : "#666", fontSize: 11, fontWeight: 600, cursor: "pointer", fontFamily: "'JetBrains Mono', monospace", transition: "all 0.2s" }),
    green: "#44FF88", red: "#FF4444", orange: "#FF8C00",
  };

  // ─── SERVICE EDITOR ───
  const updateServico = (i, key, val) => {
    const updated = [...servicos];
    updated[i] = { ...updated[i], [key]: key === "nome" ? val : Number(val) || 0 };
    setServicos(updated);
  };
  const addServico = () => setServicos([...servicos, { nome: "Novo Serviço", ticket: 300, peso: 10 }]);
  const removeServico = (i) => servicos.length > 1 && setServicos(servicos.filter((_, idx) => idx !== i));

  // ─── RENDER ───
  return (
    <div style={S.app}>
      <div style={S.container}>
        {/* HEADER */}
        {!presenting && (
          <div style={{ textAlign: "center", marginBottom: 36 }}>
            <div style={{ display: "inline-flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
              <div style={{ width: 32, height: 32, borderRadius: 8, background: S.neon, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "'JetBrains Mono'", fontWeight: 800, fontSize: 14, color: "#070707" }}>V</div>
              <span style={{ fontFamily: "'JetBrains Mono'", fontSize: 12, letterSpacing: 4, color: S.neon, fontWeight: 600 }}>VPEX SOLUTIONS</span>
            </div>
            <h1 style={{ fontSize: "clamp(28px, 5vw, 40px)", fontWeight: 700, color: "#fff", marginBottom: 6 }}>
              Med<span style={{ color: S.neon }}>Profit</span>
            </h1>
            <p style={{ color: "#777", fontSize: 14 }}>Calculadora de retorno para clínicas e institutos médicos</p>
          </div>
        )}

        {/* NAV */}
        <div style={{ display: "flex", gap: 8, marginBottom: 20, flexWrap: "wrap", justifyContent: presenting ? "center" : "flex-start" }}>
          {[
            ["calc", "📊 Calculadora"],
            ["planos", "📋 Planos"],
            ["reversa", "🔄 Reversa"],
            ["historico", "💾 Histórico"],
          ].map(([k, l]) => (
            <button key={k} onClick={() => setTab(k)} style={S.tab(tab === k)}>{l}</button>
          ))}
          <div style={{ flex: 1 }} />
          <button onClick={() => setPresenting(!presenting)} style={{ ...S.tab(presenting), borderColor: presenting ? S.green : undefined, color: presenting ? S.green : "#888" }}>
            {presenting ? "✕ Sair" : "🖥 Apresentar"}
          </button>
        </div>

        {/* ════ TAB: CALCULADORA ════ */}
        {tab === "calc" && (
          <>
            {/* Cenários */}
            <div style={{ display: "flex", gap: 8, marginBottom: 16, alignItems: "center" }}>
              <span style={{ fontSize: 11, color: "#777", fontFamily: "'JetBrains Mono'", marginRight: 4 }}>CENÁRIO:</span>
              {[
                ["conservador", S.orange],
                ["realista", S.neon],
                ["otimista", S.green],
              ].map(([k, c]) => (
                <button key={k} onClick={() => setScenario(k)} style={S.scenarioBtn(scenario === k, c)}>
                  {k.charAt(0).toUpperCase() + k.slice(1)}
                </button>
              ))}
            </div>

            {/* Dados Clínica */}
            {!presenting && (
              <div style={S.card}>
                <div style={S.sectionTitle}><span style={S.dot} /> Dados da Clínica</div>
                <div style={S.sub}>informações do cliente para simulação personalizada</div>

                <div style={{ marginBottom: 16 }}>
                  <label style={{ ...S.label, marginBottom: 6 }}>Nome da Clínica</label>
                  <input value={nome} onChange={e => setNome(e.target.value)} placeholder="Ex: Life Medical Institute" style={S.inputNeon} />
                </div>

                {/* Serviços */}
                <div style={{ marginBottom: 16 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
                    <span style={{ fontSize: 13, color: "#fff", fontWeight: 500 }}>Serviços <span style={S.hint}>(ticket médio ponderado: {fmt(ticketMedio)})</span></span>
                    <button onClick={addServico} style={{ ...S.btnNeon, padding: "4px 10px", fontSize: 10 }}>+ Serviço</button>
                  </div>
                  {servicos.map((s, i) => (
                    <div key={i} style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1fr 30px", gap: 8, marginBottom: 6, alignItems: "center" }}>
                      <input value={s.nome} onChange={e => updateServico(i, "nome", e.target.value)} style={{ ...S.input, fontSize: 12, padding: "8px 10px" }} />
                      <input type="number" value={s.ticket} onChange={e => updateServico(i, "ticket", e.target.value)} style={{ ...S.input, fontSize: 12, padding: "8px 10px" }} placeholder="R$" />
                      <input type="number" value={s.peso} onChange={e => updateServico(i, "peso", e.target.value)} style={{ ...S.input, fontSize: 12, padding: "8px 10px" }} placeholder="%" />
                      <button onClick={() => removeServico(i)} style={{ background: "none", border: "none", color: "#FF4444", cursor: "pointer", fontSize: 14, opacity: servicos.length > 1 ? 0.6 : 0.15 }}>✕</button>
                    </div>
                  ))}
                  <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1fr 30px", gap: 8, opacity: 0.4 }}>
                    <span style={{ fontSize: 10, color: "#777" }}>Nome</span>
                    <span style={{ fontSize: 10, color: "#777" }}>Ticket R$</span>
                    <span style={{ fontSize: 10, color: "#777" }}>Peso %</span>
                    <span />
                  </div>
                </div>

                <div style={S.grid2}>
                  <div>
                    <label style={S.label}>Capacidade Novos Pac./Mês <span style={S.hint}>agenda</span></label>
                    <input type="number" value={capacidade} onChange={e => setCapacidade(+e.target.value)} style={S.input} />
                  </div>
                  <div>
                    <label style={S.label}>Retorno do Paciente <span style={S.hint}>vezes/ano</span></label>
                    <input type="number" value={retorno} onChange={e => setRetorno(+e.target.value)} style={S.input} />
                  </div>
                </div>
                <div style={{ ...S.grid2, marginTop: 10 }}>
                  <div>
                    <label style={S.label}>Novos Pac. Atuais <span style={S.hint}>indicação/mês</span></label>
                    <input type="number" value={atuais} onChange={e => setAtuais(+e.target.value)} style={S.input} />
                  </div>
                  <div />
                </div>
              </div>
            )}

            {/* Investimento */}
            {!presenting && (
              <div style={S.card}>
                <div style={S.sectionTitle}><span style={S.dot} /> Investimento Digital</div>
                <div style={S.sub}>valores do plano + mídia + custos extras</div>

                <div style={S.grid2}>
                  <div>
                    <label style={S.label}>Setup Inicial <span style={S.hint}>R$</span></label>
                    <input type="number" value={setupVal} onChange={e => setSetupVal(+e.target.value)} style={S.input} />
                  </div>
                  <div>
                    <label style={S.label}>Mensalidade <span style={S.hint}>R$</span></label>
                    <input type="number" value={mensalVal} onChange={e => setMensalVal(+e.target.value)} style={S.input} />
                  </div>
                </div>
                <div style={{ ...S.grid2, marginTop: 10 }}>
                  <div>
                    <label style={S.label}>Verba Mídia/Mês <span style={S.hint}>R$</span></label>
                    <input type="number" value={midia} onChange={e => setMidia(+e.target.value)} style={S.input} />
                  </div>
                  <div>
                    <label style={S.label}>Custos Extras (único) <span style={S.hint}>foto, vídeo</span></label>
                    <input type="number" value={extras} onChange={e => setExtras(+e.target.value)} style={S.input} />
                  </div>
                </div>

                <div style={{ display: "flex", gap: 20, marginTop: 16 }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ display: "flex", justifyContent: "space-between" }}>
                      <span style={{ fontSize: 12, color: "#fff" }}>Conversão</span>
                      <span style={{ fontFamily: "'JetBrains Mono'", fontSize: 14, color: S.neon, fontWeight: 700 }}>{conv}%</span>
                    </div>
                    <input type="range" min={2} max={25} value={conv} onChange={e => setConv(+e.target.value)} style={{ width: "100%", accentColor: S.neon, marginTop: 4 }} />
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ display: "flex", justifyContent: "space-between" }}>
                      <span style={{ fontSize: 12, color: "#fff" }}>CPL Médio</span>
                      <span style={{ fontFamily: "'JetBrains Mono'", fontSize: 14, color: S.neon, fontWeight: 700 }}>R$ {cpl}</span>
                    </div>
                    <input type="range" min={10} max={60} value={cpl} onChange={e => setCpl(+e.target.value)} style={{ width: "100%", accentColor: S.neon, marginTop: 4 }} />
                  </div>
                </div>

                {/* Parcelamento */}
                <div style={{ marginTop: 16, padding: "14px 16px", background: "rgba(255,255,255,0.02)", borderRadius: 10, border: "1px solid rgba(255,255,255,0.05)" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                    <span style={{ fontSize: 12, color: "#fff", fontWeight: 500 }}>Parcelamento do Setup</span>
                    <span style={{ fontFamily: "'JetBrains Mono'", fontSize: 13, color: S.neon, fontWeight: 700 }}>{parcelas}x de {fmt(setupVal / parcelas)}</span>
                  </div>
                  <div style={{ display: "flex", gap: 6 }}>
                    {[1, 2, 3, 4].map(p => (
                      <button key={p} onClick={() => setParcelas(p)} style={S.scenarioBtn(parcelas === p, S.neon)}>
                        {p}x
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* RESULTS */}
            <div style={S.card}>
              <div style={S.sectionTitle}><span style={S.dot} /> Projeção — 12 Meses ({scenario})</div>
              <div style={S.sub}>
                {nome ? nome : "Clínica"} • Ticket médio {fmt(ticketMedio)} • {results.vagasDisp} vagas ociosas
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))", gap: 10, marginBottom: 16 }}>
                {[
                  ["Leads/Mês", results.leads, "gerados"],
                  ["Novos Pac./Mês", results.pacDig, "convertidos"],
                  ["Receita Mensal", fmt(results.recMensal), "digital"],
                  ["Receita 12m", fmt(results.acumRec), "com LTV"],
                  ["Investimento 12m", fmt(results.investTotal), "total", S.orange],
                  ["ROI", pct(results.roi), results.mult.toFixed(1) + "x", results.roi > 100 ? S.green : results.roi > 0 ? S.neon : S.red],
                ].map(([label, val, sub, color], i) => (
                  <div key={i} style={S.metric}>
                    <div style={S.metricLabel}>{label}</div>
                    <div style={{ ...S.metricVal, color: color || S.neon, fontSize: typeof val === "string" && val.length > 10 ? 16 : 20 }}>{val}</div>
                    <div style={{ fontSize: 9, color: "#666", marginTop: 3 }}>{sub}</div>
                  </div>
                ))}
              </div>

              {/* Payback bar */}
              <div style={{ marginBottom: 16 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                  <span style={{ fontSize: 13, color: "#fff", fontWeight: 500 }}>Payback</span>
                  <span style={{ fontFamily: "'JetBrains Mono'", fontSize: 12, fontWeight: 700, color: "#070707", background: results.pb ? S.neon : S.red, padding: "3px 12px", borderRadius: 12 }}>
                    {results.pb ? `Mês ${results.pb}` : "> 12m"}
                  </span>
                </div>
                <div style={{ background: "rgba(255,255,255,0.03)", borderRadius: 5, height: 28, overflow: "hidden", border: "1px solid rgba(255,255,255,0.06)", position: "relative" }}>
                  <div style={{
                    height: "100%", borderRadius: 5, transition: "width 0.6s ease",
                    width: results.pb ? (results.pb / 12 * 100) + "%" : "100%",
                    background: results.pb ? `linear-gradient(90deg, rgba(204,255,0,0.06), rgba(204,255,0,0.25))` : `linear-gradient(90deg, rgba(255,68,68,0.06), rgba(255,68,68,0.15))`,
                  }} />
                </div>
              </div>

              {/* Cenários lado a lado */}
              <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8, marginBottom: 16 }}>
                {Object.entries(scenarioResults).map(([key, r]) => {
                  const colors = { conservador: S.orange, realista: S.neon, otimista: S.green };
                  return (
                    <div key={key} style={{ ...S.metric, borderColor: scenario === key ? colors[key] + "40" : undefined }}>
                      <div style={{ fontSize: 10, textTransform: "uppercase", color: colors[key], fontFamily: "'JetBrains Mono'", fontWeight: 600, marginBottom: 6 }}>{key}</div>
                      <div style={{ fontFamily: "'JetBrains Mono'", fontSize: 15, fontWeight: 700, color: colors[key] }}>{fmt(r.acumRec)}</div>
                      <div style={{ fontSize: 10, color: "#666", marginTop: 2 }}>{r.pacDig} pac/mês • ROI {pct(r.roi)}</div>
                    </div>
                  );
                })}
              </div>

              {/* Timeline compact */}
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11 }}>
                  <thead>
                    <tr style={{ borderBottom: "1px solid rgba(255,255,255,0.08)" }}>
                      {["Mês", "", "Receita", "Saldo Acum."].map((h, i) => (
                        <th key={i} style={{ padding: "6px 4px", textAlign: i > 1 ? "right" : "left", fontSize: 9, color: "#666", fontFamily: "'JetBrains Mono'", textTransform: "uppercase", letterSpacing: 1, fontWeight: 500 }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {results.meses.map((mes) => {
                      const maxRec = Math.max(...results.meses.map(m => m.rec));
                      const barW = maxRec > 0 ? (mes.rec / maxRec * 100) : 0;
                      return (
                        <tr key={mes.m} style={{ borderBottom: mes.m === results.pb ? `2px solid rgba(204,255,0,0.3)` : "1px solid rgba(255,255,255,0.025)" }}>
                          <td style={{ padding: "8px 4px", fontFamily: "'JetBrains Mono'", fontWeight: 600, color: S.neon, fontSize: 10 }}>M{mes.m}</td>
                          <td style={{ padding: "8px 4px" }}>
                            <div style={{ height: 4, background: "rgba(255,255,255,0.04)", borderRadius: 2, overflow: "hidden" }}>
                              <div style={{ height: "100%", width: barW + "%", background: S.neon, opacity: 0.4, borderRadius: 2, transition: "width 0.4s" }} />
                            </div>
                          </td>
                          <td style={{ padding: "8px 4px", textAlign: "right", fontFamily: "'JetBrains Mono'", color: S.green, fontSize: 10 }}>{fmtK(mes.rec)}</td>
                          <td style={{ padding: "8px 4px", textAlign: "right", fontFamily: "'JetBrains Mono'", color: mes.saldo >= 0 ? S.green : S.red, fontSize: 10 }}>{fmtK(mes.saldo)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Parcelamento Flow */}
            {parcelas > 1 && (
              <div style={S.card}>
                <div style={S.sectionTitle}><span style={S.dot} /> Fluxo de Caixa — Setup em {parcelas}x</div>
                <div style={S.sub}>custo mensal real do cliente nos primeiros meses</div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))", gap: 8 }}>
                  {parcelamentoFlow.slice(0, 6).map(f => (
                    <div key={f.m} style={{ ...S.metric, padding: 12 }}>
                      <div style={{ fontSize: 10, color: S.neon, fontFamily: "'JetBrains Mono'", fontWeight: 600 }}>Mês {f.m}</div>
                      <div style={{ fontFamily: "'JetBrains Mono'", fontSize: 13, fontWeight: 700, color: S.red, marginTop: 4 }}>{fmt(f.totalCost)}</div>
                      <div style={{ fontSize: 9, color: "#666", marginTop: 2 }}>
                        {f.m <= parcelas ? `Setup: ${fmtK(f.setupCost)}` : "Sem parcela"}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* RESUMO */}
            <div style={{ background: "linear-gradient(135deg, rgba(204,255,0,0.04), rgba(204,255,0,0.01))", border: "1px solid rgba(204,255,0,0.12)", borderRadius: 14, padding: "24px 22px", marginBottom: 16 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 14 }}>
                <span style={{ fontSize: 18 }}>📊</span>
                <span style={{ fontSize: 15, fontWeight: 600, color: "#fff" }}>Resumo Executivo</span>
              </div>

              <p style={{ fontSize: 13, color: "#E0E0E0", lineHeight: 1.7, marginBottom: 10 }}>
                Hoje, <strong style={{ color: "#fff" }}>{nome || "a clínica"}</strong> opera com{" "}
                <span style={{ color: S.neon, fontFamily: "'JetBrains Mono'", fontWeight: 600 }}>{atuais} pacientes novos/mês</span>{" "}
                por indicação, com agenda para {capacidade}. São{" "}
                <span style={{ color: S.neon, fontFamily: "'JetBrains Mono'", fontWeight: 600 }}>{results.vagasDisp} vagas ociosas</span>{" "}
                = até <span style={{ color: S.neon, fontFamily: "'JetBrains Mono'", fontWeight: 600 }}>{fmt(results.vagasDisp * ticketMedio)}/mês</span> em receita não capturada.
              </p>

              <p style={{ fontSize: 13, color: "#E0E0E0", lineHeight: 1.7, marginBottom: 14 }}>
                Com a estratégia digital, a estimativa é gerar{" "}
                <span style={{ color: S.neon, fontFamily: "'JetBrains Mono'", fontWeight: 600 }}>{results.pacDig} novos pacientes/mês</span>,
                adicionando <span style={{ color: S.neon, fontFamily: "'JetBrains Mono'", fontWeight: 600 }}>{fmt(results.recMensal)}</span> em receita mensal.
                Cada <span style={{ color: S.neon, fontFamily: "'JetBrains Mono'", fontWeight: 600 }}>R$ 1 investido retorna R$ {results.mult.toFixed(1)}</span>.
                {results.pb && <> Payback no <span style={{ color: S.neon, fontFamily: "'JetBrains Mono'", fontWeight: 600 }}>mês {results.pb}</span>.</>}
              </p>

              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                <button onClick={copyResumo} style={{ ...S.btnNeon, background: copied ? "rgba(68,255,136,0.15)" : undefined, borderColor: copied ? S.green : undefined, color: copied ? S.green : S.neon }}>
                  {copied ? "✅ Copiado!" : "📋 Copiar resumo"}
                </button>
                <button onClick={exportPDF} style={S.btnNeon}>📄 Exportar TXT</button>
                <button onClick={saveToHistory} style={S.btnNeon}>💾 Salvar simulação</button>
              </div>
            </div>
          </>
        )}

        {/* ════ TAB: PLANOS ════ */}
        {tab === "planos" && (
          <div style={S.card}>
            <div style={S.sectionTitle}><span style={S.dot} /> Comparativo de Planos ({scenario})</div>
            <div style={S.sub}>ROI calculado para cada plano com os dados da clínica</div>

            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12 }}>
              {planResults.map(p => (
                <div key={p.id} style={{ background: "rgba(255,255,255,0.02)", border: `1px solid ${p.cor}25`, borderRadius: 12, padding: 18, position: "relative" }}>
                  {p.id === "profissional" && (
                    <div style={{ position: "absolute", top: -8, right: 12, background: p.cor, color: "#070707", fontSize: 9, fontWeight: 700, padding: "2px 8px", borderRadius: 4, fontFamily: "'JetBrains Mono'" }}>RECOMENDADO</div>
                  )}
                  <div style={{ fontSize: 15, fontWeight: 700, color: p.cor, marginBottom: 12 }}>{p.nome}</div>

                  {[
                    ["Setup", fmt(p.setup)],
                    ["Mensal", fmt(p.mensal)],
                    ["Invest. 12m", fmt(p.results.investTotal)],
                  ].map(([l, v], i) => (
                    <div key={i} style={{ display: "flex", justifyContent: "space-between", padding: "5px 0", borderBottom: "1px solid rgba(255,255,255,0.04)", fontSize: 11 }}>
                      <span style={{ color: "#888" }}>{l}</span>
                      <span style={{ fontFamily: "'JetBrains Mono'", color: "#fff", fontWeight: 600 }}>{v}</span>
                    </div>
                  ))}

                  <div style={{ marginTop: 12, padding: 12, background: "rgba(0,0,0,0.3)", borderRadius: 8 }}>
                    {[
                      ["Receita 12m", fmt(p.results.acumRec), S.green],
                      ["ROI", pct(p.results.roi), p.results.roi > 100 ? S.green : S.neon],
                      ["Multiplicador", p.results.mult.toFixed(1) + "x", p.cor],
                      ["Payback", p.results.pb ? `Mês ${p.results.pb}` : "> 12m", p.results.pb ? S.neon : S.red],
                    ].map(([l, v, c], i) => (
                      <div key={i} style={{ display: "flex", justifyContent: "space-between", padding: "4px 0", fontSize: 11 }}>
                        <span style={{ color: "#666" }}>{l}</span>
                        <span style={{ fontFamily: "'JetBrains Mono'", color: c, fontWeight: 700 }}>{v}</span>
                      </div>
                    ))}
                  </div>

                  <button onClick={() => { setSetupVal(p.setup); setMensalVal(p.mensal); setTab("calc"); }} style={{ ...S.btnNeon, width: "100%", justifyContent: "center", marginTop: 12, borderColor: p.cor + "40", color: p.cor }}>
                    Simular este plano
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ════ TAB: REVERSA ════ */}
        {tab === "reversa" && (
          <div style={S.card}>
            <div style={S.sectionTitle}><span style={S.dot} /> Calculadora Reversa</div>
            <div style={S.sub}>quanto investir em mídia para atingir X pacientes/mês</div>

            <div style={{ maxWidth: 400 }}>
              <label style={S.label}>Quantos novos pacientes/mês você quer? <span style={S.hint}>meta</span></label>
              <input type="number" value={targetPac} onChange={e => setTargetPac(+e.target.value)} style={{ ...S.input, fontSize: 22, textAlign: "center", marginBottom: 16 }} />

              <div style={{ fontSize: 12, color: "#888", marginBottom: 4 }}>Com CPL de R$ {cpl} e conversão de {conv}%:</div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginTop: 12 }}>
                <div style={S.metric}>
                  <div style={S.metricLabel}>Leads necessários</div>
                  <div style={{ ...S.metricVal, fontSize: 24 }}>{Math.ceil(targetPac / (conv / 100))}</div>
                  <div style={{ fontSize: 9, color: "#666" }}>por mês</div>
                </div>
                <div style={S.metric}>
                  <div style={S.metricLabel}>Verba de mídia</div>
                  <div style={{ ...S.metricVal, fontSize: 24 }}>{fmt(reverseMidia)}</div>
                  <div style={{ fontSize: 9, color: "#666" }}>por mês</div>
                </div>
              </div>

              <div style={{ marginTop: 16, padding: 14, background: "rgba(204,255,0,0.04)", borderRadius: 10, border: "1px solid rgba(204,255,0,0.1)" }}>
                <div style={{ fontSize: 12, color: "#ccc", lineHeight: 1.6 }}>
                  Para captar <strong style={{ color: S.neon }}>{targetPac} pacientes/mês</strong>, {nome || "a clínica"} precisa investir{" "}
                  <strong style={{ color: S.neon }}>{fmt(reverseMidia)}/mês</strong> em mídia paga.
                  Isso geraria <strong style={{ color: S.neon }}>{fmt(targetPac * ticketMedio)}/mês</strong> em receita direta,
                  ou <strong style={{ color: S.neon }}>{fmt(targetPac * ticketMedio * retorno * 12)}/ano</strong> considerando retornos.
                </div>
              </div>

              <button onClick={() => { setMidia(reverseMidia); setTab("calc"); }} style={{ ...S.btnNeon, marginTop: 14 }}>
                ↗ Aplicar na calculadora
              </button>
            </div>
          </div>
        )}

        {/* ════ TAB: HISTÓRICO ════ */}
        {tab === "historico" && (
          <div style={S.card}>
            <div style={S.sectionTitle}><span style={S.dot} /> Simulações Salvas</div>
            <div style={S.sub}>{history.length} simulações • dados salvos localmente</div>

            {history.length === 0 ? (
              <div style={{ textAlign: "center", padding: 40, color: "#666" }}>
                <div style={{ fontSize: 32, marginBottom: 8 }}>💾</div>
                <div style={{ fontSize: 13 }}>Nenhuma simulação salva ainda.</div>
                <div style={{ fontSize: 11, marginTop: 4 }}>Use o botão "Salvar simulação" na aba Calculadora.</div>
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {history.map((h, i) => (
                  <div key={h.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "12px 14px", background: "rgba(255,255,255,0.02)", borderRadius: 8, border: "1px solid rgba(255,255,255,0.05)" }}>
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 600, color: "#fff" }}>{h.nome}</div>
                      <div style={{ fontSize: 10, color: "#666", fontFamily: "'JetBrains Mono'", marginTop: 2 }}>
                        {h.date} • Ticket {fmt(h.ticket)} • Mídia {fmt(h.midia)} • {h.scenario}
                      </div>
                    </div>
                    <div style={{ display: "flex", gap: 6 }}>
                      <button onClick={() => {
                        setNome(h.nome);
                        setCapacidade(h.capacidade);
                        setRetorno(h.retorno);
                        setAtuais(h.atuais);
                        setSetupVal(h.setup);
                        setMensalVal(h.mensal);
                        setMidia(h.midia);
                        setConv(h.conv);
                        setCpl(h.cpl);
                        setScenario(h.scenario);
                        setTab("calc");
                      }} style={{ ...S.btnNeon, padding: "4px 10px", fontSize: 9 }}>Carregar</button>
                      <button onClick={() => {
                        const updated = history.filter((_, idx) => idx !== i);
                        setHistory(updated);
                        localStorage.setItem("medprofit_history", JSON.stringify(updated));
                      }} style={{ ...S.btnNeon, padding: "4px 8px", fontSize: 9, borderColor: "rgba(255,68,68,0.2)", color: S.red }}>✕</button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* FOOTER */}
        <div style={{ textAlign: "center", marginTop: 32, paddingTop: 16, borderTop: "1px solid rgba(255,255,255,0.05)" }}>
          <div style={{ fontFamily: "'JetBrains Mono'", fontSize: 10, letterSpacing: 3, color: S.neon, opacity: 0.35 }}>VPEX SOLUTIONS — MEDPROFIT v2.0</div>
          <div style={{ fontSize: 9, color: "#555", marginTop: 6, maxWidth: 420, margin: "6px auto 0", lineHeight: 1.5 }}>
            Estimativas baseadas em benchmarks de tráfego pago saúde/estética Brasil. Resultados reais variam conforme mercado e execução.
          </div>
        </div>
      </div>
    </div>
  );
}
