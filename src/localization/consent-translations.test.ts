import { test, expect } from '@jest/globals';
import en from './locales/en.json';
import ar from './locales/ar.json';
import de from './locales/de.json';
import es from './locales/es.json';
import fr from './locales/fr.json';
import it from './locales/it.json';
const keys=['Terms of Service','Agree to Terms of Service','I agree to the Terms of Service','Unable to load Terms of Service. Please try again.','Continue','Retry','Logout'];
function flatten(value: unknown, prefix=''): Record<string,string> {
 if (typeof value === 'string') return { [prefix]:value };
 if (!value || typeof value !== 'object') return {};
 return Object.assign({},...Object.entries(value).map(([key,item])=>flatten(item,prefix?prefix+'.'+key:key)));
}
const source=flatten(en);
test.each(Object.entries({en,ar,de,es,fr,it}))('%s includes the complete consent/recovery flow without lost interpolation',(_,catalog)=>{
 const target=flatten(catalog);
 for(const key of keys) expect(target[key]?.trim()).toBeTruthy();
 const placeholders=(text:string)=>[...text.matchAll(/\{\{\s*(\w+)\s*\}\}/g)].map(match=>match[1]).sort();
 for(const [key,value]of Object.entries(target)) if(key in source) expect(placeholders(value)).toEqual(placeholders(source[key]));
});
