# Descoberta real de perfis pelo Chrome

O servidor mantém a fila de buscas. O worker executa no computador com um Chrome dedicado e uma sessão do Instagram iniciada pelo usuário. Ele busca perfis visíveis, abre cada perfil para conferir a existência e devolve seus dados públicos e a URL de origem. Não gera perfis fictícios, não usa cookies do Chrome principal e não envia mensagens.

1. Instale as dependências (`pnpm install`). O Google Chrome deve estar instalado.
2. Execute `pnpm discovery:login` e faça login manualmente no Instagram na janela dedicada. Feche essa janela após o login; a sessão fica no diretório local ignorado `.discovery/chrome`.
3. No painel de leads, crie uma conexão do worker e uma busca com segmento, localização e limite.
4. Salve a conexão em `.discovery/config.json`, com permissão **600**. Formato:

```json
{"apiUrl":"https://find-leads-qualify.onrender.com", "token":"TOKEN_GERADO_NO_PAINEL"}
```

5. Execute `DISCOVERY_CONFIG=.discovery/config.json pnpm discovery:worker`. Para processar uma única busca, acrescente `-- --once` ao comando ou execute o script diretamente com `--once`.

Variáveis opcionais: `DISCOVERY_API_URL`, `DISCOVERY_WORKER_TOKEN`, `DISCOVERY_CDP_URL`. A conexão CDP só aceita um Chrome no próprio computador; configure apenas uma janela dedicada. A execução comum abre automaticamente o perfil persistente dedicado.

O worker para a busca ao encontrar login, desafio ou confirmação humana. Resolva manualmente no Chrome e inicie outra busca. Nenhuma confirmação é contornada. Resultados vazios continuam vazios; falhas são reportadas no aplicativo. A descoberta depende dos resultados que o Instagram mostra à conta conectada.

Verificação: `pnpm test:discovery-worker`. Os testes verificam a exclusão de URLs externas, conteúdos, rotas especiais e duplicatas; a sessão real deve ser validada no Chrome.
