export const priorityTypes = ['construction','architecture','engineering','restaurant'] as const;
export type PriorityBusinessType = typeof priorityTypes[number];
export function professionalBusinessType(text: string): PriorityBusinessType | null {
  const value = String(text || '').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
  if (/\b(?:estudante|estudantes|student|students|estagio|estagiario|estagiaria|faculdade)\b/.test(value)) return null;
  if (/\b(?:construtor[ae]s?|empreiteir[oa]s?)\b|\bconstrucao\s+(?:civil|e remodelac)|\bempresa de construcao\b/.test(value)) return 'construction';
  if (/\b(?:arquitet[oa]s?|arquitect[oa]s?|arquitetura|arquitectura)\b/.test(value)) return 'architecture';
  if (/\bengenheir[oa]s?\b|\bengenharia\s+(?:civil|estrutural|eletrica|eletrotecnica|e construcao)|\b(?:gabinete|empresa) de engenharia\b/.test(value)) return 'engineering';
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
    return /restaurante|restauracao|pizzaria|churrasqueira|marisqueira/.test(normalized);
  });
}

export function professionalLeadType(lead: {instagramBio:string|null;instagramDisplayName?:string|null;instagramUsername?:string|null}) {
  const username=(lead.instagramUsername || '').toLowerCase();
  const bio=(lead.instagramBio || '').split('\n').filter(line => line.trim().toLowerCase() !== username).join('\n');
  const name=lead.instagramDisplayName?.toLowerCase() === username ? '' : (lead.instagramDisplayName || '').split('\n').filter(line => line.trim().toLowerCase() !== username).join('\n');
  return professionalBusinessType(`${name}\n${bio}`);
}
