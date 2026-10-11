# Usar a prospecção Instagram

## Busca automática
Em Leads, configure segmentos específicos e região, escolha o intervalo e clique Ativar busca automática. Pausar impede novas buscas; uma busca em curso pode terminar. O serviço local inicia ao entrar neste Mac e usa o Chrome dedicado autenticado como @obeliscoradical. A página pode ficar fechada; o Mac precisa estar ligado, com sessão aberta e internet.

Estado do serviço: `node scripts/discovery-service.mjs status`. Logs locais: `.discovery/service.log` e `.discovery/service-error.log`. A credencial tem validade de sete dias e é renovada automaticamente pelo conector ativo, mantendo o mesmo acesso. Se ficar desligado até a ligação expirar, use Conectar Chrome, substitua a configuração privada e reinicie o serviço com `node scripts/discovery-service.mjs install`. Nunca publique o token.

## Avaliar perfis
Resultados reais não são automaticamente clientes qualificados. Reveja a biografia, região e se a empresa compra serviços elétricos. A pontuação ICP é heurística. Região por confirmar e prestadores exigem revisão; restrições e pedidos de não contacto são respeitados. Revalidar resultados atualiza a avaliação sem apagar registros.

## Primeiro contacto
Abra Primeiro contacto no lead, reveja o perfil e personalize o texto. Abra o perfil no Google Chrome com @obeliscoradical, clique Enviar mensagem, cole o texto e envie. Depois marque Já enviei este texto no Instagram e Registar envio manual. Copiar ou abrir perfil não marca envio.

## Respostas
Acompanhe o Direct do Instagram. Cole uma resposta recebida no campo Resposta recebida e Registar resposta real; o estado passa a Respondeu. A API de respostas está preparada para um conector com identificação comprovada do remetente e ID da mensagem; a leitura automática do Chrome e o bot ainda não foram validados. Não há envio automático de DM nesta versão.

## Teste real em 2026-10-11
Conector confirmou @obeliscoradical. Uma busca pendente encontrou dez novos perfis, total passou de 11 para 21. Exemplo verificado no Chrome: @gestao_mais_condominios, Administração de condomínios em Lisboa e Loures, com botão Enviar mensagem disponível. Conversa aberta sem mensagem enviada.
