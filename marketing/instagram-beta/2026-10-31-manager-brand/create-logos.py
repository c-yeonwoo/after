"""Original geometric marks plus outlined lettering; no system-font dependency.

Run with fonttools + brotli. Wanted Sans copyright Wanted Lab, SIL OFL 1.1.
All three are unapproved design proposals, not replacements for the live logo.
"""
from pathlib import Path
from fontTools.ttLib import TTFont
from fontTools.varLib.instancer import instantiateVariableFont
from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.pens.boundsPen import BoundsPen

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[2]
INK, PINK = "#393B42", "#EF8798"


def lettering(weight, italic=False):
    font = instantiateVariableFont(TTFont(ROOT / "public/fonts/wanted-sans/woff2/WantedSansVariable.split.90.woff2"), {"wght": weight})
    glyphs, cmap = font.getGlyphSet(), font.getBestCmap()
    x, paths, bounds = 0, [], []
    for char in "after":
        name = cmap[ord(char)]
        pen = SVGPathPen(glyphs)
        glyphs[name].draw(pen)
        bound = BoundsPen(glyphs)
        glyphs[name].draw(bound)
        bounds.append(bound.bounds)
        paths.append(f'<path transform="translate({x} 0)" d="{pen.getCommands()}"/>')
        x += font["hmtx"][name][0] - 30
    # Font units are not CSS pixels. Fit the actual ascender before export.
    scale = 80 / max(b[3] for b in bounds)
    return f'<g transform="translate(12 92){" skewX(-9)" if italic else ""} scale({scale} {-scale})">{"".join(paths)}</g>', x * scale + (30 if italic else 16)


# Shared f/t crossbar is deliberate lettering, not a font ligature approximation.
round_word = '''<g fill="none" stroke="currentColor" stroke-width="12" stroke-linecap="round" stroke-linejoin="round">
<path d="M60 56c0-17-11-29-27-29S6 39 6 56s11 29 27 29 27-12 27-29zm0-29v58"/>
<path d="M90 85V29c0-14 7-22 21-22h8M78 38h97M143 16v50c0 14 7 19 20 19h12"/>
<path d="M201 55h49c0-17-9-28-25-28-17 0-27 12-27 29 0 18 11 29 29 29 10 0 18-3 24-9M279 85V29m0 26c0-18 9-28 26-28"/>
</g>'''

marks = {
    "a": '''<g fill="none" stroke="currentColor" stroke-width="12" stroke-linecap="round" stroke-linejoin="round"><path d="M28 83V29c0-15 8-22 23-22h4M15 38h72M67 15v49c0 14 7 19 21 19"/></g>''',
    "b": '''<path fill="currentColor" d="M43 15C22 15 9 28 9 48c0 18 11 30 29 30h8V60h-8c-7 0-11-4-11-12s5-13 16-13z"/><path fill="ACCENT" d="M57 81c21 0 34-13 34-33 0-18-11-30-29-30h-8v18h8c7 0 11 4 11 12s-5 13-16 13z"/>''',
    "c": '''<g fill="none" stroke="currentColor" stroke-width="11" stroke-linecap="round" stroke-linejoin="round"><path d="M66 31c-6-8-13-11-24-11-17 0-28 12-28 29s9 28 25 28c11 0 20-7 27-18M71 23 60 75"/></g><path fill="ACCENT" d="M77 70c0-5 4-9 9-9s9 4 9 9c0 13-6 24-17 30l-6-8c7-4 11-9 11-14-4-1-6-4-6-8z"/>''',
}


def svg(body, width, height, title):
    return f'<svg xmlns="http://www.w3.org/2000/svg" width="{width}" height="{height}" viewBox="0 0 {width} {height}" role="img"><title>{title}</title>{body}</svg>\n'


for key in ["a", "b", "c"]:
    for mode, ink, accent in [("", INK, PINK), ("-mono", INK, INK), ("-white", "#FFFFFF", PINK)]:
        mark = marks[key].replace("ACCENT", accent)
        if key == "a":
            word, width = round_word, 317
            body = f'<g color="{ink}">{word}</g>'
        else:
            word, width = lettering(800 if key == "b" else 600, key == "c")
            if key == "b":
                body = f'<g color="{ink}"><g transform="translate(0 10) scale(.8)">{mark}</g><g transform="translate(105 0)" fill="{ink}">{word}</g></g>'
                width += 110
            else:
                body = f'<g fill="{ink}">{word}</g><path d="M{width+12} 77c0-5 4-9 9-9s9 4 9 9c0 14-7 25-19 31l-5-8c7-4 11-9 11-14-3-1-5-4-5-9z" fill="{accent}"/>'
                width += 48
        (HERE / "logos" / f"{key}-wordmark{mode}.svg").write_text(svg(body, round(width + 8), 114, "after 로고 시안 " + key.upper()))
        (HERE / "logos" / f"{key}-symbol{mode}.svg").write_text(svg(f'<g color="{ink}">{mark}</g>', 104, 110, "after 심벌 시안 " + key.upper()))
    icon = f'<rect width="1024" height="1024" rx="232" fill="#FAF9F6"/><g transform="translate(192 174) scale(6.2)" color="{INK}">{marks[key].replace("ACCENT",PINK)}</g>'
    (HERE / "logos" / f"{key}-app-icon.svg").write_text(svg(icon, 1024, 1024, "after 앱 아이콘 시안 " + key.upper()))

print("Created 21 outlined SVG logo proposals.")
