import {describe,expect,it} from 'vitest';
import {hasMessagingScopes,incomingInstagramEvent} from './messaging';
const event = {sender:{id:'12'},recipient:{id:'34'},timestamp:1720000000000,message:{mid:'real_mid',text:'Resposta real'}};
describe('official Instagram message eligibility', () => {
    it('requires exact messaging scopes, not just a linked page', () => {
        expect(hasMessagingScopes('["instagram_basic"]')).toBe(false);
        expect(hasMessagingScopes('["instagram_manage_messages","pages_manage_metadata"]')).toBe(true);
        expect(hasMessagingScopes('bad')).toBe(false);
    });
    it('requires recipient match and ignores our own echo', () => {
        expect(incomingInstagramEvent('34',event)?.message.text).toBe('Resposta real');
        expect(incomingInstagramEvent('99',event)).toBeNull();
        expect(incomingInstagramEvent('34',{...event,message:{...event.message,is_echo:true}})).toBeNull();
        expect(incomingInstagramEvent('34',{...event,sender:{id:'34'}})).toBeNull();
    });
    it('rejects missing IDs and preserves media-only events without invented text', () => {
        expect(incomingInstagramEvent('34',{...event,message:{text:'fake'}})).toBeNull();
        expect(incomingInstagramEvent('34',{...event,message:{mid:'real_mid',attachments:[{type:'image'}]}})?.message.text).toBeUndefined();
    });
});
