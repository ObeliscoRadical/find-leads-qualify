import {profileFromUrl} from './discovery-worker.mjs'
import {threadFromUrl} from './discovery-inbox.mjs'
export async function sendOutreach(adapter, job, { authorize = async () => false } = {}) {
  const expected = String(job.instagramUsername || '').replace(/^@/,'').toLowerCase()
  const profile = profileFromUrl(job.instagramProfileUrl)
  const content = String(job.content || '').trim()
  if (!profile || profile.username !== expected || !content || content.length > 2000) return {status:'failed', attemptedSend:false, error:'Destinatário ou mensagem inválidos.'}
  let attemptedSend = false, textFilled = false, threadUrl
  try {
    const opened = await adapter.openConversation(profile)
    threadUrl = threadFromUrl(opened.threadUrl)
    if (!threadUrl || opened.username !== expected) throw new Error('Não foi possível confirmar o destinatário da conversa.')
    if (await adapter.hasExactOutgoing(content)) return {status:'manual_review', attemptedSend:false, threadUrl, error:'Texto idêntico já aparece na conversa; envio bloqueado para evitar duplicação.'}
    if (!await authorize()) throw new Error('O aplicativo não autorizou este contato.')
    await adapter.assertConversation?.()
    textFilled = true
    await adapter.fill(content)
    if (!await authorize()) {
      await adapter.clear?.()
      textFilled = false
      throw new Error('O contato foi desativado ou bloqueado antes do envio.')
    }
    await adapter.assertConversation?.()
    // Boundary before Enter: a timeout after this point is never retryable.
    attemptedSend = true
    await adapter.send()
    if (!await adapter.confirmExactOutgoing(content)) throw new Error('Envio solicitado, mas não confirmado no histórico da conversa.')
    return {status:'sent', attemptedSend, threadUrl, content}
  } catch (error) {
    if (textFilled && !attemptedSend) { try { await adapter.clear?.() } catch {} }
    return {status:attemptedSend?'manual_review':'failed', attemptedSend, ...(threadUrl?{threadUrl}:{}), error:String(error.message).slice(0,500)}
  }
}

export function recipientLabel(username) {
  const escaped = username.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return new RegExp(`^(?:Open the profile page of|Abrir a página de perfil de) ${escaped}$`, 'i')
}

export function chromeOutreachAdapter(page, {expectedSender} = {}) {
  let composer, threadUrl, recipientUsername, inspectedContent, typedContent, sendCompleted = false
  async function verifyRecipient(username) {
    const matches = page.getByRole('link',{name:recipientLabel(username)}).filter({has:page.getByRole('heading')})
    await matches.first().waitFor({state:'visible',timeout:20000})
    const links = await matches.all()
    if (links.length !== 1) throw new Error('Cabeçalho do destinatário ausente ou ambíguo.')
    for (const link of links) if (profileFromUrl(await link.getAttribute('href'))?.username !== username) throw new Error('Destinatário não corresponde ao lead.')
  }
  async function verifySender() {
    if (!expectedSender) throw new Error('Conta remetente esperada ausente.')
    const sender = page.getByRole('link',{name:/^Foto do perfil de |^Profile picture of /i}).first()
    await sender.waitFor({state:'visible',timeout:15000})
    if (profileFromUrl(await sender.getAttribute('href'))?.username !== expectedSender) throw new Error('Conta remetente do Chrome mudou.')
  }
  return {
    async openConversation(profile) {
      await page.goto(profile.profileUrl,{waitUntil:'domcontentloaded',timeout:45000})
      if (/\/accounts\/login|\/challenge|\/checkpoint/.test(page.url())) throw new Error('Instagram exige confirmação humana.')
      const button = page.getByRole('button',{name:/^(Enviar mensagem|Mensagem|Message)$/i})
      await button.first().waitFor({state:'visible',timeout:30000})
      if (await button.count() !== 1) throw new Error('Botão de mensagem indisponível ou ambíguo.')
      await button.click()
      // Some professional accounts offer priority messaging first. Choose only
      // the ordinary contact request; this opens the editor, never sends text.
      const ordinaryRequest = page.getByRole('button',{name:/^(Enviar solicitação de contato|Enviar pedido de contacto|Send message request|Send contact request)$/i})
      try { await ordinaryRequest.waitFor({state:'visible',timeout:3000}); if(await ordinaryRequest.count()===1) await ordinaryRequest.click() } catch {}
      await verifyRecipient(profile.username)
      const hrefs = await page.locator('a[href*="/direct/t/"]').evaluateAll(nodes => [...new Set(nodes.map(node => node.getAttribute('href')))])
      const threads = [...new Set(hrefs.map(href => threadFromUrl(new URL(href,'https://www.instagram.com').toString())).filter(Boolean))]
      if (threads.length !== 1) throw new Error('Instagram não apresentou uma única conversa real.')
      threadUrl = threads[0]
      await page.goto(threadUrl,{waitUntil:'domcontentloaded',timeout:45000})
      await verifyRecipient(profile.username)
      recipientUsername = profile.username
      await verifySender()
      composer = page.locator('[contenteditable="true"][role="textbox"][data-lexical-editor="true"]')
      await composer.waitFor({state:'visible',timeout:15000})
      if (await composer.count() !== 1) throw new Error('Editor da mensagem ambíguo.')
      return {username:profile.username,threadUrl}
    },
    async hasExactOutgoing(content) {
      const exists = await page.getByText(content,{exact:true}).count() > 0
      inspectedContent = exists ? undefined : content
      return exists
    },
    async fill(content) { await composer.fill(content); typedContent = content },
    async clear() { await composer.fill(''); typedContent = undefined },
    async assertConversation() { await verifyRecipient(recipientUsername); await verifySender() },
    async send() { await composer.press('Enter'); sendCompleted = true },
    async confirmExactOutgoing(content) {
      // Causal confirmation: absent before typing, Enter completed once, editor
      // cleared, and the same text persists after reopening the verified thread.
      if (!expectedSender || !sendCompleted || inspectedContent !== content || typedContent !== content || !threadUrl) return false
      try {
        await page.getByText(content,{exact:true}).first().waitFor({state:'visible',timeout:20000})
        if ((await composer.innerText()).trim()) return false
        await page.goto(threadUrl,{waitUntil:'domcontentloaded',timeout:45000})
        await verifyRecipient(recipientUsername)
        const sender = page.getByRole('link',{name:/^Foto do perfil de |^Profile picture of /i}).first()
        await sender.waitFor({state:'visible',timeout:15000})
        if (profileFromUrl(await sender.getAttribute('href'))?.username !== expectedSender) return false
        await page.getByText(content,{exact:true}).first().waitFor({state:'visible',timeout:20000})
        if (await page.getByText(content,{exact:true}).count() !== 1) return false
        if (await page.getByText(/^(?:Falha ao enviar|Não foi possível enviar|Couldn't send|Tentar novamente|Try again)$/i).count()) return false
        await composer.waitFor({state:'visible',timeout:15000})
        // Instagram exposes the message author on its sibling action buttons.
        // Stay inside this message's group: never borrow evidence from another row.
        return await page.getByText(content,{exact:true}).evaluate((node,sender) => {
          const article = node.closest('[role="article"][aria-roledescription="message"]')
          const group = article?.closest('[role="group"]')
          if (!group || group.querySelectorAll('[role="article"]').length !== 1) return false
          const labels = Array.from(group.querySelectorAll('[aria-label]')).map(el=>el.getAttribute('aria-label'))
          return labels.includes(`Responda à mensagem de ${sender}`) || labels.includes(`Reply to ${sender}'s message`)
        },expectedSender)
      } catch { return false }
    },
  }
}
