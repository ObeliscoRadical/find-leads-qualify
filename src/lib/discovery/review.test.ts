import { beforeEach, describe, expect, it, vi } from 'vitest'
vi.mock('@/db', () => ({ getDb: vi.fn() }))
import { getDb } from '@/db'
import { jobs, leads } from '@/db/schema'
import { reviewDiscovery } from './jobs'
const dbMock = vi.mocked(getDb)

describe('reversible review of a discovery job', () => {
  beforeEach(() => vi.clearAllMocks())
  it('blocks unrelated profiles without changing lead status or overwriting existing opt-outs', async () => {
    const changes: {table: unknown, value: Record<string, unknown>}[] = []
    const job = {id: 'job_one', status: 'completed', lastError: null, payload: JSON.stringify({keywords: 'condomínios', found: 3, inserted: 3, ingressRejected: 2, rejected: 2})}
    const associated = [
      {id:'wrong', instagramUsername:'fitness_portugal', instagramDisplayName:'Fitness Portugal', instagramBio:'Ginásio', noContact:false, noContactReason:null},
      {id:'valid', instagramUsername:'condominioslisboa', instagramDisplayName:'Condomínios Lisboa', instagramBio:'Administração de condomínios', noContact:false, noContactReason:null},
      {id:'optout', instagramUsername:'other', instagramDisplayName:'Fitness', instagramBio:'Fitness', noContact:true, noContactReason:'Cliente pediu para não ser contatado'},
    ]
    let selects = 0
    const tx = {
      select: () => ({from: () => ({where: () => ++selects === 1 ? {for: async () => [job]} : Promise.resolve(associated)})}),
      update: (table:unknown) => ({set: (value:Record<string,unknown>) => {changes.push({table,value});return {where: async () => []}}}),
    }
    dbMock.mockReturnValue({transaction: async (callback:(value:unknown)=>unknown) => callback(tx)} as unknown as ReturnType<typeof getDb>)
    expect(await reviewDiscovery('org_one','job_one')).toEqual({valid:1,rejected:4,reviewed:3})
    const leadChanges = changes.filter(change => change.table === leads)
    expect(leadChanges).toHaveLength(1)
    expect(leadChanges[0].value).toMatchObject({noContact:true,noContactReason:'Fora do segmento da busca: condomínios'})
    expect(leadChanges[0].value).not.toHaveProperty('leadStatus')
    const jobChange = changes.find(change => change.table === jobs)
    expect(JSON.parse(jobChange?.value.payload as string)).toMatchObject({found:1,inserted:1,ingressRejected:2,rejected:4})
  })
  it('does not touch an absent or in-progress job', async () => {
    const update = vi.fn()
    const tx = {select:()=>({from:()=>({where:()=>({for:async()=>[]})})}),update}
    dbMock.mockReturnValue({transaction:async(callback:(value:unknown)=>unknown)=>callback(tx)} as unknown as ReturnType<typeof getDb>)
    expect(await reviewDiscovery('org_other','job_one')).toBeNull()
    expect(update).not.toHaveBeenCalled()
  })
})
