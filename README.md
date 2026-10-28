# Git Retrospectiva

Um "Wrapped" para repositórios git: escolha a pasta de um projeto na sua máquina e assista a uma retrospectiva animada, em slides no estilo stories, com os números do seu ano em commits.

Tudo roda no navegador. O app lê a pasta `.git` localmente e nenhum código, commit ou estatística é enviado para servidor algum.

## O que aparece na retrospectiva

1. Abertura com o nome do repositório e o período
2. Total de commits, com confete
3. Linhas adicionadas e removidas
4. Calendário de atividade, dia a dia
5. Mês de pico
6. Relógio de 24 h com o horário favorito e a sua "personalidade" (coruja noturna, madrugador, relógio suíço…)
7. Dia da semana mais produtivo e quanto foi feito no fim de semana
8. Maior sequência de dias seguidos com commit
9. Ranking de linguagens
10. Os "hits do ano": arquivos mais alterados
11. Pódio de contribuidores
12. Nuvem de palavras das mensagens de commit
13. Momentos memoráveis: o maior commit, o mais tarde da noite, a mensagem mais curta
14. A árvore de arquivos crescendo ao longo do tempo (inspirada no Gource)
15. Cartão-resumo, que pode ser baixado como PNG

Dá para filtrar por ano, últimos 12 meses ou todo o histórico, e por autor.

## Como usar

```bash
npm install
npm run dev
```

Abra o endereço mostrado e clique em **Escolher pasta do repositório**, selecionando a pasta raiz do projeto (a que contém `.git`).

- **Chrome e Edge** usam a File System Access API e leem só a pasta `.git`.
- **Firefox e Safari** usam o seletor de pastas padrão, que enumera a pasta inteira antes de filtrar o `.git`. Em projetos com `node_modules` grande isso pode demorar.
- Para repositórios muito grandes, use **Colar saída do git log**: o app mostra o comando a rodar e aceita a saída colada ou o arquivo arrastado.
- **Ver demonstração** usa dados fictícios.

## Como funciona

- [isomorphic-git](https://isomorphic-git.org/) lê commits, árvores e blobs (objetos soltos e packfiles) a partir de um sistema de arquivos somente leitura montado sobre a pasta escolhida, dentro de um Web Worker.
- As linhas adicionadas e removidas são calculadas comparando as árvores de cada commit com a do primeiro pai e contando as linhas que entram e saem de cada arquivo. Linhas que só mudaram de lugar não contam, então o total pode ficar um pouco abaixo do `git diff --numstat` (cerca de 1% a 5% nos repositórios testados). Arquivos binários e maiores que 1 MB entram como alterados, sem contagem de linhas.
- Lockfiles, `node_modules`, `dist`, `vendor` e arquivos minificados ficam fora das contagens de linhas, arquivos e linguagens.
- Commits de merge são contados à parte e não entram nas demais estatísticas.
- Horários e datas usam o fuso do autor registrado em cada commit.
- Animações com [Motion](https://motion.dev/), confete com canvas-confetti, cartão exportado com html-to-image. O app respeita `prefers-reduced-motion`.

Limitações: clones rasos (`--depth`) e worktrees em que `.git` é um arquivo não são suportados. Só o histórico alcançável a partir de `HEAD` é lido.

## Desenvolvimento

```bash
npm test         # testes unitários, incluindo comparação com o git numstat em um repositório gerado
npm run build    # build estático em dist/
```

Para medir desempenho e precisão em um repositório real:

```bash
REPO=/caminho/do/repo N=1000 npx vitest run tests/benchmark.test.ts
```

## Inspirações

Git Rewind, Git Wrapped (Python e Node.js), Git History UI, Gource, Wrapped.dev, coderecap, @snaylaker/git-wrapped, GitHub Unwrapped e Unwrapped by Middleware.
