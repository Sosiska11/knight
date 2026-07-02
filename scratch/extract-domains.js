import fs from 'fs';

const filePath = "C:/Users/alexs/.gemini/antigravity-ide/brain/b0bff61a-1aad-4b34-93fd-95604af9e80f/.system_generated/steps/83/content.md";
const content = fs.readFileSync(filePath, 'utf8');

const regex = /([a-z0-9-]+\.[a-z]{2,6})/gi;
const matches = content.match(regex) || [];
const domains = [...new Set(matches.map(d => d.toLowerCase()))];

console.log('Total unique domains found in discussion:', domains.length);
const russianDomains = domains.filter(d => d.endsWith('.ru') || d.endsWith('.su') || d.includes('gosuslugi') || d.includes('sber') || d.includes('yandex') || d.includes('vk') || d.includes('mail') || d.includes('ok.ru'));
console.log('Russian domains:', russianDomains);
