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
    await adapter.fill(content)
    textFilled = true
    if (!await authorize()) {
      await adapter.clear?.()
      textFilled = false
      throw new Error('O contato foi desativado ou bloqueado antes do envio.')
    }
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

export function chromeOutreachAdapter(page) {
  let composer, threadUrl
  return {
    async openConversation(profile) {
      await page.goto(profile.profileUrl,{waitUntil:'domcontentloaded',timeout:45000})
      if (/\/accounts\/login|\/challenge|\/checkpoint/.test(page.url())) throw new Error('Instagram exige confirmação humana.')
      const button = page.getByRole('button',{name:/^(Enviar mensagem|Mensagem|Message)$/i})
      if (await button.count() !== 1) throw new Error('Botão de mensagem indisponível ou ambíguo.')
      await button.click()
      const recipient = page.getByRole('link',{name:`Open the profile page of ${profile.username}`,exact:true})
      await recipient.waitFor({state:'visible',timeout:15000})
      const actual = profileFromUrl(await recipient.getAttribute('href'))
      if (actual?.username !== profile.username) throw new Error('Destinatário não corresponde ao lead.')
      const messages = page.getByRole('link',{name:/^(Mensagens|Messages)$/i})
      if (await messages.count() !== 1) throw new Error('Não foi possível identificar o link real da conversa.')
      const href = await messages.getAttribute('href')
      threadUrl = threadFromUrl(new URL(href,'https://www.instagram.com').toString())
      if (!threadUrl) throw new Error('Instagram não apresentou o endereço real da conversa.')
      await page.goto(threadUrl,{waitUntil:'domcontentloaded',timeout:45000})
      const confirmed = page.getByRole('link',{name:`Open the profile page of ${profile.username}`,exact:true})
      await confirmed.waitFor({state:'visible',timeout:15000})
      if (profileFromUrl(await confirmed.getAttribute('href'))?.username !== profile.username) throw new Error('Destinatário mudou ao abrir conversa.')
      composer = page.locator('[contenteditable="true"][role="textbox"][data-lexical-editor="true"]')
      await composer.waitFor({state:'visible',timeout:15000})
      if (await composer.count() !== 1) throw new Error('Editor da mensagem ambíguo.')
      return {username:profile.username,threadUrl}
    },
    async hasExactOutgoing(content) { return await page.getByText(content,{exact:true}).count() > 0 },
    async fill(content) { await composer.fill(content) },
    async clear() { await composer.fill('') },
    async send() { await composer.press('Enter') },
    async confirmExactOutgoing(content) {
      // Observe the rendered result, but do not call it sent without verified
      // outgoing sender metadata. Parent can review actual DOM after first send.
      try {
        await page.getByText(content,{exact:true}).first().waitFor({state:'visible',timeout:15000})
        if ((await composer.innerText()).trim()) return false
      } catch { return false }
      return false
    },
  }
}
