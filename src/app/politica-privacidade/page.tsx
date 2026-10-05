import type { Metadata } from 'next'

export const metadata: Metadata = { title: 'Política de privacidade — Find Leads Qualify' }

export default function PublicPrivacyPage() {
  return (
    <main className="app-shell">
      <article className="dashboard privacy-document">
        <h1>{"Política de privacidade — Find Leads Qualify"}</h1>
        <p>{"Atualizada em 5 de outubro de 2026."}</p>
        <h2>{"Finalidade e responsabilidade"}</h2>
        <p>{"O Find Leads Qualify organiza contatos comerciais para as empresas que utilizam a plataforma. A empresa responsável pelo formulário ou atendimento decide a finalidade e o uso dos dados de seus contatos."}</p>
        <h2>{"Dados recebidos"}</h2>
        <p>{"Quando uma empresa autoriza a integração Meta, o app pode importar nome, email, telefone e respostas enviados por pessoas aos formulários de anúncios da Página selecionada. Também recebe os identificadores do formulário, do contato e da Página, necessários para associar os dados à empresa e evitar duplicações."}</p>
        <h2>{"Uso dos dados"}</h2>
        <p>{"Os dados são usados para registrar os contatos, calcular a compatibilidade com o perfil de cliente da empresa e acompanhar o atendimento no painel. A captação de formulários não envia mensagens nem cria anúncios."}</p>
        <h2>{"Acesso e fornecedores"}</h2>
        <p>{"Os contatos ficam associados à organização que conectou a Página. O acesso ao painel exige autenticação. Tokens de acesso da Meta são armazenados criptografados. A aplicação utiliza Render para hospedagem e PostgreSQL/Neon para armazenamento; a Meta fornece os dados autorizados pela empresa."}</p>
        <h2>{"Conservação, exclusão e direitos"}</h2>
        <p>{"Os dados permanecem armazenados enquanto o contato estiver cadastrado na plataforma. A empresa pode excluir o contato na gestão de leads ou marcar que ele não deve ser contactado. A revogação da conexão interrompe novas importações; os contatos já importados continuam sujeitos à gestão e exclusão pela empresa."}</p>
        <p>{"Para solicitar acesso, correção ou exclusão dos seus dados, contacte a empresa responsável pelo formulário pelo canal que ela disponibilizou. O administrador pode remover o contato e seu histórico na plataforma. O usuário da integração pode revogar o acesso nas integrações comerciais do Facebook e desligar a Página nas configurações do app."}</p>
      </article>
    </main>
  )
}
