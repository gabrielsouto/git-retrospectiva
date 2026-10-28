import type { Commit, Repo } from './types';

/** Deterministic pseudo-random generator so the demo looks the same every time. */
function rng(seed: number) {
  return () => {
    seed = (seed * 1664525 + 1013904223) % 4294967296;
    return seed / 4294967296;
  };
}

const AUTHORS = [
  { name: 'Ana Lima', email: 'ana@exemplo.dev', weight: 5, nightOwl: true },
  { name: 'Bruno Costa', email: 'bruno@exemplo.dev', weight: 3, nightOwl: false },
  { name: 'Carla Souza', email: 'carla@exemplo.dev', weight: 2, nightOwl: false },
  { name: 'Diego Rocha', email: 'diego@exemplo.dev', weight: 1, nightOwl: true },
];

const FILES = [
  'src/App.tsx', 'src/main.tsx', 'src/components/Header.tsx', 'src/components/Button.tsx',
  'src/components/Modal.tsx', 'src/components/Chart.tsx', 'src/hooks/useAuth.ts', 'src/hooks/useFetch.ts',
  'src/pages/Home.tsx', 'src/pages/Dashboard.tsx', 'src/pages/Settings.tsx', 'src/styles/global.css',
  'src/styles/theme.css', 'src/utils/format.ts', 'src/utils/date.ts', 'src/api/client.ts',
  'src/api/users.ts', 'server/index.py', 'server/models.py', 'server/routes/auth.py',
  'server/routes/reports.py', 'server/tests/test_auth.py', 'docs/README.md', 'docs/arquitetura.md',
  'package.json', 'Dockerfile', '.github/workflows/ci.yml', 'scripts/deploy.sh', 'db/migrations/001_init.sql',
  'db/migrations/002_reports.sql', 'public/index.html', 'src/i18n/pt-BR.json',
];

const VERBS = ['feat', 'fix', 'refactor', 'docs', 'chore', 'test', 'style', 'perf'];
const SUBJECTS = [
  'dashboard', 'login', 'relatórios', 'tema escuro', 'cache', 'tradução', 'gráficos', 'modal',
  'deploy', 'testes de autenticação', 'migração do banco', 'formatação de datas', 'cabeçalho', 'API de usuários',
];

export function demoRepo(): Repo {
  const rand = rng(42);
  const pick = <T,>(arr: T[]) => arr[Math.floor(rand() * arr.length)];
  const weighted = () => {
    const total = AUTHORS.reduce((s, a) => s + a.weight, 0);
    let r = rand() * total;
    for (const a of AUTHORS) if ((r -= a.weight) < 0) return a;
    return AUTHORS[0];
  };

  const year = new Date().getFullYear();
  const start = Date.UTC(year, 0, 1);
  const end = Math.min(Date.now(), Date.UTC(year, 11, 31));
  const commits: Commit[] = [];
  let i = 0;
  for (let day = start; day <= end; day += 86_400_000) {
    const weekday = new Date(day).getUTCDay();
    const month = new Date(day).getUTCMonth();
    const busy = 1 + Math.sin((month / 12) * Math.PI * 2) * 0.6;
    const base = weekday === 0 || weekday === 6 ? 0.8 : 3.2;
    const n = Math.max(0, Math.round(base * busy * rand() * 1.6 - (rand() < 0.15 ? 3 : 0)));
    for (let k = 0; k < n; k++) {
      const author = weighted();
      const hour = author.nightOwl && rand() < 0.5 ? (21 + Math.floor(rand() * 6)) % 24 : 9 + Math.floor(rand() * 9);
      const time = day + hour * 3_600_000 + Math.floor(rand() * 3_600_000) + 3 * 3_600_000;
      const nFiles = 1 + Math.floor(rand() * rand() * 6);
      const files = Array.from({ length: nFiles }, () => {
        const path = pick(FILES.slice(0, Math.min(FILES.length, 8 + Math.floor(((day - start) / (end - start || 1)) * FILES.length))));
        return { path, added: Math.floor(rand() * rand() * 120) + 1, removed: Math.floor(rand() * rand() * 60) };
      });
      const verb = pick(VERBS);
      commits.push({
        hash: (0x1000000 + i++ * 7919).toString(16).padStart(40, 'a'),
        author: author.name,
        email: author.email,
        time,
        tz: -180,
        message: `${verb}: ${verb === 'fix' ? 'corrige' : 'ajusta'} ${pick(SUBJECTS)}`,
        parents: 1,
        files,
      });
    }
  }
  commits.push({
    hash: 'f'.repeat(40), author: 'Ana Lima', email: 'ana@exemplo.dev',
    time: Date.UTC(year, 5, 14, 6, 47), tz: -180, message: 'wip', parents: 1,
    files: [{ path: 'src/pages/Dashboard.tsx', added: 1420, removed: 610 }],
  });
  commits.sort((a, b) => b.time - a.time);
  return { name: 'projeto-demo', commits, loadDiffs: async () => {} };
}
