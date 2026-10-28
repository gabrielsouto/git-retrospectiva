# Git Retrospectiva

Um "Wrapped" para repositórios git: escolha a pasta de um projeto na sua máquina, ou cole o endereço de um repositório público do GitHub, e assista a uma retrospectiva animada, em slides no estilo stories, com os números do seu ano em commits.

Tudo roda no navegador. Com uma pasta local, o app lê a pasta `.git` ali mesmo e nada é enviado para servidor algum. Com um repositório do GitHub, o histórico é baixado direto para a memória do navegador (veja [Repositórios do GitHub](#repositórios-do-github)).

A retrospectiva pode ser baixada como imagem (o cartão final) ou como vídeo vertical (9:16), pronto para stories.

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

A versão publicada fica em **https://gabrielsouto.github.io/git-retrospectiva/**, atualizada a cada push na `main` pelo workflow `pages.yml`.

Para rodar localmente:

```bash
npm install
npm run dev
```

Abra o endereço mostrado e escolha uma das opções:

- **Endereço do GitHub**: cole `dono/repositório` ou a URL do repositório e clique em **Abrir**.
- **Escolher pasta local**: selecione a pasta raiz do projeto (a que contém `.git`).

- **Chrome e Edge** usam a File System Access API e leem só a pasta `.git`.
- **Firefox e Safari** usam o seletor de pastas padrão, que enumera a pasta inteira antes de filtrar o `.git`. Em projetos com `node_modules` grande isso pode demorar.
- Para repositórios muito grandes, use **Colar saída do git log**: o app mostra o comando a rodar e aceita a saída colada ou o arquivo arrastado.
- **Ver demonstração** usa dados fictícios.

## Repositórios do GitHub

O GitHub não libera CORS nos endpoints do git, então o navegador não consegue baixar um repositório sozinho. O download passa por um proxy CORS, por padrão o público do isomorphic-git (`https://cors.isomorphic-git.org`). Ele tem limite de uso e só serve para repositórios públicos; para uso frequente ou repositórios grandes, rode o seu (por exemplo com [@isomorphic-git/cors-proxy](https://github.com/isomorphic-git/cors-proxy)) e informe o endereço em **Proxy CORS** na tela inicial.

Só o banco de dados do git é baixado (sem os arquivos de trabalho), com o histórico completo da branch padrão. Repositórios com dezenas de milhares de commits podem levar alguns minutos e usar bastante memória.

## Vídeo

O botão de download no topo da retrospectiva (ou **Baixar vídeo** no cartão final) grava a apresentação inteira, do primeiro ao último slide, num vídeo vertical 1080×1920:

- O navegador pede permissão para capturar a aba. Escolha a aba do Git Retrospectiva e mantenha-a visível até o fim (cerca de 2 minutos).
- Durante a gravação os slides ocupam a altura toda da janela. Quanto maior a janela, mais nítido fica o vídeo.
- Cada quadro capturado é recortado e desenhado num canvas de tamanho fixo, codificado com WebCodecs (H.264 por software) e empacotado em MP4 pelo próprio app, com [Mediabunny](https://mediabunny.dev/). Sem WebCodecs, o app usa o `MediaRecorder` sobre esse canvas e o arquivo sai em WebM.

## Como funciona

- [isomorphic-git](https://isomorphic-git.org/) lê commits, árvores e blobs (objetos soltos e packfiles) a partir de um sistema de arquivos somente leitura montado sobre a pasta escolhida, dentro de um Web Worker.
- As linhas adicionadas e removidas são calculadas comparando as árvores de cada commit com a do primeiro pai e contando as linhas que entram e saem de cada arquivo. Linhas que só mudaram de lugar não contam, então o total pode ficar um pouco abaixo do `git diff --numstat` (cerca de 1% a 5% nos repositórios testados). Arquivos binários e maiores que 1 MB entram como alterados, sem contagem de linhas.
- Lockfiles, `node_modules`, `dist`, `vendor` e arquivos minificados ficam fora das contagens de linhas, arquivos e linguagens.
- Commits de merge são contados à parte e não entram nas demais estatísticas.
- Horários e datas usam o fuso do autor registrado em cada commit.
- Repositórios remotos são clonados com `git.clone` do isomorphic-git para um sistema de arquivos em memória, e daí em diante seguem o mesmo caminho das pastas locais.
- O vídeo é capturado com `getDisplayMedia`, recortado com Region Capture (`CropTarget`) quando disponível (ou pelas coordenadas do quadro, nos outros navegadores) e codificado com WebCodecs.
- Animações com [Motion](https://motion.dev/), confete com canvas-confetti, cartão exportado com html-to-image. O app respeita `prefers-reduced-motion`.

Limitações: repositórios privados do GitHub não são suportados; clones rasos (`--depth`) e worktrees em que `.git` é um arquivo não são suportados. Só o histórico alcançável a partir de `HEAD` é lido.

## Desenvolvimento

```bash
npm test         # testes unitários, incluindo comparação com o git numstat em um repositório gerado
npm run build    # build estático em dist/
```

Para medir desempenho e precisão em um repositório real:

```bash
REPO=/caminho/do/repo N=1000 npx vitest run tests/benchmark.test.ts
```

Para testar o clone de um repositório do GitHub (precisa de rede):

```bash
NETWORK=1 npx vitest run tests/clone.test.ts
```

## Inspirações

Git Rewind, Git Wrapped (Python e Node.js), Git History UI, Gource, Wrapped.dev, coderecap, @snaylaker/git-wrapped, GitHub Unwrapped e Unwrapped by Middleware.
