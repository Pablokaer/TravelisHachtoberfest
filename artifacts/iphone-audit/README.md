# Revisão visual de iPhone

Abra `index.html` para a galeria e a tabela de posições. As capturas finais usam 390 × 844 CSS px (DPR 3), em Chromium com emulação móvel de iPhone 13.

`after.json` e `auth-after.json` registram x, y, largura, altura, alinhamento de texto e distância do centro horizontal para elementos principais. Nenhuma das 16 rotas medidas apresentou overflow horizontal no documento.

Validação: lint, TypeScript e 46 testes de autenticação, landing, city hub e design system passaram. Mais 23 testes de atrações, onboarding e design system passaram após os últimos ajustes.

Limites: emulação web, sem execução nativa iOS; compartilhamento e recuperação sem token válido; checklist capturado no estado disponível das funções locais. Os primeiros prints públicos usaram a área útil padrão do perfil do navegador; os finais usam a viewport explícita.

## Segunda rodada (D-076)

Títulos de seção (`Section`), cards de walk list e a área de reviews ficavam alinhados à esquerda em telefone. Pares antes/depois da página da cidade em `hub-*-before.png` / `hub-*-after.png`; `sections-centring.json` lista os 43 títulos que estavam fora do centro (mais de 8 px) e onde ficaram depois, em 11 telas autenticadas. Restam 2, de propósito: o cabeçalho do Perfil (avatar ao lado do nome).
