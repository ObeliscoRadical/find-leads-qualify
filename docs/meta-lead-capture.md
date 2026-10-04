# Captação de formulários Meta

A integração recebe eventos `page/leadgen`, valida `X-Hub-Signature-256` com o App Secret e consulta o lead com o token criptografado da Página. Salva nome, telefone, email, respostas e score ICP na organização proprietária da conexão. O índice `(organization_id, source_type, source_external_id)` impede duplicatas mesmo com eventos concorrentes; erros retornam 503 para permitir reenvio pela Meta.

## Instalação

1. Aplicar a migração aditiva: `DATABASE_URL=... node scripts/migrate-meta-capture.mjs`. Use a variável do ambiente, preservando a credencial fora dos logs.
2. Gerar `META_WEBHOOK_VERIFY_TOKEN` aleatório com pelo menos 32 caracteres. Não trocar JWT_SECRET/ENCRYPTION_KEY.
3. No app Meta, adicionar o caso de uso de captura de leads. Preparar `leads_retrieval`, `pages_manage_metadata` e `pages_manage_ads`.
4. Configurar webhook de Page em `/api/webhooks/meta`, usando o token de verificação e o campo `leadgen`. Só habilitar `META_CAPTURE_ENABLED=true` depois de o callback e o campo estarem configurados.
5. Em `/settings/meta`, autorizar os formulários para a Página escolhida. Ativar captação: o app inscreve a Página em `leadgen` e importa um lote de até 100 leads por formulário, até 50 formulários. A resposta informa se há mais registros históricos fora desse lote. Novos eventos são recebidos automaticamente.
6. Confirmar o recebimento com a ferramenta oficial de testes de Lead Ads e verificar a lista de leads. Sem teste real não declarar captação ponta a ponta validada.

O acesso da pessoa aos leads da Página deve estar habilitado no Leads Access Manager quando o portfólio personaliza essas funções. Apps em desenvolvimento têm restrições da Meta: dados de terceiros/publicação podem exigir revisão e acesso avançado. O fluxo não cria campanhas nem envia mensagens aos contatos.
