// KaTeX paints a subscript by shifting a zero-height box with an inline
// `top`. That is correct HTML, and the tests can see `.msupsub`, but on the
// reading surface the shift is a couple of pixels: $A_{\mathrm{Nb}}$ and
// $N_A$ read as ANb / NA, which is a different quantity. Replacing the
// script with a native <sub> / <sup> after KaTeX has parsed the TeX keeps
// the same letters and makes the position unmistakable (guide 2: the
// typeset body is a rendering of the professor's source, not a rewrite).

type HastNode = {
  type?: string;
  tagName?: string;
  value?: string;
  properties?: {
    className?: string[] | string;
    style?: string | Record<string, string>;
  };
  children?: HastNode[];
};

function classList(node: HastNode): string[] {
  const names = node.properties?.className;
  if (Array.isArray(names)) return names.map(String);
  if (typeof names === "string") return names.split(/\s+/).filter(Boolean);
  return [];
}

function textOf(node: HastNode): string {
  if (node.type === "text") return node.value ?? "";
  return (node.children ?? []).map(textOf).join("");
}

function parseTopEm(node: HastNode): number | null {
  const style = node.properties?.style;
  const raw =
    typeof style === "string"
      ? /(?:^|;)\s*top\s*:\s*([^;]+)/i.exec(style)?.[1]
      : style && typeof style === "object"
        ? style.top
        : undefined;
  if (!raw) return null;
  const match = /^(-?[\d.]+)em$/i.exec(raw.trim());
  return match ? Number(match[1]) : null;
}

// Superscripts sit higher (more negative `top`) than subscripts. KaTeX's
// own values are about -3.1em for a superscript and -2.55em for a subscript.
const SUPERSCRIPT_TOP = -2.8;

type Script = { kind: "sub" | "sup"; text: string };

function scriptsIn(node: HastNode): Script[] {
  const found: Script[] = [];
  const walk = (current: HastNode) => {
    const top = parseTopEm(current);
    if (top !== null) {
      const text = textOf(current).replace(/\u200b/g, "").trim();
      if (text) {
        found.push({ kind: top <= SUPERSCRIPT_TOP ? "sup" : "sub", text });
      }
      return;
    }
    current.children?.forEach(walk);
  };
  walk(node);
  return found;
}

function scriptElement(tag: "sub" | "sup", text: string): HastNode {
  return {
    type: "element",
    tagName: tag,
    properties: {},
    children: [{ type: "text", value: text }],
  };
}

export function rehypeNativeScripts() {
  return (tree: HastNode) => {
    const walk = (node: HastNode) => {
      if (classList(node).includes("msupsub")) {
        const scripts = scriptsIn(node);
        const [script] = scripts;
        if (scripts.length === 1 && script !== undefined) {
          node.tagName = script.kind;
          node.properties = {};
          node.children = [{ type: "text", value: script.text }];
          return;
        }
        if (scripts.length > 1) {
          node.tagName = "span";
          node.properties = { className: ["katex-scripts"] };
          node.children = scripts.map((script) =>
            scriptElement(script.kind, script.text),
          );
          return;
        }
      }
      node.children?.forEach(walk);
    };
    walk(tree);
  };
}
