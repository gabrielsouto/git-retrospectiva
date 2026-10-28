import { AnimatePresence, motion } from 'motion/react';
import { useMemo, useRef, useState } from 'react';
import { demoRepo } from './git/demo';
import {
  DEFAULT_CORS_PROXY,
  filesFromInput,
  normalizeRepoUrl,
  GIT_LOG_COMMAND,
  openRepo,
  parseGitLog,
  pickDirectory,
  supportsDirectoryPicker,
  type Progress,
} from './git/loadRepo';
import type { Repo } from './git/types';
import { StoryPlayer } from './components/StoryPlayer';
import { fmt } from './components/format';
import { authorsOf, availableYears, computeStats, selectCommits, type Filters, type Period, type Stats } from './stats/compute';
import { buildSlides } from './slides/slides';

type Screen =
  | { kind: 'home'; error?: string }
  | { kind: 'paste' }
  | { kind: 'loading'; progress: Progress }
  | { kind: 'setup'; repo: Repo }
  | { kind: 'story'; stats: Stats; repo: Repo };

export function App() {
  const [screen, setScreen] = useState<Screen>({ kind: 'home' });
  const fileInput = useRef<HTMLInputElement>(null);

  const load = async (fn: () => Promise<Repo>) => {
    setScreen({ kind: 'loading', progress: { label: 'Abrindo o repositório', done: 0, total: 0 } });
    try {
      const repo = await fn();
      if (!repo.commits.length) throw new Error('Esse repositório ainda não tem commits.');
      setScreen({ kind: 'setup', repo });
    } catch (e) {
      if (e instanceof DOMException && e.name === 'AbortError') return setScreen({ kind: 'home' });
      setScreen({ kind: 'home', error: e instanceof Error ? e.message : String(e) });
    }
  };

  const onPick = () => {
    if (!supportsDirectoryPicker) return fileInput.current?.click();
    pickDirectory().then(
      (handle) =>
        load(() =>
          openRepo({ kind: 'handle', handle }, (progress) => setScreen({ kind: 'loading', progress })),
        ),
      (e) => {
        if (!(e instanceof DOMException && e.name === 'AbortError')) setScreen({ kind: 'home', error: String(e) });
      },
    );
  };

  const onUrl = (input: string, corsProxy: string) => {
    const url = normalizeRepoUrl(input);
    if (!url) return setScreen({ kind: 'home', error: 'Não reconheci esse endereço. Use algo como dono/repositório ou https://github.com/dono/repositório.' });
    load(() => openRepo({ kind: 'url', url, corsProxy }, (progress) => setScreen({ kind: 'loading', progress })));
  };

  const onFiles = (list: FileList | null) => {
    if (!list?.length) return;
    const files = filesFromInput(list);
    load(() => openRepo({ kind: 'files', files }, (progress) => setScreen({ kind: 'loading', progress })));
  };

  const start = async (repo: Repo, filters: Filters, authorName?: string) => {
    const selected = selectCommits(repo.commits, filters).filter((c) => c.parents <= 1);
    setScreen({ kind: 'loading', progress: { label: 'Analisando as mudanças', done: 0, total: selected.length } });
    try {
      await repo.loadDiffs(selected, (done, total) =>
        setScreen({ kind: 'loading', progress: { label: 'Analisando as mudanças', done, total } }),
      );
      setScreen({ kind: 'story', repo, stats: computeStats(repo.name, repo.commits, filters, authorName) });
    } catch (e) {
      setScreen({ kind: 'home', error: e instanceof Error ? e.message : String(e) });
    }
  };

  return (
    <>
      <input
        ref={fileInput}
        type="file"
        hidden
        // @ts-expect-error non-standard but widely supported
        webkitdirectory=""
        multiple
        onChange={(e) => onFiles(e.target.files)}
      />
      <AnimatePresence mode="wait">
        {screen.kind === 'home' && (
          <Home key="home" error={screen.error} onPick={onPick} onUrl={onUrl} onPaste={() => setScreen({ kind: 'paste' })} onDemo={() => load(async () => demoRepo())} />
        )}
        {screen.kind === 'paste' && (
          <Paste
            key="paste"
            onBack={() => setScreen({ kind: 'home' })}
            onSubmit={(text, name) => load(async () => parseGitLog(text, name))}
          />
        )}
        {screen.kind === 'loading' && <Loading key="loading" progress={screen.progress} />}
        {screen.kind === 'setup' && <Setup key="setup" repo={screen.repo} onStart={start} onBack={() => setScreen({ kind: 'home' })} />}
      </AnimatePresence>
      {screen.kind === 'story' && (
        <StoryPlayer
          slides={buildSlides(screen.stats)}
          videoName={`retrospectiva-${screen.stats.repoName}-${screen.stats.periodLabel.replace(/\s+/g, '-')}`}
          onExit={() => setScreen({ kind: 'setup', repo: screen.repo })} />
      )}
    </>
  );
}

const page = {
  initial: { opacity: 0, y: 16 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: -16 },
  transition: { duration: 0.35 },
};

const PROXY_KEY = 'git-retrospectiva:cors-proxy';

function readProxy() {
  try {
    return localStorage.getItem(PROXY_KEY) ?? DEFAULT_CORS_PROXY;
  } catch {
    return DEFAULT_CORS_PROXY;
  }
}

function Home({
  error,
  onPick,
  onUrl,
  onPaste,
  onDemo,
}: {
  error?: string;
  onPick: () => void;
  onUrl: (url: string, corsProxy: string) => void;
  onPaste: () => void;
  onDemo: () => void;
}) {
  const [url, setUrl] = useState('');
  const [proxy, setProxy] = useState(readProxy);
  const submitUrl = (e: React.FormEvent) => {
    e.preventDefault();
    try {
      localStorage.setItem(PROXY_KEY, proxy);
    } catch {
      // Remembering the proxy is a convenience only.
    }
    onUrl(url, proxy.trim());
  };
  return (
    <motion.main className="home" {...page}>
      <div className="home-glow" aria-hidden />
      <motion.p className="kicker" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.1 }}>
        O seu ano em commits
      </motion.p>
      <h1 className="title">
        {'Git Retrospectiva'.split('').map((ch, i) => (
          <motion.span
            key={i}
            initial={{ opacity: 0, y: 40, rotate: 8 }}
            animate={{ opacity: 1, y: 0, rotate: 0 }}
            transition={{ delay: 0.15 + i * 0.03, type: 'spring', stiffness: 200, damping: 16 }}
          >
            {ch === ' ' ? ' ' : ch}
          </motion.span>
        ))}
      </h1>
      <p className="lead">
        Escolha a pasta de um repositório na sua máquina, ou cole o endereço de um repositório público do GitHub, e assista a
        uma retrospectiva animada no estilo Wrapped. Tudo é processado no seu navegador.
      </p>
      <form className="url-form" onSubmit={submitUrl}>
        <input
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="github.com/dono/repositório"
          aria-label="Endereço do repositório no GitHub"
          spellCheck={false}
          autoCapitalize="off"
        />
        <button className="btn primary" disabled={!url.trim()}>
          Abrir
        </button>
      </form>
      <details className="proxy">
        <summary>Proxy CORS</summary>
        <p>
          O GitHub não permite que o navegador baixe repositórios direto, então o download passa por um proxy. O padrão é o
          proxy público do isomorphic-git; você pode usar o seu.
        </p>
        <input value={proxy} onChange={(e) => setProxy(e.target.value)} aria-label="Endereço do proxy CORS" spellCheck={false} />
      </details>
      <div className="actions">
        <button className="btn" onClick={onPick}>
          Escolher pasta local
        </button>
        <button className="btn" onClick={onPaste}>
          Colar saída do git log
        </button>
        <button className="btn ghost" onClick={onDemo}>
          Ver demonstração
        </button>
      </div>
      {error && (
        <motion.p className="error" role="alert" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
          {error}
        </motion.p>
      )}
      <p className="fine">
        {supportsDirectoryPicker
          ? 'Na pasta local, selecione a raiz do projeto (a que contém a pasta .git).'
          : 'Na pasta local, o navegador vai pedir para "enviar" a pasta, mas os arquivos são lidos só aqui.'}
      </p>
    </motion.main>
  );
}

function Paste({ onBack, onSubmit }: { onBack: () => void; onSubmit: (text: string, name: string) => void }) {
  const [text, setText] = useState('');
  const [name, setName] = useState('');
  const [copied, setCopied] = useState(false);
  return (
    <motion.main className="panel" {...page}>
      <h2>Colar o histórico</h2>
      <p>Rode este comando na pasta do repositório e cole a saída abaixo. Útil para repositórios muito grandes.</p>
      <div className="code">
        <code>{GIT_LOG_COMMAND} &gt; historico.txt</code>
        <button
          className="btn small"
          onClick={() => navigator.clipboard.writeText(`${GIT_LOG_COMMAND} > historico.txt`).then(() => setCopied(true))}
        >
          {copied ? 'Copiado' : 'Copiar'}
        </button>
      </div>
      <label className="field">
        <span>Nome do repositório</span>
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="meu-projeto" />
      </label>
      <label className="field">
        <span>Saída do comando (ou arraste o arquivo historico.txt aqui)</span>
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault();
            e.dataTransfer.files[0]?.text().then(setText);
          }}
          rows={10}
          spellCheck={false}
          placeholder="@@@a1b2c3...|...|Ana|ana@exemplo.dev|2026-03-01T10:00:00-03:00|feat: primeira versão"
        />
      </label>
      <div className="actions">
        <button className="btn ghost" onClick={onBack}>
          Voltar
        </button>
        <button className="btn primary" disabled={!text.trim()} onClick={() => onSubmit(text, name.trim() || 'repositório')}>
          Analisar
        </button>
      </div>
    </motion.main>
  );
}

function Loading({ progress }: { progress: Progress }) {
  const ratio = progress.total ? progress.done / progress.total : null;
  return (
    <motion.main className="loading" {...page}>
      <div className="spinner" aria-hidden>
        {[0, 1, 2].map((i) => (
          <motion.span
            key={i}
            animate={{ scale: [1, 1.6, 1], opacity: [0.4, 1, 0.4] }}
            transition={{ repeat: Infinity, duration: 1, delay: i * 0.15 }}
          />
        ))}
      </div>
      <p>{progress.label}…</p>
      {ratio !== null ? (
        <div className="progress" role="progressbar" aria-valuenow={Math.round(ratio * 100)} aria-valuemin={0} aria-valuemax={100}>
          <div style={{ width: `${ratio * 100}%` }} />
        </div>
      ) : (
        progress.done > 0 && <small>{fmt(progress.done)}</small>
      )}
    </motion.main>
  );
}

function Setup({ repo, onStart, onBack }: { repo: Repo; onStart: (repo: Repo, f: Filters, authorName?: string) => void; onBack: () => void }) {
  const years = useMemo(() => availableYears(repo.commits), [repo]);
  const authors = useMemo(() => authorsOf(repo.commits), [repo]);
  const [periodKey, setPeriodKey] = useState(() => String(years[0] ?? 'all'));
  const [email, setEmail] = useState('');

  const period: Period =
    periodKey === 'all' ? { kind: 'all' } : periodKey === 'last12' ? { kind: 'last12' } : { kind: 'year', year: Number(periodKey) };
  const count = selectCommits(repo.commits, { period, email: email || null }).length;

  return (
    <motion.main className="panel" {...page}>
      <p className="kicker">Repositório carregado</p>
      <h2>{repo.name}</h2>
      <p>
        {fmt(repo.commits.length)} commits de {fmt(authors.length)} {authors.length === 1 ? 'pessoa' : 'pessoas'}.
      </p>
      <label className="field">
        <span>Período</span>
        <select value={periodKey} onChange={(e) => setPeriodKey(e.target.value)}>
          {years.map((y) => (
            <option key={y} value={y}>
              {y}
            </option>
          ))}
          <option value="last12">Últimos 12 meses</option>
          <option value="all">Todo o histórico</option>
        </select>
      </label>
      <label className="field">
        <span>De quem é a retrospectiva?</span>
        <select value={email} onChange={(e) => setEmail(e.target.value)}>
          <option value="">Todo o time</option>
          {authors.map((a) => (
            <option key={a.email} value={a.email}>
              {a.name} ({fmt(a.commits)})
            </option>
          ))}
        </select>
      </label>
      <p className="fine">{count ? `${fmt(count)} commits nesse recorte.` : 'Nenhum commit nesse recorte.'}</p>
      <div className="actions">
        <button className="btn ghost" onClick={onBack}>
          Trocar repositório
        </button>
        <button
          className="btn primary"
          disabled={!count}
          onClick={() => onStart(repo, { period, email: email || null }, authors.find((a) => a.email === email)?.name)}
        >
          Começar a retrospectiva
        </button>
      </div>
    </motion.main>
  );
}
