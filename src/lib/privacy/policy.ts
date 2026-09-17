type OrganizationPolicyInput = {
  name: string
  nif?: string | null
  cae?: string | null
  nicho?: string | null
  description?: string | null
  timezone?: string | null
}

function line(label: string, value?: string | null) {
  const normalized = value?.trim()
  return normalized ? `- ${label}: ${normalized}` : null
}

function section(title: string, body: string[]) {
  return [`## ${title}`, ...body].join('\n')
}

export function generatePrivacyPolicyPt(organization: OrganizationPolicyInput) {
  const identityLines = [
    line('Responsável pelo tratamento', organization.name),
    line('NIF', organization.nif),
    line('CAE', organization.cae),
    line('Área de atividade', organization.nicho),
    line('Descrição da atividade', organization.description),
    line('Fuso horário operacional', organization.timezone),
  ].filter((item): item is string => Boolean(item))

  return [
    `# Política de Privacidade — ${organization.name}`,
    '',
    section('1. Identificação do responsável', [
      'Esta política descreve como a organização abaixo trata dados pessoais no contexto da captação, gestão e acompanhamento de leads.',
      '',
      ...identityLines,
    ]),
    '',
    section('2. Dados pessoais tratados', [
      'A organização pode tratar apenas os dados que sejam fornecidos, recolhidos através de integrações configuradas ou registados durante interações comerciais.',
      'Os dados podem incluir nome ou identificador público, contactos profissionais, website, perfil de rede social, mensagens trocadas, estado no funil comercial e notas necessárias ao acompanhamento do pedido ou oportunidade.',
    ]),
    '',
    section('3. Finalidades do tratamento', [
      'Os dados são tratados para gerir contactos comerciais, responder a pedidos, qualificar oportunidades, organizar o pipeline comercial, manter histórico de interações e cumprir obrigações legais aplicáveis.',
      'Quando existirem integrações externas configuradas, os dados são usados apenas para executar as ações autorizadas pela organização no âmbito da captação e comunicação com leads.',
    ]),
    '',
    section('4. Fundamentos de licitude', [
      'O tratamento pode basear-se no interesse legítimo de desenvolvimento comercial, na execução de diligências pré-contratuais, no consentimento quando exigido e no cumprimento de obrigações legais.',
      'A organização deve avaliar o fundamento adequado para cada campanha, canal e tipo de contacto antes de iniciar comunicações.',
    ]),
    '',
    section('5. Conservação', [
      'Os dados são conservados apenas durante o período necessário para as finalidades descritas, para cumprimento de obrigações legais ou para defesa de direitos em processo administrativo, judicial ou extrajudicial.',
      'Leads marcados como sem contacto, opt-out ou equivalente devem deixar de ser usados para novas comunicações comerciais, salvo obrigação legal ou pedido do próprio titular.',
    ]),
    '',
    section('6. Partilha e subcontratantes', [
      'Os dados podem ser tratados por fornecedores técnicos estritamente necessários à operação da plataforma, alojamento, base de dados, autenticação, integrações autorizadas, envio de mensagens e segurança.',
      'A organização deve garantir que estes fornecedores oferecem garantias adequadas de proteção de dados e que apenas tratam os dados segundo instruções documentadas.',
    ]),
    '',
    section('7. Transferências internacionais', [
      'Quando ferramentas ou fornecedores impliquem tratamento fora do Espaço Económico Europeu, a organização deve assegurar que existem mecanismos de transferência válidos, como decisões de adequação, cláusulas contratuais-tipo ou outro mecanismo previsto no RGPD.',
    ]),
    '',
    section('8. Direitos dos titulares', [
      'Os titulares podem solicitar acesso, retificação, apagamento, limitação, oposição, portabilidade e retirada de consentimento quando aplicável.',
      'Os pedidos devem ser analisados pela organização responsável pelo tratamento, que deve responder nos prazos previstos pelo RGPD.',
    ]),
    '',
    section('9. Segurança', [
      'A organização aplica medidas técnicas e organizativas adequadas ao risco, incluindo controlo de acesso por organização, autenticação, limitação de permissões, registo de operações relevantes e segregação de dados por tenant.',
    ]),
    '',
    section('10. Reclamações', [
      'O titular dos dados pode apresentar reclamação junto da autoridade de controlo competente se considerar que o tratamento viola a legislação de proteção de dados.',
      'Em Portugal, a autoridade de controlo é a Comissão Nacional de Proteção de Dados.',
    ]),
  ].join('\n')
}
