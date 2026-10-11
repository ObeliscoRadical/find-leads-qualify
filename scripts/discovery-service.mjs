import fs from 'node:fs/promises'
import path from 'node:path'
import os from 'node:os'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'
const label = 'com.findleads.discovery'
export function xmlEscape(value) { return String(value).replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' })[character]) }
export function servicePlist({ projectDir, nodePath, configPath }) {
  if (![projectDir, nodePath, configPath].every(path.isAbsolute)) throw new Error('Use caminhos absolutos para projeto, Node e configuração.')
  const x = xmlEscape
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
<key>Label</key><string>${label}</string>
<key>ProgramArguments</key><array><string>${x(nodePath)}</string><string>${x(path.join(projectDir, 'scripts/discovery-worker.mjs'))}</string></array>
<key>WorkingDirectory</key><string>${x(projectDir)}</string>
<key>EnvironmentVariables</key><dict><key>DISCOVERY_CONFIG</key><string>${x(configPath)}</string></dict>
<key>RunAtLoad</key><true/>
<key>KeepAlive</key><dict><key>SuccessfulExit</key><false/></dict>
<key>ThrottleInterval</key><integer>300</integer>
<key>StandardOutPath</key><string>${x(path.join(projectDir, '.discovery/service.log'))}</string>
<key>StandardErrorPath</key><string>${x(path.join(projectDir, '.discovery/service-error.log'))}</string>
</dict></plist>\n`
}
export async function restartService(run, domain, plistPath, { sleep = ms => new Promise(resolve => setTimeout(resolve, ms)) } = {}) {
  const target = `${domain}/${label}`
  const removed = await run(['bootout', target])
  // bootout can return before launchd has removed the existing service.
  if (removed.status === 0) {
    let absent = false
    for (let attempt = 0; attempt < 20; attempt++) {
      const state = await run(['print', target])
      if (state.status !== 0) { absent = true; break }
      await sleep(250)
    }
    if (!absent) throw new Error('O serviço anterior ainda está encerrando. Tente novamente após alguns segundos.')
  }
  for (let attempt = 0; attempt < 10; attempt++) {
    const result = await run(['bootstrap', domain, plistPath])
    if (result.status === 0) return
    if (result.status !== 5 || attempt === 9) throw new Error(result.stderr || 'Não foi possível carregar o serviço.')
    await sleep(500)
  }
}
async function main() {
  if (process.platform !== 'darwin') throw new Error('O serviço requer macOS.')
  const action = process.argv[2]
  const projectDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
  const configPath = path.resolve(process.env.DISCOVERY_CONFIG || path.join(projectDir, '.discovery/config.json'))
  const plistPath = path.join(os.homedir(), 'Library/LaunchAgents', `${label}.plist`)
  const domain = `gui/${process.getuid()}`
  const run = args => spawnSync('/bin/launchctl', args, { encoding: 'utf8' })
  if (action === 'status') { const result = run(['print', `${domain}/${label}`]); console.log(result.stdout || result.stderr); process.exitCode = result.status; return }
  if (action === 'uninstall') { run(['bootout', `${domain}/${label}`]); await fs.rm(plistPath, { force: true }); console.log('Serviço removido; configuração e perfil do Chrome preservados.'); return }
  if (action !== 'install') throw new Error('Uso: node scripts/discovery-service.mjs install|status|uninstall')
  const stat = await fs.stat(configPath)
  if (!stat.isFile() || (stat.mode & 0o077) !== 0) throw new Error('A configuração deve existir e ter permissões 600.')
  const config = JSON.parse(await fs.readFile(configPath, 'utf8'))
  if (!(config.apiUrl || config.appUrl) || !config.token) throw new Error('Configuração precisa de apiUrl e token.')
  await fs.mkdir(path.dirname(plistPath), { recursive: true })
  await fs.mkdir(path.join(projectDir, '.discovery'), { recursive: true, mode: 0o700 })
  await fs.writeFile(plistPath, servicePlist({ projectDir, nodePath: process.execPath, configPath }), { mode: 0o600 })
  await restartService(run, domain, plistPath)
  console.log('Busca autônoma ativada neste Mac, ao iniciar sessão. Logs em .discovery/service.log.')
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main().catch(error => { console.error(error.message); process.exitCode = 1 })
