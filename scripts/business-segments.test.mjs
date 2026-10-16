import {test} from 'node:test'
import assert from 'node:assert/strict'
import {segmentMatches} from './discovery-worker.mjs'
test('Chrome discovery follows professional sectors and excludes personal/student/food-blog accounts',() => {
 for(const [text,keyword] of [['Construtora ABC | Construção civil','construtoras'],['Gabinete de arquitetura','arquitetos'],['Engenheiro civil','engenheiros'],['Restaurante ABC | reservas','restaurantes']]) assert.equal(segmentMatches(text,keyword),true)
 for(const [text,keyword] of [['Food blogger | visito restaurantes','restaurantes'],['Estudante de arquitetura','arquitetos'],['Maria, foodie e receitas','restaurantes']]) assert.equal(segmentMatches(text,keyword),false)
})
