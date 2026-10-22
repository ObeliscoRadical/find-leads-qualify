export const priorityTypes = ['construction','architecture','engineering','restaurant','gym','condo_management'] as const;
export type PriorityBusinessType = typeof priorityTypes[number];
export function professionalBusinessType(text: string): PriorityBusinessType | null {
  const value = String(text || '').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
  if (/\b(?:estudante|estudantes|student|students|estagio|estagiario|estagiaria|faculdade)\b/.test(value)) return null;
  if (/\b(?:construtor[ae]s?|empreiteir[oa]s?)\b|\bconstrucao\s+(?:civil|e remodelac)|\bempresa de construcao\b/.test(value)) return 'construction';
  if (/\b(?:arquitet[oa]s?|arquitect[oa]s?|arquitetura|arquitectura)\b/.test(value)) return 'architecture';
  if (/\bengenheir[oa]s?\b|\bengenharia\s+(?:civil|estrutural|eletrica|eletrotecnica|e construcao)|\b(?:gabinete|empresa) de engenharia\b/.test(value)) return 'engineering';
  if (/\b(?:gestao|administracao|gestora|administradora)\s+(?:e\s+(?:gestao|administracao)\s+)?(?:de\s+)?condominios?\b/.test(value)) return 'condo_management';
  const gym = /\b(?:ginasios?|gyms?|fitness\s*(?:clubs?|centers?|centres?)|academia\s+(?:fitness|de musculacao))\b/.test(value);
  const personalFitness = /\b(?:personal trainer|treinador pessoal|influencer|foodie|lifestyle)\b|\b(?:adoro|gosto|treino no)\b/.test(value);
  if (gym && !personalFitness) return 'gym';
  const restaurant = /\b(?:restaurantes?|restauracao|pizzaria|churrasqueira|marisqueira|bistro|tasca)\b/.test(value);
  const reviewer = /food\s*blog|foodie|critic[oa].*gastronom|roteiro.*gastronom|\b(?:receitas|influencer)\b|\b(?:visito|descubro|conheco|avalio) restaurantes|criador.*(?:conteudo|digital)/.test(value);
  return restaurant && !reviewer ? 'restaurant' : null;
}
export function requestedProfessionalTypes(keywords: string): PriorityBusinessType[] {
  const normalized = String(keywords || '').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
  return priorityTypes.filter(type => {
    if (type === 'construction') return /construtor|construcao|empreiteir/.test(normalized);
    if (type === 'architecture') return /arquitet|arquitect/.test(normalized);
    if (type === 'engineering') return /engenheir|engenharia/.test(normalized);
    if (type === 'gym') return /ginasio|academia|fitness|\bgym/.test(normalized);
    if (type === 'condo_management') return /condomin/.test(normalized);
    return /restaurante|restauracao|pizzaria|churrasqueira|marisqueira/.test(normalized);
  });
}

export function professionalLeadType(lead: {instagramBio:string|null;instagramDisplayName?:string|null;instagramUsername?:string|null}) {
  const username=(lead.instagramUsername || '').toLowerCase();
  const bio=(lead.instagramBio || '').split('\n').filter(line => line.trim().toLowerCase() !== username).join('\n');
  const name=lead.instagramDisplayName?.toLowerCase() === username ? '' : (lead.instagramDisplayName || '').split('\n').filter(line => line.trim().toLowerCase() !== username).join('\n');
  return professionalBusinessType(`${name}\n${bio}`);
}
