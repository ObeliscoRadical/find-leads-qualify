import {expect,it} from 'vitest'
import {professionalBusinessType,professionalLeadType} from './business-types'
import {segmentMatches,segmentProfileMatches} from './segment'
it('recognises professional construction architecture engineering and restaurants',() => {
 for(const [text,keyword,type] of [['Empresa de construção civil e remodelações em Lisboa','construtoras','construction'],['Gabinete de arquitetura em Lisboa','arquitetos','architecture'],['Engenheiro civil | Projetos e fiscalização','engenheiros','engineering'],['Restaurante X | Reservas e menu do dia','restaurantes','restaurant']]) {
  expect(professionalBusinessType(text)).toBe(type)
  expect(segmentMatches(text,keyword)).toBe(true)
 }
})
it('rejects bloggers students and inferred owners without professional evidence',() => {
 for(const [text,keyword] of [['Food blogger | Visito restaurantes de Lisboa','restaurantes'],['Estudante de arquitetura em Lisboa','arquitetos'],['Student engineer | Lisboa','engenheiros'],['Estudante de engenharia civil em Lisboa','engenheiros civis'],['Gosto de restaurantes de Lisboa, foodie','restaurantes'],['João Silva, dono','construtoras']]) expect(segmentMatches(text,keyword),text).toBe(false)
 expect(professionalLeadType({instagramUsername:'restaurante_lisboa',instagramDisplayName:'João Silva',instagramBio:'restaurante_lisboa\nJoão Silva\nBem-vindo à minha vida'})).toBeNull()
 expect(segmentProfileMatches({username:'arquiteto',displayName:'arquiteto',bio:'arquiteto\nJoão Silva\nLisboa'},'arquitetos')).toBe(false)
 expect(professionalLeadType({instagramUsername:'arquiteto',instagramDisplayName:'arquiteto',instagramBio:'arquiteto\nLisboa'})).toBeNull()
})
it('keeps legacy segment discovery and supports all four requested sectors together',() => {
 expect(segmentMatches('Empresa de limpeza profissional Lisboa','limpezas')).toBe(true)
 for(const text of ['Construtora ABC','Arquiteta Joana | atelier','Engenheiro civil','Restaurante ABC']) expect(segmentMatches(text,'construtoras, arquitetos, engenheiros, restaurantes')).toBe(true)
})

it('accepts real gyms and condominium managers while excluding personal fitness creators',()=>{
 for(const [text,keyword,type] of [['Ginásio ABC | Musculação e aulas de grupo em Lisboa','ginásios','gym'],['Academia Fitness Club | Espaço de treino em Lisboa','academias','gym'],['Gestão e administração de condomínios em Lisboa','condomínios','condo_management']]) {
  expect(professionalBusinessType(text)).toBe(type)
  expect(segmentMatches(text,keyword)).toBe(true)
 }
 for(const text of ['Personal trainer | Treino no ginásio | Influencer','Adoro o ginásio e fitness','Academia de arquitetura','Empreendedor | Lifestyle']) expect(professionalBusinessType(text)).not.toBe('gym')
})
