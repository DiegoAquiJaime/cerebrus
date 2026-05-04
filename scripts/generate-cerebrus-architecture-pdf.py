#!/usr/bin/env python3
"""
Genera PDF didáctico: módulos de Cerebrus, flujo de datos y flujo Cursor → GitHub → Pages / Drive.

Ejecutar desde la raíz del repo:
  python3 scripts/generate-cerebrus-architecture-pdf.py

Salida: Cerebrus_Arquitectura_y_flujo.pdf (en la raíz del proyecto).

Si Matplotlib se queja del caché (p. ej. en CI), usar:
  MPLCONFIGDIR=/tmp/mplcache python3 scripts/generate-cerebrus-architecture-pdf.py
"""
from pathlib import Path

import matplotlib.pyplot as plt
from matplotlib.backends.backend_pdf import PdfPages
from matplotlib.patches import FancyBboxPatch, FancyArrowPatch

OUT = Path(__file__).resolve().parent.parent / "Cerebrus_Arquitectura_y_flujo.pdf"
GENERATED = "Mayo 2026"

# Colores didácticos
C_BG = "#f8fafc"
C_BOX = "#e2e8f0"
C_ACCENT = "#0f766e"
C_CURSOR = "#7c3aed"
C_LOCAL = "#0369a1"
C_GH = "#24292f"
C_PAGES = "#1a7f37"
C_DRIVE = "#1a73e8"
C_BROWSER = "#c2410c"
C_GAS = "#ea8600"


def rounded_box(ax, xy, w, h, text, fc, ec="#334155", fontsize=9, lw=1.2):
    x, y = xy
    box = FancyBboxPatch(
        (x, y),
        w,
        h,
        boxstyle="round,pad=0.02,rounding_size=0.08",
        facecolor=fc,
        edgecolor=ec,
        linewidth=lw,
    )
    ax.add_patch(box)
    ax.text(x + w / 2, y + h / 2, text, ha="center", va="center", fontsize=fontsize, weight="600", wrap=True)


def arrow(ax, p1, p2, color="#475569", lw=1.5, style="->"):
    a = FancyArrowPatch(
        p1,
        p2,
        arrowstyle=style,
        mutation_scale=12,
        linewidth=lw,
        color=color,
        connectionstyle="arc3,rad=0",
    )
    ax.add_patch(a)


def page_setup(ax, title):
    ax.set_xlim(0, 10)
    ax.set_ylim(0, 14)
    ax.set_aspect("equal")
    ax.axis("off")
    ax.set_facecolor(C_BG)
    ax.text(5, 13.35, title, ha="center", va="center", fontsize=15, weight="bold", color="#0f172a")
    ax.text(5, 12.85, "Cerebrus — Gastronomy Suite (Aquí Jaime)", ha="center", va="center", fontsize=9, color="#64748b")


def fig_modules():
    fig, ax = plt.subplots(figsize=(8.27, 11.69))
    page_setup(ax, "1. Módulos de la app (una sola página: index.html)")

    # Centro: estado
    rounded_box(ax, (3.3, 6.2), 3.4, 1.1, "Estado único\n(state en JS)", "#ccfbf1", C_ACCENT, 10)

    # Anillo de módulos (vistas principales)
    modules = [
        (5.0, 9.0, "[SAC]\nSemana actual"),
        (6.8, 7.8, "Calendario\n+ bitácora"),
        (6.5, 5.0, "Informe\ndiario"),
        (5.0, 3.6, "Dashboard\nProyección"),
        (3.0, 3.6, "Historial\nmeses"),
        (1.2, 5.0, "Inventario\nPedido sem."),
        (1.0, 7.8, "Facturas\nproveedores"),
        (2.5, 9.0, "Créditos\ninformales"),
    ]
    for x, y, t in modules:
        rounded_box(ax, (x, y), 1.55, 0.95, t, C_BOX, "#64748b", 7.5)

    # Conexiones al centro (simplificado: líneas desde “módulos” hacia state)
    hub_cx, hub_cy = 5.0, 6.75
    for x, y, _ in modules:
        cx, cy = x + 0.775, y + 0.475
        ax.plot([cx, hub_cx], [cy, hub_cy], color="#94a3b8", linewidth=1, linestyle="--", zorder=0)

    ax.text(
        5,
        1.35,
        "Todos comparten el mismo estado: ventas, inventario, facturas, créditos, propinas, caja, etc.\n"
        "La barra lateral cambia de “vista”; los datos no están en silos separados.",
        ha="center",
        va="top",
        fontsize=9,
        color="#334155",
        linespacing=1.45,
    )

    rounded_box(ax, (0.5, 10.5), 2.2, 0.75, "Propinas", C_BOX, "#64748b", 8)
    rounded_box(ax, (7.3, 10.5), 2.2, 0.75, "Finanzas Sebas\n(solo algunos usuarios)", "#fce7f3", "#9d174d", 7.5)
    rounded_box(ax, (0.5, 1.85), 4.0, 0.65, "Configuración (categorías, usuarios, respaldos desde UI)", C_BOX, "#64748b", 8)
    ax.plot([1.6, 4.2], [10.5, 7.3], color="#cbd5e1", linewidth=0.8, linestyle=":")
    ax.plot([8.4, 6.0], [10.5, 7.3], color="#cbd5e1", linewidth=0.8, linestyle=":")

    plt.tight_layout()
    return fig


def fig_data():
    fig, ax = plt.subplots(figsize=(8.27, 11.69))
    page_setup(ax, "2. Dónde viven los datos (operación diaria)")

    rounded_box(ax, (1.0, 8.5), 3.2, 1.8, "Tu navegador\n(Chrome / Firefox)", "#ffedd5", C_BROWSER, 10)
    rounded_box(ax, (5.5, 8.5), 3.5, 1.8, "Google Apps Script\n(URL .exec en la app)", "#ffedd5", C_GAS, 9)

    arrow(ax, (4.25, 9.4), (5.45, 9.4), C_GAS, 2)
    ax.text(4.85, 9.75, "sync", ha="center", fontsize=8, color=C_GAS, weight="bold")

    rounded_box(ax, (2.2, 5.5), 5.6, 1.5, "Google Drive / almacenamiento\ndel proyecto Apps Script\n(estado JSON “en la nube”)", "#dbeafe", C_DRIVE, 9)

    arrow(ax, (7.25, 8.5), (6.5, 7.05), C_DRIVE, 2)
    arrow(ax, (6.0, 8.5), (5.5, 7.05), C_DRIVE, 2)

    rounded_box(ax, (1.2, 3.2), 7.6, 1.3, "localStorage del navegador\n(copia local + cola de sincronización)", "#e0e7ff", "#4338ca", 9)
    arrow(ax, (2.6, 8.5), (3.5, 4.55), "#4338ca", 1.8)
    arrow(ax, (4.2, 8.5), (5.0, 4.55), "#4338ca", 1.8)
    ax.text(2.2, 6.8, "lectura /\nescritura\ninstantánea", ha="left", fontsize=7.5, color="#4338ca")

    ax.text(
        5,
        1.9,
        "Resumen: la interfaz es HTML+JS (GitHub Pages). Los datos de negocio se sincronizan con Apps Script;\n"
        "en el disco local del Mac no se “guarda” el estado operativo salvo que exportes un respaldo JSON a mano.",
        ha="center",
        va="top",
        fontsize=9,
        color="#334155",
        linespacing=1.45,
    )

    plt.tight_layout()
    return fig


def fig_devflow():
    fig, ax = plt.subplots(figsize=(8.27, 11.69))
    page_setup(ax, "3. Flujo cuando pides cambios en Cursor (código)")

    y = 10.2
    dy = 1.35
    boxes = [
        ((1.0, y), 8, 0.95, "1  Cursor + agente\n(pedidos en lenguaje natural → edita archivos)", "#ede9fe", C_CURSOR),
        ((1.0, y - dy), 8, 0.95, "2  Carpeta local en tu Mac\n(ej. Documents/CURSOR/Cerebrus)", "#e0f2fe", C_LOCAL),
        ((1.0, y - 2 * dy), 8, 0.95, "3  git add / commit (cuando quieras fijar un punto)", "#f1f5f9", C_GH, 9),
        ((1.0, y - 3 * dy), 8, 0.95, "4  git push → repositorio en GitHub\n(código fuente: index.html, workflows, etc.)", "#f1f5f9", C_GH, 9),
        ((1.0, y - 4 * dy), 8, 1.05, "5  GitHub Actions (push a main)\n→ publica el sitio en GitHub Pages\n(nueva versión de la app para todos)", "#dcfce7", C_PAGES, 9),
    ]
    for (xy, w, h, txt, fc, ec, *rest) in boxes:
        fs = rest[0] if rest else 9.5
        rounded_box(ax, xy, w, h, txt, fc, ec, fs)

    for i in range(4):
        arrow(ax, (5, y - i * dy - 0.02), (5, y - (i + 1) * dy + 0.98), "#475569", 2)

    ax.text(
        5,
        3.1,
        "Drive no sustituye a GitHub aquí: Drive guarda datos de la app (vía Apps Script);\n"
        "GitHub guarda el código. Son dos carriles distintos.",
        ha="center",
        va="top",
        fontsize=9.5,
        weight="bold",
        color="#0f172a",
    )

    rounded_box(ax, (0.8, 1.0), 8.4, 1.35, "", "#ffffff", "#cbd5e1", 0)
    ax.text(
        5,
        1.9,
        "• Cambios de lógica o diseño → Cursor → Git → GitHub → Pages.\n"
        "• Cambios de números del día (ventas, stock…) → solo dentro de Cerebrus en el navegador → nube Apps Script.",
        ha="center",
        va="center",
        fontsize=9,
        color="#334155",
        linespacing=1.5,
    )

    plt.tight_layout()
    return fig


def fig_cover():
    fig, ax = plt.subplots(figsize=(8.27, 11.69))
    ax.set_xlim(0, 10)
    ax.set_ylim(0, 14)
    ax.set_aspect("equal")
    ax.axis("off")
    ax.set_facecolor("#0f172a")
    ax.add_patch(FancyBboxPatch((0.8, 4.5), 8.4, 5.5, boxstyle="round,pad=0.03,rounding_size=0.15", facecolor="#1e293b", edgecolor="#334155", linewidth=2))
    ax.text(5, 9.2, "CEREBRUS", ha="center", fontsize=28, weight="bold", color="#f8fafc")
    ax.text(5, 8.0, "Arquitectura y flujo de trabajo", ha="center", fontsize=14, color="#94a3b8")
    ax.text(5, 6.9, "Módulos · Datos · Cursor · GitHub · Drive", ha="center", fontsize=11, color="#64748b")
    ax.text(5, 2.8, GENERATED, ha="center", fontsize=10, color="#64748b")
    ax.text(5, 2.2, "Documento generado automáticamente desde el repositorio.", ha="center", fontsize=8, color="#475569")
    plt.tight_layout()
    return fig


def fig_overview():
    fig, ax = plt.subplots(figsize=(8.27, 11.69))
    ax.set_xlim(0, 10)
    ax.set_ylim(0, 14)
    ax.set_aspect("equal")
    ax.axis("off")
    ax.set_facecolor("#f1f5f9")
    ax.text(5, 12.9, "Vista general (un vistazo)", ha="center", fontsize=16, weight="bold", color="#0f172a")
    ax.text(5, 12.35, "Dos mundos que conviven", ha="center", fontsize=11, color="#64748b")

    # Columna código
    rounded_box(ax, (0.4, 5.5), 4.3, 6.2, "", "#ffffff", C_GH, 0)
    ax.text(2.55, 11.35, "Código\n(fuente)", ha="center", fontsize=11, weight="bold", color=C_GH)
    ax.text(
        2.55,
        9.5,
        "Cursor\n     ↓\nMac local\n     ↓\nGitHub\n     ↓\nGitHub Pages\n(sitio web)",
        ha="center",
        va="center",
        fontsize=10,
        color="#334155",
        linespacing=1.55,
    )

    # Columna datos
    rounded_box(ax, (5.3, 5.5), 4.3, 6.2, "", "#ffffff", C_DRIVE, 0)
    ax.text(7.45, 11.35, "Datos\n(operación)", ha="center", fontsize=11, weight="bold", color=C_DRIVE)
    ax.text(
        7.45,
        9.5,
        "Navegador\n     ↓\nlocalStorage\n     ↕\nApps Script\n     ↓\nDrive / nube Google",
        ha="center",
        va="center",
        fontsize=10,
        color="#334155",
        linespacing=1.55,
    )

    ax.text(
        5,
        4.35,
        "Cerebrus = una app web (un index.html grande) que lee/escribe estado y lo sincroniza.\n"
        "No hace falta tocar Drive a mano para el día a día: la app habla con Apps Script.",
        ha="center",
        va="top",
        fontsize=9.5,
        color="#475569",
        linespacing=1.45,
    )

    plt.tight_layout()
    return fig


def main():
    plt.rcParams["font.family"] = ["DejaVu Sans", "Arial", "sans-serif"]

    with PdfPages(OUT) as pdf:
        figc = fig_cover()
        pdf.savefig(figc, bbox_inches="tight", facecolor=figc.axes[0].get_facecolor())
        plt.close(figc)

        fig0 = fig_overview()
        pdf.savefig(fig0, bbox_inches="tight", facecolor=fig0.axes[0].get_facecolor())
        plt.close(fig0)

        fig1 = fig_modules()
        pdf.savefig(fig1, bbox_inches="tight", facecolor=fig1.axes[0].get_facecolor())
        plt.close(fig1)

        fig2 = fig_data()
        pdf.savefig(fig2, bbox_inches="tight", facecolor=fig2.axes[0].get_facecolor())
        plt.close(fig2)

        fig3 = fig_devflow()
        pdf.savefig(fig3, bbox_inches="tight", facecolor=fig3.axes[0].get_facecolor())
        plt.close(fig3)

    print(f"Escrito: {OUT}")


if __name__ == "__main__":
    main()
