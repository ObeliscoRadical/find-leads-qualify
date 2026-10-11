import test from 'node:test'
import assert from 'node:assert/strict'
import {restartService} from './discovery-service.mjs'
test('waits for async removal before bootstrap and retries transient launchd error', async () => {
  const calls = [], sleeps = []
  const responses = [{status:0},{status:0},{status:113},{status:5},{status:0}]
  await restartService(async args=>{calls.push(args[0]);return responses.shift()},'gui/501','/service.plist',{sleep:async ms=>sleeps.push(ms)})
  assert.deepEqual(calls,['bootout','print','print','bootstrap','bootstrap'])
  assert.deepEqual(sleeps,[250,500])
})
test('nontransient bootstrap error fails immediately without retries', async () => {
  const calls = []
  await assert.rejects(restartService(async args=>{calls.push(args[0]);return {status:args[0]==='bootout'?113:64,stderr:'invalid plist'}},'gui/501','/service.plist',{sleep:async()=>assert.fail('unexpected wait')}),/invalid plist/)
  assert.deepEqual(calls,['bootout','bootstrap'])
})
test('wait for removal is bounded and never starts duplicate service', async () => {
  let polls = 0
  await assert.rejects(restartService(async args=>{if(args[0]==='print')polls++;assert.notEqual(args[0],'bootstrap');return {status:0}},'gui/501','/service.plist',{sleep:async()=>{}}),/ainda está encerrando/)
  assert.equal(polls,20)
})
test('persistent bootstrap5 is bounded to ten attempts', async () => {
  let attempts=0
  await assert.rejects(restartService(async args=>{if(args[0]==='bootstrap')attempts++;return {status:args[0]==='bootout'?113:5,stderr:'busy'}},'gui/501','/service.plist',{sleep:async()=>{}}),/busy/)
  assert.equal(attempts,10)
})
