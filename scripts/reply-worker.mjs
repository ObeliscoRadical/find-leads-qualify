import fs from 'node:fs/promises'
import path from 'node:path'
import {randomUUID} from 'node:crypto'
import {chromeOutreachAdapter,sendOutreach,recipientLabel} from './outreach-worker.mjs'
import {readConversationRows,verifiedReplySequence,verifiedInboundMessages,readStoredReplySequence} from './discovery-inbox.mjs'

async function readState(filename) {
  try {
    const stat=await fs.lstat(filename)
    if (!stat.isFile() || stat.isSymbolicLink() || stat.mode & 0o077) throw Error('Estado de resposta deve ser privado.')
    return JSON.parse(await fs.readFile(filename,'utf8'))
  } catch(error) {if(error.code==='ENOENT')return {};throw error}
}
async function savePrivate(filename,value) {
  const dir=path.dirname(filename)
  await fs.mkdir(dir,{recursive:true,mode:0o700})
  const stat=await fs.lstat(dir)
  if (!stat.isDirectory() || stat.isSymbolicLink()) throw Error('Pasta de respostas insegura.')
  await fs.chmod(dir,0o700)
  const temporary=`${filename}.${randomUUID()}.tmp`
  try {await fs.writeFile(temporary,value,{mode:0o600,flag:'wx'});await fs.rename(temporary,filename)}
  finally {await fs.rm(temporary,{force:true})}
}
export function replyConversationSignature(rows,username,inboundContent,{externalId,anchor,threadUrl,previous,expectedSender='obeliscoradical',now=Date.now()}={}) {
  if (!rows.length || rows.some(row=>!['obeliscoradical',username].includes(row.author) || typeof row.content!=='string' || !row.content.trim())) throw Error('Autoria da conversa de resposta não verificada.')
  const last=rows.at(-1)
  if (last.author!==username || last.content.trim()!==inboundContent.trim()) throw Error('Último retorno do cliente mudou; resposta pausada para revisão.')
  if (rows.some(row=>row.author===username && /nao (?:me |nos )?(?:contact|contat|envi|mand)|remov[ae]|retir[ae].*(?:lista|contact)|pare de|stop|unsubscribe|sem interesse|nao (?:estou|estamos|tenho|temos) interessad/.test(row.content.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase()))) throw Error('Pedido de não contacto observado no Direct.')
  const candidates = externalId?.startsWith('ig-sequence-v1:')
    ? verifiedReplySequence(rows,rows,{username,threadUrl,expectedSender,anchor,previous,now,forSending:true}).messages
    : verifiedInboundMessages(rows,{username,threadUrl,expectedSender})
  const latest=candidates.at(-1)
  if (!externalId || !latest || latest.externalId!==externalId || latest.content!==last.content.trim() || (!externalId.startsWith('ig-sequence-v1:') && Date.parse(last.datetime)!==Date.parse(latest.receivedAt))) throw Error('Identidade do retorno atual difere da resposta preparada.')
  return JSON.stringify(rows.map(row=>[row.author,row.content.trim()]))
}
export async function processPreparedReply(page,leadId,{request,expectedSender,enabled=false,statePath='.discovery/reply-state.json',evidenceDir='.discovery/evidence',adapterFactory=chromeOutreachAdapter,readRows=readConversationRows,now=()=>Date.now(),report=console.log}={}) {
  if (!enabled || expectedSender!=='obeliscoradical') return {status:'disabled'}
  const filename=path.resolve(statePath)
  let state=await readState(filename)
  if (now()-Math.max(Date.parse(state.lastReplySentAt)||0,Date.parse(state.lastReplyAttemptAt)||0)<90000) return {status:'interval_wait'}
  const {job}=await request('POST',{action:'claim',leadId})
  if (!job) return {status:'no_job'}
  const completion={action:'complete',jobId:job.id,claimToken:job.claimToken}
  let result
  try {
    if (!job.inboundContent || !job.profile?.username || job.profile.username===expectedSender) throw Error('Contexto da resposta incompleto.')
    state={...state,lastReplyAttemptAt:new Date(now()).toISOString()}
    await savePrivate(filename,JSON.stringify(state)+'\n')
    const adapter=adapterFactory(page,{expectedSender})
    let observed,threadUrl,sequenceState
    const signature=async()=>replyConversationSignature(await readRows(page),job.profile.username,job.inboundContent,{externalId:job.inboundExternalId,anchor:job.contactAnchor,threadUrl,previous:sequenceState,expectedSender,now:now()})
    const guarded={...adapter,
      openConversation:async profile=>{
        const opened=await adapter.openConversation(profile)
        threadUrl=opened.threadUrl
        if (job.inboundExternalId?.startsWith('ig-sequence-v1:')) {
          sequenceState=await readStoredReplySequence(job.profile.username,threadUrl,job.contactAnchor?.id)
          if (!sequenceState) throw Error('Prova local da sequência não disponível; revisão necessária.')
        }
        observed=await signature()
        return opened
      },
      assertConversation:async()=>{
        await adapter.assertConversation()
        if (await signature()!==observed) throw Error('Conversa mudou durante preparação da resposta.')
      },
    }
    result=await sendOutreach(guarded,{instagramUsername:job.profile.username,instagramProfileUrl:job.profile.profileUrl,content:job.content},{authorize:async()=>{
      await guarded.assertConversation()
      return (await request('PATCH',{jobId:job.id,claimToken:job.claimToken})).authorized===true
    }})
    if(result.status==='sent') {
      state={...state,lastReplySentAt:new Date(now()).toISOString()}
      await savePrivate(filename,JSON.stringify(state)+'\n')
      try {
        const header=page.getByRole('link',{name:recipientLabel(job.profile.username)}).filter({has:page.getByRole('heading')})
        const box=await header.boundingBox(),viewport=page.viewportSize()
        if (!box || !viewport || box.x<viewport.width*.25 || box.x>=viewport.width) throw Error('Recorte indisponível.')
        const x=Math.ceil(box.x)
        await savePrivate(path.resolve(evidenceDir,`reply_${job.id.replace(/[^a-zA-Z0-9_-]/g,'_')}.png`),await page.screenshot({clip:{x,y:0,width:viewport.width-x,height:viewport.height}}))
      } catch {report(`Resposta @${job.profile.username}: comprovativo visual indisponível.`)}
    }
  } catch(error) {result={...(result || {}),status:result?.status==='sent'?'sent':result?.attemptedSend?'manual_review':'failed',attemptedSend:result?.attemptedSend===true,error:String(error.message).slice(0,500)}}
  const status=result.status==='sent'?'confirmed':result.attemptedSend?'unknown':'not_sent'
  try {
    await request('POST',{...completion,status,...(result.threadUrl?{threadUrl:result.threadUrl}:{}),...(result.error?{error:result.error}:{})})
  } catch {
    report(result.status==='sent'?'Resposta confirmada no Chrome, registo pendente; não reenviar.':'Estado de resposta pendente no servidor; não repetir envio.')
    return {status:'registration_pending',attemptedSend:result.attemptedSend===true}
  }
  report(`Resposta @${job.profile?.username || 'perfil'}: ${status}.`)
  return {status,attemptedSend:result.attemptedSend===true}
}
