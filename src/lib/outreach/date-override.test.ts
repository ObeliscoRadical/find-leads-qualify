import {expect,it} from 'vitest'
import {effectiveOutreachConfig,outreachConfigSchema,canClassifyDaily} from './state'
const config=outreachConfigSchema.parse({enabled:true,maxDaily:5,dateOverride:{date:'2026-10-16',maxDaily:20,minIntervalSeconds:1800}})
it('never raises the permanent five-contact cap or permits undated/future exceptions',()=>{
 expect(outreachConfigSchema.safeParse({enabled:true,maxDaily:20}).success).toBe(false)
 expect(outreachConfigSchema.safeParse({...config,dateOverride:{...config.dateOverride,date:'2026-10-17'}}).success).toBe(false)
 expect(outreachConfigSchema.safeParse({...config,dateOverride:{...config.dateOverride,maxDaily:21}}).success).toBe(false)
 expect(outreachConfigSchema.safeParse({...config,dateOverride:{...config.dateOverride,minIntervalSeconds:90}}).success).toBe(false)
 expect(outreachConfigSchema.parse({enabled:true,maxDaily:5}).dateOverride).toBeUndefined()
})
it('enables the temporary20 only from09 inclusive until20 exclusive in Lisbon',()=>{
 expect(effectiveOutreachConfig(config,new Date('2026-10-16T07:59:59Z'))).toMatchObject({enabled:false,maxDaily:5,overrideActive:false})
 expect(effectiveOutreachConfig(config,new Date('2026-10-16T08:00:00Z'))).toMatchObject({enabled:true,maxDaily:20,minIntervalSeconds:1800,overrideActive:true})
 expect(effectiveOutreachConfig(config,new Date('2026-10-16T18:59:59Z'))).toMatchObject({enabled:true,maxDaily:20})
 expect(effectiveOutreachConfig(config,new Date('2026-10-16T19:00:00Z'))).toMatchObject({enabled:false,maxDaily:5,overrideActive:false})
})
it('does not spill over local midnight or resume sending the following day',()=>{
 for(const value of ['2026-10-15T23:00:00Z','2026-10-16T23:00:00Z','2026-10-17T08:00:00Z']) expect(effectiveOutreachConfig(config,new Date(value))).toMatchObject({enabled:false,maxDaily:5,overrideActive:false})
 expect(effectiveOutreachConfig(config,new Date('2026-10-16T08:30:00Z'),'UTC').overrideActive).toBe(false)
 expect(effectiveOutreachConfig(config,new Date('2026-10-16T08:30:00Z'),'Europe/Lisbon').overrideActive).toBe(true)
})
it('does not enable a disabled configuration or mutate its base and preserves classification budget20',()=>{
 expect(effectiveOutreachConfig({...config,enabled:false},new Date('2026-10-16T12:00:00Z')).enabled).toBe(false)
 expect(config.maxDaily).toBe(5)
 expect(canClassifyDaily(19)).toBe(true);expect(canClassifyDaily(20)).toBe(false)
 expect(effectiveOutreachConfig({enabled:true,maxDaily:3},new Date('2026-10-17T12:00:00Z'))).toMatchObject({maxDaily:3,minIntervalSeconds:90,enabled:true})
})
