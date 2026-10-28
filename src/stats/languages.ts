export interface Language {
  name: string;
  color: string;
}

const L = (name: string, color: string): Language => ({ name, color });

const BY_EXT: Record<string, Language> = {
  ts: L('TypeScript', '#3178c6'), tsx: L('TypeScript', '#3178c6'), mts: L('TypeScript', '#3178c6'),
  js: L('JavaScript', '#f1e05a'), jsx: L('JavaScript', '#f1e05a'), mjs: L('JavaScript', '#f1e05a'), cjs: L('JavaScript', '#f1e05a'),
  py: L('Python', '#3572A5'), rb: L('Ruby', '#cc342d'), go: L('Go', '#00ADD8'), rs: L('Rust', '#dea584'),
  java: L('Java', '#b07219'), kt: L('Kotlin', '#A97BFF'), kts: L('Kotlin', '#A97BFF'), swift: L('Swift', '#F05138'),
  c: L('C', '#555555'), h: L('C', '#555555'), cpp: L('C++', '#f34b7d'), cc: L('C++', '#f34b7d'), hpp: L('C++', '#f34b7d'),
  cs: L('C#', '#178600'), php: L('PHP', '#4F5D95'), dart: L('Dart', '#00B4AB'), scala: L('Scala', '#c22d40'),
  ex: L('Elixir', '#6e4a7e'), exs: L('Elixir', '#6e4a7e'), erl: L('Erlang', '#B83998'), hs: L('Haskell', '#5e5086'),
  lua: L('Lua', '#000080'), r: L('R', '#198CE7'), jl: L('Julia', '#a270ba'), clj: L('Clojure', '#db5855'),
  vue: L('Vue', '#41b883'), svelte: L('Svelte', '#ff3e00'), astro: L('Astro', '#ff5a03'),
  html: L('HTML', '#e34c26'), htm: L('HTML', '#e34c26'), css: L('CSS', '#663399'), scss: L('SCSS', '#c6538c'),
  sass: L('Sass', '#a53b70'), less: L('Less', '#1d365d'),
  sh: L('Shell', '#89e051'), bash: L('Shell', '#89e051'), zsh: L('Shell', '#89e051'), ps1: L('PowerShell', '#012456'),
  sql: L('SQL', '#e38c00'), md: L('Markdown', '#083fa1'), mdx: L('MDX', '#fcb32c'),
  json: L('JSON', '#292929'), yml: L('YAML', '#cb171e'), yaml: L('YAML', '#cb171e'), toml: L('TOML', '#9c4221'),
  xml: L('XML', '#0060ac'), gradle: L('Gradle', '#02303a'), tf: L('HCL', '#844FBA'), nix: L('Nix', '#7e7eff'),
  ipynb: L('Jupyter', '#DA5B0B'), zig: L('Zig', '#ec915c'), ml: L('OCaml', '#ef7a08'), fs: L('F#', '#b845fc'),
};

const BY_NAME: Record<string, Language> = {
  dockerfile: L('Dockerfile', '#384d54'),
  makefile: L('Makefile', '#427819'),
};

const OTHER = L('Outros', '#8b8b9a');

export function languageOf(path: string): Language {
  const file = path.slice(path.lastIndexOf('/') + 1).toLowerCase();
  if (BY_NAME[file]) return BY_NAME[file];
  const dot = file.lastIndexOf('.');
  if (dot <= 0) return OTHER;
  return BY_EXT[file.slice(dot + 1)] ?? OTHER;
}

/** Lockfiles and generated output would otherwise dominate line counts. */
export function isNoise(path: string) {
  return /(^|\/)(package-lock\.json|yarn\.lock|pnpm-lock\.yaml|bun\.lockb|Cargo\.lock|poetry\.lock|composer\.lock|Gemfile\.lock|go\.sum)$/.test(path)
    || /(^|\/)(node_modules|dist|build|vendor|\.next|coverage)\//.test(path)
    || /\.min\.(js|css)$/.test(path)
    || /\.map$/.test(path);
}
