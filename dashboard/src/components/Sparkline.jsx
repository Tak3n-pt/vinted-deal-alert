import React from "react";
import Chart from "react-apexcharts";

const COLOR_MAP = {
  primary: "#1e88e5",
  secondary: "#26c6da",
  success: "#00c292",
  warning: "#fec90f",
  danger: "#e46a76",
  info: "#03c9d7",
  white: "#ffffff"
};

export default function Sparkline({ data, color = "primary", height = 70, variant = "solid" }) {
  const stroke = COLOR_MAP[color] ?? COLOR_MAP.primary;
  const options = {
    chart: {
      type: "area",
      height,
      sparkline: { enabled: true },
      fontFamily: "inherit",
      foreColor: "#adb0bb"
    },
    stroke: { curve: "smooth", width: 2.5, colors: [stroke] },
    fill: {
      type: "gradient",
      gradient: {
        shadeIntensity: 1,
        inverseColors: false,
        opacityFrom: variant === "onColor" ? 0.45 : 0.55,
        opacityTo: 0.05,
        stops: [0, 90, 100],
        colorStops: [
          { offset: 0, color: stroke, opacity: variant === "onColor" ? 0.55 : 0.65 },
          { offset: 100, color: stroke, opacity: 0 }
        ]
      }
    },
    colors: [stroke],
    markers: { size: 0 },
    tooltip: {
      theme: "dark",
      x: { show: false },
      y: { formatter: (val) => String(val) }
    }
  };
  const series = [{ name: "", data }];
  return <Chart options={options} series={series} type="area" height={height} />;
}
