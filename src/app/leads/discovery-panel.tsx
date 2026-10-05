'use client';
import { useCallback, useEffect, useState, type FormEvent } from 'react';
type Job = {
    id: string;
    status: string;
    lastError: string | null;
    payload: {
        keywords: string;
        location: string;
        found?: number;
        inserted?: number;
        existing?: number;
    };
    createdAt: string;
};
const labels: Record<string, string> = { pending: 'Aguardando Chrome', running: 'Buscando perfis reais', completed: 'Busca concluída', failed: 'Busca interrompida' };
export default function DiscoveryPanel({ onComplete }: {
    onComplete: () => void;
}) {
    const [keywords, setKeywords] = useState('gestão de condomínios, empresas, escritórios');
    const [location, setLocation] = useState('Lisboa');
    const [jobs, setJobs] = useState<Job[]>([]);
    const [online, setOnline] = useState(false);
    const [connectionError, setConnectionError] = useState('');
    const [message, setMessage] = useState('');
    const [connection, setConnection] = useState('');
    const [busy, setBusy] = useState(false);
    const refresh = useCallback(async () => {
        try {
            const response = await fetch('/api/discovery');
            const data = await response.json();
            if (response.ok) {
                setJobs(data.jobs || []);
                setOnline(Boolean(data.worker?.online));
                setConnectionError('');
            } else {
                setOnline(false);
                setConnectionError(data.error || 'Não foi possível verificar a conexão do Chrome.');
            }
        }
        catch {
            setOnline(false);
            setConnectionError('Sem conexão com o app. Tentaremos novamente em alguns segundos.');
        }
    }, []);
    useEffect(() => { const initial = setTimeout(() => void refresh(), 0); const timer = setInterval(() => { void refresh(); onComplete(); }, 10000); return () => { clearTimeout(initial); clearInterval(timer); }; }, [refresh, onComplete]);
    async function start(event: FormEvent) { event.preventDefault(); setBusy(true); setMessage(''); try {
        const response = await fetch('/api/discovery', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ keywords, location, limit: 10 }) });
        const data = await response.json();
        if (!response.ok)
            throw Error(data.error || 'Falha ao iniciar busca.');
        setMessage('Busca criada. O Chrome conectado irá pesquisar e guardar os perfis encontrados.');
        await refresh();
    }
    catch (error) {
        setMessage(error instanceof Error ? error.message : 'Falha de conexão.');
    }
    finally {
        setBusy(false);
    } }
    async function pair() { setMessage(''); try {
        const response = await fetch('/api/discovery/pair', { method: 'POST' });
        const data = await response.json();
        if (!response.ok)
            throw Error(data.error);
        const connectionJson = JSON.stringify({ appUrl: window.location.origin, token: data.token }, null, 2);
        setConnection(connectionJson);
        const blob = new Blob([connectionJson], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = 'leads-chrome-connection.json';
        document.body.appendChild(link);
        link.click();
        link.remove();
        setTimeout(() => URL.revokeObjectURL(url), 10000);
        setMessage('Conexão criada, válida por 7 dias. Use o arquivo descarregado ou copie a conexão abaixo para o conector local.');
    }
    catch (error) {
        setMessage(error instanceof Error ? error.message : 'Não foi possível conectar.');
    } }
    return <section className="lead-list-panel" style={{ marginBottom: 24 }}>
  <h2>Descobrir leads no Instagram</h2>
  <p role="status">{online ? 'Chrome conectado e pronto para buscar.' : 'Chrome desconectado. Abra o conector local para executar as buscas.'}</p>
  <p className="muted">Encontre perfis reais por segmento e região com o seu Chrome. Os resultados entram na lista abaixo com a fonte da descoberta.</p>
  {connectionError ? <p role="alert">{connectionError}</p> : null}
  <form className="form" onSubmit={start}>
   <div className="two-col"><label>Quem procura?<input required minLength={3} maxLength={300} value={keywords} onChange={e => setKeywords(e.target.value)} placeholder="gestores de condomínios, escritórios"/></label><label>Região<input maxLength={100} value={location} onChange={e => setLocation(e.target.value)} placeholder="Lisboa"/></label></div>
   <div className="filters"><button className="primary-button" disabled={busy || jobs.some(j => ['pending', 'running'].includes(j.status))}>{busy ? 'A iniciar...' : 'Buscar 10 leads'}</button><button type="button" className="secondary-button" onClick={() => void pair()}>Conectar Chrome</button></div>
  </form>
  {message ? <p role="status">{message}</p> : null}
  {connection ? <details><summary>Configuração do conector local</summary><label>Conexão do Chrome<textarea readOnly aria-label="Conexão do Chrome" rows={5} value={connection}/></label><button className="secondary-button" type="button" onClick={() => setConnection('')}>Ocultar conexão</button></details> : null}
  {jobs.slice(0, 5).map(job => <article key={job.id} className="lead-row"><div><strong>{job.payload.keywords}</strong><span>{job.payload.location} · {labels[job.status] || job.status}</span>{job.lastError ? <span role="alert">{job.lastError}</span> : null}</div><div>{job.payload.found !== undefined ? `${job.payload.found} encontrados · ${job.payload.inserted} novos · ${job.payload.existing} existentes` : null}</div></article>)}
 </section>;
}
