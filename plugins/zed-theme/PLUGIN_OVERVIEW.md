Give bb the typography Zed uses: IBM Plex Sans for the interface and Lilex for code, diffs, file paths and the integrated terminal. Both are the typefaces Zed ships as its defaults, and both are open source under the SIL Open Font License.

## What you get

- One theme, listed as **Zed** in the theme picker and in `bb theme list` as `plugin:zed-theme:zed`.
- IBM Plex Sans for the whole interface and message text, in the weights bb uses (400, 500, 600, 700) plus italics.
- Lilex for code blocks, diffs, file paths, previews, the editor plugin and the terminal, with its ligatures.
- Nothing is installed on any machine: the faces are ordinary web fonts, so the theme renders the same in every browser and on every host that opens bb.

## How to use it

```
bb theme set plugin:zed-theme:zed
```

Switch back with `bb theme set default`, or pick any other palette in Settings, Appearance. The theme changes typography only; colors, code highlighting and the favicon stay as they are.

## How it works

The theme CSS declares IBM Plex Sans and Lilex with `@font-face`, pinned to the Fontsource CDN build of both families (version 5.3.0), and overrides `--font-sans`, `--font-mono` and `--font-terminal`. Every subset carries a `unicode-range`, so a browser downloads only the files its text needs: a Latin plus Cyrillic interface pulls about 130 KB once, and the CDN answers with a one-year immutable cache after that.

The CDN is the one external dependency. A machine without access to `cdn.jsdelivr.net` sees bb fall back to Inter and the system monospace font. If that matters for a host, install the two families locally and point a custom theme at the family names instead, or embed the fonts in the theme file.

## Notes

- The integrated terminal re-measures its cell size once the font has loaded, so the terminal grid stays correct.
- Lilex covers Latin, Cyrillic and Greek, plus PowerLine and box-drawing symbols; Nerd Font icon glyphs still come from the terminal's fallback stack.
- IBM Plex Sans is (c) IBM, Lilex is by Misha Myrt; both are licensed under the SIL Open Font License 1.1, which permits bundling and redistribution.
