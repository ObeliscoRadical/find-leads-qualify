import { z } from 'zod';
const reserved = new Set(['p', 'reel', 'reels', 'stories', 'explore', 'accounts', 'direct', 'about', 'developer', 'legal']);
export const discoverySchema = z.object({
    keywords: z.string().trim().min(3).max(300),
    location: z.string().trim().max(100).default(''),
    limit: z.number().int().min(1).max(30).default(10),
});
export const profileSchema = z.object({
    username: z.string().trim().regex(/^[a-zA-Z0-9._]{1,30}$/).transform(s => s.toLowerCase()),
    displayName: z.string().trim().max(255).optional(),
    bio: z.string().trim().max(3000).optional(),
    profileUrl: z.url().max(500),
    sourceUrl: z.url().max(2000).refine(s => new URL(s).protocol === 'https:', 'A fonte deve usar HTTPS.'),
}).refine(p => {
    const u = new URL(p.profileUrl);
    return u.protocol === 'https:' && ['instagram.com', 'www.instagram.com'].includes(u.hostname) && u.pathname.replace(/^\/+|\/+$/g, '').toLowerCase() === p.username && !reserved.has(p.username);
}, 'Perfil Instagram inválido.');
export const resultSchema = z.object({
    jobId: z.string().min(1).max(100), claimToken: z.string().uuid(),
    profiles: z.array(profileSchema).max(30).default([]), error: z.string().max(1000).optional(),
});
