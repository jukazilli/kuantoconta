"use client";
import { useEffect, useRef } from "react";
import { money, cents } from "../../lib/finance";

const palette = {
  coral: "#FE6803",
  dark: "#1B1C18",
  muted: "#737789",
  grid: "#E7E8EF",
  donut: ["#FE6803", "#D8DAE4", "#C6C9D6", "#E5E6EC", "#B4B7C7", "#ECEEF4"],
};

export default function FinanceChart({ type = "line", data = [], height = 240 }) {
  const node = useRef(null);

  useEffect(() => {
    let instance = null;
    let cancelled = false;
    let observer;

    (async () => {
      const echarts = await import("echarts");
      if (cancelled || !node.current) return;
      instance = echarts.init(node.current, null, { renderer: "svg" });

      let options = {
        animationDuration: 420,
        backgroundColor: "transparent",
        textStyle: { fontFamily: "Poppins, Inter, system-ui, sans-serif", fontSize: 12 },
        tooltip: {
          trigger: type === "donut" || type === "gauge" ? "item" : "axis",
          backgroundColor: "#ffffff",
          borderColor: "#E7E8EF",
          borderWidth: 1,
          extraCssText: "border-radius:12px;box-shadow:0 12px 30px rgba(22,23,28,.08)",
          formatter: (params) => {
            if (!Array.isArray(params)) return `${params.name}: ${money(params.value)}`;
            return params.map((p) => `${p.marker} ${p.seriesName}: <b>${money(p.data)}</b>`).join("<br/>");
          },
        },
      };

      if (type === "donut") {
        const series = data.map((item) => ({ name: item.name, value: cents(item.value) })).filter((x) => x.value > 0);
        const totalCents = series.reduce((acc, item) => acc + item.value, 0);
        options = {
          ...options,
          tooltip: { ...options.tooltip, trigger: "item", formatter: (p) => `${p.name}: <b>${money(p.value)}</b> (${p.percent}%)` },
          legend: {
            type: "scroll",
            orient: "vertical",
            right: 4,
            top: "middle",
            icon: "roundRect",
            itemWidth: 12,
            itemHeight: 12,
            itemGap: 10,
            textStyle: { color: "#51576A", fontSize: 12 },
          },
          color: palette.donut,
          series: [
            {
              name: "Categorias",
              type: "pie",
              radius: ["56%", "80%"],
              center: ["34%", "50%"],
              avoidLabelOverlap: true,
              label: { show: false },
              itemStyle: { borderColor: "#fdfdff", borderWidth: 3, borderRadius: 6 },
              data: series,
            },
          ],
          title: totalCents
            ? {
                text: money(totalCents),
                subtext: "Total de despesas",
                left: "33.5%",
                top: "39%",
                textAlign: "center",
                itemGap: 4,
                textStyle: {
                  color: "#16171C",
                  fontSize: 15,
                  fontWeight: 700,
                  fontFamily: "Poppins, Inter, system-ui, sans-serif",
                },
                subtextStyle: {
                  color: "#737789",
                  fontSize: 11,
                  fontFamily: "Poppins, Inter, system-ui, sans-serif",
                },
              }
            : undefined,
        };
      } else if (type === "gauge") {
        const pct = Math.min(100, Math.max(0, Number(data?.[0]?.value ?? 0)));
        const label = data?.[0]?.name || "Comprometido";
        options = {
          ...options,
          tooltip: { show: false },
          series: [
            {
              type: "gauge",
              startAngle: 180,
              endAngle: 0,
              min: 0,
              max: 100,
              radius: "96%",
              center: ["50%", "74%"],
              progress: { show: true, width: 14, roundCap: true, itemStyle: { color: pct > 35 ? "#D65A50" : palette.coral } },
              axisLine: { roundCap: true, lineStyle: { width: 14, color: [[1, "#E7E8EF"]] } },
              pointer: { show: false },
              axisTick: { show: false },
              splitLine: { show: false },
              axisLabel: { show: false },
              title: { offsetCenter: [0, "6%"], fontSize: 12, fontWeight: 500, color: "#737789" },
              detail: {
                valueAnimation: true,
                fontSize: 24,
                fontWeight: 700,
                fontFamily: "Poppins, Inter, system-ui, sans-serif",
                color: "#16171C",
                offsetCenter: [0, "-28%"],
                formatter: "{value}%",
              },
              data: [{ value: pct, name: label }],
            },
          ],
        };
      } else if (type === "hbar") {
        const items = [...data].reverse();
        options = {
          ...options,
          grid: { left: 8, right: 64, top: 8, bottom: 8, containLabel: true },
          tooltip: {
            trigger: "axis",
            axisPointer: { type: "none" },
            formatter: (p) => {
              const item = items[p[0]?.dataIndex];
              return item ? `<b>${item.name}</b>: ${money(cents(item.value))} (${item.sharePct}%)` : "";
            },
          },
          xAxis: { type: "value", show: false },
          yAxis: {
            type: "category",
            data: items.map((i) => i.name),
            axisTick: { show: false },
            axisLine: { show: false },
            axisLabel: { color: "#16171C", fontSize: 12, fontWeight: 500 },
          },
          series: [
            {
              type: "bar",
              barMaxWidth: 16,
              data: items.map((i, idx) => ({
                value: cents(i.value) / 100,
                itemStyle: {
                  color: idx === items.length - 1 ? palette.coral : "#D8DAE4",
                  borderRadius: [0, 6, 6, 0],
                },
              })),
              label: {
                show: true,
                position: "right",
                color: "#51576A",
                fontSize: 11,
                fontWeight: 600,
                formatter: (p) => `${items[p.dataIndex]?.sharePct ?? 0}%`,
              },
            },
          ],
        };
      } else if (type === "compare") {
        options = {
          ...options,
          grid: { left: 10, right: 10, top: 24, bottom: 26, containLabel: true },
          tooltip: {
            trigger: "axis",
            formatter: (p) => `${p[0]?.name || ""}: <b>${money(Math.round(Number(p[0]?.data) * 100))}</b>`,
          },
          xAxis: {
            type: "category",
            data: data.map((d) => d.label),
            axisTick: { show: false },
            axisLine: { show: false },
            axisLabel: { color: "#51576A", fontSize: 12, fontWeight: 500 },
          },
          yAxis: {
            type: "value",
            axisTick: { show: false },
            axisLine: { show: false },
            splitLine: { show: true, lineStyle: { color: "#E7E8EF", type: "dashed" } },
            axisLabel: {
              color: "#737789",
              fontSize: 11,
              formatter: (v) => (Math.abs(v) >= 1000 ? `${(v / 1000).toFixed(0)} mil` : String(v)),
            },
          },
          series: [
            {
              type: "bar",
              barMaxWidth: 28,
              data: data.map((d, idx) => ({
                value: cents(d.value) / 100,
                itemStyle: {
                  color: idx === 0 ? palette.dark : palette.coral,
                  borderRadius: [6, 6, 0, 0],
                },
              })),
            },
          ],
        };
      } else {
        const months = data.map((i) => i.label);
        const commonAxis = {
          axisTick: { show: false },
          axisLine: { show: false },
          axisLabel: { color: "#737789", fontSize: 11 },
          splitLine: { show: false },
        };
        options = {
          ...options,
          grid: { left: 8, right: 12, top: 32, bottom: 24, containLabel: true },
          xAxis: { type: "category", data: months, boundaryGap: type !== "line", ...commonAxis },
          yAxis: {
            type: "value",
            ...commonAxis,
            splitLine: { show: true, lineStyle: { color: "#E7E8EF", type: "dashed" } },
            axisLabel: {
              color: "#737789",
              fontSize: 11,
              formatter: (v) => (Math.abs(v) >= 1000 ? `${(v / 1000).toFixed(0)} mil` : String(v)),
            },
          },
          legend: { show: false },
        };

        if (type === "line") {
          const hasWithin = data.some(
            (i) => i.balanceWithinBudgets !== null && i.balanceWithinBudgets !== undefined && i.balanceWithinBudgets !== i.balance
          );
          options.series = [
            {
              name: "Contratual",
              type: "line",
              data: data.map((i) => cents(i.balance) / 100),
              smooth: 0.22,
              symbol: "circle",
              symbolSize: 5,
              lineStyle: { width: 3, color: palette.coral },
              itemStyle: { color: palette.coral },
              areaStyle: {
                color: {
                  type: "linear",
                  x: 0,
                  y: 0,
                  x2: 0,
                  y2: 1,
                  colorStops: [
                    { offset: 0, color: "rgba(254, 104, 3, .22)" },
                    { offset: 1, color: "rgba(254, 104, 3, .01)" },
                  ],
                },
              },
            },
          ];
          if (hasWithin) {
            options.series.push({
              name: "Com limites",
              type: "line",
              data: data.map((i) => cents(i.balanceWithinBudgets) / 100),
              smooth: 0.22,
              symbol: "none",
              lineStyle: { width: 2, type: "dashed", color: palette.dark },
              itemStyle: { color: palette.dark },
            });
            options.legend = {
              show: true,
              top: 0,
              right: 8,
              itemWidth: 12,
              itemHeight: 8,
              textStyle: { fontSize: 11, color: "#737789" },
            };
          }
          options.tooltip.formatter = (p) =>
            `${p[0]?.axisValueLabel || ""}<br/>` +
            p.map((q) => `${q.marker} ${q.seriesName}: <b>${money(Math.round(Number(q.data) * 100))}</b>`).join("<br/>");
        } else {
          // Exceção visual obrigatória V2: barras estreitas e delicadas com duas cores (coral e carvão #1B1C18)
          options.color = [palette.coral, palette.dark];
          options.series = [
            {
              name: "Receitas",
              type: "bar",
              barMaxWidth: 16,
              barGap: "32%",
              itemStyle: { color: palette.coral, borderRadius: [5, 5, 0, 0] },
              data: data.map((i) => cents(i.income) / 100),
            },
            {
              name: "Despesas",
              type: "bar",
              barMaxWidth: 16,
              barGap: "32%",
              itemStyle: { color: palette.dark, borderRadius: [5, 5, 0, 0] },
              data: data.map((i) => cents(i.expense) / 100),
            },
          ];
          options.tooltip.formatter = (p) =>
            p.map((q) => `${q.marker} ${q.seriesName}: <b>${money(Math.round(Number(q.data) * 100))}</b>`).join("<br/>");
          options.legend = {
            show: true,
            top: 0,
            right: 8,
            itemWidth: 9,
            itemHeight: 9,
            textStyle: { fontSize: 11, color: "#737789" },
          };
        }
      }

      instance.setOption(options, { notMerge: true });
      if (typeof ResizeObserver !== "undefined") {
        observer = new ResizeObserver(() => instance?.resize());
        observer.observe(node.current);
      }
    })();

    return () => {
      cancelled = true;
      observer?.disconnect();
      instance?.dispose();
    };
  }, [type, JSON.stringify(data)]);

  return (
    <div
      ref={node}
      style={{ width: "100%", height }}
      role="img"
      aria-label={
        type === "line"
          ? "Gráfico de saldo projetado"
          : type === "donut"
            ? "Distribuição de despesas por categoria"
            : type === "gauge"
              ? "Comprometimento da renda"
              : type === "hbar"
                ? "Ranking de gastos por categoria"
                : type === "compare"
                  ? "Comparativo de economia potencial"
                  : "Receitas e despesas mensais"
      }
    />
  );
}
